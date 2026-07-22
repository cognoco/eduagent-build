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
import { eq, like, inArray, or, sql } from 'drizzle-orm';
import {
  organization,
  person,
  login,
  membership,
  guardianship,
  supportership,
  consentGrant,
  consentRequest,
  subscription,
  learningProfiles,
  subjects,
  curricula,
  curriculumTopics,
  curriculumBooks,
  bookSuggestions,
  learningSessions,
  sessionEvents,
  sessionSummaries,
  monthlyReports,
  weeklyReports,
  retentionCards,
  assessments,
  quotaPools,
  profileQuotaUsage,
  usageEvents,
  streaks,
  needsDeepeningTopics,
  vocabulary,
  bookmarks,
  topicNotes,
  quizRounds,
  dictationResults,
  milestones,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import { listSubjects } from './subject';
import { getTierConfig } from './subscription';
import { sleep } from './sleep';
import {
  seedV2SupporterAccepted,
  seedV2SupporterManaged,
  seedV2SupporterPendingLink,
  seedV2SupporterSelfLearning,
  seedV2SupporterSelfLearningActive,
} from './test-seed-v2-supporter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Prefix used for all seed-created Clerk user IDs */
export const SEED_CLERK_PREFIX = 'clerk_seed_';

// [M1 / config-secrets] Hardcoded default seed password removed. SEED_PASSWORD
// must be supplied via env var (Doppler: stg/dev configs). Add to Doppler if
// not already present. Absence throws at password-use time, not at module load,
// so non-Clerk paths (unit tests with no Clerk key) also fail fast if the env
// var is missing.

/** Clerk REST API base URL */
const CLERK_API_BASE = 'https://api.clerk.com/v1';
const CLERK_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const CLERK_FETCH_MAX_ATTEMPTS = 4;
const CLERK_FETCH_BASE_DELAY_MS = 500;

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
  | 'child-quota-exceeded'
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
  | 'parent-with-children-no-sessions'
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
  | 'quiz-completed-history-detail'
  | 'dictation-with-mistakes'
  | 'dictation-perfect-score'
  | 'review-empty'
  // E2E chat/book entry-path coverage seeds
  // (docs/plans/2026-05-29-chat-book-entry-coverage.md).
  | 'topic-not-started'
  | 'topic-overdue-review'
  | 'book-no-curriculum'
  | 'subject-with-book-suggestions'
  // Mentor Chrome audit seed pack (docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md).
  // Stable registry names used by the audit re-run. Many are aliases of existing
  // scenarios — the alias preserves the audit's naming contract so blocked rows
  // can be rerun without coupling them to internal seeder names.
  | 'mentor-audit-empty-adult' // alias: pre-profile
  | 'mentor-audit-consent-pending-child' // alias: consent-pending (with consentStateId in ids)
  | 'mentor-audit-consent-withdrawn-child' // alias: consent-withdrawn
  | 'mentor-audit-post-approval-steady-state' // alias: parent-multi-child
  | 'mentor-audit-deletion-scheduled-owner' // alias: account-deletion-scheduled
  | 'mentor-audit-family-at-profile-limit'
  | 'mentor-audit-post-approval-redirect'
  | 'mentor-audit-consent-us-under-threshold'
  | 'mentor-audit-consent-eu-under-threshold'
  | 'mentor-audit-consent-over-threshold'
  | 'mentor-audit-quota-owner-daily'
  | 'mentor-audit-quota-family-monthly'
  | 'mentor-audit-paywall-child-notify'
  | 'mentor-audit-resumable-session'
  // Second wave — Task 0 composite + remaining DB-backed mentor-audit seeds.
  // mentor-audit-session-expired lives in apps/mobile/e2e-web/ (Playwright
  // storage-state mutation), not here.
  | 'mentor-audit-family-no-children' // alias: parent-solo (see Task 1b note)
  | 'mentor-audit-rich-child-history'
  | 'mentor-audit-session-revoked'
  | 'mentor-audit-mfa-totp'
  // Third wave (BILLING-07/08 + BRIDGE-03/04).
  | 'mentor-audit-family-pool-members'
  | 'mentor-audit-family-owner-daily-quota-with-child'
  | 'mentor-audit-bridge-backstack'
  // WI-2194 — stale Plus denominator repaired into one Family cycle.
  | 'wi-2194-stale-family-cycle'
  // [WI-2241] Supportership-aware v2 identity + accepted-visibility fixture —
  // apps/api/src/services/test-seed-v2-supporter.ts.
  | 'v2-supporter-accepted'
  // [WI-2226 owner-gate corroboration] Same-org managed cold-start candidate
  // — apps/api/src/services/test-seed-v2-supporter.ts.
  | 'v2-supporter-managed'
  // [WI-2554] Credentialed learner-only identity for Account row gating.
  | 'v2-account-non-owner-child'
  // [WI-2243] Self-learning doorway + Me-scope persistence fixtures —
  // apps/api/src/services/test-seed-v2-supporter.ts.
  | 'v2-supporter-self-learning'
  | 'v2-supporter-self-learning-active'
  // [WI-2242] Pending (pre-acceptance) visibility contract — the link-
  // ceremony fixture — apps/api/src/services/test-seed-v2-supporter.ts.
  | 'v2-supporter-pending-link';

/** Environment bindings needed by the seed service */
export interface SeedEnv {
  /** Clerk secret key for Backend API calls. Optional — falls back to fake IDs. */
  CLERK_SECRET_KEY?: string;
  /** Password for seed-created Clerk users. Required — no hardcoded fallback.
   * Set via SEED_PASSWORD in Doppler (stg/dev). */
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
  /** Delete DB rows while preserving matching reusable Clerk seed users. */
  preserveClerkUsers?: boolean;
  /** If provided, skip the Clerk deletion step entirely and use this list
   * for DB cleanup. Used by scripts/clean-clerk-test-users.mjs to keep Clerk
   * HTTP calls out of the Worker invocation (Cloudflare 50-subrequest limit). */
  clerkUserIds?: string[];
  /** Clerk IDs already verified by the local cleanup script as seed-managed. */
  verifiedSeedClerkUserIds?: string[];
}

// ---------------------------------------------------------------------------
// Clerk REST API helpers
// ---------------------------------------------------------------------------

interface ClerkUser {
  id: string;
  primary_email_address_id?: string | null;
  email_addresses: Array<{ id?: string; email_address: string }>;
  external_id: string | null;
}

function isSeedManagedClerkUserId(
  clerkUserId: string,
  seedClerkUserIds: string[] = [],
): boolean {
  return (
    clerkUserId.startsWith(SEED_CLERK_PREFIX) ||
    seedClerkUserIds.includes(clerkUserId)
  );
}

function isSeedManagedClerkUser(user: ClerkUser): boolean {
  return user.external_id?.startsWith(SEED_CLERK_PREFIX) === true;
}

async function fetchClerkWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  action: string,
): Promise<Response> {
  let lastDetail = '';

  for (let attempt = 0; attempt < CLERK_FETCH_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(input, init);
    if (response.ok || !CLERK_RETRYABLE_STATUSES.has(response.status)) {
      return response;
    }

    lastDetail = await response.text().catch(() => '');
    if (attempt < CLERK_FETCH_MAX_ATTEMPTS - 1) {
      await sleep(CLERK_FETCH_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }

  throw new Error(`${action} failed after retries: ${lastDetail}`);
}

/**
 * Finds or creates a real Clerk user via the Backend API.
 * If a user with the given email already exists, reuses it.
 * Returns the Clerk user ID (e.g., `user_2abc...`).
 *
 * If CLERK_SECRET_KEY is not set, generates a fake `clerk_seed_*` ID instead.
 */
export async function createClerkTestUser(
  email: string,
  env: SeedEnv,
): Promise<{ clerkUserId: string; password: string }> {
  if (!env.CLERK_SECRET_KEY) {
    // Fallback for environments without Clerk (unit tests, CI without secrets).
    // A random UUID is used as the password sentinel — no static default
    // credential exists, so there is nothing to leak if a future code path
    // accidentally forwards this value to an external service.
    return {
      clerkUserId: `${SEED_CLERK_PREFIX}${generateUUIDv7()}`,
      password: env.SEED_PASSWORD ?? generateUUIDv7(),
    };
  }

  // [M1] SEED_PASSWORD must be set via env var (Doppler stg/dev) for real Clerk
  // calls. No fallback — a committed default would leak a known credential for
  // seed accounts.
  const password = env.SEED_PASSWORD;
  if (!password) {
    throw new Error(
      'SEED_PASSWORD env var is required for test seeding. Add it to Doppler (stg/dev configs).',
    );
  }

  // Step 1: Check if user already exists (avoids 422 on duplicate email)
  const existingUser = await findClerkUserByEmail(email, env);

  let userId: string;
  const seedExternalId = `${SEED_CLERK_PREFIX}${generateUUIDv7()}`;

  if (existingUser) {
    if (!isSeedManagedClerkUser(existingUser)) {
      throw new Error(
        `Refusing to reuse non-seed Clerk user for seed email ${email}`,
      );
    }
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

  await verifyClerkTestUserEmail(userId, email, env);

  return { clerkUserId: userId, password };
}

async function verifyClerkTestUserEmail(
  userId: string,
  email: string,
  env: SeedEnv,
): Promise<void> {
  if (!env.CLERK_SECRET_KEY) return;

  const userRes = await fetch(
    `${CLERK_API_BASE}/users/${encodeURIComponent(userId)}`,
    {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    },
  );

  if (!userRes.ok) {
    const body = await userRes.text();
    throw new Error(`Clerk user lookup failed (${userRes.status}): ${body}`);
  }

  const user = (await userRes.json()) as ClerkUser;
  const emailAddress =
    user.email_addresses.find(
      (address) => address.email_address.toLowerCase() === email.toLowerCase(),
    ) ?? null;
  const emailAddressId = emailAddress?.id ?? user.primary_email_address_id;

  if (!emailAddressId) {
    throw new Error(`Clerk email address not found for seed user ${email}`);
  }

  const verifyRes = await fetch(
    `${CLERK_API_BASE}/email_addresses/${encodeURIComponent(emailAddressId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ verified: true, primary: true }),
    },
  );

  if (!verifyRes.ok) {
    const body = await verifyRes.text();
    throw new Error(
      `Clerk email verification failed (${verifyRes.status}): ${body}`,
    );
  }
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
  const res = await fetchClerkWithRetry(
    `${CLERK_API_BASE}/users?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    },
    `Clerk user lookup`,
  );

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
  const seedUsers = await listSeedClerkUsers(env, options);

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

async function verifySeedClerkUserIds(
  env: SeedEnv,
  clerkUserIds: string[],
  options: ResetOptions = {},
): Promise<string[]> {
  if (clerkUserIds.length === 0) return [];
  const requestedIds = new Set(clerkUserIds);
  const seedUsers = await listSeedClerkUsers(env, options);
  return seedUsers
    .filter((user) => requestedIds.has(user.id))
    .map((user) => user.id);
}

async function listSeedClerkUsers(
  env: SeedEnv,
  options: ResetOptions = {},
): Promise<ClerkUser[]> {
  if (!env.CLERK_SECRET_KEY) return [];
  const prefix = options.prefix?.trim().toLowerCase();
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

  return seedUsers;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Relative birth years — keeps fixtures stable as calendar year advances.
// Age 17 → LEARNER persona, one year clear of the consent gate (age ≤ 16).
const LEARNER_BIRTH_YEAR = new Date().getFullYear() - 17;
// Age 14 → real teen (≥ 13 v1 floor), used for guardian-with-children seeds
// so they never silently cross the profileListResponseSchema birthYear floor.
const CHILD_BIRTH_YEAR = new Date().getFullYear() - 14;

function pastDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

function futureDate(daysAhead: number): Date {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Legacy-FK-parent compatibility (WI-788)
//
// The v2 seed writes only the canonical parents (organization/person/
// subscription). On a committed-migration database the FIVE legacy identity
// parents (accounts/profiles/subscriptions/family_links/consent_states) still
// exist and many seeded children still FK them — `subjects.profile_id →
// profiles`, `quota_pools.subscription_id → subscriptions`,
// `profile_quota_usage.{profile_id→profiles, subscription_id→subscriptions}`,
// and ~50 learning-data children FKing profiles. The staging m-repoint.sql FK
// re-point (subscriptions→subscription, profiles→person) is a STAGING-MANUAL
// step, not a committed migration, so CI never has it.
//
// Fix: when a legacy parent table still exists, write the matching legacy
// parent row alongside the v2 parent, REUSING the same id (the deterministic
// reseed invariant: person.id = profiles.id = profileId, organization.id =
// accounts.id = accountId, subscription.id = subscriptions.id). Every legacy-FK
// child then resolves against its legacy parent.
//
// Self-inerting: post-DROP staging has dropped these tables → the existence
// check is false → the writes skip → no 500. Reversible once WI-586 commits
// m-repoint + M-DROP (the tables vanish and this code becomes inert).
// ---------------------------------------------------------------------------

/** Memoized per-table existence (regclass) — one probe per process. */
const legacyTableExistsCache = new Map<string, boolean>();

/** True iff `public.<table>` exists. Robust to both db.execute return shapes:
 *  the Neon HTTP driver returns an array; node-postgres returns `{ rows }`. */
async function tableExists(db: Database, table: string): Promise<boolean> {
  const cached = legacyTableExistsCache.get(table);
  if (cached !== undefined) return cached;
  const raw = (await db.execute(
    sql`SELECT to_regclass(${`public.${table}`}) AS reg`,
  )) as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<{ reg: string | null }>)
    : ((raw as { rows?: Array<{ reg: string | null }> }).rows ?? []);
  const exists = rows[0]?.reg != null;
  legacyTableExistsCache.set(table, exists);
  return exists;
}

// [WI-1139] The legacy `accounts`/`profiles`/`subscriptions` Drizzle table
// defs were removed (physical DB drop is a separate step, WI-1306/M2a) — the
// three legacy-parent writers below switch from typed `db.insert(table)` calls
// to raw parameterized SQL so they can keep writing the legacy-FK-satisfying
// rows on a still-legacy-chain DB (e.g. CI) without the removed schema
// exports. Behavior (including the self-inerting `tableExists()` gate) is
// unchanged.

/** Write the legacy `accounts` row (id = accountId) when the table exists. */
async function writeLegacyAccountIfPresent(
  db: Database,
  accountId: string,
  email: string,
  clerkUserId: string,
): Promise<void> {
  if (!(await tableExists(db, 'accounts'))) return;
  await db.execute(
    sql`INSERT INTO accounts (id, clerk_user_id, email) VALUES (${accountId}, ${clerkUserId}, ${email})`,
  );
}

/** Write the legacy `profiles` row (id = profileId) when the table exists. */
async function writeLegacyProfileIfPresent(
  db: Database,
  profileId: string,
  accountId: string,
  opts: { displayName: string; birthYear: number; isOwner: boolean },
): Promise<void> {
  if (!(await tableExists(db, 'profiles'))) return;
  await db.execute(
    sql`INSERT INTO profiles (id, account_id, display_name, birth_year, is_owner) VALUES (${profileId}, ${accountId}, ${opts.displayName}, ${opts.birthYear}, ${opts.isOwner})`,
  );
}

/**
 * The v2 `subscription` values the seed writes (the common subset across all
 * seed sites — none use store-correlation or cancelledAt columns).
 */
interface SeedSubscriptionValues {
  id: string;
  organizationId: string;
  payerPersonId: string;
  planTier: 'free' | 'plus' | 'family' | 'pro';
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
  trialEndsAt?: Date | null;
  periodStartAt?: Date | null;
  periodEndAt?: Date | null;
}

/**
 * Insert the v2 `subscription` row, then — on a committed-migration DB — the
 * matching legacy `subscriptions` row REUSING the same id, so quota children
 * (`quota_pools`/`profile_quota_usage`/`usage_events`/`top_up_credits`) whose
 * FK targets legacy `subscriptions` resolve. `organization_id` maps to the
 * legacy `account_id`; `planTier`→`tier`; `periodStartAt/EndAt`→
 * `currentPeriodStart/End`. Self-inerting post-DROP.
 */
async function insertSubscriptionWithLegacy(
  db: Database,
  values: SeedSubscriptionValues,
): Promise<void> {
  await db.insert(subscription).values(values);
  if (!(await tableExists(db, 'subscriptions'))) return;
  await db.execute(
    sql`INSERT INTO subscriptions (id, account_id, tier, status, trial_ends_at, current_period_start, current_period_end) VALUES (${values.id}, ${values.organizationId}, ${values.planTier}, ${values.status}, ${values.trialEndsAt ?? null}, ${values.periodStartAt ?? null}, ${values.periodEndAt ?? null})`,
  );
}

async function createBaseAccount(
  db: Database,
  email: string,
  clerkUserId: string,
): Promise<{ accountId: string }> {
  const accountId = generateUUIDv7();
  await db.insert(organization).values({
    id: accountId,
    name: `Seed org ${accountId.slice(0, 8)}`,
  });
  // Legacy FK anchor for committed-migration DBs — id = accountId so legacy
  // profiles/subscriptions FKs (account_id → accounts.id) resolve.
  await writeLegacyAccountIfPresent(db, accountId, email, clerkUserId);
  return { accountId };
}

async function createBaseProfile(
  db: Database,
  accountId: string,
  opts: {
    displayName: string;
    birthYear: number;
    isOwner?: boolean;
    email?: string;
    clerkUserId?: string;
    defaultAppContext?: string;
    residenceJurisdiction?: string;
  },
): Promise<string> {
  const profileId = generateUUIDv7();
  const isOwner = opts.isOwner !== false;

  await db.insert(person).values({
    id: profileId,
    displayName: opts.displayName,
    birthDate: `${opts.birthYear}-01-01`,
    residenceJurisdiction: opts.residenceJurisdiction ?? 'ROW',
    ...(opts.defaultAppContext
      ? { defaultAppContext: opts.defaultAppContext }
      : {}),
  });

  // Legacy FK anchor for committed-migration DBs — id = profileId so every
  // learning-data child FKing profiles.id (subjects, sessions, assessments, …)
  // resolves. accountId already has a matching legacy accounts row.
  await writeLegacyProfileIfPresent(db, profileId, accountId, {
    displayName: opts.displayName,
    birthYear: opts.birthYear,
    isOwner,
  });

  if (isOwner) {
    if (!opts.email || !opts.clerkUserId) {
      throw new Error(
        'createBaseProfile: email and clerkUserId required for owner profiles',
      );
    }
    const loginId = generateUUIDv7();
    await db.insert(login).values({
      id: loginId,
      personId: profileId,
      clerkUserId: opts.clerkUserId,
      email: opts.email,
    });
    await db.update(person).set({ loginId }).where(eq(person.id, profileId));
    await db.insert(membership).values({
      personId: profileId,
      organizationId: accountId,
      roles: ['admin', 'learner'],
    });
  } else {
    await db.insert(membership).values({
      personId: profileId,
      organizationId: accountId,
      roles: ['learner'],
    });
  }

  return profileId;
}

export async function createSubjectWithCurriculum(
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
// Reusable insert helpers (Task 0 from mentor-audit seed pack plan)
//
// These were extracted from the inline inserts inside seedParentWithWeeklyReport,
// seedParentSubjectWithRetention, seedParentSessionWithRecap, seedWithBookmarks
// (bookmarks/topicNotes), and seedLanguageLearner (vocabulary) so the
// mentor-audit-rich-child-history composite seeder can compose them without
// re-creating account/subject scaffolding for each call.
//
// Each helper returns the inserted row IDs so callers can put them into
// SeedResult.ids. Helpers MUST NOT alter the SeedResult.ids shape of the
// original seeders — the unit + integration test suites encode that contract
// (see VALID_SCENARIOS it.each + the Stage-0 ids whitelist in test-seed.test.ts).
// ---------------------------------------------------------------------------

export async function insertWeeklyReport(
  db: Database,
  opts: {
    profileId: string; // parent
    childProfileId: string;
    childName?: string;
    reportWeek?: string; // ISO YYYY-MM-DD, Monday start
  },
): Promise<{ reportId: string; reportWeek: string }> {
  const reportId = generateUUIDv7();
  const reportWeek = opts.reportWeek ?? '2026-04-28';
  await db.insert(weeklyReports).values({
    id: reportId,
    profileId: opts.profileId,
    childProfileId: opts.childProfileId,
    reportWeek,
    reportData: {
      childName: opts.childName ?? 'Test Teen',
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
  return { reportId, reportWeek };
}

async function insertMonthlyReport(
  db: Database,
  opts: {
    profileId: string; // parent
    childProfileId: string;
    childName?: string;
    reportMonth?: string; // ISO YYYY-MM-DD, first of month
    monthLabel?: string;
  },
): Promise<{ reportId: string; reportMonth: string }> {
  const reportId = generateUUIDv7();
  const reportMonth = opts.reportMonth ?? '2026-03-01';
  await db.insert(monthlyReports).values({
    id: reportId,
    profileId: opts.profileId,
    childProfileId: opts.childProfileId,
    reportMonth,
    reportData: {
      childName: opts.childName ?? 'Test Teen',
      month: opts.monthLabel ?? 'March 2026',
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
  return { reportId, reportMonth };
}

export async function insertRetentionCards(
  db: Database,
  opts: {
    profileId: string;
    topicId: string;
    count?: number;
  },
): Promise<{ retentionCardIds: string[] }> {
  const count = opts.count ?? 1;
  const rows = Array.from({ length: count }, () => ({
    id: generateUUIDv7(),
    profileId: opts.profileId,
    topicId: opts.topicId,
    easeFactor: 2.5,
    intervalDays: 7,
    repetitions: 3,
    failureCount: 0,
    consecutiveSuccesses: 3,
    xpStatus: 'verified' as const,
    nextReviewAt: futureDate(7),
  }));
  await db.insert(retentionCards).values(rows);
  return { retentionCardIds: rows.map((row) => row.id) };
}

export async function insertSessionWithRecap(
  db: Database,
  opts: {
    profileId: string;
    subjectId: string;
    topicId: string;
    recapContent?: string;
    recapHighlight?: string;
    engagementSignal?: 'curious' | 'focused' | 'restless' | 'frustrated';
    endedDaysAgo?: number;
    exchangeCount?: number;
    wallClockSeconds?: number;
  },
): Promise<{ sessionId: string; summaryId: string }> {
  const sessionId = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId: opts.profileId,
    subjectId: opts.subjectId,
    topicId: opts.topicId,
    sessionType: 'learning',
    status: 'completed',
    exchangeCount: opts.exchangeCount ?? 10,
    endedAt: pastDate(opts.endedDaysAgo ?? 1),
    wallClockSeconds: opts.wallClockSeconds ?? 1080,
  });

  const summaryId = generateUUIDv7();
  await db.insert(sessionSummaries).values({
    id: summaryId,
    sessionId,
    profileId: opts.profileId,
    topicId: opts.topicId,
    content:
      opts.recapContent ??
      'We worked through the topic with growing confidence and self-corrected mid-way.',
    aiFeedback: 'Great perseverance and clear reasoning throughout.',
    highlight:
      opts.recapHighlight ??
      'Recognised the pattern before being prompted — strong sign of transfer.',
    narrative:
      'The learner approached the topic methodically and self-corrected on the second exchange without prompting.',
    conversationPrompt:
      'Can you spot any connection between this and the last topic?',
    engagementSignal: opts.engagementSignal ?? 'curious',
    status: 'accepted',
  });

  return { sessionId, summaryId };
}

async function insertVocabulary(
  db: Database,
  opts: {
    profileId: string;
    subjectId: string;
    terms?: Array<{
      term: string;
      translation: string;
      cefrLevel?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
      mastered?: boolean;
      type?: 'word' | 'chunk';
    }>;
  },
): Promise<{ vocabularyIds: string[] }> {
  const terms = opts.terms ?? [
    { term: 'hola', translation: 'hello', cefrLevel: 'A1', mastered: false },
    {
      term: 'gracias',
      translation: 'thank you',
      cefrLevel: 'A1',
      mastered: true,
      type: 'chunk',
    },
    {
      term: 'biblioteca',
      translation: 'library',
      cefrLevel: 'A2',
      mastered: false,
    },
  ];
  const rows = terms.map((entry) => ({
    id: generateUUIDv7(),
    profileId: opts.profileId,
    subjectId: opts.subjectId,
    term: entry.term,
    termNormalized: entry.term.toLowerCase(),
    translation: entry.translation,
    type: entry.type ?? ('word' as const),
    cefrLevel: entry.cefrLevel ?? ('A1' as const),
    mastered: entry.mastered ?? false,
  }));
  await db.insert(vocabulary).values(rows);
  return { vocabularyIds: rows.map((row) => row.id) };
}

async function insertBookmarks(
  db: Database,
  opts: {
    profileId: string;
    sessionId: string;
    subjectId: string;
    topicId: string;
    contents?: string[];
  },
): Promise<{ bookmarkIds: string[] }> {
  const contents = opts.contents ?? [
    'The Roman Republic was founded in 509 BC after the overthrow of the monarchy.',
    'Julius Caesar crossed the Rubicon river in 49 BC, triggering the civil war.',
  ];
  const rows = contents.map((content) => ({
    id: generateUUIDv7(),
    profileId: opts.profileId,
    sessionId: opts.sessionId,
    // Bookmarks reference raw event IDs (no FK — by design in schema).
    eventId: generateUUIDv7(),
    subjectId: opts.subjectId,
    topicId: opts.topicId,
    content,
  }));
  await db.insert(bookmarks).values(rows);
  return { bookmarkIds: rows.map((row) => row.id) };
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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

/**
 * A credentialed learner who is not an organization admin. Unlike the
 * managed-child fixtures, this person owns a Clerk login and can enter the
 * V2 shell directly; unlike owner fixtures, membership carries only the
 * learner role. That distinction is the property Account E2E must exercise.
 */
async function seedV2AccountNonOwnerChild(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Child',
    birthYear: LEARNER_BIRTH_YEAR,
    isOwner: false,
  });

  const loginId = generateUUIDv7();
  await db.insert(login).values({
    id: loginId,
    personId: profileId,
    clerkUserId,
    email,
  });
  await db.update(person).set({ loginId }).where(eq(person.id, profileId));

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Child Learning Data',
  );

  return {
    scenario: 'v2-account-non-owner-child',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId },
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
    email,
    clerkUserId,
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
    email,
    clerkUserId,
  });

  const { subjectId, bookId, topicIds } = await createSubjectWithCurriculum(
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
    ids: { subjectId, bookId, retentionCardId: firstCard.id },
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
    email,
    clerkUserId,
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

// E2E coverage seed: a topic in the `not_started` state (no sessions, no
// retention card, no assessment). computeCompletionStatus (progress.ts) returns
// 'not_started', so the topic-detail StudyCTA renders "Start studying" and
// pushes a mode=learning session. Exports bookId + topicId so the flow can
// navigate Library → shelf → book → topic without scraping titles.
async function seedTopicNotStarted(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Fresh Learner',
    birthYear: LEARNER_BIRTH_YEAR,
    email,
    clerkUserId,
  });

  const { subjectId, bookId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Geography',
  );

  const firstTopicId = topicIds[0];
  if (!firstTopicId)
    throw new Error('createSubjectWithCurriculum returned no topics');
  return {
    scenario: 'topic-not-started',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, bookId, topicId: firstTopicId },
  };
}

// E2E coverage seed: a topic in the `verified` + overdue state. A retention
// card with xpStatus='verified' makes computeCompletionStatus return 'verified',
// and nextReviewAt in the past makes it overdue. The topic-detail StudyCTA
// renders "Review this topic" and handleStudyPress pushes a mode=review session
// (topic/[topicId].tsx overdue branch). Exports bookId + topicId.
async function seedTopicOverdueReview(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Review Due Learner',
    birthYear: LEARNER_BIRTH_YEAR,
    email,
    clerkUserId,
  });

  const { subjectId, bookId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Astronomy',
  );

  const firstTopicId = topicIds[0];
  if (!firstTopicId)
    throw new Error('createSubjectWithCurriculum returned no topics');

  await db.insert(retentionCards).values({
    id: generateUUIDv7(),
    profileId,
    topicId: firstTopicId,
    easeFactor: 2.5,
    intervalDays: 7,
    repetitions: 3,
    consecutiveSuccesses: 3,
    failureCount: 0,
    xpStatus: 'verified',
    nextReviewAt: pastDate(1), // overdue → "Review this topic" → mode=review
    lastReviewedAt: pastDate(8),
  });

  return {
    scenario: 'topic-overdue-review',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, bookId, topicId: firstTopicId },
  };
}

// E2E coverage seed: a book whose curriculum has been marked generated but has
// ZERO topics, so the book-detail screen renders the empty-state
// "Build learning path" CTA (topics-empty-build). handleBuildLearningPath calls
// startFirstCurriculumSession (sessionCount===0, no resume target) and lands in
// a mode=learning session. Exports bookId.
async function seedBookNoCurriculum(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'New Book Learner',
    birthYear: LEARNER_BIRTH_YEAR,
    email,
    clerkUserId,
  });

  const subjectId = generateUUIDv7();
  await db.insert(subjects).values({
    id: subjectId,
    profileId,
    name: 'Economics',
    status: 'active',
  });

  const curriculumId = generateUUIDv7();
  await db.insert(curricula).values({
    id: curriculumId,
    subjectId,
    version: 1,
  });

  // Book exists and is marked generated, but no curriculumTopics rows are
  // inserted — this drives the empty-state build-learning-path CTA.
  const bookId = generateUUIDv7();
  await db.insert(curriculumBooks).values({
    id: bookId,
    subjectId,
    title: 'Economics',
    sortOrder: 0,
    topicsGenerated: true,
  });

  return {
    scenario: 'book-no-curriculum',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, bookId },
  };
}

// E2E coverage seed: a subject with pre-generated book suggestions but no books
// yet. Drives the shelf suggestion cards (shelf-suggestion-${id}) and the
// pick-book screen's flat suggestion grid (pick-book-suggestion-${id}), which
// file a chosen suggestion into a new book. Exports the first suggestionId.
async function seedSubjectWithBookSuggestions(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Suggestion Picker',
    birthYear: LEARNER_BIRTH_YEAR,
    email,
    clerkUserId,
  });

  const subjectId = generateUUIDv7();
  await db.insert(subjects).values({
    id: subjectId,
    profileId,
    name: 'Philosophy',
    status: 'active',
  });

  const curriculumId = generateUUIDv7();
  await db.insert(curricula).values({
    id: curriculumId,
    subjectId,
    version: 1,
  });

  // The pick-book screen's `useBookSuggestions(subjectId, { topup: true })`
  // POSTs to the topup endpoint, which triggers an LLM call whenever
  // `unpicked.length < 4` (services/suggestions.ts:207). Seeding 4 unpicked
  // suggestions skips the topup path so the screen renders deterministically
  // without depending on an LLM round-trip. The shelf screen's plain GET path
  // is unaffected (it doesn't touch the topup branch).
  const suggestionValues = [
    { title: 'Ancient Greek Philosophy', emoji: '🏛️' },
    { title: 'Ethics and Morality', emoji: '⚖️' },
    { title: 'Philosophy of Mind', emoji: '🧠' },
    { title: 'Logic and Reasoning', emoji: '🔍' },
  ].map((s, i) => ({
    id: generateUUIDv7(),
    subjectId,
    title: s.title,
    emoji: s.emoji,
    description: `An introduction to ${s.title}`,
    createdAt: new Date(Date.now() + i), // stable ordering
    pickedAt: null,
  }));

  await db.insert(bookSuggestions).values(suggestionValues);

  const firstSuggestion = suggestionValues[0];
  if (!firstSuggestion) throw new Error('No book suggestions created');
  return {
    scenario: 'subject-with-book-suggestions',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, suggestionId: firstSuggestion.id },
  };
}

async function seedParentWithChildren(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Parent profile in Family mode. With MODE_NAV_V1_ENABLED=true (eas.json
  // development + preview builds), showFamilyHome requires familyShape=true
  // which requires defaultAppContext='family'. Without this, the parent lands on
  // learner-screen (study mode) and open-family-dashboard.yaml cannot find
  // parent-home-check-child-* (only rendered inside ParentHomeScreen).
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Parent',
    birthYear: 1990,
    email,
    clerkUserId,
    defaultAppContext: 'family',
  });

  // Child profile (teen)
  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Teen',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  // Family link
  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });

  // Consent for child
  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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

  // Parent profile in Family mode (defaultAppContext='family' → V1 guardian
  // shape; see seedParentWithChildren rationale).
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Parent',
    birthYear: 1990,
    email,
    clerkUserId,
    defaultAppContext: 'family',
  });

  // Parent also gets a subject so the inline "Learn something" view works.
  // Expose its ID separately from the child subjects so owner-learner E2E
  // evidence can bind content to the exact owner's row.
  const { subjectId: ownerSubjectId } = await createSubjectWithCurriculum(
    db,
    parentProfileId,
    'General Knowledge',
  );

  // Child 1 — teen with active learning
  const child1ProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Emma',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: parentProfileId,
    chargePersonId: child1ProfileId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: child1ProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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

  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: parentProfileId,
    chargePersonId: child2ProfileId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: child2ProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: parentProfileId,
    chargePersonId: child3ProfileId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: child3ProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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
      ownerSubjectId,
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
    email,
    clerkUserId,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'plus',
    status: 'trial',
    trialEndsAt: futureDate(7),
    periodStartAt: new Date(),
    periodEndAt: futureDate(14),
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
    email,
    clerkUserId,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'free',
    status: 'expired',
    trialEndsAt: pastDate(3),
    periodStartAt: pastDate(17),
    periodEndAt: pastDate(3),
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
    email,
    clerkUserId,
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
    email,
    clerkUserId,
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
    email,
    clerkUserId,
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
  const childMonthlyQuota = freeTier.childMonthlyQuota;
  const childDailyQuota = freeTier.childDailyQuota;
  if (childMonthlyQuota == null || childDailyQuota == null) {
    throw new Error('Free tier child quota config must include child limits');
  }

  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Parent profile (account owner)
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Paywall Parent',
    birthYear: 1990,
    isOwner: true,
    email,
    clerkUserId,
  });

  // Expired subscription — child hits the paywall
  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: parentProfileId,
    planTier: 'free',
    status: 'expired',
    trialEndsAt: pastDate(3),
    periodStartAt: pastDate(17),
    periodEndAt: pastDate(3),
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

  // Child profile (non-owner teen)
  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Paywall Teen',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(profileQuotaUsage).values({
    id: generateUUIDv7(),
    subscriptionId,
    profileId: childProfileId,
    role: 'child',
    monthlyLimit: childMonthlyQuota,
    usedThisMonth: childMonthlyQuota,
    dailyLimit: childDailyQuota,
    usedToday: childDailyQuota,
    cycleResetAt: futureDate(13),
  });

  // Family link
  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });

  // Consent for child
  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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
    email,
    clerkUserId,
  });

  // Child profile (non-owner teen) with withdrawn consent
  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Withdrawn Teen',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  // Family link
  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });

  // Consent state: WITHDRAWN
  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });
  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: false,
    withdrawnAt: new Date(),
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
    email,
    clerkUserId,
  });

  // Consent state: WITHDRAWN
  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });
  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: false,
    withdrawnAt: new Date(),
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: parentProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: parentProfileId,
    planTier: 'family',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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
  _db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  // Pre-profile models an authenticated Clerk user who has NOT yet created a
  // profile (the create-profile gate). In the v2 model that is purely a Clerk
  // identity with NO row in our DB — no organization, person, login, or
  // membership. Creating an organization here would orphan it: the login-rooted
  // reset and idempotency paths can never find an org with no login/membership,
  // so it would accumulate on every seed call. The Clerk user alone is enough;
  // GET /v1/profiles returns {profiles: []} for the graphless v2 user.
  //
  // Clerk-side cleanup is NOT orphaned: deleteClerkTestUsers (run by
  // resetDatabase) reaps by scanning all Clerk users and filtering on the seed
  // external_id prefix (clerk_seed_) — it does NOT depend on a login/DB row, so
  // this graphless Clerk user is reclaimed by every reset like any other seed.
  const { password } = await createClerkTestUser(email, env);

  return {
    scenario: 'pre-profile',
    accountId: '',
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
    birthYear: CHILD_BIRTH_YEAR,
    email,
    clerkUserId,
  });
  const consentToken = `seed-consent-${generateUUIDv7()}`;
  const consentStateId = generateUUIDv7();

  await db.insert(consentRequest).values({
    id: consentStateId,
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    requestedBasis: 'gdpr_parental_consent',
    guardianEmail: 'parent-e2e-test@example.com',
    status: 'requested',
    token: consentToken,
    tokenExpiresAt: futureDate(7),
    requestedAt: new Date(),
  });

  return {
    scenario: 'consent-pending',
    accountId,
    profileId,
    email,
    password,
    ids: { consentToken, consentStateId },
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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
  const firstTopicId = topicIds[0];
  if (!firstTopicId) {
    throw new Error('language-learner seed did not create a topic');
  }

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
    ids: { subjectId, topicId: firstTopicId },
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

  const { reportId } = await insertMonthlyReport(db, {
    profileId: parentProfileId,
    childProfileId,
    childName: 'Test Teen',
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
  await db.insert(organization).values({
    id: accountId,
    name: `Seed org ${accountId.slice(0, 8)}`,
    deletionScheduledAt: futureDate(30),
  });

  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Deletion Scheduled User',
    birthYear: LEARNER_BIRTH_YEAR,
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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
    email,
    clerkUserId,
  });

  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Proxy Child',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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

  const { bookmarkIds } = await insertBookmarks(db, {
    profileId,
    sessionId,
    subjectId,
    topicId,
  });
  const bookmarkId = bookmarkIds[0];
  if (!bookmarkId) throw new Error('insertBookmarks returned no rows');

  await db.insert(topicNotes).values({
    profileId,
    topicId,
    sessionId,
    content: 'Rome moved from monarchy to republic before becoming an empire.',
  });

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

  const { reportId } = await insertWeeklyReport(db, {
    profileId: parentProfileId,
    childProfileId,
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
// Scenario: parent-with-children-no-sessions
// Parent owner with defaultAppContext='family' + linked child + consent, but
// the child has ZERO learningSessions rows. listRecapsForParent returns [],
// so the V1 Recaps tab renders the `recaps-empty` branch with the
// "start a session" CTA.
//
// Distinct from parent-session-recap-empty: that scenario has a session whose
// summary is null (pre-backfill state). This one has no session at all, which
// is the only seed shape that produces an empty recaps list.
// ---------------------------------------------------------------------------

async function seedParentWithChildrenNoSessions(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Parent profile in Family mode (defaultAppContext='family' → V1 guardian
  // shape; see seedParentWithChildren rationale).
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Parent',
    birthYear: 1990,
    email,
    clerkUserId,
    defaultAppContext: 'family',
  });

  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Test Teen',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  // Subject + curriculum WITHOUT any learningSessions row. Keeps the child
  // dashboard renderable (subject card visible) but produces zero recaps.
  const { subjectId } = await createSubjectWithCurriculum(
    db,
    childProfileId,
    'Mathematics',
    'active',
    3,
    'fractions homework',
  );

  return {
    scenario: 'parent-with-children-no-sessions',
    accountId,
    profileId: parentProfileId,
    email,
    password,
    ids: {
      parentProfileId,
      childProfileId,
      subjectId,
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

  await insertRetentionCards(db, {
    profileId: childProfileId,
    topicId: topicRow.id,
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'family',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'pro',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'plus',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const freeTier = getTierConfig('free');
  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const freeTier = getTierConfig('free');
  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const freeTier = getTierConfig('free');
  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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
// Scenario: quiz-completed-history-detail
// A completed round in the production-persisted shape consumed by detail reads.
// The full Playwright history-open specification uses this seed so it never
// depends on a prior quiz run or mutates state during the browser assertion.
// ---------------------------------------------------------------------------

async function seedQuizCompletedHistoryDetail(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedOnboardingComplete(db, email, env);
  const roundId = generateUUIDv7();

  await db.insert(quizRounds).values({
    id: roundId,
    profileId: base.profileId,
    subjectId: base.ids.subjectId,
    activityType: 'capitals',
    theme: 'European Capitals',
    questions: [
      {
        type: 'capitals',
        country: 'France',
        correctAnswer: 'Paris',
        acceptedAliases: ['Paris'],
        distractors: ['Berlin', 'Madrid', 'Rome'],
        funFact: 'Paris is known as the City of Light.',
        isLibraryItem: false,
      },
    ],
    results: [
      {
        questionIndex: 0,
        correct: false,
        correctAnswer: 'Paris',
        answerGiven: 'Berlin',
        timeMs: 1250,
      },
    ],
    score: 0,
    total: 1,
    xpEarned: 0,
    libraryQuestionIndices: [],
    status: 'completed',
    completedAt: new Date(),
  });

  return {
    ...base,
    scenario: 'quiz-completed-history-detail',
    ids: { ...base.ids, roundId },
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
    email,
    clerkUserId,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
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

  // [per-profile metering] The owner profile also needs a profile_quota_usage
  // row so the per-profile read path sees the exhausted daily cap. The shared
  // quotaPools row above is for legacy/shared-pool reads; the free tier reads
  // per-profile, so without this the middleware auto-provisions a fresh row with
  // usedToday=0 and the daily cap never triggers.
  await db.insert(profileQuotaUsage).values({
    id: generateUUIDv7(),
    subscriptionId,
    profileId,
    role: 'owner',
    monthlyLimit: freeTier.ownerMonthlyQuota ?? freeTier.monthlyQuota,
    usedThisMonth: 10,
    dailyLimit: freeTier.dailyLimit,
    usedToday: 10,
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

async function seedChildQuotaExceeded(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const freeTier = getTierConfig('free');
  const childMonthlyQuota = freeTier.childMonthlyQuota ?? freeTier.monthlyQuota;
  const childDailyQuota = freeTier.childDailyQuota ?? freeTier.dailyLimit;
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const ownerProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Quota Parent',
    birthYear: 1985,
    isOwner: true,
    email,
    clerkUserId,
    defaultAppContext: 'family',
  });
  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Quota Child',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: ownerProfileId,
    chargePersonId: childProfileId,
  });
  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: ownerProfileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
  });
  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: freeTier.monthlyQuota,
    usedThisMonth: childMonthlyQuota,
    dailyLimit: freeTier.dailyLimit,
    usedToday: 1,
    cycleResetAt: futureDate(30),
  });
  await db.insert(profileQuotaUsage).values({
    id: generateUUIDv7(),
    subscriptionId,
    profileId: childProfileId,
    role: 'child',
    monthlyLimit: childMonthlyQuota,
    usedThisMonth: childMonthlyQuota,
    dailyLimit: childDailyQuota,
    usedToday: 1,
    cycleResetAt: futureDate(30),
  });

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    childProfileId,
    'Mathematics',
  );
  const topicId = topicIds[0];
  if (!topicId)
    throw new Error('createSubjectWithCurriculum returned no topics');

  const sessionId = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId: childProfileId,
    subjectId,
    topicId,
    sessionType: 'learning',
    status: 'active',
    exchangeCount: 1,
  });
  await db.insert(sessionEvents).values({
    id: generateUUIDv7(),
    sessionId,
    profileId: childProfileId,
    subjectId,
    eventType: 'ai_response',
    content: 'We were practicing algebra patterns.',
  });

  return {
    scenario: 'child-quota-exceeded',
    accountId,
    profileId: childProfileId,
    email,
    password,
    ids: {
      subscriptionId,
      ownerProfileId,
      childProfileId,
      subjectId,
      sessionId,
      topicId,
    },
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
    email,
    clerkUserId,
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
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
// Mentor Chrome audit seed pack
//
// See docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md. These seeders
// back the `mentor-audit-*` registry names. Most entries are thin aliases of
// existing scenarios (the registry preserves the audit's naming contract
// without coupling it to internal seeder names). New seeders cover states the
// audit cannot reach with current scenarios.
// ---------------------------------------------------------------------------

/** Wraps an existing seeder and rewrites the returned `scenario` field so
 *  alias entries return the registry name the caller asked for. Other fields
 *  (accountId, profileId, password, ids) are passed through unchanged. */
function aliasSeeder(scenario: SeedScenario, inner: SeederFn): SeederFn {
  return async (db, email, env) => {
    const result = await inner(db, email, env);
    return { ...result, scenario };
  };
}

/** Family owner at the plan's profile cap (1 owner + 3 children = 4, which is
 *  `getTierConfig('family').maxProfiles`). Exercises the "add child" gating UX
 *  when the plan limit is already reached. */
async function seedMentorAuditFamilyAtProfileLimit(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const familyTier = getTierConfig('family');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Parent profile in Family mode (defaultAppContext='family' → V1 guardian
  // shape; see seedParentWithChildren rationale).
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Capped Parent',
    birthYear: 1985,
    email,
    clerkUserId,
    defaultAppContext: 'family',
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: parentProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: parentProfileId,
    planTier: 'family',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
  });

  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: familyTier.monthlyQuota,
    usedThisMonth: 120,
    cycleResetAt: futureDate(30),
  });

  // 1 owner is already inserted above; add (maxProfiles - 1) children so the
  // total exactly hits the cap.
  const childProfileIds: string[] = [];
  const childCount = familyTier.maxProfiles - 1;
  for (let i = 0; i < childCount; i += 1) {
    const childProfileId = await createBaseProfile(db, accountId, {
      displayName: `Capped Child ${i + 1}`,
      birthYear: CHILD_BIRTH_YEAR,
      isOwner: false,
    });
    childProfileIds.push(childProfileId);

    await db.insert(guardianship).values({
      id: generateUUIDv7(),
      guardianPersonId: parentProfileId,
      chargePersonId: childProfileId,
    });

    await db.insert(consentGrant).values({
      id: generateUUIDv7(),
      chargePersonId: childProfileId,
      organizationId: accountId,
      purpose: 'platform_use',
      lawfulBasis: 'gdpr_parental_consent',
      granted: true,
    });
  }

  return {
    scenario: 'mentor-audit-family-at-profile-limit',
    accountId,
    profileId: parentProfileId,
    email,
    password,
    ids: {
      parentProfileId,
      subscriptionId,
      childProfileId1: childProfileIds[0] ?? '',
      childProfileId2: childProfileIds[1] ?? '',
      childProfileId3: childProfileIds[2] ?? '',
    },
  };
}

/** Parent landing at the consent-approve URL. Mirrors the data state a parent
 *  hits when clicking the link in the consent-request email — pending child
 *  consent with a usable `consentToken`. The parent (owner) is signed in. */
async function seedMentorAuditPostApprovalRedirect(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Approving Parent',
    birthYear: 1985,
    isOwner: true,
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: parentProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Awaiting-Approval Child',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });

  const consentToken = `seed-consent-${generateUUIDv7()}`;
  const consentStateId = generateUUIDv7();
  await db.insert(consentRequest).values({
    id: consentStateId,
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    requestedBasis: 'gdpr_parental_consent',
    guardianEmail: 'parent-e2e-test@example.com',
    status: 'requested',
    token: consentToken,
    tokenExpiresAt: futureDate(7),
    requestedAt: new Date(),
  });

  return {
    scenario: 'mentor-audit-post-approval-redirect',
    accountId,
    profileId: parentProfileId,
    email,
    password,
    ids: { parentProfileId, childProfileId, consentToken, consentStateId },
  };
}

/** Region/age consent threshold variants. Each seeds a profile with the
 *  specified `location` enum value and a birth year that produces the target
 *  age relative to the current calendar year. The product code decides whether
 *  parental consent is required based on these inputs — the seeder does NOT
 *  pre-set `consent_states.status`; it leaves the threshold logic to the app
 *  so the audit can observe each gate produced from the same starting state. */
function makeConsentThresholdSeeder(
  scenario: SeedScenario,
  opts: { location: 'US' | 'EU' | 'OTHER'; ageYears: number },
): SeederFn {
  return async (db, email, env) => {
    const { clerkUserId, password } = await createClerkTestUser(email, env);
    const { accountId } = await createBaseAccount(db, email, clerkUserId);
    const profileId = generateUUIDv7();
    await db.insert(person).values({
      id: profileId,
      displayName: `Consent Threshold (${opts.location} ${opts.ageYears}y)`,
      birthDate: `${new Date().getFullYear() - opts.ageYears}-01-01`,
      residenceJurisdiction:
        opts.location === 'US' ? 'US' : opts.location === 'EU' ? 'EU' : 'ROW',
    });
    {
      const loginId = generateUUIDv7();
      await db.insert(login).values({
        id: loginId,
        personId: profileId,
        clerkUserId,
        email,
      });
      await db.update(person).set({ loginId }).where(eq(person.id, profileId));
    }
    await db.insert(membership).values({
      personId: profileId,
      organizationId: accountId,
      roles: ['admin', 'learner'],
    });

    return {
      scenario,
      accountId,
      profileId,
      email,
      password,
      ids: {},
    };
  };
}

/** Free-tier owner that has hit the daily cap (10/day). Family/Pro tiers have
 *  no daily limit (`getTierConfig` at `subscription.ts:35,50,61,72`), so this
 *  state is Study/free-tier-only. */
async function seedMentorAuditQuotaOwnerDaily(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const freeTier = getTierConfig('free');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Daily Cap Owner',
    birthYear: 1985,
    isOwner: true,
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
  });

  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: freeTier.monthlyQuota,
    usedThisMonth: 12,
    dailyLimit: freeTier.dailyLimit,
    usedToday: freeTier.dailyLimit ?? 10,
    cycleResetAt: futureDate(30),
  });

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Mathematics',
  );

  return {
    scenario: 'mentor-audit-quota-owner-daily',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId },
  };
}

/** Family-tier owner whose monthly pool is exhausted. Tests the
 *  family-pool-exhausted owner state (no daily cap on Family). */
async function seedMentorAuditQuotaFamilyMonthly(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const familyTier = getTierConfig('family');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Family Monthly Cap Owner',
    birthYear: 1985,
    isOwner: true,
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: profileId,
    planTier: 'family',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
  });

  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: familyTier.monthlyQuota,
    usedThisMonth: familyTier.monthlyQuota,
    cycleResetAt: futureDate(30),
  });

  const { subjectId } = await createSubjectWithCurriculum(
    db,
    profileId,
    'General Knowledge',
  );

  return {
    scenario: 'mentor-audit-quota-family-monthly',
    accountId,
    profileId,
    email,
    password,
    ids: { subscriptionId, subjectId },
  };
}

/** Profile with a deterministic in-progress learning session — enough state
 *  for the resume card to render. No LLM calls during seeding. */
async function seedMentorAuditResumableSession(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Resume Learner',
    birthYear: LEARNER_BIRTH_YEAR,
    isOwner: true,
    email,
    clerkUserId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: profileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    'Geography',
  );
  const topicId = topicIds[0];
  if (!topicId) {
    throw new Error('resumable-session seed: subject created no topics');
  }

  const sessionId = generateUUIDv7();
  const startedAt = pastDate(0); // a few minutes ago — kept simple
  await db.insert(learningSessions).values({
    id: sessionId,
    profileId,
    subjectId,
    topicId,
    sessionType: 'learning',
    status: 'active',
    exchangeCount: 4,
    startedAt,
    lastActivityAt: startedAt,
  });

  // Enough events to render a meaningful resume card (alternating user / ai).
  await db.insert(sessionEvents).values(
    Array.from({ length: 4 }, (_, i) => ({
      id: generateUUIDv7(),
      sessionId,
      profileId,
      subjectId,
      eventType:
        i % 2 === 0 ? ('user_message' as const) : ('ai_response' as const),
      content:
        i % 2 === 0
          ? 'What are the continents called?'
          : 'There are seven continents. Want to name them with me?',
    })),
  );

  return {
    scenario: 'mentor-audit-resumable-session',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId, topicId, sessionId },
  };
}

/** Rich-history child — composes the Task 0 helpers so the audit can exercise
 *  the parent-native review surfaces (weekly report, recap, retention,
 *  vocabulary, bookmarks) against a single linked child. Deterministic — no
 *  LLM calls during seeding. */
async function seedMentorAuditRichChildHistory(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Parent profile in Family mode (defaultAppContext='family' → V1 guardian
  // shape; see seedParentWithChildren rationale).
  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Rich-History Parent',
    birthYear: 1985,
    email,
    clerkUserId,
    defaultAppContext: 'family',
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: parentProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Rich-History Child',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  // 2 subjects, ≥3 topics — one Math (retention surface), one English (recap +
  // bookmarks + vocabulary).
  const math = await createSubjectWithCurriculum(
    db,
    childProfileId,
    'Mathematics',
    'active',
    3,
  );
  const english = await createSubjectWithCurriculum(
    db,
    childProfileId,
    'English',
    'active',
    3,
  );
  const mathTopicId = math.topicIds[0];
  const englishTopicId = english.topicIds[0];
  if (!mathTopicId || !englishTopicId) {
    throw new Error('rich-child-history: subject created no topics');
  }

  // Retention surface — one card on the math topic. The production schema
  // enforces one retention card per profile/topic.
  await insertRetentionCards(db, {
    profileId: childProfileId,
    topicId: mathTopicId,
  });

  // Recap surface — a completed session + summary on the english topic.
  const { sessionId: recapSessionId } = await insertSessionWithRecap(db, {
    profileId: childProfileId,
    subjectId: english.subjectId,
    topicId: englishTopicId,
    recapContent:
      'We read a short passage about migration patterns and discussed why birds fly south.',
    recapHighlight:
      'Connected vocabulary from the chapter to the broader theme without prompting.',
    engagementSignal: 'curious',
    endedDaysAgo: 1,
    exchangeCount: 8,
    wallClockSeconds: 900,
  });

  // Vocabulary surface — three terms on the english subject.
  const { vocabularyIds } = await insertVocabulary(db, {
    profileId: childProfileId,
    subjectId: english.subjectId,
  });
  const vocabularyId = vocabularyIds[0];

  // Bookmark surface — two bookmarks tied to the recap session.
  const { bookmarkIds } = await insertBookmarks(db, {
    profileId: childProfileId,
    sessionId: recapSessionId,
    subjectId: english.subjectId,
    topicId: englishTopicId,
    contents: [
      'Birds migrate to follow seasonal food and warmer weather.',
      'Some birds use the stars at night to navigate during migration.',
    ],
  });

  // Weekly report — exposes the parent-side weekly surface.
  const { reportId } = await insertWeeklyReport(db, {
    profileId: parentProfileId,
    childProfileId,
    childName: 'Rich-History Child',
  });

  const { reportId: monthlyReportId } = await insertMonthlyReport(db, {
    profileId: parentProfileId,
    childProfileId,
    childName: 'Rich-History Child',
    reportMonth: '2026-04-01',
    monthLabel: 'April 2026',
  });

  const milestoneId = generateUUIDv7();
  await db.insert(milestones).values({
    id: milestoneId,
    profileId: childProfileId,
    milestoneType: 'session_count',
    threshold: 5,
    subjectId: english.subjectId,
    bookId: english.bookId,
    metadata: {
      title: 'Five focused sessions',
      summary:
        'Built enough momentum to unlock the first parent milestone view.',
    },
    celebratedAt: pastDate(1),
  });

  const topicNoteId = generateUUIDv7();
  await db.insert(topicNotes).values({
    id: topicNoteId,
    profileId: childProfileId,
    topicId: englishTopicId,
    sessionId: recapSessionId,
    content:
      'Migration patterns depend on food supply, weather, and inherited routes.',
  });

  const quizRoundId = generateUUIDv7();
  await db.insert(quizRounds).values({
    id: quizRoundId,
    profileId: childProfileId,
    subjectId: english.subjectId,
    activityType: 'vocabulary',
    theme: 'Bird migration vocabulary',
    questions: [
      {
        type: 'vocabulary',
        prompt:
          'Which word best matches a bird moving to a warmer place for winter?',
        correctAnswer: 'migrate',
        distractors: ['hibernate', 'evaporate', 'orbit'],
      },
    ],
    results: [
      {
        questionIndex: 0,
        userAnswer: 'migrate',
        isCorrect: true,
      },
    ],
    score: 1,
    total: 1,
    xpEarned: 12,
    libraryQuestionIndices: [],
    status: 'completed',
    completedAt: pastDate(1),
  });

  const dictationResultId = generateUUIDv7();
  await db.insert(dictationResults).values({
    id: dictationResultId,
    profileId: childProfileId,
    completionKey: generateUUIDv7(),
    date: '2026-05-01',
    sentenceCount: 4,
    mistakeCount: 1,
    mode: 'homework',
    reviewed: true,
  });

  const homeworkSessionId = generateUUIDv7();
  await db.insert(learningSessions).values({
    id: homeworkSessionId,
    profileId: childProfileId,
    subjectId: math.subjectId,
    topicId: mathTopicId,
    sessionType: 'homework',
    status: 'completed',
    exchangeCount: 6,
    startedAt: pastDate(2),
    lastActivityAt: pastDate(2),
    endedAt: pastDate(2),
    wallClockSeconds: 840,
    metadata: {
      homeworkSummary: {
        problemCount: 3,
        practicedSkills: ['fractions', 'word problems'],
        independentProblemCount: 2,
        guidedProblemCount: 1,
        summary:
          'Worked through fraction comparison and one multi-step word problem with growing independence.',
        displayTitle: 'Fractions homework',
      },
    },
  });
  await db.insert(sessionEvents).values([
    {
      id: generateUUIDv7(),
      sessionId: homeworkSessionId,
      profileId: childProfileId,
      subjectId: math.subjectId,
      topicId: mathTopicId,
      eventType: 'homework_problem_started',
      content: 'Compare 3/4 and 5/8.',
      metadata: { problemIndex: 1 },
    },
    {
      id: generateUUIDv7(),
      sessionId: homeworkSessionId,
      profileId: childProfileId,
      subjectId: math.subjectId,
      topicId: mathTopicId,
      eventType: 'homework_problem_completed',
      content: 'The learner solved the fraction comparison correctly.',
      metadata: { problemIndex: 1, outcome: 'correct' },
    },
  ]);

  return {
    scenario: 'mentor-audit-rich-child-history',
    accountId,
    profileId: parentProfileId,
    email,
    password,
    ids: {
      parentProfileId,
      childProfileId,
      mathSubjectId: math.subjectId,
      englishSubjectId: english.subjectId,
      mathTopicId,
      englishTopicId,
      recapSessionId,
      reportId: monthlyReportId,
      weeklyReportId: reportId,
      quizRoundId,
      dictationResultId,
      homeworkSessionId,
      milestoneId,
      topicNoteId,
      vocabularyId: vocabularyId ?? '',
      bookmarkId: bookmarkIds[0] ?? '',
    },
  };
}

/** Session-revoked — sign in normally, then call Clerk Backend
 *  `POST /sessions/{id}/revoke` so the next API call from the page hits the
 *  revoked-token-refresh code path. Distinct from the cookie-corruption path
 *  exercised by the Playwright `session-expired` storage-state helper. */
async function seedMentorAuditSessionRevoked(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedOnboardingComplete(db, email, env);

  // Best-effort revoke. Without CLERK_SECRET_KEY we still produce a usable
  // SeedResult so unit-test runs (no Clerk env) succeed; the integration
  // suite + Playwright bring real Clerk credentials.
  let revokedSessionId = '';
  if (env.CLERK_SECRET_KEY) {
    // List active sessions for the seeded user, revoke the most recent.
    const clerkUserId = await findClerkUserIdForAccount(db, base.accountId);
    if (clerkUserId) {
      revokedSessionId = await revokeNewestClerkSession(clerkUserId, env);
    }
  }

  return {
    ...base,
    scenario: 'mentor-audit-session-revoked',
    ids: {
      ...base.ids,
      revokedSessionId,
    },
  };
}

/** MFA TOTP — attach a TOTP factor via Clerk Backend
 *  `POST /users/{id}/totp`. Returns the shared secret in `SeedResult.ids` so
 *  the Playwright helper can generate the rolling code via `otplib` at
 *  sign-in time. Backup-code + SMS factor paths are out of scope (plan §10).
 *
 *  [BUG-781] Clerk environments that have authenticator-app MFA disabled
 *  respond `405 Method Not Allowed` to the attach call. Treat that as a
 *  recoverable environment-config gap rather than a seed-time failure: log
 *  the degradation, return an empty totpSecret, and surface a structured
 *  `mfaDisabledReason` in SeedResult.ids so the smoke spec / harness can
 *  skip the MFA assertion with a clear cause. The rest of the audit run
 *  must not be blocked by a single environment config flip.
 *
 *  Operator action required to fully enable this scenario in staging:
 *  Clerk Dashboard → User & Authentication → Multi-factor →
 *  enable "Authenticator application". Until then, this seeder degrades
 *  gracefully and the smoke skips. */
async function seedMentorAuditMfaTotp(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedOnboardingComplete(db, email, env);

  let totpSecret = '';
  let mfaDisabledReason = '';
  if (env.CLERK_SECRET_KEY) {
    const clerkUserId = await findClerkUserIdForAccount(db, base.accountId);
    if (clerkUserId) {
      const attachResult = await attachClerkTotpFactor(clerkUserId, env);
      totpSecret = attachResult.secret;
      mfaDisabledReason = attachResult.disabledReason;
    }
  }

  return {
    ...base,
    scenario: 'mentor-audit-mfa-totp',
    ids: {
      ...base.ids,
      totpSecret,
      // Empty string when MFA attach succeeded (or was skipped because no
      // CLERK_SECRET_KEY). Non-empty when the Clerk environment rejected
      // the attach with a structured 405 / 422 — the spec can read this to
      // decide whether to skip or fail.
      mfaDisabledReason,
    },
  };
}

/** BILLING-08 — Family in normal mid-month use. Distinct from
 *  `mentor-audit-family-at-profile-limit` (which pins at the add-child cap) and
 *  from `mentor-audit-quota-family-monthly` (which exhausts the monthly pool).
 *  This seed is the "shared pool partially consumed" semantic seed that the
 *  audit row reads to verify the pool readout in steady state.
 *
 *  Pinned: 2 consented children (matches the most common Family shape — owner
 *  + 2 kids — without coupling to the add-child cap). usedThisMonth is set to
 *  ~50% of the Family monthly cap so the readout shows non-trivial usage on
 *  both sides of the divide. */
async function seedMentorAuditFamilyPoolMembers(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const familyTier = getTierConfig('family');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  const parentProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Pool-Sharing Parent',
    birthYear: 1985,
    isOwner: true,
    email,
    clerkUserId,
    defaultAppContext: 'family',
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: parentProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: parentProfileId,
    planTier: 'family',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
  });

  const usedThisMonth = Math.floor(familyTier.monthlyQuota / 2);
  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: familyTier.monthlyQuota,
    usedThisMonth,
    cycleResetAt: futureDate(30),
  });

  // Pinned at 2 consented children — see docstring.
  const childProfileIds: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const childProfileId = await createBaseProfile(db, accountId, {
      displayName: `Pool Child ${i + 1}`,
      birthYear: CHILD_BIRTH_YEAR,
      isOwner: false,
    });
    childProfileIds.push(childProfileId);

    await db.insert(guardianship).values({
      id: generateUUIDv7(),
      guardianPersonId: parentProfileId,
      chargePersonId: childProfileId,
    });

    await db.insert(consentGrant).values({
      id: generateUUIDv7(),
      chargePersonId: childProfileId,
      organizationId: accountId,
      purpose: 'platform_use',
      lawfulBasis: 'gdpr_parental_consent',
      granted: true,
    });
  }

  // Family status is reconstructed from current-cycle events, so the
  // maintained mid-month seed records its 50% usage in the event ledger too.
  await db.insert(usageEvents).values(
    Array.from({ length: usedThisMonth }, () => ({
      subscriptionId,
      profileId: parentProfileId,
      delta: 1,
    })),
  );

  return {
    scenario: 'mentor-audit-family-pool-members',
    accountId,
    profileId: parentProfileId,
    email,
    password,
    ids: {
      parentProfileId,
      subscriptionId,
      childProfileId1: childProfileIds[0] ?? '',
      childProfileId2: childProfileIds[1] ?? '',
      // String-encoded because SeedResult.ids is Record<string, string>; the
      // audit row reads it as a numeric percentage of the monthly cap.
      quotaUsedThisMonth: String(usedThisMonth),
      quotaMonthlyLimit: String(familyTier.monthlyQuota),
    },
  };
}

/** WI-2194 — stale Plus-era pool repaired into one current Family cycle.
 *  Kept separate from the maintained normal-mid-month audit seed so the
 *  generic BILLING-08 contract remains at 40–60% usage. */
async function seedWi2194StaleFamilyCycle(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const base = await seedMentorAuditFamilyPoolMembers(db, email, env);
  const {
    subscriptionId,
    parentProfileId,
    childProfileId1: childProfileId,
  } = base.ids;
  if (!subscriptionId || !parentProfileId || !childProfileId) {
    throw new Error('WI-2194 Family seed did not return its required IDs');
  }

  await db
    .update(quotaPools)
    .set({
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      usedThisMonth: 7,
    })
    .where(eq(quotaPools.subscriptionId, subscriptionId));
  await db
    .delete(usageEvents)
    .where(eq(usageEvents.subscriptionId, subscriptionId));
  await db.insert(usageEvents).values([
    ...Array.from({ length: 9 }, () => ({
      subscriptionId,
      profileId: parentProfileId,
      delta: 1,
    })),
    ...Array.from({ length: 5 }, () => ({
      subscriptionId,
      profileId: childProfileId,
      delta: 1,
    })),
  ]);

  return {
    ...base,
    scenario: 'wi-2194-stale-family-cycle',
    ids: {
      ...base.ids,
      quotaUsedThisMonth: '14',
      quotaMonthlyLimit: String(getTierConfig('family').monthlyQuota),
    },
  };
}

/** BILLING-07 + BRIDGE-03 — Free-tier owner whose daily cap is exhausted,
 *  with a linked consented child who still has real learning state. Proves
 *  child-review surfaces remain reachable while adult Study/billable actions
 *  hit the daily quota gate. Distinct from `mentor-audit-quota-owner-daily`
 *  (no child) because the audit needs to exercise the Family Mentor context
 *  against a real child while the adult is quota-blocked. */
async function seedMentorAuditFamilyOwnerDailyQuotaWithChild(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const freeTier = getTierConfig('free');
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  // Owner in Family mode (defaultAppContext='family' → V1 guardian shape; see
  // seedParentWithChildren rationale).
  const ownerProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Daily-Capped Family Owner',
    birthYear: 1985,
    email,
    clerkUserId,
    defaultAppContext: 'family',
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: ownerProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const subscriptionId = generateUUIDv7();
  await insertSubscriptionWithLegacy(db, {
    id: subscriptionId,
    organizationId: accountId,
    payerPersonId: ownerProfileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: futureDate(30),
  });

  // Daily quota maxed; monthly bucket deliberately well below cap so the
  // failure attributable to the daily gate, not the monthly one.
  // Fail-fast on the tier-config invariant — the whole point of this seed is
  // an exhausted daily cap, which only makes sense if the tier has one. A
  // silent `?? 10` fallback would mask future config drift and the structural
  // test (`usedToday === dailyLimit`) would surface as a confusing
  // `10 === 0` failure instead of an actionable error.
  if (freeTier.dailyLimit == null) {
    throw new Error(
      'family-owner-daily-quota-with-child: free tier has no dailyLimit — cannot seed an exhausted-daily scenario',
    );
  }
  // Derive monthly usage from the tier cap (~25%) rather than hardcoding —
  // a literal like `12` silently inverts the "monthly below cap" invariant
  // if the free tier cap is ever set below the literal. Guarded so the
  // intent is preserved if the cap changes.
  const monthlyUsedBelowCap = Math.floor(freeTier.monthlyQuota / 4);
  if (
    monthlyUsedBelowCap <= 0 ||
    monthlyUsedBelowCap >= freeTier.monthlyQuota
  ) {
    throw new Error(
      `family-owner-daily-quota-with-child: derived monthly usage (${monthlyUsedBelowCap}) does not satisfy 0 < used < ${freeTier.monthlyQuota}`,
    );
  }
  await db.insert(quotaPools).values({
    id: generateUUIDv7(),
    subscriptionId,
    monthlyLimit: freeTier.monthlyQuota,
    usedThisMonth: monthlyUsedBelowCap,
    dailyLimit: freeTier.dailyLimit,
    usedToday: freeTier.dailyLimit,
    cycleResetAt: futureDate(30),
  });

  // Linked consented child with real learning state — subject + topic +
  // completed session + summary (recap). Mirrors seedParentMultiChild for
  // child1 but trimmed to a single child to keep the scenario semantic.
  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Linked Learner',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: ownerProfileId,
    chargePersonId: childProfileId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const { subjectId: childSubjectId, topicIds: childTopicIds } =
    await createSubjectWithCurriculum(
      db,
      childProfileId,
      'Mathematics',
      'active',
      3,
    );
  const childTopicId = childTopicIds[0];
  if (!childTopicId) {
    throw new Error(
      'family-owner-daily-quota-with-child: child subject missing topic',
    );
  }

  const { sessionId: childSessionId } = await insertSessionWithRecap(db, {
    profileId: childProfileId,
    subjectId: childSubjectId,
    topicId: childTopicId,
    recapContent:
      'We compared fractions and explained why bigger denominators do not always mean bigger values.',
    recapHighlight:
      'Used a number line to defend the answer without prompting.',
    engagementSignal: 'focused',
    endedDaysAgo: 1,
    exchangeCount: 8,
  });

  return {
    scenario: 'mentor-audit-family-owner-daily-quota-with-child',
    accountId,
    profileId: ownerProfileId,
    email,
    password,
    ids: {
      ownerProfileId,
      childProfileId,
      subscriptionId,
      childSubjectId,
      childTopicId,
      childSessionId,
    },
  };
}

/** BRIDGE-04 — Family owner + child holding a topic that is NOT yet in the
 *  adult owner's Library. The Playwright probe in `bridge-backstack.spec.ts`
 *  uses this seed to drive Add-to-my-learning across child topic / session /
 *  recap entry surfaces, then asserts router.back() lands on the original
 *  Family child/recap context (not the Tabs first-route, not the proxy/child
 *  active-profile state). The seed-side guarantee is the **precondition**:
 *  adult library deliberately holds a *different* subject name so the bridge
 *  flow is exercising the "topic not yet in adult library" branch.
 *
 *  The owner starts in Family mode (`defaultAppContext: 'family'`) so direct
 *  child deep-links derive their guard state from persisted profile data. The
 *  paired Chrome probe is about bridge/backstack behavior, not whether a mode
 *  switch can survive an immediate hard navigation.
 *
 *  Idempotency note: the account-level cleanup performed by `seedScenario`
 *  (clerk_seed_* prefix) wipes any prior adult-side copy before reseeding,
 *  so no in-seed cleanup is needed.
 *
 *  `childRecapId` is intentionally equal to `childSessionId` — the recaps
 *  API treats `recapId` as the learning_sessions id (see
 *  apps/api/src/services/recaps.ts:92, `getRecapForParent` → `getChildSessionDetail`). */
async function seedMentorAuditBridgeBackstack(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);

  const ownerProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Bridge Parent',
    birthYear: 1985,
    isOwner: true,
    email,
    clerkUserId,
    defaultAppContext: 'family',
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: ownerProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  // Adult library deliberately gets a *different* subject name from the
  // child's, so the bridge flow exercises the "not yet in adult library"
  // branch (descriptionDivergent=false, alreadyExisted=false, topicState=new).
  // If both used 'Mathematics' the bridge would surface a divergent/exists
  // toast and the back-stack assertion would test the wrong branch.
  await createSubjectWithCurriculum(db, ownerProfileId, 'Personal Reading');

  const childProfileId = await createBaseProfile(db, accountId, {
    displayName: 'Bridge Child',
    birthYear: CHILD_BIRTH_YEAR,
    isOwner: false,
  });

  await db.insert(guardianship).values({
    id: generateUUIDv7(),
    guardianPersonId: ownerProfileId,
    chargePersonId: childProfileId,
  });

  await db.insert(consentGrant).values({
    id: generateUUIDv7(),
    chargePersonId: childProfileId,
    organizationId: accountId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: true,
  });

  const childSubjectName = 'Mathematics';
  const { subjectId: childSubjectId, topicIds: childTopicIds } =
    await createSubjectWithCurriculum(
      db,
      childProfileId,
      childSubjectName,
      'active',
      3,
    );
  const childTopicId = childTopicIds[0];
  if (!childTopicId) {
    throw new Error('bridge-backstack: child subject missing topic');
  }

  const { sessionId: childSessionId } = await insertSessionWithRecap(db, {
    profileId: childProfileId,
    subjectId: childSubjectId,
    topicId: childTopicId,
    recapContent:
      'We worked through fraction comparison and connected the steps back to last week.',
    recapHighlight: 'Spotted the denominator pattern without prompting.',
    engagementSignal: 'curious',
    endedDaysAgo: 1,
    exchangeCount: 8,
  });

  return {
    scenario: 'mentor-audit-bridge-backstack',
    accountId,
    profileId: ownerProfileId,
    email,
    password,
    ids: {
      ownerProfileId,
      childProfileId,
      childSubjectId,
      childSubjectName,
      childTopicId,
      childSessionId,
      // recapId === sessionId per the recaps service contract (recaps.ts:92).
      childRecapId: childSessionId,
    },
  };
}

/** Lookup helper for the post-sign-in Clerk-Backend mentor-audit flows. */
async function findClerkUserIdForAccount(
  db: Database,
  accountId: string,
): Promise<string | null> {
  const rows = await db
    .select({ clerkUserId: login.clerkUserId })
    .from(login)
    .innerJoin(membership, eq(membership.personId, login.personId))
    .where(eq(membership.organizationId, accountId))
    .limit(1);
  return rows[0]?.clerkUserId ?? null;
}

/** Revokes the most recently-created Clerk session for the given user.
 *  Returns the revoked session id (empty string if the user has no sessions
 *  yet — Clerk creates sessions lazily after sign-in, not on user creation). */
async function revokeNewestClerkSession(
  clerkUserId: string,
  env: SeedEnv,
): Promise<string> {
  if (!env.CLERK_SECRET_KEY) return '';

  const listRes = await fetch(
    `${CLERK_API_BASE}/sessions?user_id=${encodeURIComponent(clerkUserId)}&status=active&limit=1&order_by=-created_at`,
    { headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` } },
  );
  if (!listRes.ok) {
    const body = await listRes.text();
    throw new Error(`Clerk session list failed (${listRes.status}): ${body}`);
  }

  const sessions = (await listRes.json()) as Array<{ id: string }>;
  const sessionId = sessions[0]?.id;
  if (!sessionId) return '';

  const revokeRes = await fetch(
    `${CLERK_API_BASE}/sessions/${encodeURIComponent(sessionId)}/revoke`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    },
  );
  if (!revokeRes.ok) {
    const body = await revokeRes.text();
    throw new Error(
      `Clerk session revoke failed (${revokeRes.status}): ${body}`,
    );
  }
  return sessionId;
}

/** Attaches a TOTP factor to the given Clerk user. Returns the shared secret
 *  the Playwright helper feeds to `otplib.authenticator.generate()` at
 *  sign-in, plus a `disabledReason` string the seeder uses to mark the
 *  result as "MFA unavailable in this environment" without throwing.
 *
 *  [BUG-781] Returns a structured result instead of throwing on every error.
 *  A 405 (Method Not Allowed) means the Clerk environment has authenticator-
 *  app MFA disabled at the dashboard level — that is an operator-config gap,
 *  not a code defect, and must not block the rest of the audit registry.
 *  A 422 with an `authenticator_app_disabled` error code is treated the same
 *  way; Clerk has used both shapes historically. Other error statuses (4xx
 *  auth errors, 5xx, network) still throw so unexpected breakage is loud. */
export async function attachClerkTotpFactor(
  clerkUserId: string,
  env: SeedEnv,
): Promise<{ secret: string; disabledReason: string }> {
  if (!env.CLERK_SECRET_KEY) return { secret: '', disabledReason: '' };

  const res = await fetch(
    `${CLERK_API_BASE}/users/${encodeURIComponent(clerkUserId)}/totp`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    },
  );
  if (res.ok) {
    const payload = (await res.json()) as { secret?: string };
    return { secret: payload.secret ?? '', disabledReason: '' };
  }

  // Read body once — Response body streams are single-use (AGENTS.md rule).
  const body = await res.text();

  // 405 = Clerk environment has authenticator-app MFA disabled. The attach
  // endpoint is registered but not allowed. Surface as a graceful skip so
  // the rest of the audit run still completes.
  if (res.status === 405) {
    return {
      secret: '',
      disabledReason:
        'clerk_authenticator_app_disabled (status=405) — enable Authenticator application in Clerk Dashboard → User & Authentication → Multi-factor',
    };
  }

  // 422 with an authenticator-app-specific error code is the modern Clerk
  // shape for the same dashboard-config gap.
  if (res.status === 422) {
    let isAuthenticatorAppDisabled = false;
    try {
      const parsed = JSON.parse(body) as {
        errors?: Array<{ code?: string }>;
      };
      isAuthenticatorAppDisabled =
        parsed.errors?.some(
          (e) =>
            e.code === 'authenticator_app_disabled' ||
            e.code === 'mfa_authenticator_app_disabled',
        ) ?? false;
    } catch {
      // Fall through to throw below — a 422 without a parseable body shape
      // is a different bug worth surfacing loudly.
    }
    if (isAuthenticatorAppDisabled) {
      return {
        secret: '',
        disabledReason:
          'clerk_authenticator_app_disabled (status=422) — enable Authenticator application in Clerk Dashboard → User & Authentication → Multi-factor',
      };
    }
  }

  throw new Error(`Clerk TOTP attach failed (${res.status}): ${body}`);
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
  'child-quota-exceeded': seedChildQuotaExceeded,
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
  'parent-with-children-no-sessions': seedParentWithChildrenNoSessions,
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
  'quiz-completed-history-detail': seedQuizCompletedHistoryDetail,
  'review-empty': seedReviewEmpty,
  'dictation-with-mistakes': seedDictationWithMistakes,
  'dictation-perfect-score': seedDictationPerfectScore,
  // E2E chat/book entry-path coverage seeds.
  'topic-not-started': seedTopicNotStarted,
  'topic-overdue-review': seedTopicOverdueReview,
  'book-no-curriculum': seedBookNoCurriculum,
  'subject-with-book-suggestions': seedSubjectWithBookSuggestions,
  // Mentor Chrome audit seed pack — aliases of existing scenarios where the
  // audit state matches a current seeder, and dedicated seeders where it doesn't.
  'mentor-audit-empty-adult': aliasSeeder(
    'mentor-audit-empty-adult',
    seedPreProfile,
  ),
  'mentor-audit-consent-pending-child': aliasSeeder(
    'mentor-audit-consent-pending-child',
    seedConsentPending,
  ),
  'mentor-audit-consent-withdrawn-child': aliasSeeder(
    'mentor-audit-consent-withdrawn-child',
    seedConsentWithdrawn,
  ),
  'mentor-audit-post-approval-steady-state': aliasSeeder(
    'mentor-audit-post-approval-steady-state',
    seedParentMultiChild,
  ),
  'mentor-audit-deletion-scheduled-owner': aliasSeeder(
    'mentor-audit-deletion-scheduled-owner',
    seedAccountDeletionScheduled,
  ),
  'mentor-audit-family-at-profile-limit': seedMentorAuditFamilyAtProfileLimit,
  'mentor-audit-post-approval-redirect': seedMentorAuditPostApprovalRedirect,
  'mentor-audit-consent-us-under-threshold': makeConsentThresholdSeeder(
    'mentor-audit-consent-us-under-threshold',
    { location: 'US', ageYears: 13 },
  ),
  'mentor-audit-consent-eu-under-threshold': makeConsentThresholdSeeder(
    'mentor-audit-consent-eu-under-threshold',
    { location: 'EU', ageYears: 14 },
  ),
  'mentor-audit-consent-over-threshold': makeConsentThresholdSeeder(
    'mentor-audit-consent-over-threshold',
    { location: 'EU', ageYears: 17 },
  ),
  'mentor-audit-quota-owner-daily': seedMentorAuditQuotaOwnerDaily,
  'mentor-audit-quota-family-monthly': seedMentorAuditQuotaFamilyMonthly,
  'mentor-audit-paywall-child-notify': aliasSeeder(
    'mentor-audit-paywall-child-notify',
    seedTrialExpiredChild,
  ),
  'mentor-audit-resumable-session': seedMentorAuditResumableSession,
  // Second wave. mentor-audit-family-no-children aliases parent-solo until
  // Task 1b's manual Chrome triage confirms whether the audit's child-style
  // landing-copy symptom is a nav-contract bug (alias stays) or a missing
  // seed row (extend seedParentSolo). Either resolution preserves this
  // registry name as the public contract.
  'mentor-audit-family-no-children': aliasSeeder(
    'mentor-audit-family-no-children',
    seedParentSolo,
  ),
  'mentor-audit-rich-child-history': seedMentorAuditRichChildHistory,
  'mentor-audit-session-revoked': seedMentorAuditSessionRevoked,
  'mentor-audit-mfa-totp': seedMentorAuditMfaTotp,
  // Third wave — BILLING-07/08 + BRIDGE-03/04 (docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md §§11b, 11c, 14).
  'mentor-audit-family-pool-members': seedMentorAuditFamilyPoolMembers,
  'mentor-audit-family-owner-daily-quota-with-child':
    seedMentorAuditFamilyOwnerDailyQuotaWithChild,
  'mentor-audit-bridge-backstack': seedMentorAuditBridgeBackstack,
  'wi-2194-stale-family-cycle': seedWi2194StaleFamilyCycle,
  // [WI-2241] test-seed-v2-supporter.ts — composes test-seed-v2 owner
  // identities with the accepted-visibility fixture logic (linking-ceremony)
  // and the rich learning/report insert helpers above.
  'v2-supporter-accepted': seedV2SupporterAccepted,
  'v2-supporter-managed': seedV2SupporterManaged,
  'v2-account-non-owner-child': seedV2AccountNonOwnerChild,
  'v2-supporter-self-learning': seedV2SupporterSelfLearning,
  'v2-supporter-self-learning-active': seedV2SupporterSelfLearningActive,
  'v2-supporter-pending-link': seedV2SupporterPendingLink,
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

  const seedMarkedClerkUser =
    env.CLERK_SECRET_KEY != null
      ? await findClerkUserByEmail(email, env)
      : null;
  const seedClerkUserIds =
    seedMarkedClerkUser?.external_id?.startsWith(SEED_CLERK_PREFIX) === true
      ? [seedMarkedClerkUser.id]
      : [];

  // Idempotent: delete existing seed organizations with the same email before
  // seeding. Defence-in-depth: look up login by email first, then delete the
  // organization only if the login has a recognizable local seed marker
  // (clerk_seed_* prefix) or a real Clerk user ID that Clerk itself marks
  // with our seed external_id.
  // Child tables cascade via ON DELETE CASCADE.
  const existingLogins = await db
    .select({ personId: login.personId, clerkUserId: login.clerkUserId })
    .from(login)
    .where(eq(login.email, email));
  for (const existing of existingLogins) {
    if (isSeedManagedClerkUserId(existing.clerkUserId, seedClerkUserIds)) {
      const existingMemberships = await db
        .select({ organizationId: membership.organizationId })
        .from(membership)
        .where(eq(membership.personId, existing.personId));
      const orgIdsToDelete = existingMemberships.map((m) => m.organizationId);
      await deleteOrganizationGraph(db, orgIdsToDelete);
    }
  }

  return seeder(db, email, env);
}

// ---------------------------------------------------------------------------
// Internal helper: delete an organization and all RESTRICT-gated dependents.
//
// FK edges that block a bare DELETE FROM organization / consent_grant:
//   - subscription    (organizationId RESTRICT)
//   - consent_grant   (organizationId RESTRICT)
//   - guardianship    (guardianPersonId RESTRICT, chargePersonId RESTRICT)
//   - subscription    (payerPersonId RESTRICT)
//   - consent_request (consent_grant_id → consent_grant.id, NO ACTION — an
//     approved/withdrawn request back-linking a grant blocks that grant's
//     delete; its own organization_id/charge_person_id CASCADEs only fire on
//     person/org delete, which is AFTER the consent_grant delete — too late).
//
// Safe cascade tables (no action needed before org delete):
//   - membership     (CASCADE from both personId and organizationId)
//   - login          (CASCADE from personId)
//   - subjects + all learning data (CASCADE from profileId → person.id post-M-REPOINT)
//
// Deletion order:
//   1. Collect all personIds in the orgs (via membership — includes managed children)
//   2. Delete consent_request rows (clears the consent_grant_id back-link FK before
//      the consent_grant delete below — see WI-880)
//   3. Delete consent_grant rows (clears both chargePersonId and organizationId RESTRICT)
//   4. Delete subscription rows (clears organizationId and payerPersonId RESTRICT)
//   5. Delete guardianship rows for those persons (clears RESTRICT on person)
//   6. Delete person rows (cascades login, membership, any remaining consent_request, subjects, sessions…)
//   7. Delete organization rows (membership already gone; safe)
// ---------------------------------------------------------------------------
export async function deleteOrganizationGraph(
  db: Database,
  orgIds: string[],
): Promise<number> {
  if (orgIds.length === 0) return 0;

  // 0. Legacy cleanup (committed-migration DBs only). On CI the learning-data
  // children (subjects, sessions, quota_pools, …) FK the LEGACY parents
  // (profiles/subscriptions), not the v2 ones — so the v2 person/org deletes
  // below do NOT cascade them. accounts.id = orgId (deterministic reseed), and
  // every legacy child cascades from accounts (accounts→profiles→learning data,
  // accounts→subscriptions→quota), so one delete reclaims the whole legacy
  // subtree. Self-inerting post-DROP (table gone → skip).
  if (await tableExists(db, 'accounts')) {
    // [WI-1139] Legacy `accounts` Drizzle def removed — raw SQL delete keyed
    // on the same orgIds, same self-inerting gate.
    await db.execute(sql`
      DELETE FROM accounts WHERE id IN (${sql.join(
        orgIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    `);
  }

  // 1. Collect all person IDs (owners + managed children) across these orgs.
  const members = await db
    .select({ personId: membership.personId })
    .from(membership)
    .where(inArray(membership.organizationId, orgIds));
  const personIds = [...new Set(members.map((m) => m.personId))];

  // 1a. A person can be a member of multiple orgs. Deleting the person row
  // cascades their login, learning data, and ALL their memberships — including
  // ones outside the target orgs. So only delete persons whose ENTIRE
  // membership set is within orgIds (seed-owned / orphan-in-target). A person
  // who also belongs to a non-target org is left intact; their membership in a
  // target org still cascades when the organization row is deleted (step 5).
  let deletablePersonIds = personIds;
  if (personIds.length > 0) {
    const allMemberships = await db
      .select({
        personId: membership.personId,
        organizationId: membership.organizationId,
      })
      .from(membership)
      .where(inArray(membership.personId, personIds));
    const orgIdSet = new Set(orgIds);
    const sharedPersonIds = new Set(
      allMemberships
        .filter((m) => !orgIdSet.has(m.organizationId))
        .map((m) => m.personId),
    );
    deletablePersonIds = personIds.filter((id) => !sharedPersonIds.has(id));
  }

  // 2. Delete consent_request rows FIRST (WI-880). consent_request.consent_grant_id
  // → consent_grant.id is a NO ACTION (RESTRICT) FK with no ON DELETE, so an
  // approved/withdrawn request back-linking a grant blocks the consent_grant
  // delete below. The request's own organization_id/charge_person_id CASCADEs
  // only fire on person/org delete (steps 6-7), too late. Clearing requests here
  // (org-scoped, mirroring the consent_grant delete) breaks the FK dependency
  // for approved, withdrawn, and failed/partial J-13/J-21 teardown variants.
  await db
    .delete(consentRequest)
    .where(inArray(consentRequest.organizationId, orgIds));

  // 3. Delete consent_grant rows (RESTRICT on organizationId).
  await db
    .delete(consentGrant)
    .where(inArray(consentGrant.organizationId, orgIds));

  // 4. Delete subscription rows (RESTRICT on organizationId and payerPersonId).
  await db
    .delete(subscription)
    .where(inArray(subscription.organizationId, orgIds));

  // 5. Delete guardianship rows (RESTRICT on both person FK columns). Scoped to
  // deletable persons so a shared person's guardianship edges are left intact.
  if (deletablePersonIds.length > 0) {
    await db
      .delete(guardianship)
      .where(
        or(
          inArray(guardianship.guardianPersonId, deletablePersonIds),
          inArray(guardianship.chargePersonId, deletablePersonIds),
        ),
      );
  }

  // 5b. [WI-2241] Delete supportership rows (RESTRICT on both person FK
  // columns, mirroring guardianship above). support_visibility_contracts /
  // support_visibility_audit_events / support_visibility_notices all CASCADE
  // from supportership.id, so deleting the edge here reclaims the whole
  // visibility-contract subtree — no separate delete needed for those tables.
  // Required for any reseed of a v2-supporter-accepted-style identity: without
  // this, the person delete below hits the RESTRICT FK and the whole
  // idempotent-reseed cleanup throws.
  if (deletablePersonIds.length > 0) {
    await db
      .delete(supportership)
      .where(
        or(
          inArray(supportership.supporterPersonId, deletablePersonIds),
          inArray(supportership.supporteePersonId, deletablePersonIds),
        ),
      );
  }

  // 6. Delete person rows (cascades login, membership, any remaining consent_request, subjects, sessions…).
  if (deletablePersonIds.length > 0) {
    await db.delete(person).where(inArray(person.id, deletablePersonIds));
  }

  // 7. Delete organization rows (cascades any remaining membership — including a
  // shared person's membership in this org — via membership.organizationId).
  const deleted = await db
    .delete(organization)
    .where(inArray(organization.id, orgIds))
    .returning({ id: organization.id });

  return deleted.length;
}

export async function resetDatabase(
  db: Database,
  env: SeedEnv = {},
  options: ResetOptions = {},
): Promise<ResetResult> {
  const prefix = options.prefix?.trim();

  const verifiedSeedClerkUserIds = options.verifiedSeedClerkUserIds
    ? await verifySeedClerkUserIds(env, options.verifiedSeedClerkUserIds, {
        prefix,
      })
    : undefined;

  if (
    options.verifiedSeedClerkUserIds &&
    verifiedSeedClerkUserIds?.length === 0
  ) {
    return { deletedCount: 0, clerkUsersDeleted: 0 };
  }

  // If caller supplied server-verifiable Clerk IDs, skip Clerk deletion
  // because the cleanup script handles Clerk locally after DB rows are removed.
  const { count: clerkUsersDeleted, clerkUserIds } =
    options.clerkUserIds || verifiedSeedClerkUserIds
      ? {
          count: 0,
          clerkUserIds:
            verifiedSeedClerkUserIds ??
            (options.clerkUserIds ?? []).filter((id) =>
              id.startsWith(SEED_CLERK_PREFIX),
            ),
        }
      : options.preserveClerkUsers
        ? {
            count: 0,
            clerkUserIds: (await listSeedClerkUsers(env, { prefix })).map(
              (user) => user.id,
            ),
          }
        : await deleteClerkTestUsers(env, { prefix });

  if (
    options.clerkUserIds &&
    !options.verifiedSeedClerkUserIds &&
    clerkUserIds.length === 0
  ) {
    return { deletedCount: 0, clerkUsersDeleted };
  }

  if (prefix) {
    const seedLogins = await db
      .select({ personId: login.personId, clerkUserId: login.clerkUserId })
      .from(login)
      .where(like(login.email, `${prefix}%`));
    const filteredLogins = seedLogins.filter((l) =>
      isSeedManagedClerkUserId(l.clerkUserId, clerkUserIds),
    );
    const seedPersonIds = filteredLogins.map((l) => l.personId);

    if (seedPersonIds.length === 0) {
      return { deletedCount: 0, clerkUsersDeleted };
    }

    const seedMemberships = await db
      .select({ organizationId: membership.organizationId })
      .from(membership)
      .where(inArray(membership.personId, seedPersonIds));
    const seedOrgIds = [
      ...new Set(seedMemberships.map((m) => m.organizationId)),
    ];

    if (seedOrgIds.length === 0) {
      return { deletedCount: 0, clerkUsersDeleted };
    }

    const deletedCount = await deleteOrganizationGraph(db, seedOrgIds);

    return { deletedCount, clerkUsersDeleted };
  }

  // Build WHERE clause: match fake clerk_seed_* IDs OR real Clerk user IDs
  // that were created by the seed service.
  const loginConditions = [like(login.clerkUserId, `${SEED_CLERK_PREFIX}%`)];
  if (clerkUserIds.length > 0) {
    loginConditions.push(inArray(login.clerkUserId, clerkUserIds));
  }

  const seedLogins = await db
    .select({ personId: login.personId })
    .from(login)
    .where(or(...loginConditions));
  const seedPersonIds = seedLogins.map((l) => l.personId);

  if (seedPersonIds.length === 0) {
    return { deletedCount: 0, clerkUsersDeleted };
  }

  const seedMemberships = await db
    .select({ organizationId: membership.organizationId })
    .from(membership)
    .where(inArray(membership.personId, seedPersonIds));
  const seedOrgIds = [...new Set(seedMemberships.map((m) => m.organizationId))];

  if (seedOrgIds.length === 0) {
    return { deletedCount: 0, clerkUsersDeleted };
  }

  // deleteOrganizationGraph handles RESTRICT-gated dependents before org delete.
  const deletedCount = await deleteOrganizationGraph(db, seedOrgIds);

  return { deletedCount, clerkUsersDeleted };
}

// ---------------------------------------------------------------------------
// Debug query functions (extracted from route handlers per AGENTS.md rules)
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
  const loginRows = await db
    .select({
      personId: login.personId,
      clerkUserId: login.clerkUserId,
      email: login.email,
    })
    .from(login)
    .where(eq(login.email, email));

  return Promise.all(
    loginRows.map(async (l) => {
      const membershipRows = await db
        .select({
          organizationId: membership.organizationId,
        })
        .from(membership)
        .where(eq(membership.personId, l.personId));

      const orgId = membershipRows[0]?.organizationId ?? '';

      const personRows = await db
        .select({
          id: person.id,
          displayName: person.displayName,
          birthDate: person.birthDate,
          roles: membership.roles,
        })
        .from(person)
        .innerJoin(membership, eq(membership.personId, person.id))
        .where(eq(membership.organizationId, orgId));

      const profilesWithSubjects = await Promise.all(
        personRows.map(async (prof) => {
          const subjectRows = await db.query.subjects.findMany({
            where: eq(subjects.profileId, prof.id),
          });
          // isOwner is per-profile: derived from THIS person's own membership
          // roles in the org, not the signed-in login's. Otherwise a parent's
          // admin role would mark their children as owners too.
          const isOwner =
            Array.isArray(prof.roles) && prof.roles.includes('admin');
          const birthYear = prof.birthDate
            ? parseInt(prof.birthDate.slice(0, 4), 10)
            : null;
          return {
            id: prof.id,
            displayName: prof.displayName,
            birthYear,
            isOwner,
            subjects: subjectRows.map((s) => ({
              id: s.id,
              name: s.name,
              status: s.status,
            })),
          };
        }),
      );
      return {
        id: orgId,
        clerkUserId: l.clerkUserId,
        email: l.email,
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
 * Walks: clerkUserId → login → membership → person (admin) → subjects.
 * Returns null if no login or membership found.
 */
export async function debugSubjectsByClerkUserId(
  db: Database,
  clerkUserId: string,
): Promise<
  | { result: DebugSubjectsResult }
  | { error: string; detail: Record<string, string> }
> {
  // Find login by clerkUserId — includes both seed and real Clerk users.
  // Safe because this endpoint is ENVIRONMENT-guarded.
  const loginRows = await db
    .select({ personId: login.personId, email: login.email })
    .from(login)
    .where(eq(login.clerkUserId, clerkUserId))
    .limit(1);
  const loginRow = loginRows[0];

  if (!loginRow) {
    return {
      error: 'No login found for clerkUserId',
      detail: { clerkUserId },
    };
  }

  const membershipRows = await db
    .select({
      organizationId: membership.organizationId,
      roles: membership.roles,
    })
    .from(membership)
    .where(eq(membership.personId, loginRow.personId));

  const adminMembership =
    membershipRows.find(
      (m) => Array.isArray(m.roles) && m.roles.includes('admin'),
    ) ?? membershipRows[0];

  if (!adminMembership) {
    return {
      error: 'No membership found',
      detail: { personId: loginRow.personId },
    };
  }

  const orgId = adminMembership.organizationId;

  const personRows = await db
    .select({ id: person.id, displayName: person.displayName })
    .from(person)
    .where(eq(person.id, loginRow.personId))
    .limit(1);
  const ownerPerson = personRows[0];

  if (!ownerPerson) {
    return {
      error: 'No person found',
      detail: { personId: loginRow.personId },
    };
  }

  const subjectList = await listSubjects(db, ownerPerson.id);

  return {
    result: {
      account: {
        id: orgId,
        clerkUserId,
        email: loginRow.email,
      },
      profile: {
        id: ownerPerson.id,
        displayName: ownerPerson.displayName,
        isOwner: true,
      },
      subjects: subjectList,
      subjectCount: subjectList.length,
    },
  };
}
