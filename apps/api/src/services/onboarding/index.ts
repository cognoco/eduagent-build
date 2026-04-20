// ---------------------------------------------------------------------------
// Onboarding Service — BKT-C.1 / BKT-C.2
// Pure business logic for the three personalization-dimension PATCH routes
// surfaced during onboarding. No Hono imports — handlers live under
// routes/onboarding.ts.
//
// Scoping discipline per CLAUDE.md:
//  - profile-level writes (conversation_language, pronouns) filter on
//    profiles.id = profileId AND profiles.accountId = accountId. The accountId
//    guard protects against a rooted mobile client sending another account's
//    profileId after bypassing the profile-scope middleware.
//  - learning_profiles writes happen through learningProfiles.profileId; we
//    ensure a row exists via getOrCreateLearningProfile so the UPDATE isn't
//    a no-op for profiles that never completed onboarding.
// ---------------------------------------------------------------------------

import { eq, and, sql } from 'drizzle-orm';
import { profiles, learningProfiles, type Database } from '@eduagent/database';
import type {
  ConversationLanguage,
  InterestEntry,
  Pronouns,
} from '@eduagent/schemas';
import { getOrCreateLearningProfile } from '../learner-profile';

export class OnboardingNotFoundError extends Error {
  constructor(profileId: string) {
    super(`profile not found: ${profileId}`);
    this.name = 'OnboardingNotFoundError';
  }
}

/**
 * Update a profile's tutor-language preference.
 *
 * The value is already validated against `conversationLanguageSchema` at the
 * route boundary; the DB CHECK constraint provides a second line of defense.
 *
 * The write also includes accountId in the WHERE clause so a forged
 * profileId from a rooted client (which bypassed the profile-scope guard)
 * cannot cross-account update.
 */
export async function updateConversationLanguage(
  db: Database,
  profileId: string,
  accountId: string,
  conversationLanguage: ConversationLanguage
): Promise<void> {
  const result = await db
    .update(profiles)
    .set({
      conversationLanguage,
      updatedAt: new Date(),
    })
    .where(and(eq(profiles.id, profileId), eq(profiles.accountId, accountId)))
    .returning({ id: profiles.id });

  if (result.length === 0) {
    throw new OnboardingNotFoundError(profileId);
  }
}

/**
 * Update a profile's pronouns. Pass `null` to clear the field. The 32-char
 * max is already enforced at the Zod boundary.
 */
export async function updatePronouns(
  db: Database,
  profileId: string,
  accountId: string,
  pronouns: Pronouns | null
): Promise<void> {
  const result = await db
    .update(profiles)
    .set({
      pronouns,
      updatedAt: new Date(),
    })
    .where(and(eq(profiles.id, profileId), eq(profiles.accountId, accountId)))
    .returning({ id: profiles.id });

  if (result.length === 0) {
    throw new OnboardingNotFoundError(profileId);
  }
}

/**
 * Wholesale-replace a learner's interests array with context-tagged entries.
 *
 * Called by the onboarding per-interest context picker after the interview
 * chat extracts labels. `interests` is validated against
 * `z.array(interestEntrySchema)` at the route boundary, so each entry has a
 * non-empty label (<=60 chars) and a `free_time | school | both` context.
 *
 * Creates the learning_profiles row if missing — first-time onboarders don't
 * have one until their first session analysis runs, but we need to persist
 * interests immediately when the user submits the picker.
 */
export async function updateInterestsContext(
  db: Database,
  profileId: string,
  accountId: string,
  interests: InterestEntry[]
): Promise<void> {
  // Guard: verify the profile belongs to the calling account — mirrors the
  // accountId check in updateConversationLanguage / updatePronouns. The
  // learning_profiles table doesn't carry accountId directly, so we verify
  // via the profiles table first.
  const [owner] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.accountId, accountId)));

  if (!owner) {
    throw new OnboardingNotFoundError(profileId);
  }

  // Ensure the learning_profiles row exists — see the accommodation-mode
  // precedent at learner-profile.ts:updateAccommodationMode. Idempotent.
  await getOrCreateLearningProfile(db, profileId);

  await db
    .update(learningProfiles)
    .set({
      interests,
      // Bump optimistic-concurrency version so other writers retry (mirrors
      // the pattern used by applyAnalysis/mergeInterests).
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(learningProfiles.profileId, profileId));
}
