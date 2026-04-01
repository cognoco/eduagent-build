// ---------------------------------------------------------------------------
// Profile Service — CRUD operations with ownership checks
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, asc } from 'drizzle-orm';
import { profiles, type Database } from '@eduagent/database';
import type {
  ProfileCreateInput,
  ProfileUpdateInput,
  Profile,
} from '@eduagent/schemas';
import {
  birthDateFromBirthYear,
  birthYearFromDateLike,
  computeAgeBracket,
} from '@eduagent/schemas';
import {
  getConsentStatus,
  checkConsentRequired,
  createPendingConsentState,
} from './consent';

// ---------------------------------------------------------------------------
// Mapper — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapProfileRow(
  row: typeof profiles.$inferSelect,
  consentStatus: Profile['consentStatus'] = null
): Profile {
  return {
    id: row.id,
    accountId: row.accountId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? null,
    birthDate: row.birthDate
      ? row.birthDate.toISOString().split('T')[0]!
      : null,
    birthYear: birthYearFromDateLike(row.birthDate),
    personaType: row.personaType,
    location: row.location ?? null,
    isOwner: row.isOwner,
    consentStatus,
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
  accountId: string
): Promise<Profile[]> {
  const rows = await db.query.profiles.findMany({
    where: eq(profiles.accountId, accountId),
  });
  const mapped = await Promise.all(
    rows.map(async (row) => {
      const status = await getConsentStatus(db, row.id);
      return mapProfileRow(row, status);
    })
  );
  return mapped;
}

function inferLegacyPersonaType(
  birthYear: number
): 'TEEN' | 'LEARNER' | 'PARENT' {
  const ageBracket = computeAgeBracket(birthYear);
  if (ageBracket === 'child') return 'TEEN';
  if (ageBracket === 'adolescent') return 'LEARNER';
  return 'PARENT';
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
  accountId: string
): Promise<Profile | null> {
  // Targeted query: owner profile directly
  const ownerRow = await db.query.profiles.findFirst({
    where: and(eq(profiles.accountId, accountId), eq(profiles.isOwner, true)),
  });

  if (ownerRow) {
    const consentStatus = await getConsentStatus(db, ownerRow.id);
    return mapProfileRow(ownerRow, consentStatus);
  }

  // Fallback: no owner flag set — pick first profile (defensive edge case).
  // Should not happen in normal operation — log for observability.
  console.warn(
    `[findOwnerProfile] No owner profile for account ${accountId}, falling back to oldest profile`
  );
  const fallbackRow = await db.query.profiles.findFirst({
    where: eq(profiles.accountId, accountId),
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
 * If consent is required, a PENDING consent state row is created automatically.
 */
export async function createProfile(
  db: Database,
  accountId: string,
  input: ProfileCreateInput,
  isOwner?: boolean
): Promise<Profile> {
  const birthYear = input.birthYear ?? birthYearFromDateLike(input.birthDate);
  if (birthYear == null) {
    throw new Error('Profile birthYear or birthDate is required');
  }

  // Pre-compute consent check (single call — used for both age gate and consent state)
  const consentCheck = checkConsentRequired(birthYear);

  // Enforce minimum age (PRD line 386: ages 6-10 out of scope)
  if (consentCheck?.belowMinimumAge) {
    throw new Error('Users must be at least 11 years old to create a profile');
  }

  // Prevent minors from selecting PARENT persona (access control gate)
  if (consentCheck && consentCheck.age < 18 && input.personaType === 'PARENT') {
    throw new Error('Parent profile requires age 18 or older');
  }

  const legacyPersonaType =
    input.personaType ?? inferLegacyPersonaType(birthYear);

  const [row] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      birthDate: input.birthDate
        ? new Date(input.birthDate)
        : birthDateFromBirthYear(birthYear),
      personaType: legacyPersonaType,
      location: input.location ?? null,
      isOwner: isOwner ?? false,
    })
    .returning();

  // Server-side consent determination: if consent is required, create PENDING state
  let consentStatus: Profile['consentStatus'] = null;
  if (consentCheck?.required && consentCheck.consentType) {
    const state = await createPendingConsentState(
      db,
      row!.id,
      consentCheck.consentType
    );
    consentStatus = state.status;
  }

  return mapProfileRow(row!, consentStatus);
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
  accountId: string
): Promise<Profile | null> {
  const row = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, profileId), eq(profiles.accountId, accountId)),
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
  input: ProfileUpdateInput
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
  accountId: string
): Promise<{ profileId: string } | null> {
  const row = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, profileId), eq(profiles.accountId, accountId)),
  });
  return row ? { profileId: row.id } : null;
}
