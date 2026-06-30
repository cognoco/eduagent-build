import { resolve } from 'node:path';
import { Hono } from 'hono';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  mentorActivityLedger,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
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
});
