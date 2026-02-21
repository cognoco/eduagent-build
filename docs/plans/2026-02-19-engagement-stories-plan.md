# Engagement Stories Plan — Stories 4.7 & 4.8

## Current State Assessment

### What Already Exists (no changes needed)

**Database schema (complete):**
- `learning_modes` table in `packages/database/src/schema/progress.ts` — `profileId` (unique), `mode` (enum: 'serious'|'casual'), timestamps
- `notification_preferences` table — `profileId` (unique), `reviewReminders`, `dailyReminders`, `pushEnabled`, `maxDailyPush`, timestamps
- `learningModeEnum` pgEnum already defined
- Both tables exported from `packages/database/src/schema/index.ts` via `progress.ts`

**Schemas (complete):**
- `learningModeSchema` (`z.enum(['serious', 'casual'])`) in `packages/schemas/src/progress.ts`
- `learningModeUpdateSchema` (`{ mode: learningModeSchema }`)
- `notificationPrefsSchema` with all fields
- All types exported from `@eduagent/schemas`

**Settings service (complete):**
- `getLearningMode(db, profileId)` — returns default `serious` when no row
- `upsertLearningMode(db, profileId, mode)` — upserts into `learning_modes`
- `getNotificationPrefs(db, profileId)` — returns defaults (all false, maxDailyPush 3)
- `upsertNotificationPrefs(db, profileId, input)` — upserts into `notification_preferences`
- Full test coverage in `settings.test.ts`

**Settings routes (complete):**
- `GET /v1/settings/learning-mode` — returns `{ mode }`
- `PUT /v1/settings/learning-mode` — accepts `{ mode: 'serious' | 'casual' }`, validates with Zod
- `GET /v1/settings/notifications` — returns `{ preferences }`
- `PUT /v1/settings/notifications` — validates with Zod
- Full route test coverage in `settings.test.ts`

**Mobile hooks (complete):**
- `useLearningMode()` — TanStack Query hook
- `useUpdateLearningMode()` — mutation with invalidation
- `useNotificationSettings()` — TanStack Query hook
- `useUpdateNotificationSettings()` — mutation with invalidation
- All in `use-settings.ts` with full test coverage

**Notifications service (stub):**
- `sendPushNotification()` exists but returns mock
- `formatReviewReminderBody()` — implemented, coaching voice
- `formatDailyReminderBody()` — implemented
- `MAX_DAILY_PUSH = 3`
- Tests exist but only test the mock/formatters

**Review-reminder Inngest function (stub):**
- Triggers on `app/retention.review-due` event
- Has a `send-review-notification` step that only console.logs
- Basic tests exist

**Session-completed Inngest chain (complete):**
- Processes retention, summaries, coaching cards, streaks, XP, embeddings
- Does NOT currently emit `app/retention.review-due` events
- `closeSession` does NOT pass `summaryStatus` in the event

---

## What Needs Implementation

### Story 4.7: Learning Mode Toggle

The CRUD/API layer is already fully implemented. What's missing is the **behavioral enforcement** of mode differences and the **10-skip Casual Explorer prompt**.

#### 4.7.1: Add `summarySkipCount` tracking to session-completed chain

**File:** `apps/api/src/inngest/functions/session-completed.ts`
**Change:** Add `summaryStatus` to the event data type. In the `write-coaching-card` step, when `summaryStatus === 'skipped'`, increment a counter. This counter needs storage.

**File:** `packages/database/src/schema/progress.ts`
**Change:** Add `consecutiveSummarySkips` integer column to the `learningModes` table (default 0). This is the natural home since it's per-profile and tied to mode behavior.

**File:** `apps/api/src/services/settings.ts`
**Change:** Add `getConsecutiveSummarySkips(db, profileId)` and `incrementSummarySkips(db, profileId)` / `resetSummarySkips(db, profileId)` functions.

**File:** `apps/api/src/inngest/functions/session-completed.ts`
**Change:** Add step to increment/reset summary skip count based on `summaryStatus`.

#### 4.7.2: Add `shouldPromptCasualMode` flag to session close response

**File:** `apps/api/src/services/settings.ts`
**Change:** Add `shouldPromptCasualSwitch(db, profileId): Promise<boolean>` — returns true when consecutiveSummarySkips >= 10 AND current mode is 'serious'.

**File:** `apps/api/src/routes/sessions.ts`
**Change:** After `closeSession`, check skip count. Include `shouldPromptCasualSwitch: boolean` in the close response. Also pass `summaryStatus` from the close input to the Inngest event.

**File:** `packages/schemas/src/sessions.ts`
**Change:** Add optional `summaryStatus` to `sessionCloseSchema` so the mobile can tell the API whether the summary was skipped.

#### 4.7.3: Add learning mode enforcement helpers

**File:** `apps/api/src/services/settings.ts`
**Change:** Add:
- `getLearningModeRules(mode: LearningMode)` — returns `{ masteryGates: boolean; verifiedXpOnly: boolean; mandatorySummaries: boolean }`
- These rules are used by other services (session close, assessment gate, XP award) to branch behavior.

Tests for all new functions.

#### 4.7.4: Wire mode into XP and assessment flows

**File:** `apps/api/src/services/xp.ts`
**Change:** `insertSessionXpEntry` should check learning mode. If 'casual', award XP as 'verified' immediately (completion XP). If 'serious', keep as 'pending' (verified on delayed recall). This function already receives `db` and `profileId`.

**File:** `apps/api/src/services/assessments.ts`
**Change:** Add `isMasteryGateRequired(db, profileId)` check. The assessment completion flow (or curriculum progression logic) should enforce mastery gates only in 'serious' mode.

Note: Full mastery gate enforcement in curriculum progression is a behavioral change to the topic-ordering logic. For this story, we add the helper and document where it should be called. The progression route can check `getLearningModeRules()` before requiring assessment.

### Story 4.8: Push Notifications for Review Reminders

#### 4.8.1: Add push token storage

**File:** `packages/database/src/schema/progress.ts`
**Change:** Add `expoPushToken` text column to `notification_preferences` table (nullable). This is where the device token lives.

**File:** `packages/schemas/src/progress.ts`
**Change:** Add `pushTokenRegisterSchema` with `{ token: z.string() }`.

**File:** `apps/api/src/services/settings.ts`
**Change:** Add `registerPushToken(db, profileId, token)` and `getPushToken(db, profileId)` functions.

**File:** `apps/api/src/routes/settings.ts`
**Change:** Add `POST /v1/settings/push-token` route for token registration.

#### 4.8.2: Implement real Expo Push SDK integration

**File:** `apps/api/package.json`
**Change:** Add `expo-server-sdk` dependency.

**File:** `apps/api/src/services/notifications.ts`
**Change:** Replace mock `sendPushNotification` with real Expo Push SDK logic:
1. Accept `db` parameter to look up push token
2. Validate token with `Expo.isExpoPushToken()`
3. Send via `expo.sendPushNotificationsAsync()`
4. Return ticket ID
5. Handle errors gracefully (expired token → remove from DB)

**File:** `apps/api/src/services/notifications.test.ts`
**Change:** Add tests with mocked `expo-server-sdk`.

#### 4.8.3: Implement review-reminder Inngest cron

**File:** `apps/api/src/inngest/functions/review-reminder.ts`
**Change:** Rewrite to be a daily cron (not event-triggered). The cron:
1. Queries all profiles with `pushEnabled = true` AND `reviewReminders = true`
2. For each profile, queries `retention_cards` where `nextReviewAt < NOW()`
3. Checks for active learning sessions (skip if learner is currently in session)
4. Checks daily notification count (max 3)
5. Groups fading topics by subject
6. Formats coaching-voice message via `formatReviewReminderBody()`
7. Sends via `sendPushNotification()`

Keep the event-triggered variant as well for on-demand reminders.

**File:** `apps/api/src/inngest/functions/review-reminder.test.ts`
**Change:** Add comprehensive tests for the cron logic.

#### 4.8.4: Add daily notification tracking

**File:** `packages/database/src/schema/progress.ts`
**Change:** Add `notificationLog` table: `id`, `profileId`, `type`, `sentAt`, `ticketId`. Used to enforce the max 3 per day limit.

**File:** `apps/api/src/services/notifications.ts`
**Change:** Add `getDailyNotificationCount(db, profileId)` and `logNotification(db, profileId, type, ticketId)`.

#### 4.8.5: Mobile push token registration hook

**File:** `apps/mobile/src/hooks/use-settings.ts`
**Change:** Add `useRegisterPushToken()` hook that:
1. Calls `Notifications.getExpoPushTokenAsync()` from `expo-notifications`
2. Sends token to `POST /v1/settings/push-token`
3. Called on app startup when `pushEnabled = true`

#### 4.8.6: Wire session-completed to emit review-due events

**File:** `apps/api/src/inngest/functions/session-completed.ts`
**Change:** After updating retention, check if any topics for this profile now have `nextReviewAt` in the past. If so, emit `app/retention.review-due` event. This allows on-demand reminders in addition to the daily cron.

---

## Implementation Order

1. **4.7.1** — Schema: add `consecutiveSummarySkips` to `learningModes` table
2. **4.8.1** — Schema: add `expoPushToken` to `notification_preferences`, add `notificationLog` table
3. **4.7.2** — Settings service: skip tracking + casual mode prompt helper
4. **4.7.3** — Settings service: learning mode enforcement rules
5. **4.7.4** — Wire mode into XP flow (casual = immediate verified XP)
6. **4.7 route** — Update session close to include `summaryStatus` in event and `shouldPromptCasualSwitch` in response
7. **4.8.2** — Notifications service: real Expo Push SDK integration
8. **4.8.3** — Review-reminder: rewrite as daily cron with notification limits
9. **4.8.4** — Daily notification tracking (log + count)
10. **4.8.5** — Mobile: push token registration hook
11. **4.8.6** — Session-completed: emit review-due events
12. **Tests** — Run full test suite

## Files Modified (summary)

**Database schema:**
- `packages/database/src/schema/progress.ts` — add columns + new table

**Schemas:**
- `packages/schemas/src/progress.ts` — add push token schema
- `packages/schemas/src/sessions.ts` — add optional `summaryStatus` to close schema

**API services:**
- `apps/api/src/services/settings.ts` + `settings.test.ts` — skip tracking, mode rules, push token
- `apps/api/src/services/notifications.ts` + `notifications.test.ts` — real Expo SDK
- `apps/api/src/services/xp.ts` + `xp.test.ts` — casual mode XP

**API routes:**
- `apps/api/src/routes/settings.ts` + `settings.test.ts` — push token route
- `apps/api/src/routes/sessions.ts` — pass summaryStatus, add shouldPromptCasualSwitch

**Inngest:**
- `apps/api/src/inngest/functions/session-completed.ts` + test — skip counting, review-due emission
- `apps/api/src/inngest/functions/review-reminder.ts` + test — cron rewrite

**Mobile:**
- `apps/mobile/src/hooks/use-settings.ts` + test — push token hook

**Config:**
- `apps/api/package.json` — add `expo-server-sdk`
