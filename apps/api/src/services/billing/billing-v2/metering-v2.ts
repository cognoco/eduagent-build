// ---------------------------------------------------------------------------
// WI-776 (WP-7) — billing-v2 metering ownership cross-check
//
// v2 twin of the metering hot-path quota-enforcement guard
// (metering.ts::verifyProfileInSubscriptionAccount). The legacy guard joins
// `profiles × subscriptions ON subscriptions.account_id = profiles.account_id`
// and answers "does this profile belong to the account that owns this
// subscription?" — the ownership gate every decrement/increment runs before
// drawing quota. The v2 form re-keys that join onto
// `person × membership × subscription` via `organization_id` (the canonical
// pattern already used by resolveProfileQuotaRoleV2 /
// reconcileQuotaStateForEffectiveTierV2): a person is "under" a subscription iff
// they hold a membership in the subscription's organization.
//
// SECURITY (enumeration §4.6 — HIGH, quota enforcement). This is an IDOR /
// cross-org guard: a stale or hostile profileId for a subscription whose org the
// person is NOT a member of MUST resolve to false, so the metering layer refuses
// to draw that subscription's quota for an unrelated person. The membership-scoped
// join IS that guard — a person in org B has no membership row with
// organization_id = (org of the subscription in org A), so the cross-org case
// returns no row → false. This is the parent-chain pattern (direct db.select()
// enforcing the owning ancestor — membership.organizationId — in WHERE), the
// sanctioned alternative to the scoped repo for a read that joins through a
// parent (AGENTS.md "Non-Negotiable Engineering Rules").
//
// Flag-gated: reachable only when IDENTITY_V2_ENABLED='true'. The legacy
// verifyProfileInSubscriptionAccount stays byte-identical.
// ---------------------------------------------------------------------------

import { and, eq, isNull } from 'drizzle-orm';
import {
  membership,
  person,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';

/**
 * v2: is `profileId` (= person.id) a member of the organization that owns
 * `subscriptionId`? Returns true iff a non-archived person with that id holds a
 * membership in the subscription's organization. The membership-scoped join is
 * the cross-org IDOR guard (§4.6) — a person outside the subscription's org can
 * never resolve true, so the metering layer cannot draw that subscription's
 * quota for an unrelated person.
 */
export async function isPersonUnderSubscriptionV2(
  db: Database,
  subscriptionId: string,
  profileId: string,
): Promise<boolean> {
  const row = await db
    .select({ personId: person.id })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .innerJoin(
      subscriptionTable,
      eq(subscriptionTable.organizationId, membership.organizationId),
    )
    .where(
      and(
        eq(subscriptionTable.id, subscriptionId),
        eq(person.id, profileId),
        isNull(person.archivedAt),
      ),
    )
    .limit(1);

  return row.length > 0;
}
