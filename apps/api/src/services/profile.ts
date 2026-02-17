// ---------------------------------------------------------------------------
// Profile Service — CRUD operations with ownership checks
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import type {
  ProfileCreateInput,
  ProfileUpdateInput,
  Profile,
} from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Lists all profiles belonging to an account.
 *
 * TODO: db.query.profiles.findMany({ where: eq(profiles.accountId, accountId) })
 */
export async function listProfiles(
  db: Database,
  accountId: string
): Promise<Profile[]> {
  void db;
  void accountId;
  return [];
}

/**
 * Creates a new profile under the given account.
 *
 * The first profile created for an account is automatically marked as the
 * owner profile (isOwner = true). Subsequent profiles are non-owner.
 *
 * TODO: db.insert(profiles).values({ accountId, ...input, isOwner }).returning()
 */
export async function createProfile(
  db: Database,
  accountId: string,
  input: ProfileCreateInput,
  isOwner?: boolean
): Promise<Profile> {
  void db;
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    accountId,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl ?? null,
    birthDate: input.birthDate ?? null,
    personaType: input.personaType ?? 'LEARNER',
    isOwner: isOwner ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Fetches a single profile by ID with ownership verification.
 *
 * Returns null if the profile doesn't exist or doesn't belong to the
 * caller's account — callers should treat null as 404.
 *
 * TODO: db.query.profiles.findFirst({ where: and(eq(id, profileId), eq(accountId, accountId)) })
 */
export async function getProfile(
  db: Database,
  profileId: string,
  accountId: string
): Promise<Profile | null> {
  void db;
  void profileId;
  void accountId;
  return null;
}

/**
 * Updates a profile after verifying ownership.
 *
 * Returns null if the profile doesn't exist or isn't owned by the account.
 *
 * TODO: Verify ownership, then db.update(profiles).set({ ...input, updatedAt }).where(...)
 */
export async function updateProfile(
  db: Database,
  profileId: string,
  accountId: string,
  input: ProfileUpdateInput
): Promise<Profile | null> {
  void db;
  void profileId;
  void accountId;
  void input;
  return null;
}

/**
 * Verifies a profile belongs to the account for profile switching.
 *
 * Returns null if the profile isn't owned — caller returns 403.
 *
 * TODO: Verify profile belongs to account
 */
export async function switchProfile(
  db: Database,
  profileId: string,
  accountId: string
): Promise<{ profileId: string } | null> {
  void db;
  void profileId;
  void accountId;
  return null;
}
