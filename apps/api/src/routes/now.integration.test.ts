import { resolve } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  mentorActivityLedger,
  needsDeepeningTopics,
  parkingLotItems,
  retentionCards,
  subjects,
  supportership,
  type Database,
} from '@eduagent/database';
import {
  ERROR_CODES,
  ForbiddenError,
  MIN_EXCHANGES_FOR_TOPIC_COMPLETION,
} from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { nowRoutes } from './now';
import { acceptLink, initiateLink } from '../services/linking-ceremony';
import {
  collectCandidatesForRequest,
  collectChallengeReadyCandidates,
  __setChallengeReadyRaceHook,
} from '../services/now-feed';
import { requestSelfUnlink } from '../services/supportership-revocation';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

type TestEnv = {
  Variables: {
    db: Database;
    profileId: string | undefined;
    profileMeta: undefined;
    user: unknown;
  };
};

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb(): Database {
  return createDatabase(requireDatabaseUrl());
}

function makeApp(db: Database, profileId: string) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('profileId', profileId);
    c.set('profileMeta', undefined);
    await next();
  });
  app.route('/v1', nowRoutes);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof ForbiddenError) {
      return c.json({ code: ERROR_CODES.FORBIDDEN, message: err.message }, 403);
    }
    throw err;
  });
  return app;
}

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integ-now-${RUN_ID}`;
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];
const seededSupportershipIds: string[] = [];

async function seedProfile(database: Database, label: string): Promise<string> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  const clerkUserId = `${CLERK_PREFIX}-${label}`;
  const email = `${CLERK_PREFIX}-${label}@test.invalid`;

  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Now ${label}`,
    birthYear: 2010,
    isOwner: true,
  });

  return profileId;
}

async function seedTopic(
  database: Database,
  profileId: string,
  label: string,
  sortOrder = 0,
): Promise<{ subjectId: string; bookId: string; topicId: string }> {
  const subjectId = generateUUIDv7();
  const curriculumId = generateUUIDv7();
  const bookId = generateUUIDv7();
  const topicId = generateUUIDv7();

  await database.insert(subjects).values({
    id: subjectId,
    profileId,
    name: `Now Subject ${label}`,
    status: 'active',
    pedagogyMode: 'socratic',
  });
  await database.insert(curricula).values({
    id: curriculumId,
    subjectId,
    version: 1,
  });
  await database.insert(curriculumBooks).values({
    id: bookId,
    subjectId,
    title: `Now Book ${label}`,
    sortOrder,
  });
  await database.insert(curriculumTopics).values({
    id: topicId,
    curriculumId,
    bookId,
    title: `Now Topic ${label}`,
    description: `Now description ${label}`,
    sortOrder,
    estimatedMinutes: 30,
  });

  return { subjectId, bookId, topicId };
}

async function seedRetentionDue(
  database: Database,
  profileId: string,
  label: string,
  nextReviewAt: Date,
): Promise<{ subjectId: string; bookId: string; topicId: string }> {
  const topic = await seedTopic(database, profileId, label);

  await database.insert(retentionCards).values({
    id: generateUUIDv7(),
    profileId,
    topicId: topic.topicId,
    xpStatus: 'pending',
    nextReviewAt,
  });

  return topic;
}

async function seedCompletedSession(
  database: Database,
  profileId: string,
  subjectId: string,
  topicId: string,
): Promise<string> {
  const [row] = await database
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'completed',
      escalationRung: 1,
      exchangeCount: 1,
    })
    .returning({ id: learningSessions.id });

  if (!row) throw new Error('Failed to seed completed learning session');
  return row.id;
}

async function seedActiveSession(
  database: Database,
  profileId: string,
  label: string,
): Promise<string> {
  const topic = await seedTopic(database, profileId, label);
  const [row] = await database
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: topic.subjectId,
      topicId: topic.topicId,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 1,
      lastActivityAt: new Date(),
    })
    .returning({ id: learningSessions.id });

  if (!row) throw new Error('Failed to seed active learning session');
  return row.id;
}

async function seedNeedsDeepening(
  database: Database,
  profileId: string,
  label: string,
  pendingExpiresAt?: Date,
): Promise<{ subjectId: string; bookId: string; topicId: string }> {
  const topic = await seedTopic(database, profileId, label);
  await database.insert(needsDeepeningTopics).values({
    id: generateUUIDv7(),
    profileId,
    subjectId: topic.subjectId,
    topicId: topic.topicId,
    status: 'active',
    concept: `concept ${label}`,
    pendingExpiresAt,
  });

  return topic;
}

async function seedAssessmentEligibleTopic(
  database: Database,
  profileId: string,
  label: string,
  endedAt = new Date(),
): Promise<{ subjectId: string; bookId: string; topicId: string }> {
  const topic = await seedTopic(database, profileId, label);
  await database.insert(learningSessions).values({
    profileId,
    subjectId: topic.subjectId,
    topicId: topic.topicId,
    sessionType: 'learning',
    inputMode: 'text',
    status: 'completed',
    escalationRung: 1,
    exchangeCount: MIN_EXCHANGES_FOR_TOPIC_COMPLETION,
    endedAt,
    lastActivityAt: endedAt,
  });

  return topic;
}

// [WI-2237] `/now`'s `scope=person`/`scope=supporter-hub` now require an
// ACCEPTED visibility contract, not just a non-revoked edge — a bare
// `supportership` insert (with no contract, or a `pending` one) no longer
// grants Now-feed access (see the negative test below). Seeds through the
// real `initiateLink`+`acceptLink` write path, mirroring
// `visibility.integration.test.ts`'s `seedAcceptedContract`.
async function seedAcceptedContract(
  database: Database,
  supporterPersonId: string,
  supporteePersonId: string,
): Promise<string> {
  const initiated = await initiateLink(database, {
    supporterPersonId,
    supporteePersonId,
    relation: 'parent',
    managedTier: false,
  });
  seededSupportershipIds.push(initiated.supportershipId);

  await acceptLink(database, initiated.id, {
    actorPersonId: supporterPersonId,
    audience: 'supporter',
  });
  const accepted = await acceptLink(database, initiated.id, {
    actorPersonId: supporteePersonId,
    audience: 'supportee',
  });

  if (accepted.status !== 'accepted') {
    throw new Error(
      `Expected seeded contract to reach status "accepted", got "${accepted.status}"`,
    );
  }
  return initiated.supportershipId;
}

async function seedParkedQuestion(
  database: Database,
  profileId: string,
  sessionId: string,
  topicId: string,
  marker: string,
  createdAt = new Date(),
): Promise<void> {
  await database.insert(parkingLotItems).values({
    profileId,
    sessionId,
    topicId,
    question: `parked question ${marker}`,
    explored: false,
    createdAt,
  });
}

async function cleanup(database: Database): Promise<void> {
  if (seededSupportershipIds.length > 0) {
    await database
      .delete(supportership)
      .where(inArray(supportership.id, seededSupportershipIds));
  }
  await deleteV2IdentitiesForTest(database, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  seededSupportershipIds.length = 0;
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

let db: Database;

beforeAll(async () => {
  db = createIntegrationDb();
  await cleanup(db);
});

afterAll(async () => {
  await cleanup(db);
});

describe('Integration: now routes', () => {
  it('serves only self-scoped ledger candidates for the active profile', async () => {
    const profileA = await seedProfile(db, 'profile-a');
    const profileB = await seedProfile(db, 'profile-b');

    await db.insert(mentorActivityLedger).values([
      {
        profileId: profileA,
        actorJob: 'test',
        kind: 'milestone_reached',
        params: {
          marker: 'profile-a-only',
          milestoneId: 'milestone-a',
          milestoneType: 'session_count',
          threshold: 1,
        },
      },
      {
        profileId: profileB,
        actorJob: 'test',
        kind: 'milestone_reached',
        params: {
          marker: 'profile-b-only',
          milestoneId: 'milestone-b',
          milestoneType: 'session_count',
          threshold: 1,
        },
      },
    ]);

    const res = await makeApp(db, profileA).request('/v1/now?scope=self');

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: Array<{
        kind: string;
        templateKey: string;
        params: Record<string, unknown>;
      }>;
    };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.kind).toBe('ledger_moment');
    expect(body.cards[0]?.templateKey).toBe(
      'now.ledger_moment.milestone_reached',
    );
    expect(body.cards[0]?.params.marker).toBe('profile-a-only');
    expect(body.cards[0]?.params.ledgerKind).toBe('milestone_reached');
    expect(JSON.stringify(body)).not.toContain('profile-b-only');

    const [surfacedMoment] = await db
      .select({ surfacedAt: mentorActivityLedger.surfacedAt })
      .from(mentorActivityLedger)
      .where(eq(mentorActivityLedger.profileId, profileA));
    expect(surfacedMoment?.surfacedAt).not.toBeNull();
  });

  it('ranks due retention cards ahead of ledger moments for the active profile', async () => {
    const profileId = await seedProfile(db, 'ranking');
    const retention = await seedRetentionDue(
      db,
      profileId,
      'ranking',
      new Date('2020-01-01T00:00:00.000Z'),
    );

    await db.insert(mentorActivityLedger).values({
      profileId,
      actorJob: 'test',
      kind: 'milestone_reached',
      params: {
        marker: 'ranking-ledger',
        milestoneId: 'milestone-ranking',
        milestoneType: 'session_count',
        threshold: 1,
      },
    });

    const res = await makeApp(db, profileId).request('/v1/now?scope=self');

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: Array<{
        kind: string;
        deepLink: { params: Record<string, unknown> };
        params: Record<string, unknown>;
      }>;
    };
    expect(body.cards.map((card) => card.kind)).toEqual([
      'retention_due',
      'ledger_moment',
    ]);
    expect(body.cards[0]?.deepLink.params.topicId).toBe(retention.topicId);
    expect(body.cards[1]?.params.marker).toBe('ranking-ledger');
  });

  it('keeps a lower-ranked milestone reachable in self-scope overflow', async () => {
    const profileId = await seedProfile(db, 'overflow');

    await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        seedRetentionDue(
          db,
          profileId,
          `overflow-${index}`,
          new Date(`2020-01-0${index + 1}T00:00:00.000Z`),
        ),
      ),
    );
    await db.insert(mentorActivityLedger).values({
      profileId,
      actorJob: 'test',
      kind: 'milestone_reached',
      params: {
        marker: 'overflow-milestone',
        milestoneId: 'milestone-overflow',
        milestoneType: 'session_count',
        threshold: 3,
      },
    });

    const res = await makeApp(db, profileId).request('/v1/now?scope=self');

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: Array<{ kind: string }>;
      overflowCount: number;
    };
    expect(body.cards).toHaveLength(3);
    expect(body.cards.every((card) => card.kind === 'retention_due')).toBe(
      true,
    );
    expect(body.overflowCount).toBe(1);

    const overflowRes = await makeApp(db, profileId).request(
      '/v1/now/overflow?scope=self',
    );
    expect(overflowRes.status).toBe(200);
    const overflowBody = (await overflowRes.json()) as {
      items: Array<{
        kind: string;
        templateKey: string;
        params: Record<string, unknown>;
      }>;
    };
    expect(overflowBody.items).toEqual([
      expect.objectContaining({
        kind: 'ledger_moment',
        templateKey: 'now.ledger_moment.milestone_reached',
        params: expect.objectContaining({
          ledgerKind: 'milestone_reached',
          marker: 'overflow-milestone',
        }),
      }),
    ]);
  });

  it('surfaces unfinished, needs-deepening, and challenge-ready cards from DB state', async () => {
    const profileId = await seedProfile(db, 'candidate-kinds');

    const activeSessionId = await seedActiveSession(
      db,
      profileId,
      'candidate-unfinished',
    );
    const deepening = await seedNeedsDeepening(
      db,
      profileId,
      'candidate-deepening',
    );
    const challenge = await seedAssessmentEligibleTopic(
      db,
      profileId,
      'candidate-challenge',
    );

    const res = await makeApp(db, profileId).request('/v1/now?scope=self');

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: Array<{
        kind: string;
        params: Record<string, unknown>;
        deepLink: { params: Record<string, unknown> };
      }>;
    };
    expect(body.cards.map((card) => card.kind)).toEqual([
      'unfinished_session',
      'needs_deepening',
      'challenge_ready',
    ]);
    expect(body.cards[0]?.params.sessionId).toBe(activeSessionId);
    expect(body.cards[1]?.deepLink.params.topicId).toBe(deepening.topicId);
    expect(body.cards[2]?.deepLink.params.topicId).toBe(challenge.topicId);
  });

  it('promotes aged parked items above challenge-ready cards through the DB-backed feed', async () => {
    const profileId = await seedProfile(db, 'parked-aging');
    const parkedTopic = await seedTopic(db, profileId, 'parked-aging');
    const sessionId = await seedCompletedSession(
      db,
      profileId,
      parkedTopic.subjectId,
      parkedTopic.topicId,
    );
    await seedParkedQuestion(
      db,
      profileId,
      sessionId,
      parkedTopic.topicId,
      'aged-parked',
      new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    );
    const challenge = await seedAssessmentEligibleTopic(
      db,
      profileId,
      'parked-aging-challenge',
    );

    const res = await makeApp(db, profileId).request('/v1/now?scope=self');

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: Array<{
        kind: string;
        params: Record<string, unknown>;
      }>;
    };
    expect(body.cards.map((card) => card.kind)).toEqual([
      'parked_item',
      'challenge_ready',
    ]);
    expect(body.cards[0]?.params.question).toBe('parked question aged-parked');
    expect(body.cards[1]?.params.topicId).toBe(challenge.topicId);
  });

  it('surfaces unfinished, needs-deepening, and challenge-ready cards in supporter person and hub scopes', async () => {
    const supporterId = await seedProfile(db, 'supporter-candidate-kinds');
    const childId = await seedProfile(db, 'child-candidate-kinds');
    const edgeId = await seedAcceptedContract(db, supporterId, childId);

    await seedActiveSession(db, childId, 'supporter-unfinished');
    await seedNeedsDeepening(db, childId, 'supporter-deepening');
    await seedAssessmentEligibleTopic(db, childId, 'supporter-challenge');

    const personRes = await makeApp(db, supporterId).request(
      `/v1/now?scope=person&personId=${childId}`,
    );
    const hubRes = await makeApp(db, supporterId).request(
      '/v1/now?scope=supporter-hub',
    );

    expect(personRes.status).toBe(200);
    expect(hubRes.status).toBe(200);
    const personBody = (await personRes.json()) as {
      cards: Array<{ kind: string; personId?: string; edgeId?: string }>;
    };
    const hubBody = (await hubRes.json()) as {
      cards: Array<{ kind: string; personId?: string; edgeId?: string }>;
    };

    for (const body of [personBody, hubBody]) {
      expect(body.cards.map((card) => card.kind)).toEqual([
        'unfinished_session',
        'needs_deepening',
        'challenge_ready',
      ]);
      expect(body.cards.every((card) => card.personId === childId)).toBe(true);
      expect(body.cards.every((card) => card.edgeId === edgeId)).toBe(true);
    }
  });

  it('excludes transcript-adjacent artifact cards from supporter person and hub feeds', async () => {
    const supporterId = await seedProfile(db, 'supporter-artifact-wall');
    const childId = await seedProfile(db, 'child-artifact-wall');
    const edgeId = await seedAcceptedContract(db, supporterId, childId);
    const retention = await seedRetentionDue(
      db,
      childId,
      'supporter-visible-structure',
      new Date('2020-01-01T00:00:00.000Z'),
    );
    const sessionId = await seedCompletedSession(
      db,
      childId,
      retention.subjectId,
      retention.topicId,
    );
    await seedParkedQuestion(
      db,
      childId,
      sessionId,
      retention.topicId,
      'supporter-parked-secret',
    );
    await db.insert(mentorActivityLedger).values({
      profileId: childId,
      actorJob: 'test',
      kind: 'milestone_reached',
      params: {
        marker: 'supporter-ledger-secret',
        milestoneId: 'milestone-supporter-secret',
        milestoneType: 'session_count',
        threshold: 1,
      },
    });

    const personRes = await makeApp(db, supporterId).request(
      `/v1/now?scope=person&personId=${childId}`,
    );
    const hubRes = await makeApp(db, supporterId).request(
      '/v1/now?scope=supporter-hub',
    );

    expect(personRes.status).toBe(200);
    expect(hubRes.status).toBe(200);
    const personBody = (await personRes.json()) as {
      cards: Array<{ kind: string; personId?: string; edgeId?: string }>;
    };
    const hubBody = (await hubRes.json()) as {
      cards: Array<{ kind: string; personId?: string; edgeId?: string }>;
    };

    for (const body of [personBody, hubBody]) {
      expect(body.cards.map((card) => card.kind)).toEqual(['retention_due']);
      expect(body.cards[0]?.personId).toBe(childId);
      expect(body.cards[0]?.edgeId).toBe(edgeId);
      expect(JSON.stringify(body)).not.toContain('parked_item');
      expect(JSON.stringify(body)).not.toContain('ledger_moment');
      expect(JSON.stringify(body)).not.toContain('supporter-parked-secret');
      expect(JSON.stringify(body)).not.toContain('supporter-ledger-secret');
    }
  });

  it('returns 403 before building a person feed when the supporter has no active edge', async () => {
    const supporterId = await seedProfile(db, 'supporter-no-edge');
    const inaccessibleChildId = await seedProfile(db, 'inaccessible-child');
    await seedRetentionDue(
      db,
      inaccessibleChildId,
      'must-not-fall-through',
      new Date('2020-01-01T00:00:00.000Z'),
    );

    const res = await makeApp(db, supporterId).request(
      `/v1/now?scope=person&personId=${inaccessibleChildId}`,
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      message: 'You do not have access to this person.',
    });
  });

  // [WI-2237] negative-path break test: a non-revoked edge whose visibility
  // contract never reached 'accepted' must not leak the child's Now-feed
  // data through either the person-scope or supporter-hub surface.
  it('returns 403 for scope=person and no data for scope=supporter-hub when the visibility contract is pending, not accepted', async () => {
    const supporterId = await seedProfile(db, 'supporter-pending-contract');
    const childId = await seedProfile(db, 'child-pending-contract');
    const initiated = await initiateLink(db, {
      supporterPersonId: supporterId,
      supporteePersonId: childId,
      relation: 'parent',
      managedTier: false,
    });
    seededSupportershipIds.push(initiated.supportershipId);
    expect(initiated.status).toBe('pending');

    await seedRetentionDue(
      db,
      childId,
      'pending-contract-must-not-leak',
      new Date('2020-01-01T00:00:00.000Z'),
    );

    const personRes = await makeApp(db, supporterId).request(
      `/v1/now?scope=person&personId=${childId}`,
    );
    expect(personRes.status).toBe(403);
    await expect(personRes.json()).resolves.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      message: 'You do not have access to this person.',
    });

    const hubRes = await makeApp(db, supporterId).request(
      '/v1/now?scope=supporter-hub',
    );
    expect(hubRes.status).toBe(200);
    const hubBody = (await hubRes.json()) as { cards: unknown[] };
    expect(hubBody.cards).toHaveLength(0);
    expect(JSON.stringify(hubBody)).not.toContain(
      'pending-contract-must-not-leak',
    );
  });

  // [WI-2237] RGR: revoke-race guard for the correlated EXISTS embedded in
  // the candidate reads (now-feed.ts's acceptedSupporterAccessExists).
  // `resolveNowTarget` already re-checks accepted visibility on every
  // top-level `/now` call, so a plain "seed accepted -> revoke -> call
  // buildNowFeed again" test would pass with or without this round's fix
  // (that outer gate alone denies it) — it would not be a genuine
  // regression guard. This test instead calls the candidate-read seam
  // (`collectCandidatesForRequest`, exported test-only) DIRECTLY with a
  // stale personId/edgeId, bypassing `resolveNowTarget` entirely, to prove
  // the read itself denies once the edge is revoked — the exact
  // intra-call TOCTOU window Codex's review flagged (a revoke landing
  // between the pre-check and these reads). Watched RED with
  // `acceptedSupporterAccessExists` reverted (revoked edge still returned
  // the unfinished-session candidate), GREEN with the fix restored.
  it('RGR: denies the now-feed candidate read for a revoked edge even when called directly, bypassing the outer pre-check [revoke-race]', async () => {
    const supporterId = await seedProfile(db, 'supporter-revoke-race');
    const childId = await seedProfile(db, 'child-revoke-race');
    const edgeId = await seedAcceptedContract(db, supporterId, childId);
    const sessionId = await seedActiveSession(db, childId, 'revoke-race');

    const now = new Date();

    // Pre-check passes (accepted edge) and the candidate read returns the
    // real, person-scoped card — proving the correlated EXISTS is not
    // silently always-false and stripping legitimate content.
    const allowedCandidates = await collectCandidatesForRequest(
      db,
      childId,
      { scope: 'person', personId: childId },
      now,
      edgeId,
      supporterId,
    );
    expect(
      allowedCandidates.some(
        (candidate) =>
          candidate.kind === 'unfinished_session' &&
          candidate.params.sessionId === sessionId,
      ),
    ).toBe(true);

    // The supportee revokes mid-session (simulates the race window: a
    // revoke landing after the pre-check succeeded but before these reads).
    await requestSelfUnlink(db, {
      supportershipId: edgeId,
      callerPersonId: childId,
      now,
    });

    // The SAME stale personId/edgeId/viewer, re-requested directly against
    // the candidate-read seam (no fresh resolveNowTarget pre-check in
    // between), must now deny — no person-scoped Now data leaks through.
    // (`collectChallengeReadyCandidates`'s re-check rejects the whole read
    // rather than silently filtering the revoked candidate out — a
    // stronger, fail-closed denial than an empty array.)
    await expect(
      collectCandidatesForRequest(
        db,
        childId,
        { scope: 'person', personId: childId },
        now,
        edgeId,
        supporterId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  // [WI-2237] Complementary coverage for the challenge-ready supporter path's
  // snapshot-atomicity fix. The security DENIAL proof is the sibling RGR above
  // (collectCandidatesForRequest, revoke-then-recall -> ForbiddenError, watched
  // red/green). This block adds two properties: (a) an accepted edge with no
  // revoke still returns the child's challenge_ready candidate (the guard is not
  // always-deny); and (b) a revoke committed before the eligibility read (the
  // __setChallengeReadyRaceHook seam fires before the transaction opens, so the
  // revoke lands before the snapshot) is denied by the in-transaction
  // authorization read.
  //
  // What the transaction buys is CONSISTENCY, not a deny-difference a black-box
  // assertion can isolate: the authorization and every eligibility read run
  // against one `repeatable read` snapshot, so they cannot disagree (the TOCTOU
  // where auth passes on stale state but the read returns post-revoke data). By
  // design a revoke committed AFTER the snapshot is invisible and the request
  // serves the consistent accepted-at-snapshot candidate -- the accepted
  // contract (WI-2401 tracks the stronger fail-closed variant), not a leak. A
  // transaction-only revert therefore does NOT flip this to RED: the reinstated
  // pre-check still denies a pre-snapshot revoke; the transaction's guarantee is
  // demonstrated by trace + the sibling RGR, not by this deny assertion.
  describe('challenge-ready between-reads revoke race [WI-2237]', () => {
    afterEach(() => {
      __setChallengeReadyRaceHook(null);
    });

    it('accepted, no mid-call revoke: returns the child challenge-ready candidate (guard is not always-deny)', async () => {
      const supporterId = await seedProfile(db, 'supporter-window-accepted');
      const childId = await seedProfile(db, 'child-window-accepted');
      const edgeId = await seedAcceptedContract(db, supporterId, childId);
      const eligible = await seedAssessmentEligibleTopic(
        db,
        childId,
        'window-accepted',
      );
      // Edge is live and no seam is installed — nothing revokes mid-call.
      expect(edgeId).toBeTruthy();

      const candidates = await collectChallengeReadyCandidates(
        db,
        childId,
        'person',
        supporterId,
      );

      expect(
        candidates.some(
          (candidate) =>
            candidate.kind === 'challenge_ready' &&
            candidate.params.topicId === eligible.topicId,
        ),
      ).toBe(true);
    });

    it('revoke committed before the eligibility read denies the whole read — no revoked candidate leaks', async () => {
      const supporterId = await seedProfile(db, 'supporter-window-revoke');
      const childId = await seedProfile(db, 'child-window-revoke');
      const edgeId = await seedAcceptedContract(db, supporterId, childId);
      await seedAssessmentEligibleTopic(db, childId, 'window-revoke');

      // Commit the revoke before the eligibility read: the seam awaits before
      // the transaction opens, so the revoke lands before the repeatable-read
      // snapshot and the in-transaction authorization read denies it.
      __setChallengeReadyRaceHook(async () => {
        await requestSelfUnlink(db, {
          supportershipId: edgeId,
          callerPersonId: childId,
          now: new Date(),
        });
      });

      await expect(
        collectChallengeReadyCandidates(db, childId, 'person', supporterId),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
