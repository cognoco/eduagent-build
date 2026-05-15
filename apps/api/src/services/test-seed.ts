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
  learningProfiles,
  subjects,
  curricula,
  curriculumTopics,
  curriculumBooks,
  learningSessions,
  sessionEvents,
  sessionSummaries,
  monthlyReports,
  weeklyReports,
  retentionCards,
  assessments,
  subscriptions,
  quotaPools,
  familyLinks,
  consentStates,
  streaks,
  needsDeepeningTopics,
  vocabulary,
  bookmarks,
  quizRounds,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
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
  | 'daily-limit-reached'
  | 'language-learner'
  | 'language-subject-active'
  | 'parent-with-reports'
  | 'mentor-memory-populated'
  | 'account-deletion-scheduled'
  | 'parent-proxy'
  | 'session-with-transcript'
  | 'with-bookmarks'
  | 'parent-with-weekly-report'
  | 'parent-session-with-recap'
  | 'parent-session-recap-empty'
  | 'parent-subject-with-retention'
  | 'parent-subject-no-retention'
  | 'subscription-family-active'
  | 'subscription-pro-active'
  | 'purchase-pending'
  | 'purchase-confirmed'
  | 'quota-exceeded'
  | 'forbidden'
  | 'quiz-malformed-round'
  | 'quiz-deterministic-wrong-answer'
  | 'quiz-answer-check-fails'
  | 'dictation-with-mistakes'
  | 'dictation-perfect-score'
  | 'review-empty';

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

export interface ResetOptions {
  /** Optional email prefix filter for per-run cleanup, e.g. integ-playwright-1234- */
  prefix?: string;
  /** If provided, skip the Clerk deletion step entirely and use this list
   * for DB cleanup. Used by scripts/clean-clerk-test-users.mjs to keep Clerk
   * HTTP calls out of the Worker invocation (Cloudflare 50-subrequest limit). */
  clerkUserIds?: string[];
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
  env: SeedEnv,
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
  env: SeedEnv,
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
  return users.length > 0 && users[0] ? users[0] : null;
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
  env: SeedEnv,
  options: ResetOptions = {},
): Promise<{ count: number; clerkUserIds: string[] }> {
  if (!env.CLERK_SECRET_KEY) return { count: 0, clerkUserIds: [] };
  const prefix = options.prefix?.trim().toLowerCase();

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
      },
    );

    if (!listRes.ok) break;

    const users = (await listRes.json()) as ClerkUser[];
    if (users.length === 0) break;

    // Client-side filter: only keep users whose external_id starts with our seed prefix
    for (const user of users) {
      const matchesSeedPrefix = user.external_id?.startsWith(SEED_CLERK_PREFIX);
      const matchesEmailPrefix =
        !prefix ||
        user.email_addresses.some((email) =>
          email.email_address.toLowerCase().startsWith(prefix),
        );

      if (matchesSeedPrefix && matchesEmailPrefix) {
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
  clerkUserId: string,
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
  },
): Promise<string> {
  const profileId = generateUUIDv7();

  await db.insert(profiles).values({
    id: profileId,
    accountId,
    displayName: opts.displayName,
    birthYear: opts.birthYear,
    isOwner: opts.isOwner ?? true,
  });
  return profileId;
}

async function createSubjectWithCurriculum(
  db: Database,
  profileId: string,
  name: string,
  status: 'active' | 'paused' | 'archived' = 'active',
  topicCount = 3,
  rawInput?: string,
): Promise<{
  subjectId: string;
  curriculumId: string;
  bookId: string;
  topicIds: string[];
}> {
  const subjectId = generateUUIDv7();
  await db.insert(subjects).values({
    id: subjectId,
    profileId,
    name,
    status,
    rawInput,
  });

  const curriculumId = generateUUIDv7();
  await db.insert(curricula).values({
    id: curriculumId,
    subjectId,
    version: 1,
  });

  // Create a default book for the seed subject
  const bookId = generateUUIDv7();
  await db.insert(curriculumBooks).values({
    id: bookId,
    subjectId,
    title: name,
    sortOrder: 0,
    topicsGenerated: true,
  });

  // Batch insert all topics in a single INSERT statement
  const topicValues = Array.from({ length: topicCount }, (_, i) => {
    const topicId = generateUUIDv7();
    return {
      id: topicId,
      curriculumId,
      bookId,
      title: `${name} Topic ${i + 1}`,
      description: `Introduction to ${name} Topic ${i + 1}`,
      sortOrder: i,
      relevance: 'core' as const,
      estimatedMinutes: 30,
    };
  });

  await db.insert(curriculumTopics).values(topicValues);

  const topicIds = topicValues.map((t) => t.id);
  return { subjectId, curriculumId, bookId, topicIds };
}

// ---------------------------------------------------------------------------
// Scenario Seeders
// ---------------------------------------------------------------------------

type SeederFn = (
  db: Database,
  email: string,
  env: SeedEnv,
) => Promise<SeedResult>;

/** Onboarding complete but with 0 subjects — for testing the empty-state
 *  /create-subject redirect that home.tsx triggers when subjects.length === 0.
 *  This is the original semantics of onboarding-complete before BUG-34 added
 *  a default subject. */
async function seedOnboardingNoSubject(
  db: Database,
  email: string,
  env: SeedEnv,
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
  env: SeedEnv,
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
  // flows that expect learner-screen to remain visible.
  // NOTE: This changes the scenario's semantics — it no longer represents
  // "just finished onboarding, no subjects." A separate onboarding-no-subject
  // scenario would be needed to test the empty-state /create-subject redirect.
  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'General Studies',
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
    easeFactor: 2.5,
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

  const firstTopicId = topicIds[0];
  if (!firstTopicId)
    throw new Error('createSubjectWithCurriculum returned no topics');
  return {
    scenario: 'onboarding-complete',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, topicId: firstTopicId },
  };
}

async function seedLearningActive(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Active Learner',
    birthYear: LEARNER_BIRTH_YEAR,
  });

  const { subjectId, bookId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'World History',
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

  const firstTopicId = topicIds[0];
  if (!firstTopicId)
    throw new Error('createSubjectWithCurriculum returned no topics');
  return {
    scenario: 'learning-active',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, bookId, sessionId, topicId: firstTopicId },
  };
}

async function seedRetentionDue(
  db: Database,
  email: string,
  env: SeedEnv,
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
    'Biology',
  );

  // Batch insert retention cards in a single INSERT statement
  const cardValues = topicIds.map((topicId) => ({
    id: generateUUIDv7(),
    profileId,
    topicId,
    easeFactor: 2.5,
    intervalDays: 7,
    repetitions: 2,
    nextReviewAt: pastDate(1), // Due yesterday
    lastReviewedAt: pastDate(8),
  }));

  await db.insert(retentionCards).values(cardValues);

  const firstCard = cardValues[0];
  if (!firstCard) throw new Error('No retention cards created');
  return {
    scenario: 'retention-due',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, retentionCardId: firstCard.id },
  };
}

async function seedFailedRecall3x(
  db: Database,
  email: string,
  env: SeedEnv,
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
    'Chemistry',
  );

  const targetTopicId = topicIds[0];
  if (!targetTopicId)
    throw new Error('createSubjectWithCurriculum returned no topics');

  // Create retention card with low ease factor (struggling)
  await db.insert(retentionCards).values({
    id: generateUUIDv7(),
    profileId,
    topicId: targetTopicId,
    easeFactor: 1.3,
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
    masteryScore: 0.2,
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
  env: SeedEnv,
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
    'Mathematics',
    'active',
    3,
    'fractions homework',
  );

  // Link the session to the first curriculum topic so getChildSubjectTopics
  // (which filters by totalSessions >= 1) surfaces a topic card for parent
  // drill-down screens. Without topicId, the parent subject view shows the
  // empty state even though the child has a session.
  const curriculumRow = await db.query.curricula.findFirst({
    where: (c, { eq: eqFn }) => eqFn(c.subjectId, subjectId),
  });
  const firstTopicRow = curriculumRow
    ? await db.query.curriculumTopics.findFirst({
        where: (t, { eq: eqFn }) => eqFn(t.curriculumId, curriculumRow.id),
      })
    : undefined;

  // Child has a completed session
  const sessionId = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId: childProfileId,
    subjectId,
    topicId: firstTopicRow?.id,
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
    ids: {
      parentProfileId,
      childProfileId,
      subjectId,
      sessionId,
      topicId: firstTopicRow?.id ?? '',
    },
  };
}

async function seedParentMultiChild(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Parent profile
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Parent',
    birthYear: 1990,
    isOwner: true,
  });

  // Parent also gets a subject so the inline "Learn something" view works
  await createSubjectWithCurriculum(db, parentProfileId, 'General Knowledge');

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

  const { subjectId: subject1Id, topicIds: child1TopicIds } =
    await createSubjectWithCurriculum(
      db,
      child1ProfileId,
      'Mathematics',
      'active',
      3,
      'fractions homework',
    );
  const child1TopicId = child1TopicIds[0];
  if (!child1TopicId) {
    throw new Error('Mathematics seed subject is missing a topic');
  }

  const session1Id = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: session1Id,
    profileId: child1ProfileId,
    subjectId: subject1Id,
    topicId: child1TopicId,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 10,
    endedAt: pastDate(1),
    wallClockSeconds: 1080,
  });
  await db.insert(sessionSummaries).values({
    id: generateUUIDv7(),
    sessionId: session1Id,
    profileId: child1ProfileId,
    topicId: child1TopicId,
    content:
      'We compared fractions and practiced explaining why 3/4 is bigger than 2/3.',
    aiFeedback:
      'Nice job spotting the denominator trap and checking the actual values.',
    highlight: 'Emma used a number line to explain her thinking.',
    narrative:
      'Emma compared fractions with growing confidence and explained why the larger denominator did not always mean the larger value.',
    conversationPrompt: 'Which fraction felt easiest to compare today?',
    engagementSignal: 'focused',
    status: 'accepted',
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

  const { subjectId: subject2Id, topicIds: child2TopicIds } =
    await createSubjectWithCurriculum(db, child2ProfileId, 'Science');
  const child2TopicId = child2TopicIds[0];
  if (!child2TopicId) {
    throw new Error('Science seed subject is missing a topic');
  }

  const session2Id = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: session2Id,
    profileId: child2ProfileId,
    subjectId: subject2Id,
    topicId: child2TopicId,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 5,
    endedAt: pastDate(2),
    wallClockSeconds: 780,
  });
  await db.insert(sessionSummaries).values({
    id: generateUUIDv7(),
    sessionId: session2Id,
    profileId: child2ProfileId,
    topicId: child2TopicId,
    content:
      'We linked sunlight, water, and carbon dioxide to how plants make food.',
    aiFeedback: 'Great recall of the ingredients and what the plant produces.',
    highlight: 'Lucas connected the process back to why leaves need sunlight.',
    narrative:
      'Lucas worked through photosynthesis step by step and linked each ingredient to what the plant needs to survive.',
    conversationPrompt:
      'Can you point out where the plant gets its energy from?',
    engagementSignal: 'focused',
    status: 'accepted',
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

  const { subjectId: subject3Id, topicIds: child3TopicIds } =
    await createSubjectWithCurriculum(db, child3ProfileId, 'History');
  const child3TopicId = child3TopicIds[0];
  if (!child3TopicId) {
    throw new Error('History seed subject is missing a topic');
  }

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
      child1TopicId,
      child2TopicId,
      child3TopicId,
      session1Id,
      session2Id,
    },
  };
}

async function seedTrialActive(
  db: Database,
  email: string,
  env: SeedEnv,
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
    'Science',
  );

  const firstTopicId = topicIds[0];
  if (!firstTopicId)
    throw new Error('createSubjectWithCurriculum returned no topics');
  return {
    scenario: 'trial-active',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId, topicId: firstTopicId },
  };
}

async function seedTrialExpired(
  db: Database,
  email: string,
  env: SeedEnv,
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
    'History',
  );

  const firstTopicId = topicIds[0];
  if (!firstTopicId)
    throw new Error('createSubjectWithCurriculum returned no topics');
  return {
    scenario: 'trial-expired',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId, topicId: firstTopicId },
  };
}

async function seedMultiSubject(
  db: Database,
  email: string,
  env: SeedEnv,
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
    'active',
  );

  const { subjectId: pausedSubjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Literature',
    'paused',
  );

  const { subjectId: archivedSubjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Art History',
    'archived',
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
  env: SeedEnv,
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
    'active',
  );

  const { subjectId: chemistrySubjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Chemistry',
    'active',
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
  env: SeedEnv,
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
    'Algebra',
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

  const firstTopicId = topicIds[0];
  if (!firstTopicId)
    throw new Error('createSubjectWithCurriculum returned no topics');
  return {
    scenario: 'homework-ready',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, sessionId, topicId: firstTopicId },
  };
}

async function seedTrialExpiredChild(
  db: Database,
  email: string,
  env: SeedEnv,
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
    4,
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
  env: SeedEnv,
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
  env: SeedEnv,
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
  env: SeedEnv,
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

  const subscriptionId = generateUUIDv7();
  await db.insert(subscriptions).values({
    id: subscriptionId,
    accountId,
    tier: 'family',
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd: futureDate(30),
  });

  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: 2_000,
    usedThisMonth: 12,
    cycleResetAt: futureDate(30),
  });

  return {
    scenario: 'parent-solo',
    accountId,
    profileId: parentProfileId,
    email,
    password,
    ids: { parentProfileId, subscriptionId },
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
  env: SeedEnv,
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
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Pending Learner',
    birthYear: 2014,
  });
  const consentToken = `seed-consent-${generateUUIDv7()}`;

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId,
    consentType: 'GDPR',
    status: 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: 'parent-e2e-test@example.com',
    consentToken,
    expiresAt: futureDate(7),
  });

  return {
    scenario: 'consent-pending',
    accountId,
    profileId,
    email,
    password,
    ids: { consentToken },
  };
}

async function seedLanguageLearner(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Language Learner',
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

  const subjectId = generateUUIDv7();
  await db.insert(subjects).values({
    id: subjectId,
    profileId,
    name: 'Spanish',
    status: 'active',
    pedagogyMode: 'four_strands',
    languageCode: 'es',
  });

  const curriculumId = generateUUIDv7();
  await db.insert(curricula).values({
    id: curriculumId,
    subjectId,
    version: 1,
  });

  const bookId = generateUUIDv7();
  await db.insert(curriculumBooks).values({
    id: bookId,
    subjectId,
    title: 'Spanish',
    sortOrder: 0,
    topicsGenerated: true,
  });

  const topicValues = Array.from({ length: 3 }, (_, index) => ({
    id: generateUUIDv7(),
    curriculumId,
    bookId,
    title: `Spanish Topic ${index + 1}`,
    description: `Introduction to Spanish Topic ${index + 1}`,
    sortOrder: index,
    relevance: 'core' as const,
    estimatedMinutes: 30,
  }));
  await db.insert(curriculumTopics).values(topicValues);
  const topicIds = topicValues.map((topic) => topic.id);

  await db.insert(vocabulary).values([
    {
      id: generateUUIDv7(),
      profileId,
      subjectId,
      term: 'hola',
      termNormalized: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: 'A1',
      mastered: false,
    },
    {
      id: generateUUIDv7(),
      profileId,
      subjectId,
      term: 'gracias',
      termNormalized: 'gracias',
      translation: 'thank you',
      type: 'chunk',
      cefrLevel: 'A1',
      mastered: true,
    },
    {
      id: generateUUIDv7(),
      profileId,
      subjectId,
      term: 'biblioteca',
      termNormalized: 'biblioteca',
      translation: 'library',
      type: 'word',
      cefrLevel: 'A2',
      mastered: false,
    },
  ]);

  for (let index = 0; index < 4; index += 1) {
    const sessionId = generateUUIDv7();
    const topicId = topicIds[index % topicIds.length];
    const startedAt = pastDate(4 - index);
    const endedAt = new Date(startedAt.getTime() + 15 * 60 * 1000);

    await db.insert(learningSessions).values({
      id: sessionId,
      profileId,
      subjectId,
      topicId,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 4,
      startedAt,
      lastActivityAt: endedAt,
      endedAt,
      wallClockSeconds: 900,
    });

    await db.insert(sessionSummaries).values({
      id: generateUUIDv7(),
      sessionId,
      profileId,
      topicId,
      content: `Session ${index + 1} focused on practical Spanish vocabulary.`,
      status: 'accepted',
    });
  }

  return {
    scenario: 'language-learner',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId },
  };
}

async function seedLanguageSubjectActive(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedLanguageLearner(db, email, env);
  const subjectId = base.ids.subjectId;
  if (!subjectId) {
    throw new Error('language-learner seed did not return subjectId');
  }

  await db.insert(vocabulary).values([
    {
      id: generateUUIDv7(),
      profileId: base.profileId,
      subjectId,
      term: 'aprender',
      termNormalized: 'aprender',
      translation: 'to learn',
      type: 'word',
      cefrLevel: 'B1',
      mastered: false,
    },
    {
      id: generateUUIDv7(),
      profileId: base.profileId,
      subjectId,
      term: 'me doy cuenta',
      termNormalized: 'me doy cuenta',
      translation: 'I realize',
      type: 'chunk',
      cefrLevel: 'B1',
      mastered: false,
    },
  ]);

  const sessionId = generateUUIDv7();
  const startedAt = pastDate(1);
  const endedAt = new Date(startedAt.getTime() + 16 * 60 * 1000);
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId: base.profileId,
    subjectId,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 5,
    startedAt,
    lastActivityAt: endedAt,
    endedAt,
    wallClockSeconds: 960,
  });
  await db.insert(sessionSummaries).values({
    id: generateUUIDv7(),
    sessionId,
    profileId: base.profileId,
    content: 'A fifth Spanish session reviewed everyday phrases and B1 verbs.',
    status: 'accepted',
  });

  return {
    ...base,
    scenario: 'language-subject-active',
  };
}

async function seedParentWithReports(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedParentWithChildren(db, email, env);
  const parentProfileId = base.ids.parentProfileId;
  const childProfileId = base.ids.childProfileId;

  if (!parentProfileId || !childProfileId) {
    throw new Error(
      'parent-with-children seed did not return parent/child IDs',
    );
  }

  const reportId = generateUUIDv7();
  await db.insert(monthlyReports).values({
    id: reportId,
    profileId: parentProfileId,
    childProfileId,
    reportMonth: '2026-03-01',
    reportData: {
      childName: 'Test Teen',
      month: 'March 2026',
      thisMonth: {
        totalSessions: 15,
        totalActiveMinutes: 180,
        topicsMastered: 12,
        topicsExplored: 15,
        vocabularyTotal: 45,
        streakBest: 6,
      },
      lastMonth: null,
      highlights: ['Completed the geometry unit', 'Consistent daily practice'],
      nextSteps: [
        'Start algebra fundamentals',
        'Review weak areas in fractions',
      ],
      subjects: [
        {
          subjectName: 'Mathematics',
          topicsMastered: 12,
          topicsAttempted: 15,
          topicsExplored: 15,
          vocabularyTotal: 45,
          activeMinutes: 180,
          trend: 'growing',
        },
      ],
      headlineStat: {
        value: 12,
        label: 'Topics mastered',
        comparison: 'Up from 8 last month',
      },
    },
  });

  return {
    ...base,
    scenario: 'parent-with-reports',
    ids: {
      ...base.ids,
      reportId,
    },
  };
}

async function seedMentorMemoryPopulated(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedParentWithChildren(db, email, env);
  const childProfileId = base.ids.childProfileId;
  const subjectId = base.ids.subjectId;

  if (!childProfileId || !subjectId) {
    throw new Error(
      'parent-with-children seed did not return childProfileId/subjectId',
    );
  }

  for (let index = 0; index < 3; index += 1) {
    const sessionId = generateUUIDv7();
    const startedAt = pastDate(index + 2);
    const endedAt = new Date(startedAt.getTime() + 14 * 60 * 1000);
    await db.insert(learningSessions).values({
      id: sessionId,
      profileId: childProfileId,
      subjectId,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 6,
      startedAt,
      lastActivityAt: endedAt,
      endedAt,
      wallClockSeconds: 840,
    });
  }

  await db.insert(learningProfiles).values({
    profileId: childProfileId,
    learningStyle: {
      preferredExplanations: ['diagrams', 'examples'],
      pacePreference: 'thorough',
      responseToChallenge: 'motivated',
      confidence: 'medium',
      corroboratingSessions: 4,
      source: 'inferred',
    },
    interests: ['Soccer', 'History'],
    strengths: [
      {
        subject: 'History',
        topics: ['Critical thinking'],
        confidence: 'high',
        source: 'inferred',
      },
    ],
    struggles: [
      {
        subject: 'English',
        topic: 'Long reading passages',
        lastSeen: pastDate(2).toISOString(),
        attempts: 3,
        confidence: 'medium',
        source: 'inferred',
      },
    ],
    communicationNotes: ['Responds well to encouragement'],
    suppressedInferences: [],
    interestTimestamps: {
      Soccer: pastDate(5).toISOString(),
      History: pastDate(3).toISOString(),
    },
    memoryEnabled: true,
    memoryConsentStatus: 'granted',
    memoryCollectionEnabled: true,
    memoryInjectionEnabled: true,
  });

  return {
    ...base,
    scenario: 'mentor-memory-populated',
  };
}

// ---------------------------------------------------------------------------
// Scenario: account-deletion-scheduled
// Account in deletion stage 2 (scheduled). The `deletionScheduledAt` column
// on `accounts` is set to a future date to simulate a queued deletion that the
// user can still cancel. Family / subscription flags ensure warning banners
// render in the deletion flow.
// ---------------------------------------------------------------------------

async function seedAccountDeletionScheduled(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);

  const accountId = generateUUIDv7();
  await db.insert(accounts).values({
    id: accountId,
    clerkUserId,
    email,
    // Scheduled for deletion in 30 days
    deletionScheduledAt: futureDate(30),
  });

  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Deletion Scheduled User',
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
    monthlyLimit: 100,
    usedThisMonth: 5,
    cycleResetAt: futureDate(30),
  });

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'General Studies',
  );

  return {
    scenario: 'account-deletion-scheduled',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, subscriptionId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: session-with-transcript
// Learner with one completed session whose transcript blob is populated.
// Returns SESSION_ID so Maestro flows can navigate directly to the transcript.
// ---------------------------------------------------------------------------

async function seedSessionWithTranscript(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Transcript User',
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

  const { subjectId, bookId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Mathematics',
  );

  const topicId = topicIds[0];
  if (!topicId)
    throw new Error('createSubjectWithCurriculum returned no topics');

  const sessionId = generateUUIDv7();
  const startedAt = pastDate(1);
  const endedAt = new Date(startedAt.getTime() + 20 * 60 * 1000);

  await db.insert(learningSessions).values({
    id: sessionId,
    profileId,
    subjectId,
    topicId,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 6,
    startedAt,
    lastActivityAt: endedAt,
    endedAt,
    wallClockSeconds: 1200,
  });

  // Populate the transcript via session events
  const eventValues: Array<{
    id: string;
    sessionId: string;
    profileId: string;
    subjectId: string;
    topicId: string;
    eventType: 'user_message' | 'ai_response';
    content: string;
  }> = [
    {
      id: generateUUIDv7(),
      sessionId,
      profileId,
      subjectId,
      topicId,
      eventType: 'user_message',
      content: 'What is the Pythagorean theorem?',
    },
    {
      id: generateUUIDv7(),
      sessionId,
      profileId,
      subjectId,
      topicId,
      eventType: 'ai_response',
      content:
        'The Pythagorean theorem states that in a right triangle, a² + b² = c².',
    },
    {
      id: generateUUIDv7(),
      sessionId,
      profileId,
      subjectId,
      topicId,
      eventType: 'user_message',
      content: 'Can you give me an example?',
    },
    {
      id: generateUUIDv7(),
      sessionId,
      profileId,
      subjectId,
      topicId,
      eventType: 'ai_response',
      content: 'Sure! If a = 3 and b = 4, then c = 5 because 9 + 16 = 25.',
    },
    {
      id: generateUUIDv7(),
      sessionId,
      profileId,
      subjectId,
      topicId,
      eventType: 'user_message',
      content: 'How do I find the hypotenuse?',
    },
    {
      id: generateUUIDv7(),
      sessionId,
      profileId,
      subjectId,
      topicId,
      eventType: 'ai_response',
      content:
        'Square both legs, add them together, then take the square root.',
    },
  ];

  await db.insert(sessionEvents).values(eventValues);

  await db.insert(sessionSummaries).values({
    id: generateUUIDv7(),
    sessionId,
    profileId,
    topicId,
    content: 'We covered the Pythagorean theorem with concrete examples.',
    aiFeedback: 'Great recall of the formula and the 3-4-5 example.',
    highlight: 'User connected the abstract formula to a concrete triangle.',
    narrative:
      'The learner worked through Pythagoras step-by-step with growing confidence.',
    conversationPrompt: 'Can you think of a real-world use for this theorem?',
    engagementSignal: 'focused',
    status: 'accepted',
  });

  return {
    scenario: 'session-with-transcript',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, bookId, sessionId, topicId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: parent-proxy
// Parent viewing a child's session transcript (proxy view). Builds on
// session-with-transcript but wraps it in a parent+family-link structure.
// Returns CHILD_PROFILE_ID and SESSION_ID.
// ---------------------------------------------------------------------------

async function seedParentProxy(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Proxy Parent',
    birthYear: 1985,
    isOwner: true,
  });

  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Proxy Child',
    birthYear: 2014,
    isOwner: false,
  });

  await db.insert(familyLinks).values({
    id: generateUUIDv7(),
    parentProfileId,
    childProfileId,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId: childProfileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: email,
    respondedAt: new Date(),
  });

  const { subjectId, bookId, topicIds } = await createSubjectWithCurriculum(
    db,
    childProfileId,
    'Science',
  );

  const topicId = topicIds[0];
  if (!topicId)
    throw new Error('createSubjectWithCurriculum returned no topics');

  const sessionId = generateUUIDv7();
  const startedAt = pastDate(1);
  const endedAt = new Date(startedAt.getTime() + 18 * 60 * 1000);

  await db.insert(learningSessions).values({
    id: sessionId,
    profileId: childProfileId,
    subjectId,
    topicId,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 5,
    startedAt,
    lastActivityAt: endedAt,
    endedAt,
    wallClockSeconds: 1080,
  });

  const eventValues = [
    {
      id: generateUUIDv7(),
      sessionId,
      profileId: childProfileId,
      subjectId,
      topicId,
      eventType: 'user_message' as const,
      content: 'How does photosynthesis work?',
    },
    {
      id: generateUUIDv7(),
      sessionId,
      profileId: childProfileId,
      subjectId,
      topicId,
      eventType: 'ai_response' as const,
      content:
        'Plants use sunlight, water, and CO₂ to produce glucose and oxygen.',
    },
    {
      id: generateUUIDv7(),
      sessionId,
      profileId: childProfileId,
      subjectId,
      topicId,
      eventType: 'user_message' as const,
      content: 'Why do leaves turn green?',
    },
    {
      id: generateUUIDv7(),
      sessionId,
      profileId: childProfileId,
      subjectId,
      topicId,
      eventType: 'ai_response' as const,
      content:
        'Chlorophyll absorbs red and blue light but reflects green, making leaves appear green.',
    },
  ];

  await db.insert(sessionEvents).values(eventValues);

  await db.insert(sessionSummaries).values({
    id: generateUUIDv7(),
    sessionId,
    profileId: childProfileId,
    topicId,
    content: 'We explored photosynthesis and why leaves are green.',
    aiFeedback: 'Good connections between sunlight, chlorophyll, and colour.',
    highlight: 'Linked chlorophyll to the colour we see.',
    narrative:
      'The learner understood photosynthesis as a conversion process and made the colour-absorption link independently.',
    conversationPrompt: 'What would happen to a plant kept in the dark?',
    engagementSignal: 'curious',
    status: 'accepted',
  });

  return {
    scenario: 'parent-proxy',
    accountId,
    profileId: parentProfileId,
    email,
    password,
    ids: {
      parentProfileId,
      childProfileId,
      subjectId,
      bookId,
      sessionId,
      topicId,
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario: with-bookmarks
// Learner with ≥2 bookmarks. Returns BOOKMARK_ID (first bookmark).
// ---------------------------------------------------------------------------

async function seedWithBookmarks(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Bookmarks User',
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

  const { subjectId, bookId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'History',
  );

  const topicId = topicIds[0];
  if (!topicId)
    throw new Error('createSubjectWithCurriculum returned no topics');

  const sessionId = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId,
    subjectId,
    topicId,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: 4,
    endedAt: pastDate(1),
  });

  // Bookmarks reference raw event IDs (no FK — by design in schema)
  const event1Id = generateUUIDv7();
  const event2Id = generateUUIDv7();

  const bookmarkId = generateUUIDv7();
  await db.insert(bookmarks).values([
    {
      id: bookmarkId,
      profileId,
      sessionId,
      eventId: event1Id,
      subjectId,
      topicId,
      content:
        'The Roman Republic was founded in 509 BC after the overthrow of the monarchy.',
    },
    {
      id: generateUUIDv7(),
      profileId,
      sessionId,
      eventId: event2Id,
      subjectId,
      topicId,
      content:
        'Julius Caesar crossed the Rubicon river in 49 BC, triggering the civil war.',
    },
  ]);

  return {
    scenario: 'with-bookmarks',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, bookId, sessionId, bookmarkId, topicId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: parent-with-weekly-report
// Parent + child + ≥1 weekly report. Distinct from parent-with-reports
// (monthly). Returns CHILD_ID and REPORT_ID.
// ---------------------------------------------------------------------------

async function seedParentWithWeeklyReport(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedParentWithChildren(db, email, env);
  const parentProfileId = base.ids.parentProfileId;
  const childProfileId = base.ids.childProfileId;

  if (!parentProfileId || !childProfileId) {
    throw new Error(
      'parent-with-children seed did not return parent/child IDs',
    );
  }

  const reportId = generateUUIDv7();
  const reportWeek = '2026-04-28'; // Monday start
  await db.insert(weeklyReports).values({
    id: reportId,
    profileId: parentProfileId,
    childProfileId,
    reportWeek,
    reportData: {
      childName: 'Test Teen',
      // weeklyReportDataSchema requires `weekStart` (ISO YYYY-MM-DD);
      // omitting it makes mapWeeklyReportRow's safeParse return null and
      // the detail screen shows the gone fallback instead of the report.
      weekStart: reportWeek,
      thisWeek: {
        totalSessions: 4,
        totalActiveMinutes: 48,
        topicsMastered: 2,
        topicsExplored: 3,
        vocabularyTotal: 12,
        streakBest: 4,
      },
      lastWeek: null,
      highlights: ['Completed the fractions unit', 'Consistent daily practice'],
      nextSteps: ['Start decimals', 'Review area and perimeter'],
      subjects: [
        {
          subjectName: 'Mathematics',
          topicsMastered: 2,
          topicsAttempted: 3,
          topicsExplored: 3,
          vocabularyTotal: 12,
          activeMinutes: 48,
          trend: 'growing',
        },
      ],
      headlineStat: {
        value: 4,
        label: 'Sessions this week',
        comparison: 'Up from 2 last week',
      },
    },
  });

  return {
    ...base,
    scenario: 'parent-with-weekly-report',
    ids: {
      ...base.ids,
      childId: childProfileId,
      // reportId and weeklyReportId intentionally share one progress_reports row.
      reportId,
      weeklyReportId: reportId,
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario: parent-session-with-recap
// Parent + child + completed session with backfilled recap (all fields set).
// Returns CHILD_ID and SESSION_ID.
// ---------------------------------------------------------------------------

async function seedParentSessionWithRecap(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedParentWithChildren(db, email, env);
  const childProfileId = base.ids.childProfileId;
  const subjectId = base.ids.subjectId;
  const existingSessionId = base.ids.sessionId;

  if (!childProfileId || !subjectId || !existingSessionId) {
    throw new Error('parent-with-children seed did not return expected IDs');
  }

  // Add a backfilled recap summary to the session created in seedParentWithChildren
  await db.insert(sessionSummaries).values({
    id: generateUUIDv7(),
    sessionId: existingSessionId,
    profileId: childProfileId,
    content: 'We worked through linear equations with increasing confidence.',
    aiFeedback: 'Great perseverance when rearranging terms.',
    highlight: 'Recognised the pattern for isolating the variable.',
    narrative:
      'The learner approached algebra methodically and self-corrected on the second equation without prompting.',
    conversationPrompt:
      'Can you spot any connection between this and the last topic?',
    engagementSignal: 'curious',
    status: 'accepted',
  });

  return {
    ...base,
    scenario: 'parent-session-with-recap',
    ids: {
      ...base.ids,
      childId: childProfileId,
      sessionId: existingSessionId,
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario: parent-session-recap-empty
// Same shape as parent-session-with-recap but recap fields are null
// (pre-backfill state). Returns CHILD_ID and SESSION_ID.
// ---------------------------------------------------------------------------

async function seedParentSessionRecapEmpty(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedParentWithChildren(db, email, env);
  const childProfileId = base.ids.childProfileId;
  const subjectId = base.ids.subjectId;
  const existingSessionId = base.ids.sessionId;

  if (!childProfileId || !subjectId || !existingSessionId) {
    throw new Error('parent-with-children seed did not return expected IDs');
  }

  // Insert a summary with all nullable recap fields left null
  await db.insert(sessionSummaries).values({
    id: generateUUIDv7(),
    sessionId: existingSessionId,
    profileId: childProfileId,
    // content, narrative, highlight, conversationPrompt all null — pre-backfill
    status: 'pending',
  });

  return {
    ...base,
    scenario: 'parent-session-recap-empty',
    ids: {
      ...base.ids,
      childId: childProfileId,
      sessionId: existingSessionId,
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario: parent-subject-with-retention
// Parent + child + subject with retentionStatus set and totalSessions ≥ 1.
// retentionStatus is a computed value; we materialise it by inserting a
// retentionCard that has been reviewed (failureCount 0 = 'strong').
// ---------------------------------------------------------------------------

async function seedParentSubjectWithRetention(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedParentWithChildren(db, email, env);
  const childProfileId = base.ids.childProfileId;
  const subjectId = base.ids.subjectId;

  if (!childProfileId || !subjectId) {
    throw new Error(
      'parent-with-children seed did not return childProfileId/subjectId',
    );
  }

  // Fetch the curriculum for the child's subject, then pick the first topic
  const curriculumRow = await db.query.curricula.findFirst({
    where: (c, { eq: eqFn }) => eqFn(c.subjectId, subjectId),
  });
  if (!curriculumRow) throw new Error('No curriculum found for subject');

  const topicRow = await db.query.curriculumTopics.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.curriculumId, curriculumRow.id),
  });
  if (!topicRow) throw new Error('No topic found for curriculum');

  await db.insert(retentionCards).values({
    id: generateUUIDv7(),
    profileId: childProfileId,
    topicId: topicRow.id,
    easeFactor: 2.5,
    intervalDays: 7,
    repetitions: 3,
    failureCount: 0,
    consecutiveSuccesses: 3,
    xpStatus: 'verified',
    nextReviewAt: futureDate(7),
  });

  return {
    ...base,
    scenario: 'parent-subject-with-retention',
    ids: {
      ...base.ids,
      topicId: topicRow.id,
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario: parent-subject-no-retention
// Same shape as parent-subject-with-retention but no retention data at all.
// The child has a subject and at least one completed session but no
// retentionCards row, representing the "not yet reviewed" state.
// ---------------------------------------------------------------------------

async function seedParentSubjectNoRetention(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedParentWithChildren(db, email, env);
  // No retention cards inserted — that's the distinguishing feature.
  return {
    ...base,
    scenario: 'parent-subject-no-retention',
  };
}

// ---------------------------------------------------------------------------
// Scenario: subscription-family-active
// User on Family tier (active), RevenueCat offerings disabled so the
// subscription screen falls back to static pricing cards.
// ---------------------------------------------------------------------------

async function seedSubscriptionFamilyActive(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const familyTier = getTierConfig('family');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Family Subscriber',
    birthYear: 1985,
    isOwner: true,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: 'parent-seed@example.com',
    respondedAt: new Date(),
  });

  const subscriptionId = generateUUIDv7();
  await db.insert(subscriptions).values({
    id: subscriptionId,
    accountId,
    tier: 'family',
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd: futureDate(30),
  });

  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: familyTier.monthlyQuota,
    usedThisMonth: 120,
    cycleResetAt: futureDate(30),
  });

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'General Knowledge',
  );

  return {
    scenario: 'subscription-family-active',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: subscription-pro-active
// User on Pro tier (active), RevenueCat offerings disabled for static fallback.
// ---------------------------------------------------------------------------

async function seedSubscriptionProActive(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const proTier = getTierConfig('pro');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Pro Subscriber',
    birthYear: 1982,
    isOwner: true,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: 'parent-seed@example.com',
    respondedAt: new Date(),
  });

  const subscriptionId = generateUUIDv7();
  await db.insert(subscriptions).values({
    id: subscriptionId,
    accountId,
    tier: 'pro',
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd: futureDate(30),
  });

  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: proTier.monthlyQuota,
    usedThisMonth: 250,
    cycleResetAt: futureDate(30),
  });

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Advanced Mathematics',
  );

  return {
    scenario: 'subscription-pro-active',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: purchase-pending
// Free-tier user who has initiated a RevenueCat purchase but the server-side
// webhook has not yet confirmed the upgrade. DB state is still free/active.
// In the emulator the RevenueCat offerings section is absent (no Play Store),
// so the subscription screen shows the static no-offerings fallback with the
// Upgrade button — representing the pre-confirmation state machine step.
// ---------------------------------------------------------------------------

async function seedPurchasePending(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const freeTier = getTierConfig('free');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Purchase Pending User',
    birthYear: LEARNER_BIRTH_YEAR,
    isOwner: true,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: 'parent-seed@example.com',
    respondedAt: new Date(),
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
    usedThisMonth: 3,
    dailyLimit: freeTier.dailyLimit,
    usedToday: 1,
    cycleResetAt: futureDate(30),
  });

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'History',
  );

  return {
    scenario: 'purchase-pending',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: purchase-confirmed
// Free-tier user whose upgrade webhook has been processed — now on Plus tier,
// status=active. Represents the post-confirmation state machine step.
// The subscription screen shows: current plan "Plus", static tier comparison
// with plus highlighted, manage-billing section, and top-up section visible.
// ---------------------------------------------------------------------------

async function seedPurchaseConfirmed(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const plusTier = getTierConfig('plus');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Confirmed Subscriber',
    birthYear: LEARNER_BIRTH_YEAR,
    isOwner: true,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: 'parent-seed@example.com',
    respondedAt: new Date(),
  });

  const subscriptionId = generateUUIDv7();
  await db.insert(subscriptions).values({
    id: subscriptionId,
    accountId,
    tier: 'plus',
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd: futureDate(30),
  });

  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: plusTier.monthlyQuota,
    usedThisMonth: 10,
    cycleResetAt: futureDate(30),
  });

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Science',
  );

  return {
    scenario: 'purchase-confirmed',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: quota-exceeded
// User whose monthly quota is fully exhausted (distinct from daily-limit-reached
// which caps only the daily allowance). Quiz launch will return
// ApiResponseError.code === 'QUOTA_EXCEEDED'.
// ---------------------------------------------------------------------------

async function seedQuotaExceeded(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const freeTier = getTierConfig('free');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Quota Exceeded User',
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
    // Monthly quota fully exhausted — this is the server-side cap
    usedThisMonth: freeTier.monthlyQuota,
    dailyLimit: freeTier.dailyLimit,
    usedToday: 2, // Daily still has headroom; server caps on monthly
    cycleResetAt: futureDate(30),
  });

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Mathematics',
  );

  const topicId = topicIds[0];
  if (!topicId)
    throw new Error('createSubjectWithCurriculum returned no topics');

  return {
    scenario: 'quota-exceeded',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId, topicId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: forbidden
// User profile whose quiz launch will return FORBIDDEN (403). We achieve this
// by creating the profile without linking it to a valid subscription — the
// metering middleware will reject the request as FORBIDDEN when the account
// lacks a subscription record.
// ---------------------------------------------------------------------------

async function seedForbidden(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Forbidden User',
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

  // Deliberately no subscription row — metering middleware returns FORBIDDEN
  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Science',
  );

  return {
    scenario: 'forbidden',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: quiz-malformed-round
// A pre-inserted quiz round whose questions array contains a capitals question
// where the options deduplicate to fewer than 2 unique values (BUG-812).
// The mobile quiz/play screen checks for this and renders the malformed-round
// fallback branch (testIDs: quiz-play-malformed, quiz-play-malformed-back).
// Returns ROUND_ID so the E2E flow can navigate directly to
// /quiz/play?roundId=<ROUND_ID>.
// ---------------------------------------------------------------------------

async function seedQuizMalformedRound(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Malformed Round User',
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

  const freeTier = getTierConfig('free');
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
    usedThisMonth: 0,
    cycleResetAt: futureDate(30),
  });

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Geography',
  );

  // Build a round with a capitals question whose distractors are duplicates of
  // the correct answer. After deduplication the options array collapses to 1
  // entry — triggering the malformed-round guard in quiz/play.tsx.
  const malformedQuestion = {
    type: 'capitals',
    country: 'France',
    correctAnswer: 'Paris',
    acceptedAliases: ['Paris'],
    // All distractors are the same as correctAnswer — dedupes to 1 option
    distractors: ['Paris', 'Paris', 'Paris'],
    funFact: 'Paris is known as the City of Light.',
    isLibraryItem: false,
    topicId: null,
    freeTextEligible: false,
  };

  const roundId = generateUUIDv7();
  await db.insert(quizRounds).values({
    id: roundId,
    profileId,
    activityType: 'capitals',
    theme: 'European Capitals',
    questions: [malformedQuestion],
    total: 1,
    libraryQuestionIndices: [],
    status: 'active',
  });

  return {
    scenario: 'quiz-malformed-round',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, roundId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: quiz-deterministic-wrong-answer
// A pre-inserted quiz round with a known-wrong option at a deterministic index.
// The E2E dispute test taps option index 1 which is always wrong (correctAnswer
// is at index 0 after the server side shuffle; we arrange distractors so the
// round's stored question places the correct answer first in the options
// presented to the client).
// Returns ROUND_ID.
// ---------------------------------------------------------------------------

async function seedQuizDeterministicWrongAnswer(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Deterministic Quiz User',
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

  const freeTier = getTierConfig('free');
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
    usedThisMonth: 0,
    cycleResetAt: futureDate(30),
  });

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Geography',
  );

  // Question with correctAnswer='Paris', distractors are clearly wrong.
  // Index 0 = correct, index 1-3 = wrong — E2E flow taps index 1 to submit
  // a known-wrong answer for the dispute test.
  const deterministicQuestion = {
    type: 'capitals',
    country: 'France',
    correctAnswer: 'Paris',
    acceptedAliases: ['Paris'],
    distractors: ['London', 'Berlin', 'Madrid'],
    funFact: 'Paris has been the capital of France since the 10th century.',
    isLibraryItem: false,
    topicId: null,
    freeTextEligible: false,
  };

  const roundId = generateUUIDv7();
  await db.insert(quizRounds).values({
    id: roundId,
    profileId,
    activityType: 'capitals',
    theme: 'European Capitals',
    questions: [deterministicQuestion],
    total: 1,
    libraryQuestionIndices: [],
    status: 'active',
  });

  return {
    scenario: 'quiz-deterministic-wrong-answer',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, roundId, wrongOptionIndex: '1' },
  };
}

// ---------------------------------------------------------------------------
// Scenario: quiz-answer-check-fails
// Seed where POST /quiz/rounds/:id/check returns 5xx. We model this with a
// quiz round in 'completed' status — the check endpoint returns 409/5xx for
// already-completed rounds, simulating the "check fails" error path without
// requiring an actual server fault.
// Returns ROUND_ID.
// ---------------------------------------------------------------------------

async function seedQuizAnswerCheckFails(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Quiz Check Fails User',
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

  const freeTier = getTierConfig('free');
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
    usedThisMonth: 0,
    cycleResetAt: futureDate(30),
  });

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Geography',
  );

  // A completed round whose check endpoint will reject the request (already
  // completed rounds cannot accept new answer submissions — the route returns
  // 409 Conflict, which the mobile error handling maps to a 5xx-style error).
  const question = {
    type: 'capitals',
    country: 'Germany',
    correctAnswer: 'Berlin',
    acceptedAliases: ['Berlin'],
    distractors: ['Munich', 'Hamburg', 'Frankfurt'],
    funFact: 'Berlin became the German capital in 1871.',
    isLibraryItem: false,
    topicId: null,
    freeTextEligible: false,
  };

  const roundId = generateUUIDv7();
  await db.insert(quizRounds).values({
    id: roundId,
    profileId,
    activityType: 'capitals',
    theme: 'European Capitals',
    questions: [question],
    results: [],
    score: 1,
    total: 1,
    status: 'completed',
    completedAt: new Date(),
    libraryQuestionIndices: [],
  });

  return {
    scenario: 'quiz-answer-check-fails',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, roundId },
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
  env: SeedEnv,
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
    'Mathematics',
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
    })),
  );

  const firstTopicId = topicIds[0];
  if (!firstTopicId)
    throw new Error('createSubjectWithCurriculum returned no topics');
  return {
    scenario: 'daily-limit-reached',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId, sessionId, topicId: firstTopicId },
  };
}

// ---------------------------------------------------------------------------
// review-empty — All caught up (totalOverdue === 0, nextUpcomingReviewAt set)
// ---------------------------------------------------------------------------

async function seedReviewEmpty(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Caught Up Learner',
    birthYear: LEARNER_BIRTH_YEAR,
  });

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Environmental Science',
  );

  // All cards scheduled for the future — totalOverdue === 0.
  // nextUpcomingReviewAt will be populated (7 days from now), which
  // causes practice.tsx to render the "All caught up" branch including
  // review-empty-state and review-empty-browse.
  const cardValues = topicIds.map((topicId) => ({
    id: generateUUIDv7(),
    profileId,
    topicId,
    easeFactor: 2.5,
    intervalDays: 7,
    repetitions: 3,
    failureCount: 0,
    consecutiveSuccesses: 3,
    xpStatus: 'verified' as const,
    nextReviewAt: futureDate(7),
    lastReviewedAt: new Date(),
  }));

  await db.insert(retentionCards).values(cardValues);

  const firstTopicId = topicIds[0];
  if (!firstTopicId)
    throw new Error('createSubjectWithCurriculum returned no topics');
  return {
    scenario: 'review-empty',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, topicId: firstTopicId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: dictation-with-mistakes
// Active learner for the dictation review flow (DICT-07..08).
// The reviewResult is produced at E2E runtime by the LLM analysing a seeded
// gallery image — the seed only provides the authenticated user context.
// The E2E wrapper (seed-and-run-dictation-review.sh) pre-pushes a JPEG with
// deliberate spelling errors to the emulator gallery so the LLM consistently
// returns a non-empty mistakes array.
// ---------------------------------------------------------------------------

async function seedDictationWithMistakes(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Dictation Learner',
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

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'English',
  );

  return {
    scenario: 'dictation-with-mistakes',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId },
  };
}

// ---------------------------------------------------------------------------
// Scenario: dictation-perfect-score
// Active learner for the dictation perfect-score review flow (DICT-09..10).
// Same profile shape as dictation-with-mistakes. The wrapper pushes a JPEG
// of neatly written, correctly spelled text so the LLM returns
// mistakes.length === 0 and the review-celebration screen renders.
// ---------------------------------------------------------------------------

async function seedDictationPerfectScore(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Dictation Learner',
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

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'English',
  );

  return {
    scenario: 'dictation-perfect-score',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId },
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
  'language-learner': seedLanguageLearner,
  'language-subject-active': seedLanguageSubjectActive,
  'parent-with-reports': seedParentWithReports,
  'mentor-memory-populated': seedMentorMemoryPopulated,
  'account-deletion-scheduled': seedAccountDeletionScheduled,
  'parent-proxy': seedParentProxy,
  'session-with-transcript': seedSessionWithTranscript,
  'with-bookmarks': seedWithBookmarks,
  'parent-with-weekly-report': seedParentWithWeeklyReport,
  'parent-session-with-recap': seedParentSessionWithRecap,
  'parent-session-recap-empty': seedParentSessionRecapEmpty,
  'parent-subject-with-retention': seedParentSubjectWithRetention,
  'parent-subject-no-retention': seedParentSubjectNoRetention,
  'subscription-family-active': seedSubscriptionFamilyActive,
  'subscription-pro-active': seedSubscriptionProActive,
  'purchase-pending': seedPurchasePending,
  'purchase-confirmed': seedPurchaseConfirmed,
  'quota-exceeded': seedQuotaExceeded,
  forbidden: seedForbidden,
  'quiz-malformed-round': seedQuizMalformedRound,
  'quiz-deterministic-wrong-answer': seedQuizDeterministicWrongAnswer,
  'quiz-answer-check-fails': seedQuizAnswerCheckFails,
  'review-empty': seedReviewEmpty,
  'dictation-with-mistakes': seedDictationWithMistakes,
  'dictation-perfect-score': seedDictationPerfectScore,
};

export const VALID_SCENARIOS = Object.keys(SCENARIO_MAP) as SeedScenario[];

export async function seedScenario(
  db: Database,
  scenario: SeedScenario,
  email: string,
  env: SeedEnv = {},
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
  env: SeedEnv = {},
  options: ResetOptions = {},
): Promise<ResetResult> {
  const prefix = options.prefix?.trim();

  // If caller supplied clerkUserIds, skip Clerk deletion (caller already did it
  // — typically the clean-clerk-test-users.mjs script, which runs locally to
  // avoid Cloudflare's 50-subrequest-per-Worker limit on bulk cleanup).
  const { count: clerkUsersDeleted, clerkUserIds } = options.clerkUserIds
    ? { count: 0, clerkUserIds: options.clerkUserIds }
    : await deleteClerkTestUsers(env, { prefix });

  if (prefix) {
    const deleted = await db
      .delete(accounts)
      .where(like(accounts.email, `${prefix}%`))
      .returning({ id: accounts.id });

    return { deletedCount: deleted.length, clerkUsersDeleted };
  }

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
  email: string,
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
            birthYear: prof.birthYear,
            isOwner: prof.isOwner,
            subjects: subjectRows.map((s) => ({
              id: s.id,
              name: s.name,
              status: s.status,
            })),
          };
        }),
      );
      return {
        id: acc.id,
        clerkUserId: acc.clerkUserId,
        email: acc.email,
        profiles: profilesWithSubjects,
      };
    }),
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
  clerkUserId: string,
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
