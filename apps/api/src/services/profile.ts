// ---------------------------------------------------------------------------
// Profile Service — CRUD operations with ownership checks
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, asc, sql, isNull } from 'drizzle-orm';
import { profiles, familyLinks, type Database } from '@eduagent/database';
import { createLogger } from './logger';

const logger = createLogger();
import type {
  AgeBracket,
  ProfileCreateInput,
  ProfileUpdateInput,
  Profile,
} from '@eduagent/schemas';
import { computeAgeBracket } from '@eduagent/schemas';
export type ProfileValidationCode = 'CHILD_AGE_VIOLATION';

export class ProfileValidationError extends Error {
  code: ProfileValidationCode;
  field: string;

  constructor(code: ProfileValidationCode, field: string, message: string) {
    super(message);
    this.name = 'ProfileValidationError';
    this.code = code;
    this.field = field;
  }
}
import {
  getConsentStatus,
  checkConsentRequired,
  createPendingConsentState,
  createGrantedConsentState,
} from './consent';
import { getSubscriptionByAccountId, canAddProfile } from './billing';

export class ProfileLimitError extends Error {
  constructor() {
    super('Profile limit exceeded');
    this.name = 'ProfileLimitError';
  }
}

// ---------------------------------------------------------------------------
// Mapper — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapProfileRow(
  row: typeof profiles.$inferSelect,
  consentStatus: Profile['consentStatus'] = null,
  linkCreatedAt: Date | null = null,
): Profile {
  return {
    id: row.id,
    accountId: row.accountId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? null,
    birthYear: row.birthYear,
    location: row.location ?? null,
    isOwner: row.isOwner,
    hasPremiumLlm: row.hasPremiumLlm,
    // BKT-C.1 — narrow the DB row's text type to the Zod enum. The CHECK
    // constraint guarantees the value is always one of the 8 codes; the cast
    // is a type-narrowing no-op at runtime.
    conversationLanguage:
      row.conversationLanguage as Profile['conversationLanguage'],
    pronouns: row.pronouns ?? null,
    consentStatus,
    linkCreatedAt: linkCreatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Lists all profiles belonging to an account.
 */
export async function listProfiles(
  db: Database,
  accountId: string,
): Promise<Profile[]> {
  const rows = await db.query.profiles.findMany({
    where: and(eq(profiles.accountId, accountId), isNull(profiles.archivedAt)),
  });
  const ownerRow = rows.find((row) => row.isOwner);
  const links = ownerRow
    ? await db.query.familyLinks.findMany({
        where: eq(familyLinks.parentProfileId, ownerRow.id),
      })
    : [];
  const linkCreatedAtByChildId = new Map(
    links.map((link) => [link.childProfileId, link.createdAt]),
  );
  const mapped = await Promise.all(
    rows.map(async (row) => {
      const status = await getConsentStatus(db, row.id);
      return mapProfileRow(
        row,
        status,
        linkCreatedAtByChildId.get(row.id) ?? null,
      );
    }),
  );
  return mapped;
}

/**
 * Finds the owner profile for an account.
 * Used by profile-scope middleware to auto-resolve profileId when X-Profile-Id
 * header is absent, preventing the broken `account.id` fallback.
 *
 * Uses a targeted `WHERE is_owner = true LIMIT 1` query instead of loading all
 * profiles into memory. Falls back to the first profile only if no owner flag
 * is set (defensive — should not happen in normal operation).
 */
export async function findOwnerProfile(
  db: Database,
  accountId: string,
): Promise<Profile | null> {
  // Targeted query: owner profile directly
  const ownerRow = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.accountId, accountId),
      eq(profiles.isOwner, true),
      isNull(profiles.archivedAt),
    ),
  });

  if (ownerRow) {
    const consentStatus = await getConsentStatus(db, ownerRow.id);
    return mapProfileRow(ownerRow, consentStatus);
  }

  // Fallback: no owner flag set — pick first profile (defensive edge case).
  // Should not happen in normal operation — log for observability.
  logger.warn(
    '[findOwnerProfile] No owner profile for account, falling back to oldest profile',
    {
      accountId,
    },
  );
  const fallbackRow = await db.query.profiles.findFirst({
    where: and(eq(profiles.accountId, accountId), isNull(profiles.archivedAt)),
    orderBy: [asc(profiles.createdAt)],
  });
  if (!fallbackRow) return null;
  const consentStatus = await getConsentStatus(db, fallbackRow.id);
  return mapProfileRow(fallbackRow, consentStatus);
}

/**
 * Creates a new profile under the given account.
 *
 * The first profile created for an account is automatically marked as the
 * owner profile (isOwner = true). Subsequent profiles are non-owner.
 *
 * Consent is determined by age alone (GDPR-everywhere, Story 10.19).
 * If consent is required:
 * - When `parentProfileId` is provided (parent adding child directly),
 *   consent is recorded as GRANTED immediately — the parent IS the consenting
 *   adult, so no email loop is needed. A family_link row is also created.
 * - Otherwise (child self-registering), a PENDING consent state is created and
 *   the child must go through the email-based consent request flow.
 */
export async function createProfile(
  db: Database,
  accountId: string,
  input: ProfileCreateInput,
  isOwner?: boolean,
  parentProfileId?: string,
): Promise<Profile> {
  const birthYear = input.birthYear;

  // Pre-compute consent check (single call — used for both age gate and consent state)
  const consentCheck = checkConsentRequired(birthYear);

  // Enforce minimum age (PRD line 386: ages 6-10 out of scope)
  if (consentCheck?.belowMinimumAge) {
    throw new ProfileValidationError(
      'CHILD_AGE_VIOLATION',
      'birthYear',
      'Users must be at least 11 years old to create a profile',
    );
  }

  const [row] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      birthYear,
      location: input.location ?? null,
      isOwner: isOwner ?? false,
    })
    .returning();

  // Server-side consent determination: if consent is required, record it.
  // When a parent creates a child (parentProfileId set), consent is GRANTED
  // immediately — the parent IS the consenting adult (BUG-239 fix).
  // Otherwise (child self-registering), create PENDING state for the
  // email-based consent request flow.
  if (!row) throw new Error('Insert profile did not return a row');

  let consentStatus: Profile['consentStatus'] = null;
  if (consentCheck?.required && consentCheck.consentType) {
    if (parentProfileId) {
      const state = await createGrantedConsentState(
        db,
        row.id,
        consentCheck.consentType,
        parentProfileId,
      );
      consentStatus = state.status;
    } else {
      const state = await createPendingConsentState(
        db,
        row.id,
        consentCheck.consentType,
      );
      consentStatus = state.status;
    }
  }

  return mapProfileRow(row, consentStatus);
}

/**
 * Creates a profile with tier-based limit enforcement and advisory locking.
 * Wraps createProfile in a transaction with pg_advisory_xact_lock to
 * prevent TOCTOU races (two concurrent POSTs both reading below the limit).
 *
 * Throws ProfileLimitError when the account's subscription tier is at capacity.
 */
export async function createProfileWithLimitCheck(
  db: Database,
  accountId: string,
  input: ProfileCreateInput,
): Promise<Profile> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // Advisory lock per account — serializes concurrent profile creations
    // without blocking unrelated accounts. Released on commit/rollback.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${accountId}))`);

    // O(1) count instead of loading all profiles + N consent queries.
    // Only need the count and the owner ID — keeps the lock window minimal.
    const [countRow] = await txDb
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(profiles)
      .where(
        and(eq(profiles.accountId, accountId), isNull(profiles.archivedAt)),
      );
    const profileCount = countRow?.count ?? 0;
    const isFirstProfile = profileCount === 0;

    // Enforce per-tier profile limits. First profile creation is always allowed.
    if (!isFirstProfile) {
      const subscription = await getSubscriptionByAccountId(txDb, accountId);
      if (!subscription || !(await canAddProfile(txDb, subscription.id))) {
        throw new ProfileLimitError();
      }
    }

    // BUG-239: When a non-first profile is created, the account owner (parent)
    // is always the one creating it — the account has a single Clerk auth
    // session. Consent is granted immediately; the parent IS the consenting
    // adult, so no email loop is needed. A family_link row is also created.
    //
    // Consent flow (PENDING state) is ONLY for first-profile creation by a
    // self-registering underage user who has no parent on the account yet.
    let parentProfileId: string | undefined;
    if (!isFirstProfile) {
      const ownerProfile = await txDb.query.profiles.findFirst({
        where: and(
          eq(profiles.accountId, accountId),
          eq(profiles.isOwner, true),
          isNull(profiles.archivedAt),
        ),
        columns: { id: true },
      });
      if (ownerProfile) {
        parentProfileId = ownerProfile.id;
      }
    }

    return createProfile(
      txDb,
      accountId,
      input,
      isFirstProfile,
      parentProfileId,
    );
  });
}

/**
 * Fetches a single profile by ID with ownership verification.
 *
 * Returns null if the profile doesn't exist or doesn't belong to the
 * caller's account — callers should treat null as 404.
 */
export async function getProfile(
  db: Database,
  profileId: string,
  accountId: string,
): Promise<Profile | null> {
  const row = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.accountId, accountId),
      isNull(profiles.archivedAt),
    ),
  });
  if (!row) return null;
  const status = await getConsentStatus(db, row.id);
  return mapProfileRow(row, status);
}

/**
 * Updates a profile after verifying ownership.
 *
 * Returns null if the profile doesn't exist or isn't owned by the account.
 */
export async function updateProfile(
  db: Database,
  profileId: string,
  accountId: string,
  input: ProfileUpdateInput,
): Promise<Profile | null> {
  const rows = await db
    .update(profiles)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(profiles.id, profileId), eq(profiles.accountId, accountId)))
    .returning();
  if (!rows[0]) return null;
  const status = await getConsentStatus(db, rows[0].id);
  return mapProfileRow(rows[0], status);
}

/**
 * Verifies a profile belongs to the account for profile switching.
 *
 * Returns null if the profile isn't owned — caller returns 403.
 */
export async function switchProfile(
  db: Database,
  profileId: string,
  accountId: string,
): Promise<{ profileId: string } | null> {
  const row = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.accountId, accountId),
      isNull(profiles.archivedAt),
    ),
  });
  return row ? { profileId: row.id } : null;
}

/**
 * Returns the learner's age derived from birthYear. Falls back to 12 if
 * birthYear is not set. Minimum returned age is 5.
 */
export async function getProfileAge(
  db: Database,
  profileId: string,
): Promise<number> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
  });
  const currentYear = new Date().getUTCFullYear();
  return profile?.birthYear ? Math.max(5, currentYear - profile.birthYear) : 12;
}

/**
 * Loads the raw profile row by ID. Self-keyed lookup — caller is asking for the
 * exact row that defines the scope, not a child resource, so no parent-chain
 * check is needed. Centralised here so `db.select().from(profiles)` and
 * `db.query.profiles.findFirst({ where: eq(profiles.id, ...) })` aren't sprinkled
 * across services. If scoping ever needs to tighten, this is the single migration
 * point.
 */
export async function loadProfileRowById(
  db: Database,
  profileId: string,
): Promise<typeof profiles.$inferSelect | null> {
  const row = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
  });
  return row ?? null;
}

/**
 * Returns the learner's display name. Used to personalise LLM prompts.
 * Returns undefined if the profile doesn't exist.
 */
export async function getProfileDisplayName(
  db: Database,
  profileId: string,
): Promise<string | undefined> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { displayName: true },
  });
  return profile?.displayName;
}

/**
 * Resolves a profile's AgeBracket for passing to LLM safety-preamble calls.
 * Returns `'adult'` (the conservative minor-safe default) if birthYear is unset.
 */
export async function getProfileAgeBracket(
  db: Database,
  profileId: string,
): Promise<AgeBracket> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { birthYear: true },
  });
  return profile?.birthYear ? computeAgeBracket(profile.birthYear) : 'adult';
}

// ---------------------------------------------------------------------------
// Role resolution (used by recall notifications + daily plan)
// ---------------------------------------------------------------------------

export type ProfileRole = 'guardian' | 'self_learner';

/**
 * Determines whether a profile is a guardian or self-learner by checking
 * the family_links table. A profile with any child links is a guardian.
 */
export async function resolveProfileRole(
  db: Database,
  profileId: string,
): Promise<ProfileRole> {
  const childLink = await db.query.familyLinks.findFirst({
    where: eq(familyLinks.parentProfileId, profileId),
  });
  return childLink ? 'guardian' : 'self_learner';
}
