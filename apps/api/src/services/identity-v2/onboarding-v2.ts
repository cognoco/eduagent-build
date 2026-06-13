// ---------------------------------------------------------------------------
// CUT-B1 onboarding write twins (cutover-plan §2.2 / P1). The v2 equivalents of
// the onboarding service's `updateConversationLanguage` / `updatePronouns`
// writes — they target the re-homed columns on `person` (§1.3) instead of
// legacy `profiles`. Cross-account protection is enforced via membership in the
// organization (the v2 analogue of the legacy profiles.accountId guard), since
// account.id = organization.id.
//
// `updateInterestsContext` is NOT re-homed: interests live on
// `learning_profiles` (a satellite keyed by profileId = person.id), which is
// unchanged by the cutover — only the ownership *verification* (profiles vs
// membership) differs, and that is handled in the legacy service by a
// profileId-keyed lookup that already works against person.id. So the v2 twin
// covers only the two writes that touch re-homed `profiles` columns.
// ---------------------------------------------------------------------------

import { and, eq, sql } from 'drizzle-orm';
import { membership, person, type Database } from '@eduagent/database';
import type { ConversationLanguage, Pronouns } from '@eduagent/schemas';

/**
 * The v2 cross-org authorization predicate, expressed as a correlated EXISTS so
 * it can be folded INTO the UPDATE's WHERE clause (atomic — no TOCTOU window
 * between a separate check and the write). A forged profileId from a rooted
 * client that bypassed profile-scope still cannot cross-org write, because the
 * row only updates when the person has a membership in `organizationId`.
 */
function personInOrgExists(profileId: string, organizationId: string) {
  return sql`EXISTS (
    SELECT 1 FROM ${membership}
    WHERE ${membership.personId} = ${profileId}
      AND ${membership.organizationId} = ${organizationId}
  )`;
}

/**
 * v2 `updateConversationLanguage` — writes person.conversation_language only
 * when the person is a member of `organizationId` (authorization folded into
 * the WHERE clause — atomic). Returns false when no row matched (not a member /
 * unknown person — caller maps to NotFound).
 */
export async function updateConversationLanguageV2(
  db: Database,
  profileId: string,
  organizationId: string,
  conversationLanguage: ConversationLanguage,
): Promise<boolean> {
  const result = await db
    .update(person)
    .set({ conversationLanguage, updatedAt: new Date() })
    .where(
      and(
        eq(person.id, profileId),
        personInOrgExists(profileId, organizationId),
      ),
    )
    .returning({ id: person.id });
  return result.length > 0;
}

/**
 * v2 `updatePronouns` — writes person.pronouns (null clears) only when the
 * person is a member of `organizationId` (authorization folded into the WHERE
 * clause — atomic). Returns false when no row matched (caller maps to NotFound).
 */
export async function updatePronounsV2(
  db: Database,
  profileId: string,
  organizationId: string,
  pronouns: Pronouns | null,
): Promise<boolean> {
  const result = await db
    .update(person)
    .set({ pronouns, updatedAt: new Date() })
    .where(
      and(
        eq(person.id, profileId),
        personInOrgExists(profileId, organizationId),
      ),
    )
    .returning({ id: person.id });
  return result.length > 0;
}
