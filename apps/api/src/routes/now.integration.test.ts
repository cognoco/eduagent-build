import { resolve } from 'node:path';
import { Hono } from 'hono';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  mentorActivityLedger,
  parkingLotItems,
  retentionCards,
  subjects,
  supportership,
  type Database,
} from '@eduagent/database';
import { inArray, or } from 'drizzle-orm';
import { ERROR_CODES, ForbiddenError } from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { nowRoutes } from './now';
import {
  deleteLegacyAccountsForTest,
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
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
  // Mirrors the global onError handler in src/index.ts for the typed
  // service errors this suite exercises (ForbiddenError -> 403).
  app.onError((err, c) => {
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

async function seedProfile(database: Database, label: string): Promise<string> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  const clerkUserId = `${CLERK_PREFIX}-${label}`;
  const email = `${CLERK_PREFIX}-${label}@test.invalid`;

  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  await ensureLegacyProfileAnchorForTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Now ${label}`,
    birthYear: 2010,
    isOwner: true,
  });
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

async function cleanup(database: Database): Promise<void> {
  if (seededProfileIds.length > 0) {
    // supportership FKs to person are ON DELETE RESTRICT — clear edges first.
    await database
      .delete(supportership)
      .where(
        or(
          inArray(supportership.supporterPersonId, seededProfileIds),
          inArray(supportership.supporteePersonId, seededProfileIds),
        ),
      );
  }
  await deleteV2IdentitiesForTest(database, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  await deleteLegacyAccountsForTest(database, seededAccountIds);
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

  it('excludes parked_item and ledger_moment kinds from the supporter person-scope feed', async () => {
    const supporterId = await seedProfile(db, 'supporter');
    const supporteeId = await seedProfile(db, 'supportee');

    await db.insert(supportership).values({
      supporterPersonId: supporterId,
      supporteePersonId: supporteeId,
    });

    // Permitted kind for supporter visibility: a due retention card.
    await seedRetentionDue(
      db,
      supporteeId,
      'supportee-retention',
      new Date('2020-01-01T00:00:00.000Z'),
    );

    // Excluded kinds: a parked item (via a real session) + an unsurfaced
    // ledger moment, both owned by the supportee.
    const topic = await seedTopic(db, supporteeId, 'supportee-parked');
    const [session] = await db
      .insert(learningSessions)
      .values({ profileId: supporteeId, subjectId: topic.subjectId })
      .returning();
    await db.insert(parkingLotItems).values({
      sessionId: session!.id,
      profileId: supporteeId,
      question: 'supportee-parked-question',
    });
    await db.insert(mentorActivityLedger).values({
      profileId: supporteeId,
      actorJob: 'test',
      kind: 'milestone_reached',
      params: {
        marker: 'supportee-ledger-marker',
        milestoneId: 'milestone-supportee',
        milestoneType: 'session_count',
        threshold: 1,
      },
    });

    const supporterApp = makeApp(db, supporterId);
    const feedRes = await supporterApp.request(
      `/v1/now?scope=person&personId=${supporteeId}`,
    );

    expect(feedRes.status).toBe(200);
    const feedBody = (await feedRes.json()) as {
      cards: Array<{ kind: string }>;
    };
    const kinds = feedBody.cards.map((card) => card.kind);
    expect(kinds).toContain('retention_due');
    expect(kinds).not.toContain('parked_item');
    expect(kinds).not.toContain('ledger_moment');
    expect(JSON.stringify(feedBody)).not.toContain('supportee-parked-question');
    expect(JSON.stringify(feedBody)).not.toContain('supportee-ledger-marker');

    const overflowRes = await supporterApp.request(
      `/v1/now/overflow?scope=person&personId=${supporteeId}`,
    );
    expect(overflowRes.status).toBe(200);
    const overflowText = JSON.stringify(await overflowRes.json());
    expect(overflowText).not.toContain('parked_item');
    expect(overflowText).not.toContain('ledger_moment');

    // Non-vacuity control: the supportee's own self feed DOES surface both
    // seeded kinds (parked_item in the cards; ledger_moment ranks last and
    // lands in the overflow).
    const selfApp = makeApp(db, supporteeId);
    const selfRes = await selfApp.request('/v1/now?scope=self');
    expect(selfRes.status).toBe(200);
    const selfBody = (await selfRes.json()) as {
      cards: Array<{ kind: string }>;
      overflowCount: number;
    };
    expect(selfBody.cards.map((card) => card.kind)).toContain('parked_item');
    expect(selfBody.overflowCount).toBe(1);
    const selfOverflowRes = await selfApp.request(
      '/v1/now/overflow?scope=self',
    );
    expect(selfOverflowRes.status).toBe(200);
    expect(JSON.stringify(await selfOverflowRes.json())).toContain(
      'supportee-ledger-marker',
    );
  });

  it('returns 403 for a person-scope request with no supportership edge', async () => {
    const outsiderId = await seedProfile(db, 'outsider');
    const targetId = await seedProfile(db, 'target');

    const res = await makeApp(db, outsiderId).request(
      `/v1/now?scope=person&personId=${targetId}`,
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(body.message).toBe('You do not have access to this person.');
  });
});
