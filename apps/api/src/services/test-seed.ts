/**
 * Test Data Seeding Service
 *
 * Creates pre-configured test scenarios for E2E and integration testing.
 * NEVER use in production — guarded by ENVIRONMENT check in route middleware.
 *
 * All seed accounts use `clerk_seed_` prefix in clerkUserId so resetDatabase()
 * can safely scope deletions to test data only.
 *
 * When CLERK_SECRET_KEY is present, creates real Clerk users so Maestro flows
 * can sign in via the app's Clerk-powered login UI. When absent (e.g., unit
 * tests), falls back to generating fake `clerk_seed_*` IDs.
 */
import { like, inArray, or } from 'drizzle-orm';
import {
  accounts,
  profiles,
  subjects,
  curricula,
  curriculumTopics,
  learningSessions,
  sessionEvents,
  retentionCards,
  assessments,
  subscriptions,
  quotaPools,
  familyLinks,
  consentStates,
  streaks,
  needsDeepeningTopics,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Prefix used for all seed-created Clerk user IDs */
export const SEED_CLERK_PREFIX = 'clerk_seed_';

/** Standard test password for all seed-created Clerk users */
const SEED_PASSWORD = 'TestPass123!';

/** Clerk REST API base URL */
const CLERK_API_BASE = 'https://api.clerk.com/v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeedScenario =
  | 'onboarding-complete'
  | 'learning-active'
  | 'retention-due'
  | 'failed-recall-3x'
  | 'parent-with-children'
  | 'trial-active'
  | 'trial-expired'
  | 'multi-subject';

/** Environment bindings needed by the seed service */
export interface SeedEnv {
  /** Clerk secret key for Backend API calls. Optional — falls back to fake IDs. */
  CLERK_SECRET_KEY?: string;
}

export interface SeedResult {
  scenario: SeedScenario;
  accountId: string;
  profileId: string;
  email: string;
  /** Password for Clerk sign-in. Present when Clerk user was created. */
  password: string;
  /** Additional IDs specific to the scenario */
  ids: Record<string, string>;
}

export interface ResetResult {
  deletedCount: number;
  clerkUsersDeleted: number;
}

// ---------------------------------------------------------------------------
// Clerk REST API helpers
// ---------------------------------------------------------------------------

interface ClerkUser {
  id: string;
  email_addresses: Array<{ email_address: string }>;
}

/**
 * Creates a real Clerk user via the Backend API.
 * Returns the Clerk user ID (e.g., `user_2abc...`).
 *
 * If CLERK_SECRET_KEY is not set, generates a fake `clerk_seed_*` ID instead.
 */
async function createClerkTestUser(
  email: string,
  env: SeedEnv
): Promise<{ clerkUserId: string; password: string }> {
  if (!env.CLERK_SECRET_KEY) {
    // Fallback for environments without Clerk (unit tests, CI without secrets)
    return {
      clerkUserId: `${SEED_CLERK_PREFIX}${generateUUIDv7()}`,
      password: SEED_PASSWORD,
    };
  }

  const res = await fetch(`${CLERK_API_BASE}/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email_address: [email],
      password: SEED_PASSWORD,
      skip_password_checks: true,
      // Mark as test user with external_id for cleanup
      external_id: `${SEED_CLERK_PREFIX}${generateUUIDv7()}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clerk user creation failed (${res.status}): ${body}`);
  }

  const user = (await res.json()) as ClerkUser;
  return { clerkUserId: user.id, password: SEED_PASSWORD };
}

/**
 * Deletes all Clerk users that were created by the seed service.
 * Identifies seed users by external_id prefix `clerk_seed_`.
 * Returns the Clerk user IDs that were deleted (for DB cleanup).
 */
async function deleteClerkTestUsers(
  env: SeedEnv
): Promise<{ count: number; clerkUserIds: string[] }> {
  if (!env.CLERK_SECRET_KEY) return { count: 0, clerkUserIds: [] };

  // List users with our seed prefix in external_id
  const listRes = await fetch(
    `${CLERK_API_BASE}/users?external_id_prefix=${encodeURIComponent(
      SEED_CLERK_PREFIX
    )}&limit=100`,
    {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    }
  );

  if (!listRes.ok) return { count: 0, clerkUserIds: [] };

  const users = (await listRes.json()) as ClerkUser[];
  let deleted = 0;
  const deletedIds: string[] = [];

  for (const user of users) {
    const delRes = await fetch(`${CLERK_API_BASE}/users/${user.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    });
    if (delRes.ok) {
      deleted++;
      deletedIds.push(user.id);
    }
  }

  return { count: deleted, clerkUserIds: deletedIds };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pastDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

function futureDate(daysAhead: number): Date {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
}

async function createBaseAccount(
  db: Database,
  email: string,
  clerkUserId: string
): Promise<{ accountId: string }> {
  const accountId = generateUUIDv7();
  await db.insert(accounts).values({
    id: accountId,
    clerkUserId,
    email,
  });
  return { accountId };
}

async function createBaseProfile(
  db: Database,
  accountId: string,
  opts: {
    displayName: string;
    personaType: 'TEEN' | 'LEARNER' | 'PARENT';
    isOwner?: boolean;
  }
): Promise<string> {
  const profileId = generateUUIDv7();
  await db.insert(profiles).values({
    id: profileId,
    accountId,
    displayName: opts.displayName,
    personaType: opts.personaType,
    isOwner: opts.isOwner ?? true,
  });
  return profileId;
}

async function createSubjectWithCurriculum(
  db: Database,
  profileId: string,
  name: string,
  status: 'active' | 'paused' | 'archived' = 'active',
  topicCount = 3
): Promise<{ subjectId: string; curriculumId: string; topicIds: string[] }> {
  const subjectId = generateUUIDv7();
  await db.insert(subjects).values({
    id: subjectId,
    profileId,
    name,
    status,
  });

  const curriculumId = generateUUIDv7();
  await db.insert(curricula).values({
    id: curriculumId,
    subjectId,
    version: 1,
  });

  // Batch insert all topics in a single INSERT statement
  const topicValues = Array.from({ length: topicCount }, (_, i) => {
    const topicId = generateUUIDv7();
    return {
      id: topicId,
      curriculumId,
      title: `${name} Topic ${i + 1}`,
      description: `Introduction to ${name} Topic ${i + 1}`,
      sortOrder: i,
      relevance: 'core' as const,
      estimatedMinutes: 30,
    };
  });

  await db.insert(curriculumTopics).values(topicValues);

  const topicIds = topicValues.map((t) => t.id);
  return { subjectId, curriculumId, topicIds };
}

// ---------------------------------------------------------------------------
// Scenario Seeders
// ---------------------------------------------------------------------------

type SeederFn = (
  db: Database,
  email: string,
  env: SeedEnv
) => Promise<SeedResult>;

async function seedOnboardingComplete(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Learner',
    personaType: 'LEARNER',
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: 'parent-seed@example.com',
    respondedAt: new Date(),
  });

  return {
    scenario: 'onboarding-complete',
    accountId,
    profileId,
    email,
    password,
    ids: {},
  };
}

async function seedLearningActive(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Active Learner',
    personaType: 'LEARNER',
  });

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'World History'
  );

  const sessionId = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId,
    subjectId,
    topicId: topicIds[0],
    sessionType: 'learning',
    status: 'active',
    exchangeCount: 3,
  });

  // Batch insert session events in a single INSERT statement
  const eventValues = Array.from({ length: 3 }, (_, i) => ({
    id: generateUUIDv7(),
    sessionId,
    profileId,
    subjectId,
    eventType:
      i % 2 === 0 ? ('user_message' as const) : ('ai_response' as const),
    content:
      i % 2 === 0
        ? 'Tell me about ancient Rome'
        : 'Ancient Rome was founded in 753 BC...',
  }));

  await db.insert(sessionEvents).values(eventValues);

  await db.insert(streaks).values({
    id: generateUUIDv7(),
    profileId,
    currentStreak: 3,
    longestStreak: 5,
    lastActivityDate: new Date().toISOString().split('T')[0],
  });

  return {
    scenario: 'learning-active',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, sessionId, topicId: topicIds[0] },
  };
}

async function seedRetentionDue(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Review Learner',
    personaType: 'LEARNER',
  });

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Biology'
  );

  // Batch insert retention cards in a single INSERT statement
  const cardValues = topicIds.map((topicId) => ({
    id: generateUUIDv7(),
    profileId,
    topicId,
    easeFactor: '2.50',
    intervalDays: 7,
    repetitions: 2,
    nextReviewAt: pastDate(1), // Due yesterday
    lastReviewedAt: pastDate(8),
  }));

  await db.insert(retentionCards).values(cardValues);

  return {
    scenario: 'retention-due',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, retentionCardId: cardValues[0].id },
  };
}

async function seedFailedRecall3x(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Struggling Learner',
    personaType: 'LEARNER',
  });

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Chemistry'
  );

  const targetTopicId = topicIds[0];

  // Create retention card with low ease factor (struggling)
  await db.insert(retentionCards).values({
    id: generateUUIDv7(),
    profileId,
    topicId: targetTopicId,
    easeFactor: '1.30',
    intervalDays: 1,
    repetitions: 5,
    nextReviewAt: pastDate(1),
    lastReviewedAt: pastDate(2),
    failureCount: 3,
  });

  // Batch insert 3 failed assessments in a single INSERT statement
  const assessmentValues = Array.from({ length: 3 }, () => ({
    id: generateUUIDv7(),
    profileId,
    subjectId,
    topicId: targetTopicId,
    verificationDepth: 'recall' as const,
    status: 'failed' as const,
    masteryScore: '0.20',
    qualityRating: 1,
  }));

  await db.insert(assessments).values(assessmentValues);

  // Mark topic as needs-deepening
  await db.insert(needsDeepeningTopics).values({
    id: generateUUIDv7(),
    profileId,
    subjectId,
    topicId: targetTopicId,
    consecutiveSuccessCount: 0,
  });

  return {
    scenario: 'failed-recall-3x',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, topicId: targetTopicId },
  };
}

async function seedParentWithChildren(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Parent profile
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Parent',
    personaType: 'PARENT',
    isOwner: true,
  });

  // Child profile (teen)
  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Teen',
    personaType: 'TEEN',
    isOwner: false,
  });

  // Family link
  await db.insert(familyLinks).values({
    id: generateUUIDv7(),
    parentProfileId,
    childProfileId,
  });

  // Consent for child
  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId: childProfileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: email,
    respondedAt: new Date(),
  });

  // Give child a subject with some progress
  const { subjectId } = await createSubjectWithCurriculum(
    db,
    childProfileId,
    'Mathematics'
  );

  // Child has a completed session
  const sessionId = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId: childProfileId,
    subjectId,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 8,
    endedAt: pastDate(1),
  });

  return {
    scenario: 'parent-with-children',
    accountId,
    profileId: parentProfileId,
    email,
    password,
    ids: { parentProfileId, childProfileId, subjectId, sessionId },
  };
}

async function seedTrialActive(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Trial User',
    personaType: 'LEARNER',
  });

  const subscriptionId = generateUUIDv7();
  await db.insert(subscriptions).values({
    id: subscriptionId,
    accountId,
    tier: 'plus',
    status: 'trial',
    trialEndsAt: futureDate(7),
    currentPeriodStart: new Date(),
    currentPeriodEnd: futureDate(14),
  });

  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: 500,
    usedThisMonth: 42,
    cycleResetAt: futureDate(30),
  });

  return {
    scenario: 'trial-active',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId },
  };
}

async function seedTrialExpired(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Expired Trial User',
    personaType: 'LEARNER',
  });

  const subscriptionId = generateUUIDv7();
  await db.insert(subscriptions).values({
    id: subscriptionId,
    accountId,
    tier: 'free',
    status: 'expired',
    trialEndsAt: pastDate(3),
    currentPeriodStart: pastDate(17),
    currentPeriodEnd: pastDate(3),
  });

  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: 50, // Free tier limit
    usedThisMonth: 12,
    cycleResetAt: futureDate(13),
  });

  return {
    scenario: 'trial-expired',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId },
  };
}

async function seedMultiSubject(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Multi-Subject Learner',
    personaType: 'LEARNER',
  });

  const { subjectId: activeSubjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Physics',
    'active'
  );

  const { subjectId: pausedSubjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Literature',
    'paused'
  );

  const { subjectId: archivedSubjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Art History',
    'archived'
  );

  return {
    scenario: 'multi-subject',
    accountId,
    profileId,
    email,
    password,
    ids: { activeSubjectId, pausedSubjectId, archivedSubjectId },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const SCENARIO_MAP: Record<SeedScenario, SeederFn> = {
  'onboarding-complete': seedOnboardingComplete,
  'learning-active': seedLearningActive,
  'retention-due': seedRetentionDue,
  'failed-recall-3x': seedFailedRecall3x,
  'parent-with-children': seedParentWithChildren,
  'trial-active': seedTrialActive,
  'trial-expired': seedTrialExpired,
  'multi-subject': seedMultiSubject,
};

export const VALID_SCENARIOS = Object.keys(SCENARIO_MAP) as SeedScenario[];

export async function seedScenario(
  db: Database,
  scenario: SeedScenario,
  email: string,
  env: SeedEnv = {}
): Promise<SeedResult> {
  const seeder = SCENARIO_MAP[scenario];
  if (!seeder) {
    throw new Error(`Unknown scenario: ${scenario}`);
  }
  return seeder(db, email, env);
}

export async function resetDatabase(
  db: Database,
  env: SeedEnv = {}
): Promise<ResetResult> {
  // Delete Clerk test users first (before DB cleanup removes the mapping).
  // Collects real Clerk user IDs so we can also delete their DB accounts.
  const { count: clerkUsersDeleted, clerkUserIds } = await deleteClerkTestUsers(
    env
  );

  // Build WHERE clause: match fake clerk_seed_* IDs OR real Clerk user IDs
  // that were created by the seed service.
  const conditions = [like(accounts.clerkUserId, `${SEED_CLERK_PREFIX}%`)];
  if (clerkUserIds.length > 0) {
    conditions.push(inArray(accounts.clerkUserId, clerkUserIds));
  }

  // Child tables (profiles, subjects, sessions, etc.) cascade automatically.
  const deleted = await db
    .delete(accounts)
    .where(or(...conditions))
    .returning({ id: accounts.id });

  return { deletedCount: deleted.length, clerkUsersDeleted };
}
