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
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import { registerProvider, unregisterProvider } from './llm';
import { createMockProvider } from './llm/test-utils';
import { generateRecallBridge } from './recall-bridge';

// ---------------------------------------------------------------------------
// DB setup — loads DATABASE_URL from .env.development.local in local dev,
// uses the already-set DATABASE_URL in CI.
// ---------------------------------------------------------------------------

// Resolve workspace root: from services/ → src → api → apps → workspace root (4 parents)
loadDatabaseEnv(resolve(__dirname, '../../../..'));

// ---------------------------------------------------------------------------
// [T-5 / BUG-749] Require DATABASE_URL — never silently skip.
//
// The previous `describe.skip` fallback hid integration regressions whenever
// the env file was missing or misnamed: the suite would record "0 failures"
// despite running zero assertions. Failing loudly matches the rest of the
// integration suite (see metering.integration.test.ts:31) and ensures CI
// fails fast if the secret pipeline ever drops DATABASE_URL.
// ---------------------------------------------------------------------------

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local at the workspace root, or supply it via Doppler in CI.',
    );
  }
  return url;
}

// ---------------------------------------------------------------------------
// Unique test-run prefix to avoid collisions between concurrent test runs
// ---------------------------------------------------------------------------

const RUN_ID = generateUUIDv7();

// ---------------------------------------------------------------------------
// Seed helpers — direct Drizzle inserts for lightweight per-test data
// ---------------------------------------------------------------------------

let db: Database;
let seedCounter = 0;
// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedProfile() {
  const idx = ++seedCounter;
  const clerkUserId = `clerk_integ_recall_${RUN_ID}_${idx}`;
  const email = `integ-recall-${RUN_ID}-${idx}@test.invalid`;

  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: 'Recall Bridge Test Learner',
    birthYear: new Date().getFullYear() - 15,
    clerkUserId,
    email,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  return { accountId, profileId };
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
  topicDescription: string,
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
  topicId: string | null,
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

describe('generateRecallBridge (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(requireDatabaseUrl());

    // Register mock LLM provider — the ONLY mocked external boundary.
    // [WI-2432] seedProfile() seeds a 15-year-old (birthYear = this year - 15),
    // and generateRecallBridge now threads that profile's ageBracket to the
    // router's under-18 vendor-exclusion gate, so a provider registered under
    // 'gemini' is correctly excluded as a candidate. Register the mock under
    // an approved-vendor id instead — 'cerebras' is the router's universal
    // default and the first candidate approvedTextFallbackConfig checks.
    unregisterProvider('cerebras');
    registerProvider(createMockProvider('cerebras'));
  });

  afterAll(async () => {
    // Clean up all test data seeded during this run.
    if (db) {
      await deleteV2IdentitiesForTest(db, {
        accountIds: [...seededAccountIds],
        profileIds: [...seededProfileIds],
      });
      seededAccountIds.length = 0;
      seededProfileIds.length = 0;
    }

    unregisterProvider('cerebras');
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
      nonExistentSessionId,
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
      'Solving equations of the form ax² + bx + c = 0',
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
      'Limits, derivatives, and integrals',
    );
    // Session belongs to profile B
    const sessionId = await seedSession(profileB, subjectId, topicId);

    // Profile A tries to access profile B's session — scoped repo should return null
    const result = await generateRecallBridge(db, profileA, sessionId);

    expect(result.questions).toEqual([]);
    expect(result.topicId).toBe('');
    expect(result.topicTitle).toBe('');
  });

  // -------------------------------------------------------------------------
  // [CR-2026-05-21-016] Break test: attacker-controlled topicId cross-profile
  //
  // Attack: profile A has a valid session, but session.topicId is set to a
  // topic owned by profile B. The unscoped query (before the fix) would return
  // profile B's topic and feed its title/description into the LLM prompt —
  // cross-profile data disclosure.
  //
  // The DB allows the FK (topicId → curriculumTopics.id) without profile
  // scoping, so a session from profile A CAN legally reference profile B's
  // topic if inserted directly. The parent-chain join (topics → books →
  // subjects.profileId = A) is the only layer that prevents the leak.
  // -------------------------------------------------------------------------

  it('[security] does not disclose topic owned by a different profile even when session.topicId points to it', async () => {
    // Profile A — the "attacker" making the call
    const { profileId: profileA } = await seedProfile();
    const subjectIdA = await seedSubject(profileA);

    // Profile B — the victim whose topic we want to protect
    const { profileId: profileB } = await seedProfile();
    const subjectIdB = await seedSubject(profileB);
    const { topicId: topicIdB } = await seedCurriculumAndTopic(
      subjectIdB,
      'SECRET TOPIC — profile B only',
      'This description must never reach profile A',
    );

    // Insert a session for profile A but wire it to profile B's topicId.
    // The DB FK only checks curriculumTopics.id existence, not ownership —
    // so this insert succeeds, creating the cross-profile wiring the attack
    // relies on.
    const sessionId = await seedSession(profileA, subjectIdA, topicIdB);

    // The parent-chain join (topics → books → subjects WHERE subjects.profileId = profileA)
    // must return nothing for topicIdB, so generateRecallBridge returns no questions
    // and does NOT include profile B's topic title/description in any output.
    const result = await generateRecallBridge(db, profileA, sessionId);

    expect(result.questions).toEqual([]);
    // topicId in the result comes from session.topicId (already revealed by the
    // session lookup), but topicTitle must be empty — the topic data itself is
    // withheld.
    expect(result.topicTitle).toBe('');
  });
});
