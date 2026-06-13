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

import { and, eq } from 'drizzle-orm';
import { membership, person, type Database } from '@eduagent/database';
import type { ConversationLanguage, Pronouns } from '@eduagent/schemas';

/**
 * True when `profileId` belongs to organization `organizationId` (the v2
 * cross-account guard — a forged profileId from a rooted client that bypassed
 * profile-scope must not cross-org write).
 */
async function personInOrg(
  db: Database,
  profileId: string,
  organizationId: string,
): Promise<boolean> {
  const row = await db
    .select({ id: membership.id })
    .from(membership)
    .where(
      and(
        eq(membership.personId, profileId),
        eq(membership.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row.length > 0;
}

/**
 * v2 `updateConversationLanguage` — writes person.conversation_language.
 * Returns false when the person is not in the org (caller maps to NotFound).
 */
export async function updateConversationLanguageV2(
  db: Database,
  profileId: string,
  organizationId: string,
  conversationLanguage: ConversationLanguage,
): Promise<boolean> {
  if (!(await personInOrg(db, profileId, organizationId))) return false;
  const result = await db
    .update(person)
    .set({ conversationLanguage, updatedAt: new Date() })
    .where(eq(person.id, profileId))
    .returning({ id: person.id });
  return result.length > 0;
}

/**
 * v2 `updatePronouns` — writes person.pronouns (null clears). Returns false
 * when the person is not in the org (caller maps to NotFound).
 */
export async function updatePronounsV2(
  db: Database,
  profileId: string,
  organizationId: string,
  pronouns: Pronouns | null,
): Promise<boolean> {
  if (!(await personInOrg(db, profileId, organizationId))) return false;
  const result = await db
    .update(person)
    .set({ pronouns, updatedAt: new Date() })
    .where(eq(person.id, profileId))
    .returning({ id: person.id });
  return result.length > 0;
}
