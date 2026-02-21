// ---------------------------------------------------------------------------
// Profile Service — CRUD operations with ownership checks
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import { profiles, type Database } from '@eduagent/database';
import type {
  ProfileCreateInput,
  ProfileUpdateInput,
  Profile,
} from '@eduagent/schemas';
import { getConsentStatus } from './consent';

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
    birthDate: row.birthDate ? row.birthDate.toISOString().split('T')[0] : null,
    personaType: row.personaType,
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

/**
 * Creates a new profile under the given account.
 *
 * The first profile created for an account is automatically marked as the
 * owner profile (isOwner = true). Subsequent profiles are non-owner.
 */
export async function createProfile(
  db: Database,
  accountId: string,
  input: ProfileCreateInput,
  isOwner?: boolean
): Promise<Profile> {
  const [row] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      personaType: input.personaType ?? 'LEARNER',
      isOwner: isOwner ?? false,
    })
    .returning();
  return mapProfileRow(row);
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
      birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
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
