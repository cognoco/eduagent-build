# [BUG] downgradeQuotaPool can reset an upgraded account's quota pool to free limits (day-28 transition race)

**File:** [`apps/api/src/services/billing/trial.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/billing/trial.ts#L52-L75) (lines 52, 62, 66, 75)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

downgradeQuotaPool() is called by the trial-expiry cron Step 2 (trial-expiry.ts:220) for rows from findExpiredTrialsByDaysSinceEnd() (status='expired'). Its only safety is an idempotency check that skips when currentPool.monthlyLimit === monthlyLimit (line 62). If, during the extended-trial window, the user re-subscribes to a paid tier (RevenueCat sets tier='plus' and reconcileQuotaStateForSubscription raises the pool's monthlyLimit), the equality check no longer matches the free limit, so the cron proceeds to overwrite the pool with free monthlyLimit/dailyLimit and zero usedThisMonth/usedToday. The subscriptions row stays tier='plus' while the quota pool carries free limits — divergent billing state that under-serves the paying user until the next billing event re-reconciles. The UPDATE is keyed only on subscriptionId with no join to the subscription's current tier/status.

## Recommendation

Before rewriting the pool, re-resolve the subscription's effective tier (or guard the UPDATE by joining subscriptions and only downgrading when status IN ('expired','trial')). Alternatively gate the cron step so it skips subscriptions whose status has advanced to 'active'/tier!='free'. Equality-on-monthlyLimit is not a sufficient idempotency key once the row may have been upgraded.

## Revalidation

**Verdict:** true-positive

Confirmed in current code. downgradeQuotaPool (L52-76) guards only on monthlyLimit equality (L62) and its UPDATE is keyed solely on subscriptionId (L75), with no join to the subscription's current tier/status. The caller is the cron Step 2 (trial-expiry.ts L208-225) over findExpiredTrialsByDaysSinceEnd rows (status='expired'). The race: if, during the extended-trial window, the user re-subscribes (RevenueCat raises the pool's monthlyLimit to the paid value and sets tier='plus' on the same row), then a day-28 cron run that SELECTed the row while it was still status='expired' will, in downgradeQuotaPool, read currentPool.monthlyLimit=700 (now != free 100), fail the idempotency skip, and overwrite the pool to free limits while subscriptions.tier stays 'plus' — divergent state under-serving the paying user. The window is narrow (the conversion must land between the batch SELECT and the per-row read+UPDATE, while status is still 'expired'), and it self-heals at the next monthly cycle reset (resetExpiredQuotaCycles rewrites monthly_limit from s.tier='plus'), so impact is bounded — BUG severity is correct. Equality-on-monthlyLimit is indeed not a sufficient idempotency key once the row may have been upgraded; the recommended tier/status re-resolution is the right fix. (expireTrialSubscription and expireTrialAndDowngradeQuota share the unguarded pattern but, as the finding notes, have no production callers — confirmed by grep — so they are latent.)

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-24)
