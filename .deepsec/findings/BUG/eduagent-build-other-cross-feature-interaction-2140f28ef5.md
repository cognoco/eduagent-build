# [BUG] Outbox-spillover rate-limit rows silently consume the daily push-notification cap

**File:** [`apps/api/src/routes/support.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/routes/support.ts#L69-L75) (lines 69, 70, 71, 72, 73, 74, 75)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-cross-feature-interaction`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

POST /support/outbox-spillover calls checkAndLogRateLimit(db, profileId, account.id, 'support_outbox_spillover', ...) (support.ts lines 69-75). On every ALLOWED call, checkAndLogRateLimit (settings.ts:633-675) inserts a row into the shared `notification_log` table with type='support_outbox_spillover' and sentAt defaulting to now(). The push-notification daily cap is enforced by sendPushNotification (notifications.ts:104-108), which calls getDailyNotificationCount(db, profileId). That function (settings.ts:516-534) counts ALL notification_log rows for the profile since start-of-day, filtering ONLY on profileId + sentAt — it does NOT filter by `type` (in contrast to getRecentNotificationCount, which does). Consequence: each allowed spillover request increments the profile's effective daily-notification count. Because MAX_DAILY_PUSH is 3 (notifications.ts:39), after just 3 spillover calls in a day — well within the 20/hour spillover rate limit — getDailyNotificationCount returns >= 3 and every subsequent real push (review reminders, weekly/monthly nudges that don't set skipDailyCap) is dropped with reason 'daily_cap_exceeded'. This is self-inflicted and connectivity-correlated: the mobile outbox-spillover mechanism fires precisely when session writes have been failing (flaky connectivity), so the same conditions that trigger spillover also silently suppress the user's notifications for the rest of the day. The WI-179 design comment in support.ts explicitly states the support_outbox_spillover type 'is NEVER dispatched as an actual notification', but it overlooked that these rows still count toward the type-agnostic daily-cap query. Scope is per-profile (both functions are profileId-scoped), so there is no cross-tenant impact — this is a correctness/reliability bug, not a security vulnerability.

## Recommendation

Make the daily-cap accounting type-aware so non-dispatch bookkeeping rows are excluded. Either (a) add a type filter / exclusion to getDailyNotificationCount so only real push types count, or (b) store spillover rate-limit accounting in a dedicated table or a separate column namespace rather than notification_log. Add a regression test asserting that N spillover calls do not change getDailyNotificationCount.

## Revalidation

**Verdict:** true-positive

Every step of this cross-feature interaction is verified against current code. (1) The allowed path of checkAndLogRateLimit (settings.ts:667-671) inserts a notification_log row with type='support_outbox_spillover' and a default sentAt=now() on every non-limited spillover call; 'support_outbox_spillover' and 'progress_refresh' are real notificationTypeEnum values (packages/database/src/schema/progress.ts:138,151), so the inserts succeed. (2) getDailyNotificationCount (settings.ts:516-534) counts ALL notification_log rows for the profile filtering ONLY on profileId + sentAt >= start-of-day — it has NO type filter, in deliberate contrast to getRecentNotificationCount (557-577) which DOES filter by type. (3) sendPushNotification (notifications.ts:104-108) gates real pushes on getDailyNotificationCount >= MAX_DAILY_PUSH, and MAX_DAILY_PUSH = 3 (notifications.ts:39); I confirmed via grep that getDailyNotificationCount is the sole daily-cap function. Therefore 3 allowed spillover calls (trivially within the 20/hour limit) push the type-agnostic daily count to 3, and every subsequent real push that does not pass skipDailyCap is dropped with reason 'daily_cap_exceeded'. The WI-179 comment (support.ts:42-43) asserts the type 'is NEVER dispatched as an actual notification' but overlooks that the bookkeeping rows still count in the cap query. Impact is connectivity-correlated (spillover fires exactly when session writes fail) and also affects progress_refresh rows via the same path. Scope is per-profile (both functions are profileId-scoped) so there is no cross-tenant/security impact — correctly classified BUG, not a vulnerability. The recommended fix (make getDailyNotificationCount type-aware, or store rate-limit accounting separately) is not yet implemented.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-24)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-07)
