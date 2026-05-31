# [MEDIUM] Owner's top-up credit balance leaked to a child profile in quota-exceeded responses

**File:** [`apps/api/src/services/billing/top-up.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/billing/top-up.ts#L65-L71) (lines 65, 70, 71)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-cross-profile-disclosure`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

getTopUpCreditsRemaining() sums ALL unexpired credits for a subscription when the optional profileId argument is omitted (L65-71: the profileId filter is only added when profileId is truthy). In the metering middleware (apps/api/src/middleware/metering.ts L694-701 and L803-810) the profileId argument is only passed when `quotaModel === 'per-profile' && profileRole === 'owner'`; for a child profile it is passed as `undefined`, so the call returns the SUBSCRIPTION-WIDE credit total — which for a per-profile tier is the owner's purchased credits (stored with profileId=owner.id). That figure is then returned to the child in the 402 quota-exceeded body as `details.topUpCreditsRemaining` (middleware metering.ts L736 and L779) and folded into the child's quotaFractionRemaining denominator (L819-822). This is cross-profile billing-data exposure within a family account — a child learns how many top-up credits the parent has bought. It is NOT a quota bypass: the authoritative decrementProfileQuota path only lets role==='owner' draw on top-ups (services/billing/metering.ts L797-809), so the child is still correctly blocked; the impact is limited to disclosure of an integer count and a slightly skewed remaining-fraction. The codebase elsewhere explicitly guards the same boundary (billing.ts /usage masks sibling usedToday from non-owners), so this is an inconsistency with the project's own cross-profile privacy stance.

## Recommendation

For per-profile tiers, only surface top-up balances to the owner. In the metering middleware, when profileRole !== 'owner' set topUpCreditsRemaining to 0 (mirroring the billing.ts /usage route, which already hardcodes 0 for non-owner per-profile viewers) rather than calling getTopUpCreditsRemaining with an undefined profileId. Alternatively, make getTopUpCreditsRemaining require an explicit scope argument for per-profile subscriptions so the unscoped sum cannot be reached by accident.

## Revalidation

**Verdict:** true-positive

The disclosure mechanism is intact in current code: getTopUpCreditsRemaining sums ALL subscription credits when profileId is omitted (L65-71), and middleware/metering.ts passes profileId only when quotaModel==='per-profile' && profileRole==='owner' (L698-700, L807-809), so a child gets the subscription-wide sum, which is then echoed in the 402 body as details.topUpCreditsRemaining on both the fast-path (L736) and post-decrement (L779) rejections. I verified profileRole is reliably resolved for per-profile tiers because the KV cache is bypassed for them (L611-617) forcing the DB branch that sets profileRole (L662). The tier rework inverted the models, so the leak now lands on the PLUS tier (per-profile, maxProfiles=2 so it supports one child, topUpAmount=500 so the owner can buy top-ups stored with profileId=owner.id) rather than family/pro (now shared-pool, where the shared sum is by-design, not a leak). I confirmed the no-bypass claim: a child's decrement cannot draw on top-ups because attemptProfileDecrementInTx gates the top-up path on snapshot.role==='owner' (L797-809), so the child is still correctly blocked with source:'none' — the only impact is disclosing an integer count of the parent's purchased credits. This is a genuine within-family cross-profile disclosure and inconsistent with the project's own stance (family.ts getUsageBreakdownForProfile and the billing /usage route deliberately mask sibling data from non-owners; the /subscription/family route even gates with assertOwnerProfile). Reachable (a kid easily exhausts childDailyQuota=10 or childMonthlyQuota=100) but low impact (count only) — MEDIUM is appropriate.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
