# [HIGH_BUG] Trial-expiry cron can downgrade a just-converted paying subscriber (missing status='trial' guard)

**File:** [`apps/api/src/services/billing/trial.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/billing/trial.ts#L229-L243) (lines 229, 236, 243)
**Project:** eduagent-build
**Severity:** HIGH_BUG  •  **Confidence:** medium  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

transitionToExtendedTrial() is invoked by the daily trial-expiry cron (apps/api/src/inngest/functions/trial-expiry.ts:162) for every row returned by findExpiredTrials() (WHERE status='trial' AND trialEndsAt <= now). The UPDATE unconditionally sets status='expired', tier='free' and rewrites the quota pool to the extended-trial limit, guarded ONLY by eq(subscriptions.id, subscriptionId). There is a read→write TOCTOU window: between the cron's SELECT and this UPDATE, the same subscription row can be converted to a paid plan by the RevenueCat RENEWAL/INITIAL_PURCHASE webhook (handleRenewal -> updateSubscriptionFromRevenuecatWebhook sets status='active', tier='plus', trialEndsAt=null on the SAME row). Crucially, both events are triggered by the same moment — trial end — so the collision is not theoretical: the webhook can land during the cron's loop. If the cron reads the row while it is still 'trial' and writes after the conversion commits, it clobbers the now-active paid subscription back to expired/free and caps the quota pool at 450/month, silently revoking paid access from a paying customer. Strong evidence this is an omission rather than intent: the sibling function transitionToExtendedTrialFromRevenuecatEvent (lines 277-280) performs the identical transition but DOES include eq(subscriptions.status, 'trial') in its WHERE clause. expireTrialSubscription (line 33) and expireTrialAndDowngradeQuota (line 342) share the same unguarded UPDATE pattern (currently no production callers, so latent).

## Recommendation

Add a status predicate to the subscriptions UPDATE: .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.status, 'trial'))) — mirroring transitionToExtendedTrialFromRevenuecatEvent (lines 277-280). Use .returning() and skip the quota-pool rewrite when 0 rows were updated (the trial was already converted/expired). Apply the same guard to expireTrialSubscription and expireTrialAndDowngradeQuota before they are wired up.

## Revalidation

**Verdict:** true-positive

Confirmed present in current code. transitionToExtendedTrial's subscription UPDATE is guarded ONLY by .where(eq(subscriptions.id, subscriptionId)) (L243) — no status predicate — while it unconditionally sets status='expired', tier='free' and rewrites the quota pool to the extended-trial limit (L236-254). The caller is the daily cron at trial-expiry.ts L162, iterating every row from findExpiredTrials (WHERE status='trial' AND trialEndsAt<=now, L178-189). The TOCTOU is real: between the cron's batch SELECT (L156) and the per-row UPDATE, a RevenueCat RENEWAL/INITIAL_PURCHASE for the same row can convert it to status='active', tier='plus' via activateSubscriptionFromRevenuecat (keyed by accountId, UPDATEs the existing row) — and since both fire at trial-end, the collision is plausible at scale. The blind UPDATE then clobbers the paid subscription back to expired/free and caps the pool at 450/month, silently revoking paid access; it does NOT self-heal because subscriptions.tier itself is reset to 'free', so resetExpiredQuotaCycles' tier-based CASE keeps it at free until a later RevenueCat event re-activates. The omission is proven by the sibling transitionToExtendedTrialFromRevenuecatEvent (L277-280), which DOES include eq(subscriptions.status,'trial') in its WHERE. The fix (add the status predicate + .returning() and skip the quota rewrite on 0 rows) is correct. Probability is low (narrow window, not attacker-controlled) but impact is high (paying customer downgraded) — HIGH_BUG stands.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-24)
