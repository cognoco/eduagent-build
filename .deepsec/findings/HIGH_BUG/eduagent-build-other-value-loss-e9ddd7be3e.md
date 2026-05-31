# [HIGH_BUG] Top-up credits permanently stranded after upgrading from a shared-pool tier to a per-profile tier

**File:** [`apps/api/src/services/billing/top-up.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/billing/top-up.ts#L128-L182) (lines 128, 155, 182)
**Project:** eduagent-build
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-value-loss`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

purchaseTopUpCredits() stamps the credit row's profileId based on the subscription's CURRENT quotaModel at purchase time (L128): shared-pool tiers (free/plus) store profileId=null (L155, L182), per-profile tiers (family/pro) store profileId=owner.id. The credit's profileId is never migrated when the tier later changes (handleTierChange / reconcileQuotaStateForEffectiveTier / RevenueCat PRODUCT_CHANGE all touch quota pools/profileQuotaUsage but not topUpCredits). On the consumption side, the per-profile owner path consumeOwnerTopUpCredit() in services/billing/metering.ts filters `eq(topUpCredits.profileId, owner.id)` (L617, L638), and the owner-facing balance read getTopUpCreditsRemaining(...activeProfileId) filters the same way (L70-71). Therefore credits purchased while on 'plus' (profileId=null) become INVISIBLE and UNUSABLE after an upgrade to 'family'/'pro' — the per-profile consumption query and the owner balance query both exclude null-profileId rows. The user paid for these credits (Stripe PaymentIntent or RevenueCat consumable IAP) and silently loses them until the 12-month expiry. The reverse direction (family→plus) works because decrementPoolQuota's FIFO top-up consumption (services/billing/metering.ts L382-389) does NOT filter by profileId, so owner-scoped credits remain spendable — confirming the asymmetry is a bug, not intended product behavior. No log/metric fires, so the loss is invisible to both the user and ops.

## Recommendation

Either (a) when a subscription transitions to a per-profile tier, UPDATE topUpCredits SET profileId = <owner.id> WHERE subscriptionId = ? AND profileId IS NULL (do this inside the same reconcile transaction), or (b) treat null-profileId credits as account/owner-level in the per-profile read+consume paths: in consumeOwnerTopUpCredit() and the owner branch of getTopUpCreditsRemaining(), match `(topUpCredits.profileId = owner.id OR topUpCredits.profileId IS NULL)`. Add a regression test that buys a top-up on 'plus', upgrades to 'family', and asserts the owner can still see and spend the credit.

## Revalidation

**Verdict:** true-positive

The underlying value-loss defect is real and present: purchaseTopUpCredits() stamps profileId from the subscription's current quotaModel (L128-155/182), shared-pool tiers store profileId=null, and NO tier-change path migrates it — I traced handleTierChange (tier.ts L87-102), reconcileQuotaStateForEffectiveTier (quota-reconcile.ts), and activateSubscriptionFromRevenuecat; none touch topUpCredits. The asymmetry the finding identifies is confirmed in current code: consumeOwnerTopUpCredit() filters eq(topUpCredits.profileId, owner.id) (L617/638) and the owner read getTopUpCreditsRemaining filters the same (L70-71), while shared-pool decrementPoolQuota's FIFO loop does NOT filter profileId (L382-393). HOWEVER, the tier rework (c1787a714) inverted the quota models: free/plus are now per-profile and family/pro are now shared-pool — the exact opposite of what the finding's body and its proposed regression test assume. So the specific repro ('buy on plus, upgrade to family, lose credits') no longer reproduces — that is now the SAFE direction (plus stores profileId=owner.id, family's shared pool spends it without a profileId filter). The identical stranding instead occurs on the family/pro → plus DOWNGRADE: a family/pro owner buys a top-up (stored profileId=null because shared-pool), downgrades to plus (per-profile), and consumeOwnerTopUpCredit + the owner balance read both exclude the null-profileId row — the paid credit is silently invisible/unspendable until 12-month expiry, with no log/metric. The finding's title ('upgrading from a shared-pool tier to a per-profile tier') is abstractly correct and the recommended fix (migrate null-profileId credits to owner when entering a per-profile tier) is still valid; only the tier examples are stale. Real, reachable, silent loss of paid credits — HIGH_BUG stands, but the repro must be corrected to family/pro→plus.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
