# Notifications, reminders & reachability — Functional Atlas

## Screens (route → purpose)

### Primary settings screen

| Route | File | Purpose | Gating |
|---|---|---|---|
| `/(app)/more/notifications` | `apps/mobile/src/app/(app)/more/notifications.tsx` | Toggle push on/off, weekly push digest, weekly email digest, monthly email digest | All users; `pushEnabled` master switch controls all |

**Reachability:** More tab (tap 1) → Notifications row (tap 2) → NotificationsScreen. **3 taps from tab root.**

The NotificationsScreen has **no row for review reminders or daily reminders** — those preference fields (`reviewReminders`, `dailyReminders`) exist in the schema (`packages/schemas/src/progress.ts:105-106`) and are persisted to the DB but there is no toggle exposed in the UI for them. The screen exposes only 4 of the 6 preference flags.

### In-app nudge surfaces (not a screen, embedded in existing screens)

| Surface | File | Purpose | Gating |
|---|---|---|---|
| `NudgeBanner` on Learner Home | `apps/mobile/src/components/home/LearnerScreen.tsx:546` | Shows unread nudges from parent; tap opens `NudgeUnreadModal` | `isConsented && hasUnreadNudges && showLearningActions` |
| `NudgeUnreadModal` (bottom sheet) | `apps/mobile/src/components/nudge/NudgeUnreadModal.tsx` | Displays all unread nudge messages; dismiss marks all read | spawned by NudgeBanner |
| `NudgeActionSheet` on Guardian Home | `apps/mobile/src/components/home/ParentHomeScreen.tsx:1045` | Guardian sends encourage-nudge to child (4 templates) | `isGuardian && isConsented` |
| `NudgeActionSheet` on Progress tab | `apps/mobile/src/app/(app)/progress/index.tsx:759` | Same nudge send sheet from Progress view | `nudgeRecommended == true` (child inactive 3+ days, `progress-summary.ts:86-94`) |
| `NudgeActionSheet` on Weekly Report | `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx:344` | Send nudge from within the weekly report view | Guardian only |
| `ChildCapNotificationBanner` on Guardian Home | `apps/mobile/src/components/home/ParentHomeScreen.tsx:917-926` | In-app banner telling parent a child hit their daily/monthly quota | Owner only; `assertOwnerProfile` on API side |

### Child paywall notification trigger

| Surface | File | Trigger | Outcome |
|---|---|---|---|
| `ChildPaywall` component | `apps/mobile/src/app/(app)/_subscription/_components/ChildPaywall.tsx:39` | Child hits paywall or quota screen | Calls `POST /notifications/child-cap/notify-parent` to notify parent in-app; also triggers `useNotifyParentSubscribe()` → `POST /settings/notify-parent-subscribe` for push+email |
| `QuotaExceededCard` in session | `apps/mobile/src/components/session/QuotaExceededCard.tsx` | Child hits quota mid-session | Same child-cap notification path |

---

## Capabilities (user task → backend process file:line)

### 1. Toggle notification preferences

- **User action:** Toggle any switch on `/(app)/more/notifications`
- **Hook:** `useUpdateNotificationSettings()` (`apps/mobile/src/hooks/use-settings.ts:175`) → `PUT /settings/notifications`
- **Route handler:** `apps/api/src/routes/settings.ts:84-103`
- **Service:** `upsertNotificationPrefs(db, profileId, accountId, body)` in `apps/api/src/services/settings.ts`
- **DB:** `notificationPreferences` table; scoped to `profileId`
- **Guard:** `assertNotProxyMode(c)` — parent-proxy sessions cannot change their impersonated child's prefs

### 2. Register push token

- **Trigger:** Automatic on app launch when push permission already granted; re-tries on `AppState` foreground transitions
- **Hook:** `usePushTokenRegistration()` (`apps/mobile/src/hooks/use-push-token-registration.ts:50`) → `POST /settings/push-token`
- **Route handler:** `apps/api/src/routes/settings.ts:256-271`
- **Service:** `registerPushToken(db, profileId, accountId, token)` → writes `notificationPreferences.pushToken`
- **Guard:** `assertNotProxyMode`; skips if `isParentProxy`
- **No permission prompt here** — push permission is requested just-in-time post-session; this hook only registers an already-granted token

### 3. Send parent-to-child nudge (template message)

- **User action:** Tap nudge button on Guardian Home or Progress tab → NudgeActionSheet → select template
- **Hook:** `useSendNudge()` (`apps/mobile/src/hooks/use-nudges.ts:39`) → `POST /nudges`
- **Route handler:** `apps/api/src/routes/nudges.ts:34-45`
- **Service:** `createNudge(db, {fromProfileId, toProfileId, template})` (`apps/api/src/services/nudge.ts:77`)
  - Verifies `assertParentAccess` (family link)
  - Consent gate: non-null consent must be `CONSENTED`
  - Rate limit: 4 nudges per 24h window per child (advisory lock)
  - Quiet hours check: respects child's timezone (21:00–07:00)
  - Calls `sendPushNotification` to child (bypasses daily cap via `skipDailyCap: true`)
- **DB written:** `nudges` table row; `notificationLog` row

### 4. Read/dismiss nudges

- **User action:** Tap NudgeBanner → view modal → tap Done
- **Hook:** `useMarkAllNudgesRead()` → `POST /nudges/mark-read`
- **Route:** `apps/api/src/routes/nudges.ts:63-70`
- **Service:** `markAllNudgesRead(db, profileId)` — sets `nudges.readAt`

### 5. View child quota cap banner and dismiss

- **User action:** Tap "Dismiss" on ChildCapNotificationBanner on Guardian Home
- **Hook:** `useDismissChildCapNotification()` (`apps/mobile/src/hooks/use-child-cap-notifications.ts:53`) → `POST /notifications/child-cap/:id/dismiss`
- **Route:** `apps/api/src/routes/notifications.ts:53-69`
- **Service:** `dismissChildCapNotification(db, ownerProfileId, notificationId)` (`apps/api/src/services/child-cap-notifications.ts:144`) — sets `dismissedAt`
- **Guard:** `assertOwnerProfile` — non-owners cannot dismiss

### 6. Child notifies parent of cap hit (child-side)

- **User action:** Child hits quota mid-session or on paywall → auto-triggered
- **Hook:** `useNotifyParentChildCap()` (`apps/mobile/src/hooks/use-child-cap-notifications.ts:~80`) → `POST /notifications/child-cap/notify-parent`
- **Route:** `apps/api/src/routes/notifications.ts:71-93`
- **Service:** `recordChildCapNotificationForAccount(db, {accountId, childProfileId, kind, resetsAt})` (`apps/api/src/services/child-cap-notifications.ts:192`)
- **Guard:** Throws `ForbiddenError` if caller is isOwner; owner cannot self-report a cap hit

### 7. Child triggers parent subscribe notification

- **User action:** Child at paywall screen (ChildPaywall) → auto-fires
- **Hook:** `useNotifyParentSubscribe()` (`apps/mobile/src/hooks/use-settings.ts:355`) → `POST /settings/notify-parent-subscribe`
- **Route:** `apps/api/src/routes/settings.ts:274-299`
- **Service:** `notifyParentToSubscribe(db, childProfileId, emailOptions, appUrl)` (`apps/api/src/services/notifications.ts:498`)
  - Rate limited: 1 per 24h (atomic advisory lock)
  - Sends push to parent AND email to parent's `consentStates.parentEmail`

---

## Navigation depth map

| Capability | Path from tab root | Tap count | Flag |
|---|---|---|---|
| View notification preferences | More tab → Notifications row → NotificationsScreen | 2 | |
| Toggle any notif preference | More tab → Notifications row → NotificationsScreen → toggle | 2 | |
| Send nudge from Guardian Home | Home tab → NudgeBanner / nudge button → NudgeActionSheet → pick template | 2 | `showLearningActions` |
| Send nudge from Progress tab | Progress tab → child card → nudge CTA → NudgeActionSheet | 2-3 | `nudgeRecommended` (inactive 3+ days) |
| Send nudge from Weekly Report | Progress tab → child card → weekly reports → weekly report detail → NudgeActionSheet | **4** | Guardian only |
| Read incoming nudges (child) | Home tab → NudgeBanner (auto-shown) → NudgeUnreadModal | 1 | must have unread nudges |
| View child cap banner | Home tab (auto-shown on ParentHomeScreen) | 0 | Owner only |
| Dismiss child cap banner | Home tab → Dismiss button | 1 | Owner only |

**3+ tap depth items:**
- Send nudge from a weekly report detail: `Progress (1) → child profile (2) → reports list (3) → weekly report (4) → NudgeActionSheet (5)` — 5 taps from tab root
- Notification preferences screen: technically 3 taps (tab, more screen, notifications screen)

---

## Backend processes & data model

### Push notification infrastructure

**Provider:** Expo Push API (`https://exp.host/--/api/v2/push/send`) — pure `fetch`, no SDK (`apps/api/src/services/notifications.ts:41`)

**Token storage:** `notificationPreferences.pushToken` per profile. Registered via `POST /settings/push-token` on app launch.

**Daily cap:** `MAX_DAILY_PUSH = 3` per profile per day (`apps/api/src/services/notifications.ts:39`). Nudges bypass this cap (`skipDailyCap: true`).

**Dedup pattern:** All scheduled notifications use `checkAndLogRateLimitInternal()` — an advisory-locked transaction that atomically checks + writes `notificationLog` to prevent double-send on Inngest replay or concurrent cron fires.

**Consent gate in all scan functions:** Profiles are eligible for push only if `consentStates.status = 'CONSENTED'` OR no consent record exists (adult) (`daily-reminder-scan.ts:62-79`).

**DB tables involved:**
- `notificationPreferences` — per-profile flags + push token + maxDailyPush
- `notificationLog` — append-only log of every sent notification (type, sentAt, ticketId)
- `nudges` — parent→child nudge rows with readAt
- `childCapNotifications` — owner-facing cap-hit records with dismissedAt
- `consentStates` — gates GDPR-restricted push delivery

### Scheduled scan→send pipelines

| Pipeline | Trigger | Schedule | Fan-out event | Send handler | Dedup window |
|---|---|---|---|---|---|
| Daily reminder | Streak > 0, pushEnabled, dailyReminders=true, local 08:30-09:30 | Hourly cron `0 * * * *` | `app/daily-reminder.send` | `daily-reminder-send.ts` | 24h per profile |
| Recall nudge | Overdue retention cards, pushEnabled, local 07:30-08:30 | Hourly cron `0 * * * *` | `app/recall-nudge.send` | `recall-nudge-send.ts` | 24h per profile |
| Review reminder | Overdue retention cards, pushEnabled, reviewReminders=true | Every 2h `0 */2 * * *` | `app/retention.review-due` | `review-due-send.ts` | 24h per profile |
| Weekly parent push+email | Guardian has linked children, local 09:00, Monday | Hourly-on-Monday `0 * * * 1` | `app/weekly-progress-push.generate` | `weeklyProgressPushGenerate` in `weekly-progress-push.ts` | 24h per parent |
| Monthly report push+email | Parent-child pairs with active snapshots | Monthly `0 10 1 * *` | `app/monthly-report.generate` | `monthlyReportGenerate` in `monthly-report-cron.ts` | per report-month |
| Consent reminder (email) | `app/consent.requested` event | Event-driven (day 7, 14, 25) | — | `consent-reminders.ts` | Inngest idempotency key |
| Top-up expiry reminder | Credits at 6/4/2/0 months before expiry | Daily 09:00 UTC | `app/topup.expiry-reminder` | `topup-expiry-reminder-send.ts` (stub — logs only, delivery deferred to Story 5.6) | — |
| Trial expiry push | Trial subscription aging | Daily midnight | Internal (per-subscription loop) | `trial-expiry.ts:124` | 24h advisory lock |
| Child quota cap (Inngest) | `app/billing.profile_quota.exhausted` | Event-driven | — | `notify-parent-child-cap-hit.ts` | `onConflictDoNothing` on (owner, child, kind, date) |
| Session filing failed push | Filing timeout event | Event-driven | `app/session.filing_timed_out` | `filing-timed-out-observe.ts:337` | 24h dedup |
| Struggle notifications | Session complete, LLM learner profile update | Event-driven (session-completed) | — | `session-completed.ts:1615` via `sendStruggleNotification` | 24h per parent per type |

### Email channel

- **Provider:** Resend API (`https://api.resend.com/emails`) — pure `fetch`
- **Email types:** `consent_request`, `consent_reminder`, `consent_warning`, `subscribe_request`, `weekly_progress`, `monthly_progress`
- **Idempotency:** `Idempotency-Key` header forwarded to Resend (24h dedup window)
- **Bounce/complaint handling:** Resend webhook → `app/email.bounced` Inngest event → `email-bounced-observe.ts` (observability log only; no list management yet)

### Notification tap-to-navigate routing

File: `apps/mobile/src/lib/notification-tap-navigation.ts`

Initialized at app launch: `initNotificationHandler()` + `useNotificationResponseHandler()` in `apps/mobile/src/app/(app)/_layout.tsx:53,264`

| Notification type | Target context | Navigation target |
|---|---|---|
| `nudge`, `review_reminder`, `daily_reminder`, `recall_nudge`, `dictation_review`, `session_filing_failed` | `study` | `/(app)/home` |
| `progress_refresh` | `family` | `/(app)/progress` |
| `weekly_progress`, `monthly_report`, `struggle_noticed`, `struggle_flagged`, `struggle_resolved` | `family` | `/(app)/recaps` |
| `subscribe_request`, `trial_expiry` | `study` | `/(app)/subscription` |

**Cross-context rule:** If tapping a notification requires switching from `study` to `family` context (or vice versa) and the user is mid-session, a `platformAlert` prompt is shown first (`notification-tap-navigation.ts:71-77`). Otherwise, context switch happens silently via `setMode()`.

---

## Complexity signals & redesign notes

### 1. Notification preferences screen is incomplete and buried
The NotificationsScreen (`/(app)/more/notifications`) exposes only 4 of 6 preference flags. `reviewReminders` and `dailyReminders` exist in the DB schema (`packages/schemas/src/progress.ts:105-106`) and are read by Inngest scan functions (`daily-reminder-scan.ts:55`, `review-due-scan.ts:93`) but have no UI toggle. A user who wants to stop daily reminders has no way to do so from the app. This is a silent dead zone.

### 2. Three distinct "nudge" concepts under one word
The term "nudge" in this codebase covers three distinct things:
- **Parent→child encourage-nudge** (template message sent via `POST /nudges`, received on NudgeBanner)
- **Progress nudge action** (a UI concept — `ProgressNudgeAction` type — that routes parent to a specific topic/subject to encourage study; computed from `computeNudgeRecommended`, not persisted)
- **In-context nudge CTA** (the button on Progress tab that opens NudgeActionSheet when `nudgeRecommended=true`)

These are entirely separate code paths with similar naming. A one-screen redesign would need to unify or rename.

### 3. NudgeActionSheet appears in 4 entry points
`NudgeActionSheet` is rendered in: Guardian Home (`ParentHomeScreen.tsx:1045`), Progress tab (`progress/index.tsx:759`), Weekly Report detail (`child/[profileId]/weekly-report/[weeklyReportId].tsx:344`), and Child Profile view (`child/[profileId]/index.tsx` — via `openProgressNudgeAction` which navigates to a session rather than a nudge sheet). The send mechanism is the same but the triggering context differs. Users may not know they can send nudges from multiple places.

### 4. Child quota cap: two parallel notification paths
When a child hits their quota, TWO notifications can fire:
1. The child-side push `POST /notifications/child-cap/notify-parent` → `recordChildCapNotificationForAccount` (writes `childCapNotifications` table; shown as in-app banner to owner)
2. Inngest handler `notify-parent-child-cap-hit.ts` triggered by `app/billing.profile_quota.exhausted` event → `recordChildCapNotificationForSubscription` (same table, different lookup path — by subscriptionId)

The `onConflictDoNothing` on (owner, child, kind, date) prevents duplicates, but both paths exist and could both fire for the same quota hit. The in-app banner (`GET /notifications/child-cap`) surfaces the result; the child also has the paywall `POST /settings/notify-parent-subscribe` path which sends push+email to parent separately. This means a single quota event can generate up to 3 parent notifications (cap banner, subscribe push, subscribe email).

### 5. Top-up expiry reminders are wired but undelivered
`topup-expiry-reminder-send.ts` is a logged stub (`deliveryDeferred: 'pending_notification_handler_story_5_6'`). The scan-and-fan-out cron fires daily, events are generated, but no push or email is ever sent to the user. This is wired-but-untriggered.

### 6. Two overlapping "review due" push notifications
Both `recall-nudge` (hourly, 07:30-08:30, no `reviewReminders` pref gate) and `review-due-scan` (every 2h, `reviewReminders` pref required) send push notifications about overdue retention cards. The messages differ (`recall-nudge-send.ts:148` formats per-topic title; `review-due-send.ts:131` formats per-subject name) but the user experience is nearly identical. A user could receive both on the same day if they have overdue cards and push enabled.

### 7. Notification preference screen: 3 taps buried under More
The single screen controlling all notification preferences is 3 taps from any tab: `[Tab bar] → [More] → [NotificationsScreen]`. It has no direct surface in the app beyond this menu path. No quick-toggle from a notification itself, no onboarding-time preference setting (push permission prompt is separate from preference persistence).

### 8. Email digest defaults are ON, never surfaced to user pre-send
`weeklyProgressEmail` and `monthlyProgressEmail` default to `true` (`packages/schemas/src/progress.ts:153-155`) and are only opt-out via the NotificationsScreen. New users receive weekly and monthly emails without ever being asked; they must navigate 3 levels deep to turn them off.

### 9. Struggle notifications have no in-app acknowledgment surface
`struggle_noticed`, `struggle_flagged`, and `struggle_resolved` push notifications navigate to `/(app)/recaps` when tapped (`notification-tap-navigation.ts:44`). The Recaps screen (`apps/mobile/src/app/(app)/recaps/index.tsx`) shows session recaps, not struggle alerts specifically. There is no dedicated struggle-alert surface; the notification is the only signal and tapping it dumps the user onto a generic screen.

### 10. Trial expiry push: no preference gate
Trial expiry push (`trial-expiry.ts:124`) fires to the owner profile with no `pushEnabled` preference check — it uses `sendPushNotification` directly without `respectPushPreference: true`. A user who has disabled push notifications will still receive trial expiry pushes. This differs from all other scheduled pushes which check preferences explicitly.

---

## Overlaps with other domains

### Overlaps with Progress / Reports domain
- **Weekly and monthly report generation** happens inside notification Inngest functions (`weekly-progress-push.ts`, `monthly-report-cron.ts`). These functions do double duty: they generate and persist report rows in `weeklyReports`/`monthlyReports` AND send push/email notifications. Report data is consumed independently via `/(app)/recaps` and `/(app)/progress/reports`. The coupling means a notification failure can prevent a report from being persisted (though `onConflictDoNothing` provides partial protection).
- **Recap screen** (`/(app)/recaps`) is the tap target for `weekly_progress` and `monthly_report` push notifications. The Recaps domain and Notifications domain share the same downstream screen.

### Overlaps with Billing / Subscription domain
- **Child quota cap notifications** (`childCapNotifications` table) are triggered by `app/billing.profile_quota.exhausted` (a billing event). The notification handler (`notify-parent-child-cap-hit.ts`) lives in the notifications Inngest directory but its trigger is a billing event.
- **Subscribe request notifications** (`notifyParentToSubscribe` in `services/notifications.ts:498`) are billing-adjacent: sent from `ChildPaywall` and routed to `/(app)/subscription`. Push and email both go through the notifications service.
- **Trial expiry push** is in `inngest/functions/trial-expiry.ts` (a billing file) but uses `sendPushNotification` from the notifications service.

### Overlaps with Family / Consent domain
- **Consent reminder emails** (day 7, 14, 25) are the primary "notification" for underage account creation. They are in `consent-reminders.ts` (consent domain) but use `sendEmail` from `services/notifications.ts`. The consent flow has its own email logic completely separate from the settings-controlled preferences.
- **NudgeBanner visibility** is gated on `consentStatus === 'CONSENTED'` (`NudgeBanner.tsx:23-26`), creating a direct family/consent dependency in the notification UI component.
- **Struggle notifications** (`sendStruggleNotification`) check `isGdprProcessingAllowed` (consent domain) before sending (`services/notifications.ts:627`).

### Overlaps with Learning Session domain
- **Session filing failed push** fires from `filing-timed-out-observe.ts` — an Inngest function in the session/filing domain — using `sendPushNotification` from notifications. The push type `session_filing_failed` navigates to `/(app)/home` on tap.
- **Recall bridge** (`services/recall-bridge.ts`) is named similarly to "recall nudge" (an Inngest push function) but is entirely separate: it generates LLM recall questions after a homework session, not a push notification.

### Overlaps with Progress-snapshot domain
- `progress_refresh` notification type appears in `notification-tap-navigation.ts:39` and is rate-limited in `snapshot-progress.ts:87` but is not sent as a push — it is a rate-limit category name used when the user manually triggers a progress snapshot refresh. The navigation map entry for it is currently unreachable (no background process sends a `progress_refresh` push).
