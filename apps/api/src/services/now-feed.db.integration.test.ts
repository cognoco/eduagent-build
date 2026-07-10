// Real-DB integration tests for the WI-1121 read-time projection collectors
// (topic_mastered, recap_ready, snapshot_ready — MMT-ADR-0022: derive-on-read,
// no ledger writer). Same seeding pattern as
// apply-retention-update.db.integration.test.ts / retention-mastery.db.integration.test.ts.
import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  progressSnapshots,
  retentionCards,
  sessionSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  deleteLegacyAccountsForTest,
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import { buildNowFeed, LEDGER_PROJECTION_RECENCY_DAYS } from './now-feed';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

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

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integ-now-feed-${RUN_ID}`;
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT = new Date(Date.now() - 1 * DAY_MS);
const STALE = new Date(
  Date.now() - (LEDGER_PROJECTION_RECENCY_DAYS + 2) * DAY_MS,
);

interface SeededFixture {
  profileId: string;
  subjectId: string;
  bookId: string;
  topicId: string;
}

async function seedFixture(
  database: Database,
  label: string,
): Promise<SeededFixture> {
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
    displayName: `Now Feed Test ${label}`,
    birthYear: 2010,
    isOwner: true,
  });
  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Now Feed Test ${label}`,
    birthYear: 2010,
    isOwner: true,
  });

  const [subject] = await database
    .insert(subjects)
    .values({
      profileId,
      name: `Subject ${label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });
  if (!subject) throw new Error('subject insert failed');

  const [curriculum] = await database
    .insert(curricula)
    .values({ subjectId: subject.id, version: 1 })
    .returning({ id: curricula.id });
  if (!curriculum) throw new Error('curriculum insert failed');

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject.id,
      title: `Book ${label}`,
      sortOrder: 0,
    })
    .returning({ id: curriculumBooks.id });
  if (!book) throw new Error('book insert failed');

  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum.id,
      bookId: book.id,
      title: `Topic ${label}`,
      description: `Description ${label}`,
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });
  if (!topic) throw new Error('topic insert failed');

  return {
    profileId,
    subjectId: subject.id,
    bookId: book.id,
    topicId: topic.id,
  };
}

async function cleanupByPrefix(database: Database): Promise<void> {
  await deleteV2IdentitiesForTest(database, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  await deleteLegacyAccountsForTest(database, seededAccountIds);
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

async function seedSession(
  database: Database,
  fixture: SeededFixture,
): Promise<string> {
  const sessionId = generateUUIDv7();
  await database.insert(learningSessions).values({
    id: sessionId,
    profileId: fixture.profileId,
    subjectId: fixture.subjectId,
    topicId: fixture.topicId,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 10,
    endedAt: RECENT,
    wallClockSeconds: 900,
  });
  return sessionId;
}

let db: Database;

beforeAll(async () => {
  db = createIntegrationDb();
  await cleanupByPrefix(db);
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

describe('now-feed derive-on-read projections — real DB (WI-1121)', () => {
  it('surfaces a recently mastered retention card as a topic_mastered ledger_moment', async () => {
    const fixture = await seedFixture(db, 'topic-mastered');
    await db.insert(retentionCards).values({
      profileId: fixture.profileId,
      topicId: fixture.topicId,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 3,
      failureCount: 0,
      consecutiveSuccesses: 3,
      xpStatus: 'verified',
      masteredAt: RECENT,
    });

    const feed = await buildNowFeed(db, fixture.profileId, 'self');
    const card = feed.cards.find(
      (c) => c.params.ledgerKind === 'topic_mastered',
    );

    expect(card).toBeDefined();
    expect(card?.kind).toBe('ledger_moment');
    expect(card?.templateKey).toBe('now.ledger_moment.topic_mastered');
    expect(card?.params.subjectId).toBe(fixture.subjectId);
    expect(card?.deepLink).toEqual({
      route: 'subject.hub',
      params: { subjectId: fixture.subjectId },
      chain: [],
    });
  });

  it('excludes a retention card mastered outside the recency window', async () => {
    const fixture = await seedFixture(db, 'topic-mastered-stale');
    await db.insert(retentionCards).values({
      profileId: fixture.profileId,
      topicId: fixture.topicId,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 3,
      failureCount: 0,
      consecutiveSuccesses: 3,
      xpStatus: 'verified',
      masteredAt: STALE,
    });

    const feed = await buildNowFeed(db, fixture.profileId, 'self');
    expect(
      feed.cards.some((c) => c.params.ledgerKind === 'topic_mastered'),
    ).toBe(false);
  });

  it('surfaces a session with a recent learnerRecap as a recap_ready ledger_moment', async () => {
    const fixture = await seedFixture(db, 'recap-ready');
    const sessionId = await seedSession(db, fixture);
    const [summary] = await db
      .insert(sessionSummaries)
      .values({
        sessionId,
        profileId: fixture.profileId,
        topicId: fixture.topicId,
        status: 'accepted',
        learnerRecap: '- You worked through this topic with your mentor.',
      })
      .returning({ id: sessionSummaries.id });
    if (!summary) throw new Error('session summary insert failed');
    await db
      .update(sessionSummaries)
      .set({ updatedAt: RECENT })
      .where(eq(sessionSummaries.id, summary.id));

    const feed = await buildNowFeed(db, fixture.profileId, 'self');
    const card = feed.cards.find((c) => c.params.ledgerKind === 'recap_ready');

    expect(card).toBeDefined();
    expect(card?.templateKey).toBe('now.ledger_moment.recap_ready');
    expect(card?.params.sessionId).toBe(sessionId);
    expect(card?.params.subjectId).toBeUndefined();
    expect(card?.deepLink).toEqual({
      route: 'session.resume',
      params: { sessionId },
      chain: [],
    });
  });

  it('excludes a purged session summary even with a recent learnerRecap timestamp', async () => {
    const fixture = await seedFixture(db, 'recap-ready-purged');
    const sessionId = await seedSession(db, fixture);
    const [summary] = await db
      .insert(sessionSummaries)
      .values({
        sessionId,
        profileId: fixture.profileId,
        topicId: fixture.topicId,
        status: 'accepted',
        learnerRecap: '- You worked through this topic with your mentor.',
      })
      .returning({ id: sessionSummaries.id });
    if (!summary) throw new Error('session summary insert failed');
    await db
      .update(sessionSummaries)
      .set({ updatedAt: RECENT, purgedAt: RECENT })
      .where(eq(sessionSummaries.id, summary.id));

    const feed = await buildNowFeed(db, fixture.profileId, 'self');
    expect(feed.cards.some((c) => c.params.ledgerKind === 'recap_ready')).toBe(
      false,
    );
  });

  it('surfaces the latest progress snapshot as a snapshot_ready ledger_moment routed to journal', async () => {
    const fixture = await seedFixture(db, 'snapshot-ready');
    await db.insert(progressSnapshots).values({
      profileId: fixture.profileId,
      snapshotDate: new Date().toISOString().slice(0, 10),
      metrics: {},
    });

    const feed = await buildNowFeed(db, fixture.profileId, 'self');
    const card = feed.cards.find(
      (c) => c.params.ledgerKind === 'snapshot_ready',
    );

    expect(card).toBeDefined();
    expect(card?.templateKey).toBe('now.ledger_moment.snapshot_ready');
    expect(card?.deepLink).toEqual({
      route: 'journal',
      params: {},
      chain: [],
    });
  });

  it('excludes a progress snapshot outside the recency window', async () => {
    const fixture = await seedFixture(db, 'snapshot-ready-stale');
    const staleDate = new Date(
      Date.now() - (LEDGER_PROJECTION_RECENCY_DAYS + 2) * DAY_MS,
    )
      .toISOString()
      .slice(0, 10);
    await db.insert(progressSnapshots).values({
      profileId: fixture.profileId,
      snapshotDate: staleDate,
      metrics: {},
    });

    const feed = await buildNowFeed(db, fixture.profileId, 'self');
    expect(
      feed.cards.some((c) => c.params.ledgerKind === 'snapshot_ready'),
    ).toBe(false);
  });
});
