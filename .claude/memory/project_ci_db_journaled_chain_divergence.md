---
name: project_ci_db_journaled_chain_divergence
description: "CI journaled-chain tests DB lacks prod's out-of-chain FK repoints; v2 seed baseline-anchor collides with self-sub-seeding integration suites"
metadata: 
  node_type: memory
  type: project
  created: 2026-06-29
  last_confirmed: 2026-06-29
  status: active
  originSessionId: de45ac6a-5e36-4738-83bb-87966c853b57
---

The CI ephemeral `tests` DB is built purely from the committed drizzle chain
(0000→latest). Prod/stg carry **out-of-chain** changes the repo migrations do NOT
have — notably `quota_pools.subscription_id` FK still → **legacy** `subscriptions`
in the repo (schema `billing.ts:100-103` + every migration), while prod was
repointed to v2. The compaction "0117 repoint / 0119 drop" are **prod labels**, not
repo migration numbers (repo 0117/0119 = family-prefs / email-suppressions).

`createSubscriptionV2` (`subscription-core-v2.ts:222`) self-dual-writes a legacy
`subscriptions` twin (same id) so the quota_pools FK resolves on the journaled
chain. WI-1145's baseline anchor (`ensureV2IdentityForLegacyProfileTest`, default on)
occupies `subscriptions.account_id_unique` → the twin write `onConflictDoNothing`-
skips → quota_pools FK fails. Fix: suites that create their own sub pass
`seedBaselineSubscription: false` (alias-merge-v2, inngest-quota-reset, billing-
lifecycle). NOT a migration/repoint problem — verify the premise before authoring
schema migrations. Related: [[feedback_flag_collapse_breaks_legacy_pinned_unit_mocks]].
