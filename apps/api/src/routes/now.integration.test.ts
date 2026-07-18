import { resolve } from 'node:path';
import { inArray } from 'drizzle-orm';
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
      cards: Array<{ params: Record<string, unknown> }>;
    };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.params.marker).toBe('profile-a-only');
    expect(JSON.stringify(body)).not.toContain('profile-b-only');
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

  it('caps the visible now cards at three and reports the overflow count', async () => {
    const profileId = await seedProfile(db, 'overflow');

    await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        seedRetentionDue(
          db,
          profileId,
          `overflow-${index}`,
          new Date(`2020-01-0${index + 1}T00:00:00.000Z`),
        ),
      ),
    );

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
});
