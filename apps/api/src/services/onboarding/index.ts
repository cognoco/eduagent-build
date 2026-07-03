// ---------------------------------------------------------------------------
// Onboarding Service — BKT-C.1 / BKT-C.2
// Pure business logic for the three personalization-dimension PATCH routes
// surfaced during onboarding. No Hono imports — handlers live under
// routes/onboarding.ts.
//
// Scoping discipline per AGENTS.md:
//  - profile-level writes (conversation_language, pronouns) filter on
//    profiles.id = profileId AND profiles.accountId = accountId. The accountId
//    guard protects against a rooted mobile client sending another account's
//    profileId after bypassing the profile-scope middleware.
//  - learning_profiles writes happen through learningProfiles.profileId; we
//    ensure a row exists via getOrCreateLearningProfile so the UPDATE isn't
//    a no-op for profiles that never completed onboarding.
// ---------------------------------------------------------------------------

import { eq, and, sql } from 'drizzle-orm';
import {
  learningProfiles,
  membership,
  type Database,
} from '@eduagent/database';
import type { InterestEntry } from '@eduagent/schemas';
import {
  ForbiddenError,
  ConflictError,
  PRONOUNS_PROMPT_MIN_AGE,
} from '@eduagent/schemas';
import { calculateAge } from '../consent';
import { getOrCreateLearningProfile } from '../learner-profile';
import { sanitizeXmlValue } from '../llm/sanitize';

/**
 * [WI-227 / DS-138] Stored-injection defense — sanitize interest labels at
 * storage time so a hostile label persisted by one client cannot smuggle
 * prompt directives into a later LLM call through a consumer that forgot
 * to re-sanitize. Render-time consumers (`safeInterestLabels` in the quiz
 * providers) DO sanitize, but the structural guarantee should not depend
 * on every consumer remembering. Matches the 60-char cap enforced by
 * `interestEntrySchema` at the route boundary.
 *
 * If sanitization yields an empty string (input was pure attack characters
 * with no surviving letters), return empty so `updateInterestsContext` can
 * filter the entry out of the persisted list. Returning empty rather than a
 * defensive fallback to the unsanitized original is intentional — we never
 * want to persist hostile content under the guise of "preserving the user's
 * selection."
 */
export function sanitizeInterestLabel(label: string): string {
  // Trim AFTER sanitizeXmlValue so an all-attack input like `<>"<>"` —
  // which sanitizeXmlValue collapses to a single space — does not survive
  // as a blank-but-non-empty token and bypass the empty-filter below.
  return sanitizeXmlValue(label, 60).trim();
}

export class OnboardingNotFoundError extends Error {
  constructor(profileId: string) {
    super(`profile not found: ${profileId}`);
    this.name = 'OnboardingNotFoundError';
  }
}

/**
 * Authorization guard (WI-278): a learner may only SELF-set pronouns at or
 * above `PRONOUNS_PROMPT_MIN_AGE`. The mobile client hides the pronouns screen
 * for younger profiles; this enforces the same boundary server-side so a
 * modified client cannot bypass it. Year-only age is used deliberately to match
 * the client gate (`use-consent`/pronouns screen). A parent setting pronouns
 * for a child uses the separate parent-managed route, which is intentionally
 * exempt. Throws `ForbiddenError` (→ 403) when the profile is under the minimum
 * age.
 *
 * [F-145] Fail CLOSED on missing/unknown `birthYear`. `birthYear` is NOT NULL in
 * the DB, so a null/undefined/0 value is anomalous input — but age cannot be
 * verified, and a possibly-sub-13 learner must never be permitted to self-set
 * pronouns. (Previously this returned without throwing, failing open.)
 */
export function assertPronounsSelfEditAllowed(
  birthYear: number | null | undefined,
): void {
  if (!birthYear || calculateAge(birthYear) < PRONOUNS_PROMPT_MIN_AGE) {
    throw new ForbiddenError(
      'Pronouns cannot be self-set for profiles under the minimum age.',
    );
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
  interests: InterestEntry[],
): Promise<void> {
  // Guard: verify the profile belongs to the calling account — mirrors the
  // accountId check in updateConversationLanguage / updatePronouns. The
  // learning_profiles table doesn't carry accountId directly, so we verify
  // via the profiles table first.
  // [WI-586 C5] v2 seam: membership check replaces profiles ownership guard
  // (accountId = organizationId in v2; account.id ↔ organization.id parity).
  const [member] = await db
    .select({ personId: membership.personId })
    .from(membership)
    .where(
      and(
        eq(membership.personId, profileId),
        eq(membership.organizationId, accountId),
      ),
    );
  if (!member) {
    throw new OnboardingNotFoundError(profileId);
  }

  // Ensure the learning_profiles row exists — see the accommodation-mode
  // precedent at learner-profile.ts:updateAccommodationMode. Idempotent.
  // Returns the row including its current optimistic-concurrency version, which
  // seeds the compare-and-set below.
  let profile = await getOrCreateLearningProfile(db, profileId);

  // [WI-227 / DS-138] Sanitize at storage so a hostile label cannot smuggle
  // a `\nSystem:` directive through a consumer that skips re-sanitization.
  // Drop entries whose label sanitizes to empty — those are all-attack
  // labels that the Zod-boundary non-empty rule does not catch (e.g. `<>`
  // is non-empty as raw, empty after sanitize).
  const safeInterests: InterestEntry[] = interests
    .map((entry) => ({
      ...entry,
      label: sanitizeInterestLabel(entry.label),
    }))
    .filter((entry) => entry.label.length > 0);

  // Compare-and-set on the optimistic-concurrency version. The version bump
  // alone (without checking it) was decorative: two concurrent picker submits
  // would both pass and last-writer-wins would silently drop one. Gating the
  // UPDATE on the version we read turns each write into a provable land
  // (rowCount === 1) or a detected conflict that we retry, so a concurrent
  // write can never silently vanish. The interests payload is
  // caller-authoritative (a wholesale replace), so a retry simply re-reads the
  // current version and re-applies the same submitted set.
  //
  // [WI-737 / S5+C3] The accountId ownership check (above) sits outside this
  // loop and is not atomic with the UPDATE. Mirror the defense-in-depth pattern
  // from updateConversationLanguage/updatePronouns: scope the UPDATE WHERE to
  // the owning account via an EXISTS subquery on profiles so the authz guard
  // and the write are atomic even if profiles were transferable in the future.
  // The retry re-read is similarly scoped so the CAS loop never operates on a
  // row whose ownership cannot be confirmed.
  const MAX_CAS_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const expectedVersion = profile.version;
    const updated = await db
      .update(learningProfiles)
      .set({
        interests: safeInterests,
        version: sql`${learningProfiles.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(learningProfiles.profileId, profileId),
          eq(learningProfiles.version, expectedVersion),
          // [WI-586 C5] v2 seam: membership existence guard replaces profiles
          // EXISTS subquery. Ownership atomicity is preserved — the CAS UPDATE
          // only lands when the membership row still exists at write time.
          sql`EXISTS (SELECT 1 FROM ${membership} WHERE ${membership.personId} = ${profileId} AND ${membership.organizationId} = ${accountId})`,
        ),
      )
      .returning({ id: learningProfiles.id });

    if (updated.length > 0) {
      return;
    }

    // A concurrent writer advanced the version between our read and this write.
    // Re-read and retry. The row exists (we created it above), so a missing
    // re-read is an anomaly worth surfacing rather than silently succeeding.
    // [WI-737 / C3] Scope the re-read through profiles (legacy) or membership
    // (v2) to keep accountId / organizationId enforcement across the retry loop.
    // [WI-586 C5] v2 seam: JOIN membership instead of profiles for re-read.
    const learningProfilesCols = {
      id: learningProfiles.id,
      profileId: learningProfiles.profileId,
      learningStyle: learningProfiles.learningStyle,
      interests: learningProfiles.interests,
      strengths: learningProfiles.strengths,
      struggles: learningProfiles.struggles,
      communicationNotes: learningProfiles.communicationNotes,
      suppressedInferences: learningProfiles.suppressedInferences,
      interestTimestamps: learningProfiles.interestTimestamps,
      effectivenessSessionCount: learningProfiles.effectivenessSessionCount,
      memoryEnabled: learningProfiles.memoryEnabled,
      memoryConsentStatus: learningProfiles.memoryConsentStatus,
      consentPromptDismissedAt: learningProfiles.consentPromptDismissedAt,
      memoryCollectionEnabled: learningProfiles.memoryCollectionEnabled,
      memoryInjectionEnabled: learningProfiles.memoryInjectionEnabled,
      accommodationMode: learningProfiles.accommodationMode,
      celebrationLevel: learningProfiles.celebrationLevel,
      recentlyResolvedTopics: learningProfiles.recentlyResolvedTopics,
      memoryFactsBackfilledAt: learningProfiles.memoryFactsBackfilledAt,
      memoryFactsAnalysedAt: learningProfiles.memoryFactsAnalysedAt,
      version: learningProfiles.version,
      createdAt: learningProfiles.createdAt,
      updatedAt: learningProfiles.updatedAt,
    } as const;
    const [refreshed] = await db
      .select(learningProfilesCols)
      .from(learningProfiles)
      .innerJoin(
        membership,
        eq(membership.personId, learningProfiles.profileId),
      )
      .where(
        and(
          eq(learningProfiles.profileId, profileId),
          eq(membership.organizationId, accountId),
        ),
      );
    if (!refreshed) {
      throw new OnboardingNotFoundError(profileId);
    }
    profile = refreshed;
  }

  // Bounded retries exhausted under sustained concurrent contention. Escalate
  // explicitly (→ 409) rather than recover silently — the silent-recovery ban
  // applies to writes that must provably land.
  throw new ConflictError(
    `updateInterestsContext: optimistic-concurrency retries exhausted for profile ${profileId}`,
  );
}
