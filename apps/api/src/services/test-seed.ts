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
import { eq, like, inArray, or } from 'drizzle-orm';
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
import {
  birthDateFromBirthYear,
  birthYearFromDateLike,
} from '@eduagent/schemas';
import { listSubjects } from './subject';
import { getTierConfig } from './subscription';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Prefix used for all seed-created Clerk user IDs */
export const SEED_CLERK_PREFIX = 'clerk_seed_';

/** Default test password for all seed-created Clerk users.
 * Read from SEED_PASSWORD env var when available, falling back to a hardcoded default.
 * Must NOT appear in HaveIBeenPwned — Clerk blocks sign-in for breached passwords.
 * Avoid special characters (!, -, etc.) — they may cause encoding issues in Clerk's
 * Backend API user creation endpoint. */
const DEFAULT_SEED_PASSWORD = 'Mentomate2026xK';

/** Clerk REST API base URL */
const CLERK_API_BASE = 'https://api.clerk.com/v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeedScenario =
  | 'onboarding-complete'
  | 'onboarding-no-subject'
  | 'learning-active'
  | 'retention-due'
  | 'failed-recall-3x'
  | 'parent-with-children'
  | 'trial-active'
  | 'trial-expired'
  | 'multi-subject'
  | 'multi-subject-practice'
  | 'homework-ready'
  | 'trial-expired-child'
  | 'consent-withdrawn'
  | 'consent-withdrawn-solo'
  | 'parent-solo'
  | 'pre-profile'
  | 'consent-pending'
  | 'parent-multi-child'
  | 'daily-limit-reached';

/** Environment bindings needed by the seed service */
export interface SeedEnv {
  /** Clerk secret key for Backend API calls. Optional — falls back to fake IDs. */
  CLERK_SECRET_KEY?: string;
  /** Override seed password via env. Falls back to DEFAULT_SEED_PASSWORD. */
  SEED_PASSWORD?: string;
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
  external_id: string | null;
}

/**
 * Finds or creates a real Clerk user via the Backend API.
 * If a user with the given email already exists, reuses it.
 * Returns the Clerk user ID (e.g., `user_2abc...`).
 *
 * If CLERK_SECRET_KEY is not set, generates a fake `clerk_seed_*` ID instead.
 */
async function createClerkTestUser(
  email: string,
  env: SeedEnv
): Promise<{ clerkUserId: string; password: string }> {
  const password = env.SEED_PASSWORD ?? DEFAULT_SEED_PASSWORD;

  if (!env.CLERK_SECRET_KEY) {
    // Fallback for environments without Clerk (unit tests, CI without secrets)
    return {
      clerkUserId: `${SEED_CLERK_PREFIX}${generateUUIDv7()}`,
      password,
    };
  }

  // Step 1: Check if user already exists (avoids 422 on duplicate email)
  const existingUser = await findClerkUserByEmail(email, env);

  let userId: string;
  const seedExternalId = `${SEED_CLERK_PREFIX}${generateUUIDv7()}`;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Step 2: Create user (password set here may silently fail for special chars)
    const res = await fetch(`${CLERK_API_BASE}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_address: [email],
        password,
        skip_password_checks: true,
        // Mark as test user with external_id for cleanup
        external_id: seedExternalId,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Clerk user creation failed (${res.status}): ${body}`);
    }

    const user = (await res.json()) as ClerkUser;
    userId = user.id;
  }

  // Step 3: PATCH to reliably set password + bypass CAPTCHA for E2E testing.
  // Always PATCH even for existing users — ensures password, bypass_client_trust,
  // and external_id (for cleanup tracking) are current.
  const patchRes = await fetch(`${CLERK_API_BASE}/users/${userId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password,
      skip_password_checks: true,
      bypass_client_trust: true,
      // Tag reused users with seed external_id so deleteClerkTestUsers can find them
      external_id: seedExternalId,
    }),
  });

  if (!patchRes.ok) {
    const body = await patchRes.text();
    throw new Error(`Clerk user PATCH failed (${patchRes.status}): ${body}`);
  }

  return { clerkUserId: userId, password };
}

/** Look up a Clerk user by email address. Returns null if not found.
 * Throws on non-OK responses (rate limits, 5xx) to fail fast.
 * Requires CLERK_SECRET_KEY — returns null without it. */
async function findClerkUserByEmail(
  email: string,
  env: SeedEnv
): Promise<ClerkUser | null> {
  if (!env.CLERK_SECRET_KEY) return null;

  const params = new URLSearchParams({ email_address: email });
  const res = await fetch(`${CLERK_API_BASE}/users?${params.toString()}`, {
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clerk user lookup failed (${res.status}): ${body}`);
  }

  const users = (await res.json()) as ClerkUser[];
  return users.length > 0 ? users[0]! : null;
}

/**
 * Deletes all Clerk users that were created by the seed service.
 * Identifies seed users by external_id prefix `clerk_seed_`.
 * Returns the Clerk user IDs that were deleted (for DB cleanup).
 *
 * D-07: `external_id_prefix` is not a valid Clerk Backend API parameter —
 * Clerk silently ignores it and returns unfiltered users. We now paginate
 * through all users and filter client-side by `external_id` prefix.
 */
async function deleteClerkTestUsers(
  env: SeedEnv
): Promise<{ count: number; clerkUserIds: string[] }> {
  if (!env.CLERK_SECRET_KEY) return { count: 0, clerkUserIds: [] };

  // Paginate through Clerk users and filter client-side by external_id prefix.
  // Clerk's list users API supports `limit` and `offset` for pagination.
  const seedUsers: ClerkUser[] = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const listRes = await fetch(
      `${CLERK_API_BASE}/users?limit=${pageSize}&offset=${offset}&order_by=-created_at`,
      {
        headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
      }
    );

    if (!listRes.ok) break;

    const users = (await listRes.json()) as ClerkUser[];
    if (users.length === 0) break;

    // Client-side filter: only keep users whose external_id starts with our seed prefix
    for (const user of users) {
      if (user.external_id?.startsWith(SEED_CLERK_PREFIX)) {
        seedUsers.push(user);
      }
    }

    // If we got fewer than pageSize, we've reached the end
    if (users.length < pageSize) break;
    offset += pageSize;
  }

  let deleted = 0;
  const deletedIds: string[] = [];

  for (const user of seedUsers) {
    // Revert bypass_client_trust before deleting — belt-and-suspenders in case
    // the delete fails, so the user doesn't retain elevated CAPTCHA-bypass perms.
    await fetch(`${CLERK_API_BASE}/users/${user.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bypass_client_trust: false }),
    }).catch((_e: unknown) => {
      // Best-effort — don't block cleanup if PATCH fails
    });

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

// Relative birth years — keeps fixtures stable as calendar year advances.
// Age 17 → LEARNER persona, one year clear of the consent gate (age ≤ 16).
const LEARNER_BIRTH_YEAR = new Date().getFullYear() - 17;

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
    birthYear: number;
    isOwner?: boolean;
    birthDate?: Date;
  }
): Promise<string> {
  const profileId = generateUUIDv7();

  await db.insert(profiles).values({
    id: profileId,
    accountId,
    displayName: opts.displayName,
    birthYear: opts.birthYear,
    isOwner: opts.isOwner ?? true,
    birthDate: opts.birthDate ?? birthDateFromBirthYear(opts.birthYear),
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

/** Onboarding complete but with 0 subjects — for testing the empty-state
 *  /create-subject redirect that home.tsx triggers when subjects.length === 0.
 *  This is the original semantics of onboarding-complete before BUG-34 added
 *  a default subject. */
async function seedOnboardingNoSubject(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Learner',
    birthYear: LEARNER_BIRTH_YEAR,
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
    scenario: 'onboarding-no-subject',
    accountId,
    profileId,
    email,
    password,
    ids: {},
  };
}

async function seedOnboardingComplete(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Learner',
    birthYear: LEARNER_BIRTH_YEAR,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: 'parent-seed@example.com',
    respondedAt: new Date(),
  });

  // BUG-34 fix: Add a subject so the home screen stays visible after sign-in.
  // Without a subject, home.tsx auto-redirects to /create-subject, breaking
  // flows that expect home-scroll-view to remain visible.
  // NOTE: This changes the scenario's semantics — it no longer represents
  // "just finished onboarding, no subjects." A separate onboarding-no-subject
  // scenario would be needed to test the empty-state /create-subject redirect.
  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'General Studies'
  );

  // FIX-06: Create retention cards with mixed xpStatus so the curriculum_complete
  // coaching card does NOT trigger. The server-side check
  // (coaching-cards.ts Priority 3) fires when allCards.length >= 3 AND every
  // card has xpStatus === 'verified'. The client-side useCoachingCard hook
  // shows "You've mastered your subjects!" when there's a subject but no
  // continue-suggestion (all topics verified). Keeping one topic at 'pending'
  // prevents both paths.
  const now = new Date();
  const retentionCardValues = topicIds.map((topicId, i) => ({
    id: generateUUIDv7(),
    profileId,
    topicId,
    easeFactor: '2.50',
    intervalDays: i < 2 ? 7 : 1,
    repetitions: i < 2 ? 3 : 0,
    failureCount: 0,
    consecutiveSuccesses: i < 2 ? 3 : 0,
    // First two topics verified, third topic pending — prevents curriculum_complete
    xpStatus: (i < 2 ? 'verified' : 'pending') as 'verified' | 'pending',
    nextReviewAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days from now (not overdue)
    lastReviewedAt: now,
  }));
  await db.insert(retentionCards).values(retentionCardValues);

  return {
    scenario: 'onboarding-complete',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, topicId: topicIds[0]! },
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
    birthYear: LEARNER_BIRTH_YEAR,
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
    ids: { subjectId, sessionId, topicId: topicIds[0]! },
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
    birthYear: LEARNER_BIRTH_YEAR,
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
    ids: { subjectId, retentionCardId: cardValues[0]!.id },
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
    birthYear: LEARNER_BIRTH_YEAR,
  });

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Chemistry'
  );

  const targetTopicId = topicIds[0]!;

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
    birthYear: 1990,
    isOwner: true,
  });

  // Child profile (teen)
  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Teen',
    birthYear: 2014,
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

async function seedParentMultiChild(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Parent profile
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Parent',
    birthYear: 1990,
    isOwner: true,
  });

  // Child 1 — teen with active learning
  const child1ProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Emma',
    birthYear: 2014,
    isOwner: false,
  });

  await db.insert(familyLinks).values({
    id: generateUUIDv7(),
    parentProfileId,
    childProfileId: child1ProfileId,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId: child1ProfileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: email,
    respondedAt: new Date(),
  });

  const { subjectId: subject1Id } = await createSubjectWithCurriculum(
    db,
    child1ProfileId,
    'Mathematics'
  );

  const session1Id = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: session1Id,
    profileId: child1ProfileId,
    subjectId: subject1Id,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 10,
    endedAt: pastDate(1),
  });

  // Child 2 — learner with different subject
  const child2ProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Lucas',
    birthYear: LEARNER_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(familyLinks).values({
    id: generateUUIDv7(),
    parentProfileId,
    childProfileId: child2ProfileId,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId: child2ProfileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: email,
    respondedAt: new Date(),
  });

  const { subjectId: subject2Id } = await createSubjectWithCurriculum(
    db,
    child2ProfileId,
    'Science'
  );

  const session2Id = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: session2Id,
    profileId: child2ProfileId,
    subjectId: subject2Id,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 5,
    endedAt: pastDate(2),
  });

  // Child 3 — teen with no sessions yet (fresh onboarding)
  const child3ProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Sofia',
    birthYear: 2014,
    isOwner: false,
  });

  await db.insert(familyLinks).values({
    id: generateUUIDv7(),
    parentProfileId,
    childProfileId: child3ProfileId,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId: child3ProfileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: email,
    respondedAt: new Date(),
  });

  const { subjectId: subject3Id } = await createSubjectWithCurriculum(
    db,
    child3ProfileId,
    'History'
  );

  return {
    scenario: 'parent-multi-child',
    accountId,
    profileId: parentProfileId,
    email,
    password,
    ids: {
      parentProfileId,
      child1ProfileId,
      child2ProfileId,
      child3ProfileId,
      subject1Id,
      subject2Id,
      subject3Id,
      session1Id,
      session2Id,
    },
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
    birthYear: LEARNER_BIRTH_YEAR,
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

  // BUG-34 fix: Add a subject so the home screen stays visible
  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Science'
  );

  return {
    scenario: 'trial-active',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId, topicId: topicIds[0]! },
  };
}

async function seedTrialExpired(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const freeTier = getTierConfig('free');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Expired Trial User',
    birthYear: LEARNER_BIRTH_YEAR,
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
    monthlyLimit: freeTier.monthlyQuota,
    usedThisMonth: 12,
    dailyLimit: freeTier.dailyLimit,
    usedToday: 2,
    cycleResetAt: futureDate(13),
  });

  // BUG-34 fix: Add a subject so the home screen stays visible
  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'History'
  );

  return {
    scenario: 'trial-expired',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId, topicId: topicIds[0]! },
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
    birthYear: LEARNER_BIRTH_YEAR,
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

/**
 * Multi-subject scenario with 2+ ACTIVE subjects.
 * Used by the practice subject picker E2E test (Story 10.23).
 * The practice picker modal only appears when activeSubjects.length > 1.
 */
async function seedMultiSubjectPractice(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Practice Picker Learner',
    birthYear: LEARNER_BIRTH_YEAR,
  });

  const { subjectId: physicsSubjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Physics',
    'active'
  );

  const { subjectId: chemistrySubjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Chemistry',
    'active'
  );

  return {
    scenario: 'multi-subject-practice',
    accountId,
    profileId,
    email,
    password,
    ids: { physicsSubjectId, chemistrySubjectId },
  };
}

async function seedHomeworkReady(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Homework Learner',
    birthYear: LEARNER_BIRTH_YEAR,
  });

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Algebra'
  );

  // Completed learning session — gives the learner context for homework
  const sessionId = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId,
    subjectId,
    topicId: topicIds[0],
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 6,
    endedAt: pastDate(1),
  });

  return {
    scenario: 'homework-ready',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, sessionId, topicId: topicIds[0]! },
  };
}

async function seedTrialExpiredChild(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const freeTier = getTierConfig('free');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Expired subscription — child hits the paywall
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
    monthlyLimit: freeTier.monthlyQuota,
    usedThisMonth: freeTier.monthlyQuota,
    dailyLimit: freeTier.dailyLimit,
    usedToday: 10,
    cycleResetAt: futureDate(13),
  });

  // Parent profile (account owner)
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Paywall Parent',
    birthYear: 1990,
    isOwner: true,
  });

  // Child profile (non-owner teen)
  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Paywall Teen',
    birthYear: 2014,
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

  // Give child a subject with topics so "Browse Library" has content
  const { subjectId } = await createSubjectWithCurriculum(
    db,
    childProfileId,
    'Science',
    'active',
    4
  );

  return {
    scenario: 'trial-expired-child',
    accountId,
    profileId: childProfileId,
    email,
    password,
    ids: { parentProfileId, childProfileId, subscriptionId, subjectId },
  };
}

async function seedConsentWithdrawn(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Parent profile (account owner)
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Withdrawn Parent',
    birthYear: 1990,
    isOwner: true,
  });

  // Child profile (non-owner teen) with withdrawn consent
  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Withdrawn Teen',
    birthYear: 2014,
    isOwner: false,
  });

  // Family link
  await db.insert(familyLinks).values({
    id: generateUUIDv7(),
    parentProfileId,
    childProfileId,
  });

  // Consent state: WITHDRAWN
  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId: childProfileId,
    consentType: 'GDPR',
    status: 'WITHDRAWN',
    parentEmail: email,
    respondedAt: new Date(),
  });

  return {
    scenario: 'consent-withdrawn',
    accountId,
    profileId: childProfileId,
    email,
    password,
    ids: { parentProfileId, childProfileId },
  };
}

async function seedConsentWithdrawnSolo(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Single learner profile — no parent, no profile switch needed
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Withdrawn Learner',
    birthYear: LEARNER_BIRTH_YEAR,
  });

  // Consent state: WITHDRAWN
  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId,
    consentType: 'GDPR',
    status: 'WITHDRAWN',
    parentEmail: 'parent-seed@example.com',
    respondedAt: new Date(),
  });

  return {
    scenario: 'consent-withdrawn-solo',
    accountId,
    profileId,
    email,
    password,
    ids: {},
  };
}

async function seedParentSolo(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Solo parent profile — no children, no family links
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Solo Parent',
    birthYear: 1990,
    isOwner: true,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId: parentProfileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: email,
    respondedAt: new Date(),
  });

  return {
    scenario: 'parent-solo',
    accountId,
    profileId: parentProfileId,
    email,
    password,
    ids: { parentProfileId },
  };
}

/** Pre-profile: Clerk user + DB account, but NO profile.
 *  For E2E flows that test profile creation (consent triggers, onboarding).
 *  After sign-in, the app renders tabs but activeProfile is null.
 *  Navigate via More → Profiles → "Create your first profile" to reach
 *  the create-profile screen. */
async function seedPreProfile(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  return {
    scenario: 'pre-profile',
    accountId,
    profileId: '',
    email,
    password,
    ids: {},
  };
}

/** Consent-pending: Clerk user + account + learner profile with
 *  PARENTAL_CONSENT_REQUESTED status. The learner layout renders
 *  ConsentPendingGate instead of tabs. For testing the gate UI
 *  (check-again, preview modes, sign-out) without needing to traverse
 *  the full sign-up → profile creation → consent request flow. */
async function seedConsentPending(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Pending Learner',
    birthYear: 2014,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId,
    consentType: 'GDPR',
    status: 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: 'parent-e2e-test@example.com',
  });

  return {
    scenario: 'consent-pending',
    accountId,
    profileId,
    email,
    password,
    ids: {},
  };
}

// ---------------------------------------------------------------------------
// Scenario: daily-limit-reached
// Free-tier user who has hit the daily question cap (10/10) but still has
// monthly quota remaining. Next LLM request should trigger 402 QUOTA_EXCEEDED
// with reason: 'daily'.
// ---------------------------------------------------------------------------

async function seedDailyLimitReached(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const freeTier = getTierConfig('free');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Daily Cap User',
    birthYear: LEARNER_BIRTH_YEAR,
  });

  const subscriptionId = generateUUIDv7();
  await db.insert(subscriptions).values({
    id: subscriptionId,
    accountId,
    tier: 'free',
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd: futureDate(30),
  });

  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: freeTier.monthlyQuota,
    usedThisMonth: 10,
    dailyLimit: freeTier.dailyLimit,
    usedToday: 10, // Daily cap fully used
    cycleResetAt: futureDate(30),
  });

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Mathematics'
  );

  // Create an active session so the user can attempt to send a message
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

  await db.insert(sessionEvents).values(
    Array.from({ length: 3 }, (_, i) => ({
      id: generateUUIDv7(),
      sessionId,
      profileId,
      subjectId,
      eventType:
        i % 2 === 0 ? ('user_message' as const) : ('ai_response' as const),
      content:
        i % 2 === 0
          ? 'What is algebra?'
          : 'Algebra is a branch of mathematics...',
    }))
  );

  return {
    scenario: 'daily-limit-reached',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId, sessionId, topicId: topicIds[0]! },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const SCENARIO_MAP: Record<SeedScenario, SeederFn> = {
  'onboarding-complete': seedOnboardingComplete,
  'onboarding-no-subject': seedOnboardingNoSubject,
  'learning-active': seedLearningActive,
  'retention-due': seedRetentionDue,
  'failed-recall-3x': seedFailedRecall3x,
  'parent-with-children': seedParentWithChildren,
  'trial-active': seedTrialActive,
  'trial-expired': seedTrialExpired,
  'multi-subject': seedMultiSubject,
  'multi-subject-practice': seedMultiSubjectPractice,
  'homework-ready': seedHomeworkReady,
  'trial-expired-child': seedTrialExpiredChild,
  'consent-withdrawn': seedConsentWithdrawn,
  'consent-withdrawn-solo': seedConsentWithdrawnSolo,
  'parent-solo': seedParentSolo,
  'pre-profile': seedPreProfile,
  'consent-pending': seedConsentPending,
  'parent-multi-child': seedParentMultiChild,
  'daily-limit-reached': seedDailyLimitReached,
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

  // Idempotent: delete existing accounts with the same email before seeding.
  // Defence-in-depth: look up by email first, then delete by PK only if the
  // account has a recognizable seed marker (clerk_seed_* prefix) or real Clerk
  // user ID (user_* prefix from seed runs with CLERK_SECRET_KEY).
  // This avoids a blind `DELETE WHERE email = ?` which would be dangerous if
  // the environment guard ever failed (COPPA-regulated platform).
  // Child tables cascade via ON DELETE CASCADE.
  const existingAccounts = await db.query.accounts.findMany({
    where: eq(accounts.email, email),
  });
  for (const existing of existingAccounts) {
    if (
      existing.clerkUserId.startsWith(SEED_CLERK_PREFIX) ||
      existing.clerkUserId.startsWith('user_')
    ) {
      await db.delete(accounts).where(eq(accounts.id, existing.id));
    }
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

// ---------------------------------------------------------------------------
// Debug query functions (extracted from route handlers per CLAUDE.md rules)
// ---------------------------------------------------------------------------

export interface DebugAccountChain {
  id: string;
  clerkUserId: string;
  email: string;
  profiles: Array<{
    id: string;
    displayName: string;
    birthYear: number | null;
    isOwner: boolean;
    subjects: Array<{ id: string; name: string; status: string }>;
  }>;
}

/** Walks account → profiles → subjects chain for a given email.
 * Finds ALL accounts matching the email — both seed (clerk_seed_*) and real
 * Clerk users. Safe because this endpoint is ENVIRONMENT-guarded and only
 * accessible in test/development environments. */
export async function debugAccountsByEmail(
  db: Database,
  email: string
): Promise<DebugAccountChain[]> {
  const accountRows = await db.query.accounts.findMany({
    where: eq(accounts.email, email),
  });

  return Promise.all(
    accountRows.map(async (acc) => {
      const profileRows = await db.query.profiles.findMany({
        where: eq(profiles.accountId, acc.id),
      });
      const profilesWithSubjects = await Promise.all(
        profileRows.map(async (prof) => {
          const subjectRows = await db.query.subjects.findMany({
            where: eq(subjects.profileId, prof.id),
          });
          return {
            id: prof.id,
            displayName: prof.displayName,
            birthYear: birthYearFromDateLike(prof.birthDate),
            isOwner: prof.isOwner,
            subjects: subjectRows.map((s) => ({
              id: s.id,
              name: s.name,
              status: s.status,
            })),
          };
        })
      );
      return {
        id: acc.id,
        clerkUserId: acc.clerkUserId,
        email: acc.email,
        profiles: profilesWithSubjects,
      };
    })
  );
}

export interface DebugSubjectsResult {
  account: { id: string; clerkUserId: string; email: string };
  profile: { id: string; displayName: string; isOwner: boolean };
  subjects: Awaited<ReturnType<typeof listSubjects>>;
  subjectCount: number;
}

/**
 * Simulates the exact subjects query path the app uses.
 * Walks: clerkUserId → account → profile (owner) → subjects.
 * Returns null if no account or profile found.
 */
export async function debugSubjectsByClerkUserId(
  db: Database,
  clerkUserId: string
): Promise<
  | { result: DebugSubjectsResult }
  | { error: string; detail: Record<string, string> }
> {
  // Find account by clerkUserId — includes both seed and real Clerk users.
  // Safe because this endpoint is ENVIRONMENT-guarded.
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.clerkUserId, clerkUserId),
  });

  if (!account) {
    return {
      error: 'No account found for clerkUserId',
      detail: { clerkUserId },
    };
  }

  const profileRows = await db.query.profiles.findMany({
    where: eq(profiles.accountId, account.id),
  });

  const ownerProfile = profileRows.find((p) => p.isOwner) ?? profileRows[0];
  if (!ownerProfile) {
    return { error: 'No profiles found', detail: { accountId: account.id } };
  }

  const subjectList = await listSubjects(db, ownerProfile.id);

  return {
    result: {
      account: {
        id: account.id,
        clerkUserId: account.clerkUserId,
        email: account.email,
      },
      profile: {
        id: ownerProfile.id,
        displayName: ownerProfile.displayName,
        isOwner: ownerProfile.isOwner,
      },
      subjects: subjectList,
      subjectCount: subjectList.length,
    },
  };
}
