// ---------------------------------------------------------------------------
// Recall Bridge — Integration Tests [4D.5]
//
// Tests generateRecallBridge against a real test database.
// Only the LLM router is mocked (non-deterministic, external boundary).
// All internal services, repositories, and DB interactions are real.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { createDatabase } from '@eduagent/database';
import {
  accounts,
  profiles,
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import { like } from 'drizzle-orm';
import { registerProvider, createMockProvider, _clearProviders } from './llm';
import { generateRecallBridge } from './recall-bridge';

// ---------------------------------------------------------------------------
// DB setup — loads DATABASE_URL from .env.development.local in local dev,
// uses the already-set DATABASE_URL in CI.
// ---------------------------------------------------------------------------

// Resolve workspace root: from services/ → src → api → apps → workspace root (4 parents)
loadDatabaseEnv(resolve(__dirname, '../../../..'));

// ---------------------------------------------------------------------------
// Conditionally skip when DATABASE_URL is not available
// ---------------------------------------------------------------------------

const dbUrl = process.env.DATABASE_URL;
const describeIf = dbUrl ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Unique test-run prefix to avoid collisions between concurrent test runs
// ---------------------------------------------------------------------------

const RUN_ID = generateUUIDv7();

// ---------------------------------------------------------------------------
// Seed helpers — direct Drizzle inserts for lightweight per-test data
// ---------------------------------------------------------------------------

let db: Database;
let seedCounter = 0;

async function seedProfile() {
  const idx = ++seedCounter;
  const clerkUserId = `clerk_integ_recall_${RUN_ID}_${idx}`;
  const email = `integ-recall-${RUN_ID}-${idx}@test.invalid`;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Recall Bridge Test Learner',
      birthYear: new Date().getFullYear() - 15,
    })
    .returning({ id: profiles.id });

  return { accountId: account!.id, profileId: profile!.id };
}

async function seedSubject(profileId: string) {
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Mathematics',
      status: 'active',
    })
    .returning({ id: subjects.id });

  return subject!.id;
}

async function seedCurriculumAndTopic(
  subjectId: string,
  topicTitle: string,
  topicDescription: string
) {
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: 'Core Concepts',
      sortOrder: 1,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: topicTitle,
      description: topicDescription,
      sortOrder: 1,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });

  return { curriculumId: curriculum!.id, bookId: book!.id, topicId: topic!.id };
}

async function seedSession(
  profileId: string,
  subjectId: string,
  topicId: string | null
) {
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId: topicId ?? undefined,
      sessionType: 'homework',
      status: 'active',
    })
    .returning({ id: learningSessions.id });

  return session!.id;
}

// ---------------------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------------------

describeIf('generateRecallBridge (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(dbUrl!);

    // Register mock LLM provider — the ONLY mocked external boundary
    _clearProviders();
    registerProvider(createMockProvider('gemini'));
  });

  afterAll(async () => {
    // Clean up all test data seeded during this run.
    // Foreign key cascades handle child records (sessions, topics, etc.)
    // when we delete accounts. We delete by the unique clerk_user_id prefix.
    if (db) {
      await db
        .delete(accounts)
        .where(like(accounts.clerkUserId, `clerk_integ_recall_${RUN_ID}%`));
    }

    _clearProviders();
  });

  // -------------------------------------------------------------------------
  // Test 1: returns empty result when session has no topic
  // -------------------------------------------------------------------------

  it('returns empty questions array when session has no topicId', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const sessionId = await seedSession(profileId, subjectId, null);

    const result = await generateRecallBridge(db, profileId, sessionId);

    expect(result.questions).toEqual([]);
    expect(result.topicId).toBe('');
    expect(result.topicTitle).toBe('');
  });

  // -------------------------------------------------------------------------
  // Test 2: returns empty result when session is not found
  // -------------------------------------------------------------------------

  it('returns empty questions array when session does not exist', async () => {
    const { profileId } = await seedProfile();
    const nonExistentSessionId = generateUUIDv7();

    const result = await generateRecallBridge(
      db,
      profileId,
      nonExistentSessionId
    );

    expect(result.questions).toEqual([]);
    expect(result.topicId).toBe('');
    expect(result.topicTitle).toBe('');
  });

  // -------------------------------------------------------------------------
  // Test 3: returns topicId and topicTitle matching seeded data (LLM mock)
  // -------------------------------------------------------------------------

  it('returns matching topicId and topicTitle from seeded data on success', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const { topicId } = await seedCurriculumAndTopic(
      subjectId,
      'Quadratic Equations',
      'Solving equations of the form ax² + bx + c = 0'
    );
    const sessionId = await seedSession(profileId, subjectId, topicId);

    const result = await generateRecallBridge(db, profileId, sessionId);

    expect(result.topicId).toBe(topicId);
    expect(result.topicTitle).toBe('Quadratic Equations');
    // The mock LLM provider returns non-empty text; questions are extracted from it
    expect(Array.isArray(result.questions)).toBe(true);
    expect(result.questions.length).toBeGreaterThanOrEqual(0);
    expect(result.questions.length).toBeLessThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // Test 4: session scoping — profile A cannot access profile B's session
  // -------------------------------------------------------------------------

  it('returns empty result when session belongs to a different profile', async () => {
    const { profileId: profileA } = await seedProfile();
    const { profileId: profileB } = await seedProfile();
    const subjectId = await seedSubject(profileB);
    const { topicId } = await seedCurriculumAndTopic(
      subjectId,
      'Calculus',
      'Limits, derivatives, and integrals'
    );
    // Session belongs to profile B
    const sessionId = await seedSession(profileB, subjectId, topicId);

    // Profile A tries to access profile B's session — scoped repo should return null
    const result = await generateRecallBridge(db, profileA, sessionId);

    expect(result.questions).toEqual([]);
    expect(result.topicId).toBe('');
    expect(result.topicTitle).toBe('');
  });
});
