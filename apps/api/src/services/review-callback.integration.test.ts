/**
 * Integration: getReviewCallbackContext — outcome derivation + profile-scoped
 * learner quote (RR-1/RR-13 warm-review-callback).
 *
 * Tests three critical branches against a real database:
 *   1. cracked  — xpStatus='verified' card, daysOverdue >= 1, quote populated
 *                 from the most recent session_events user_message.
 *   2. wobbled  — failureCount>0 card; quote NOT populated even though a
 *                 user_message exists (quote read is gated to the cracked branch).
 *   3. isolation — profile B calling with profile A's topicId gets first_time
 *                  and no quote — proves the explicit profileId filter on both
 *                  the scoped retention-card read and the session_events query.
 *
 * No internal mocks — real DB, real services.
 *
 * Seeding uses the identity-v2 pattern (organization + person +
 * ensureLegacyProfileAnchorForTest + membership), mirroring
 * dashboard.integration.test.ts. The legacy raw-`accounts` insert harness
 * (retention-data.integration.test.ts) fails on the post-identity-v2 staging
 * DB where the `accounts` table no longer exists;
 * ensureLegacyProfileAnchorForTest is schema-drift-tolerant (it inserts into
 * `accounts` only when that table is present) so this suite runs on both
 * staging (Neon) and CI (locally-migrated Postgres).
 */

import { resolve } from 'path';
import { inArray } from 'drizzle-orm';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  membership,
  organization,
  person,
  profiles,
  retentionCards,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
  legacyIdentityTableExistsForTest,
} from '../test-utils/legacy-identity-anchors';
import { getReviewCallbackContext } from './review-callback';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();
let seedCounter = 0;

let db: Database;
const orgIds: string[] = [];
const profileIds: string[] = [];

interface SeededTopic {
  profileId: string;
  orgId: string;
  subjectId: string;
  topicId: string;
  sessionId: string;
}

/**
 * Seeds a full ancestor chain for one owner learner:
 *   organization → person → legacy profile anchor → membership
 *   → subject → curriculum → book → topic → learning_session
 * The learning session is required so session_events (FK → learning_sessions)
 * can be inserted. Returns the profileId (= person.id) and topic/session ids.
 */
async function seedTopicWithSession(label: string): Promise<SeededTopic> {
  const idx = ++seedCounter;

  const [org] = await db
    .insert(organization)
    .values({ name: `RR Callback Org ${RUN_ID}_${idx}` })
    .returning({ id: organization.id });
  orgIds.push(org!.id);

  const [p] = await db
    .insert(person)
    .values({
      displayName: `RR Callback ${label}`,
      birthDate: '2010-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning({ id: person.id });
  profileIds.push(p!.id);

  await ensureLegacyProfileAnchorForTest(db, {
    profileId: p!.id,
    accountId: org!.id,
    displayName: `RR Callback ${label}`,
    birthYear: 2010,
    isOwner: true,
  });

  await db.insert(membership).values({
    personId: p!.id,
    organizationId: org!.id,
    roles: ['admin'],
  });

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: p!.id,
      name: `Subject ${label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({ subjectId: subject!.id, title: `Book ${label}`, sortOrder: 0 })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `Topic ${label}`,
      description: `Description for ${label}`,
      sortOrder: 0,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: p!.id,
      subjectId: subject!.id,
      topicId: topic!.id,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'completed',
      escalationRung: 1,
      exchangeCount: 3,
      metadata: {},
    })
    .returning({ id: learningSessions.id });

  return {
    profileId: p!.id,
    orgId: org!.id,
    subjectId: subject!.id,
    topicId: topic!.id,
    sessionId: session!.id,
  };
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set for review-callback integration tests',
    );
  }
  db = createDatabase(process.env.DATABASE_URL);
});

afterAll(async () => {
  if (profileIds.length > 0) {
    // Delete profile-scoped data explicitly by profileId. These tables exist on
    // both staging and CI; deleting `subjects` cascades curricula → books →
    // topics (and any subject-scoped sessions/events). retention_cards and
    // session_events are profile-scoped and deleted directly. This avoids
    // relying on a profiles-table cascade — `profiles` may not exist on the
    // post-identity-v2 staging DB.
    await db
      .delete(sessionEvents)
      .where(inArray(sessionEvents.profileId, profileIds));
    await db
      .delete(retentionCards)
      .where(inArray(retentionCards.profileId, profileIds));
    await db
      .delete(learningSessions)
      .where(inArray(learningSessions.profileId, profileIds));
    await db.delete(subjects).where(inArray(subjects.profileId, profileIds));
    if (await legacyIdentityTableExistsForTest(db, 'profiles')) {
      await db.delete(profiles).where(inArray(profiles.id, profileIds));
    }
  }
  // Tear down the v2 identity graph (membership, login, person, organization).
  await deleteV2IdentitiesForTest(db, { accountIds: orgIds, profileIds });
});

describeIfDb('getReviewCallbackContext (integration) [RR-1/RR-13]', () => {
  it('cracked: returns outcome=cracked, daysOverdue>=1, and lastLearnerMessage from session_events', async () => {
    const seed = await seedTopicWithSession('cracked');
    // Pin `now` so daysOverdue and daysSinceLastReview are deterministic.
    const now = new Date('2026-06-27T12:00:00Z');
    const lastReviewedAt = new Date('2026-06-25T12:00:00Z'); // 2 days before now
    const nextReviewAt = new Date('2026-06-26T12:00:00Z'); // 1 day before now → 1 day overdue

    await db.insert(retentionCards).values({
      profileId: seed.profileId,
      topicId: seed.topicId,
      repetitions: 2,
      consecutiveSuccesses: 1,
      failureCount: 0,
      xpStatus: 'verified',
      lastReviewedAt,
      nextReviewAt,
    });

    await db.insert(sessionEvents).values({
      sessionId: seed.sessionId,
      profileId: seed.profileId,
      subjectId: seed.subjectId,
      topicId: seed.topicId,
      eventType: 'user_message',
      content: 'mitochondria make ATP',
      metadata: {},
    });

    const result = await getReviewCallbackContext(
      db,
      seed.profileId,
      seed.topicId,
      'Cell Biology',
      now,
    );

    expect(result.outcome).toBe('cracked');
    expect(result.lastLearnerMessage).toBe('mitochondria make ATP');
    expect(result.daysOverdue).toBeGreaterThanOrEqual(1);
    expect(result.topicTitle).toBe('Cell Biology');
  });

  it('wobbled: returns outcome=wobbled and lastLearnerMessage=null even when session events exist', async () => {
    const seed = await seedTopicWithSession('wobbled');
    const now = new Date('2026-06-27T12:00:00Z');
    const lastReviewedAt = new Date('2026-06-26T12:00:00Z'); // 1 day ago
    const nextReviewAt = new Date('2026-06-26T06:00:00Z'); // overdue by 30h

    await db.insert(retentionCards).values({
      profileId: seed.profileId,
      topicId: seed.topicId,
      repetitions: 1,
      consecutiveSuccesses: 0,
      failureCount: 2,
      xpStatus: 'pending',
      lastReviewedAt,
      nextReviewAt,
    });

    // A user_message exists but MUST NOT be read — only the cracked branch reads it.
    await db.insert(sessionEvents).values({
      sessionId: seed.sessionId,
      profileId: seed.profileId,
      subjectId: seed.subjectId,
      topicId: seed.topicId,
      eventType: 'user_message',
      content: 'I think the answer is ATP',
      metadata: {},
    });

    const result = await getReviewCallbackContext(
      db,
      seed.profileId,
      seed.topicId,
      'Biochemistry',
      now,
    );

    expect(result.outcome).toBe('wobbled');
    expect(result.lastLearnerMessage).toBeNull();
  });

  it("isolation: profile B querying profile A's topicId gets first_time, no quote", async () => {
    const seedA = await seedTopicWithSession('iso-a');
    const seedB = await seedTopicWithSession('iso-b');
    const now = new Date('2026-06-27T12:00:00Z');

    // Cracked card + private quote seeded under profile A only.
    await db.insert(retentionCards).values({
      profileId: seedA.profileId,
      topicId: seedA.topicId,
      repetitions: 3,
      consecutiveSuccesses: 2,
      failureCount: 0,
      xpStatus: 'verified',
      lastReviewedAt: new Date('2026-06-25T12:00:00Z'),
      nextReviewAt: new Date('2026-06-26T12:00:00Z'),
    });

    await db.insert(sessionEvents).values({
      sessionId: seedA.sessionId,
      profileId: seedA.profileId,
      subjectId: seedA.subjectId,
      topicId: seedA.topicId,
      eventType: 'user_message',
      content: 'profile A private answer',
      metadata: {},
    });

    // Call with profile B's id but profile A's topicId. The scoped repo finds no
    // card for (profileB, topicA) → card=null → outcome='first_time'; the
    // session_events query is never reached, so the quote stays null.
    const result = await getReviewCallbackContext(
      db,
      seedB.profileId,
      seedA.topicId,
      'Isolation Check',
      now,
    );

    expect(result.outcome).toBe('first_time');
    expect(result.lastLearnerMessage).toBeNull();
  });
});
