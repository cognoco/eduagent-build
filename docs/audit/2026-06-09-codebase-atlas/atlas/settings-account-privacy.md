# Settings, Account, Privacy & Security — Functional Atlas

> Branch: `new-llm` | Date: 2026-06-09 | Reviewer: atlas agent

---

## Screens (route → purpose)

| Route | File | Purpose |
|---|---|---|
| `/(app)/more` (index) | `apps/mobile/src/app/(app)/more/index.tsx` | Hub: lists all More-section rows. Proxy mode locks to warning card only. |
| `/(app)/more/account` | `apps/mobile/src/app/(app)/more/account.tsx` | Profile name (links to /profiles), security controls (inline), app-language picker, subscription link. |
| `/(app)/more/security-sessions` | `apps/mobile/src/app/(app)/more/security-sessions.tsx` | Lists and revokes Clerk sessions across devices. |
| `/(app)/more/notifications` | `apps/mobile/src/app/(app)/more/notifications.tsx` | Push toggle, weekly/monthly digest toggles (push + email). |
| `/(app)/more/privacy` | `apps/mobile/src/app/(app)/more/privacy.tsx` | Privacy policy link, ToS link, export data (owner-gated), delete account (owner-gated), child-withdrawal archive preference (owner + has-children). |
| `/(app)/more/learning-preferences` | `apps/mobile/src/app/(app)/more/learning-preferences.tsx` | Intermediary listing the current accommodation mode with a link to change it. Accepts `?childProfileId=` to edit a child's preference (owner-gated). |
| `/(app)/more/accommodation` | `apps/mobile/src/app/(app)/more/accommodation.tsx` | Selects accommodation mode (none / short-burst / predictable / extended). Has "Not sure?" expandable guide. Links to celebrations from short-burst/predictable. Accepts `?childProfileId=`. |
| `/(app)/more/celebrations` | `apps/mobile/src/app/(app)/more/celebrations.tsx` | Selects celebration level: all / big_only / off. Accepts `?childProfileId=`. |
| `/(app)/more/help` | `apps/mobile/src/app/(app)/more/help.tsx` | Opens support mailto, or opens in-app FeedbackSheet ("Report a problem"). |
| `/delete-account` | `apps/mobile/src/app/delete-account.tsx` | Three-stage delete flow (warn → typed confirmation → scheduled/cancel). Owner-gated by `isOwner` redirect. |
| `/profiles` | `apps/mobile/src/app/profiles.tsx` | Profile list with rename + switch. Owner can rename any profile; non-owners can only rename themselves. |
| `/privacy` | `apps/mobile/src/app/privacy.tsx` | Static in-app Privacy Policy text. |
| `/terms` | `apps/mobile/src/app/terms.tsx` | Static in-app Terms of Service text. |
| `/(app)/mentor-memory` | `apps/mobile/src/app/(app)/mentor-memory.tsx` | View/edit mentor memory (learning style, interests, strengths, struggles). Reachable from More index via `returnTo=more`. |
| `/(app)/subscription` | `apps/mobile/src/app/(app)/subscription.tsx` | Subscription management (billing). Owner-gated from account.tsx. |

**Layout:** `apps/mobile/src/app/(app)/more/_layout.tsx` — Expo Router Stack. `unstable_settings = { initialRouteName: 'index' }` set.

---

## Capabilities (user task → backend process file:line)

### Account & Profile

| Task | UI entry point (file:line) | API route / service | Backend service (file:line) | Gating |
|---|---|---|---|---|
| View profile name | `more/account.tsx:70-75` | — (local from Clerk `user` + `activeProfile`) | — | All |
| Rename profile | `more/account.tsx:73` → `/profiles` | `PATCH /profiles/:profileId` | `apps/api/src/services/profile.ts` (updateDisplayName) | Owner can rename any; non-owner can only rename themselves |
| Switch active profile | `profiles.tsx:117-141` | `switchProfile` (local SecureStore) | — | Owner can switch to any profile |
| Change app language (UI shell) | `more/account.tsx:43-58` (modal) | Local: `setStoredLanguage` + `i18next.changeLanguage` | No API call | `FEATURE_FLAGS.I18N_ENABLED === true` (always true) |
| Change password | `components/account-security.tsx:136-158` (inline form in account.tsx) | Clerk `user.updatePassword` — no API call | Clerk SDK only | `user.passwordEnabled && showAccountSecurity gate` |
| Add password (SSO users) | `components/account-security.tsx:91-107` | Clerk `user.updatePassword` (no current needed) | `components/add-password.tsx:59-63` | `!user.passwordEnabled && showAccountSecurity gate` |
| Change email | `components/account-security.tsx:108-116` | Clerk + `PATCH /account/email` | `apps/api/src/services/account.ts:322` `updateAccountEmailFromClerk` | `showAccountSecurity gate` |
| Manage devices (sessions) | `components/account-security.tsx:118-124` → security-sessions screen | Clerk `user.getSessions()` + `session.revoke()` | `components/security-sessions.tsx:79-127` | `showAccountSecurity gate` |
| View subscription tier | `more/account.tsx:93-106` | `useSubscription` → `GET /subscription` | `apps/api/src/services/billing.ts` | `showBilling gate (isOwner && !isParentProxy)` |
| Manage subscription | `more/account.tsx:103` → `/subscription` | RevenueCat / Stripe | `apps/mobile/src/app/(app)/subscription.tsx` | `showBilling gate` |

### Security

| Task | UI entry | API route | Backend (file:line) | Gating |
|---|---|---|---|---|
| Revoke device session | `security-sessions.tsx:110-127` | Clerk `session.revoke()` | Clerk SDK only (no API call) | `showAccountSecurity gate` |
| View active sessions | `security-sessions.tsx:79-105` | Clerk `user.getSessions()` | Clerk SDK only | `showAccountSecurity gate` |

`showAccountSecurity = isOwner && !isParentProxy` — defined at `apps/mobile/src/lib/navigation-contract.ts:364`.

### Privacy & Data

| Task | UI entry | API route | Backend service (file:line) | Gating |
|---|---|---|---|---|
| Export my data | `more/privacy.tsx:129-148` | `GET /account/export` | `apps/api/src/services/export.ts:186` `generateExport` | `showExportDelete = isOwner && !isParentProxy` |
| Delete account | `more/privacy.tsx:149-155` → `/delete-account` | `POST /account/delete` | `apps/api/src/services/deletion.ts:22` `scheduleDeletion` + Inngest `app/account.deletion-scheduled` | `isOwner` (Redirect if not owner at delete-account.tsx:167) |
| Cancel deletion | `delete-account.tsx:119-130` | `POST /account/cancel-deletion` | `apps/api/src/services/deletion.ts:109` `cancelDeletion` | `isOwner` |
| Check deletion status | `delete-account.tsx` (on load) | `GET /account/deletion-status` | `apps/api/src/services/deletion.ts:146` `getDeletionStatus` | All authenticated |
| View Privacy Policy | `more/privacy.tsx:129-133` → `/privacy` | No API | Static screen | All |
| View Terms of Service | `more/privacy.tsx:134-137` → `/terms` | No API | Static screen | All |
| Set withdrawal-archive preference | `more/privacy.tsx:98-128` | `PUT /settings/withdrawal-archive` | `apps/api/src/services/settings.ts:326` | `isOwner && hasLinkedChildren` (UI); `assertOwnerProfile` (API at `routes/settings.ts:165`) |

### Notifications

| Task | UI entry | API route | Backend service (file:line) | Gating |
|---|---|---|---|---|
| Toggle push notifications | `more/notifications.tsx:134-142` | `PUT /settings/notifications` | `apps/api/src/services/settings.ts:108` `upsertNotificationPrefs` | All profiles |
| Toggle weekly progress push | `more/notifications.tsx:143-151` | same | same | All profiles |
| Toggle weekly progress email | `more/notifications.tsx:152-161` | same | same | All profiles |
| Toggle monthly progress email | `more/notifications.tsx:162-172` | same | same | All profiles |
| Register push token | Background on app launch | `POST /settings/push-token` | `apps/api/src/services/settings.ts:465` `registerPushToken` | `assertNotProxyMode` |

**Note:** `reviewReminders` and `dailyReminders` fields exist in `notification_preferences` and are passed through in every mutation but are NOT exposed in the UI (no toggle rendered for them — `more/notifications.tsx` renders only 4 toggles).

### Learning Preferences (Accommodation)

| Task | UI entry | API route | Backend (file:line) | Gating |
|---|---|---|---|---|
| View current accommodation mode | `more/learning-preferences.tsx:86-90` | `GET /learner-profile` | `apps/api/src/services/learner-profile.ts` | All |
| Change own accommodation mode | `more/accommodation.tsx:82-107` | `PATCH /learner-profile/accommodation-mode` | `apps/api/src/services/learner-profile.ts:1930` `updateAccommodationMode` | `!isParentProxy` |
| Change child's accommodation mode | `more/accommodation.tsx?childProfileId=` | `PATCH /learner-profile/:profileId/accommodation-mode` | same, `routes/learner-profile.ts:449-471` | `isOwner && hasFamilyLink && childConsent active` |

### Celebrations

| Task | UI entry | API route | Backend (file:line) | Gating |
|---|---|---|---|---|
| Change own celebration level | `more/celebrations.tsx:90-98` | `PUT /settings/celebration-level` | `apps/api/src/services/settings.ts:267` `upsertCelebrationLevel` | All profiles |
| Change child's celebration level | `more/celebrations.tsx?childProfileId=` | `PUT /settings/celebration-level` (with `childProfileId`) | `apps/api/src/services/settings.ts:290` `upsertChildCelebrationLevel` | `isOwner && moreScreenChildEditorGate` |

### Family Settings

| Task | UI entry | API route | Backend (file:line) | Gating |
|---|---|---|---|---|
| Toggle family pool breakdown sharing | `more/index.tsx:184-209` (Switch) | `PUT /settings/family-pool-breakdown-sharing` | `apps/api/src/services/settings.ts:387` `upsertFamilyPoolBreakdownSharing` | `isOwner && hasLinkedChildren` |
| Add child profile | `more/index.tsx:160-176` | `POST /profiles` (create-profile flow) | `apps/api/src/services/profile.ts` | `showAddChild gate` |

### Help & Feedback

| Task | UI entry | API route | Backend (file:line) | Gating |
|---|---|---|---|---|
| Contact support (email) | `more/help.tsx:15-26` | `mailto:` Linking | None | All |
| Report a problem | `more/help.tsx:43-47` → FeedbackSheet | `POST /feedback` | `apps/api/src/routes/feedback.ts:66` → `sendEmail` + optional `app/feedback.delivery_failed` Inngest | All; rate-limited 5/hour/user |

### Sign Out

| Task | UI entry | API route | Gating |
|---|---|---|---|
| Sign out | `more/index.tsx:231-284` | Clerk `signOut` + `signOutWithCleanup` (clears SecureStore + QueryClient) | `!isImpersonating` |

---

## Navigation depth map

Depth is measured as taps from the "More" tab root (tab = depth 0).

| Depth | Screen | Route |
|---|---|---|
| 0 | More index | `/(app)/more` |
| 1 | Account | `/(app)/more/account` |
| 1 | Notifications | `/(app)/more/notifications` |
| 1 | Privacy & Data | `/(app)/more/privacy` |
| 1 | Help | `/(app)/more/help` |
| 1 | Learning Preferences hub | `/(app)/more/learning-preferences` |
| **2** | **Account → Security Sessions** | `/(app)/more/security-sessions` |
| **2** | **Account → Subscription** | `/(app)/subscription` |
| **2** | **Account → Profile/Rename** | `/profiles` |
| **2** | **Privacy → Delete Account** | `/delete-account` |
| **2** | **Privacy → Privacy Policy** | `/privacy` |
| **2** | **Privacy → Terms** | `/terms` |
| **2** | **Learning Preferences → Accommodation** | `/(app)/more/accommodation` |
| **3** | **Learning Prefs → Accommodation → Celebrations** | `/(app)/more/celebrations` |
| **2** | **More index → Mentor Memory** | `/(app)/mentor-memory` |
| **3+** | **Account → inline password/email forms** | (inline expand in account.tsx, no separate route) |

**Flags at depth > 2:**
- Celebrations is reached via: More → Learning Preferences → Accommodation → (link inside selected option) → Celebrations. **4 taps from tab root** (More tab press → index → learning-preferences → accommodation → celebrations). This is the deepest path in the domain.
- The Account screen contains three expandable inline security forms (Change Password, Add Password, Change Email). Each expands in-place (no navigation push), adding 1 interaction step before form interaction — effectively at depth 2, but users may not discover them without scrolling.
- "Mentor Language" row on More index links to `/(app)/more/account` — this is a duplicate entry point; Account is already reachable from "Account" row directly. The Mentor Language row is labelled as such but opens the full Account screen, where language is the second row.

---

## Backend processes & data model

### API routes

| Route | Method | Service | Table(s) written |
|---|---|---|---|
| `/settings/notifications` | GET | `getNotificationPrefs` | — |
| `/settings/notifications` | PUT | `upsertNotificationPrefs` | `notification_preferences` |
| `/settings/celebration-level` | GET | `getCelebrationLevel` / `getChildCelebrationLevel` | — |
| `/settings/celebration-level` | PUT | `upsertCelebrationLevel` / `upsertChildCelebrationLevel` | `learning_modes` / `learning_profiles` |
| `/settings/withdrawal-archive` | GET | `getWithdrawalArchivePreference` | — |
| `/settings/withdrawal-archive` | PUT | `upsertWithdrawalArchivePreference` | `withdrawal_archive_preferences` |
| `/settings/family-pool-breakdown-sharing` | GET | `getOwnedFamilyPoolBreakdownSharing` | — |
| `/settings/family-pool-breakdown-sharing` | PUT | `upsertFamilyPoolBreakdownSharing` | `family_preferences` |
| `/settings/push-token` | POST | `registerPushToken` | `notification_preferences.expo_push_token` |
| `/settings/notify-parent-subscribe` | POST | `notifyParentToSubscribe` | `notification_log` (rate limit) |
| `/settings/subjects/:subjectId/analogy-domain` | GET/PUT | `getAnalogyDomain` / `setAnalogyDomain` | `retention_data` or similar |
| `/settings/subjects/:subjectId/native-language` | GET/PUT | `getNativeLanguage` / `setNativeLanguage` | `retention_data` or similar |
| `/account/deletion-status` | GET | `getDeletionStatus` | — |
| `/account/delete` | POST | `scheduleDeletion` + `inngest.send` core-send | `accounts.deletion_scheduled_at` + Inngest |
| `/account/cancel-deletion` | POST | `cancelDeletion` | `accounts.deletion_cancelled_at` |
| `/account/export` | GET | `generateExport` | — (reads 20+ tables) |
| `/account/email` | PATCH | `updateAccountEmailFromClerk` | `accounts.email` |
| `/feedback` | POST | `sendEmail` + optional `safeSend(feedback.delivery_failed)` | None (email only) |
| `/learner-profile/accommodation-mode` | PATCH | `updateAccommodationMode` | `learning_profiles.accommodation_mode` |
| `/learner-profile/:profileId/accommodation-mode` | PATCH | `updateAccommodationMode` (child) | same |

### Inngest background processes triggered from this domain

| Event | Inngest function | Trigger source (file:line) | Purpose |
|---|---|---|---|
| `app/account.deletion-scheduled` | `scheduledDeletion` (`account-deletion.ts`) | `routes/account.ts:101` (core-send) | Wait 7 days, then delete all account + profile data + Clerk user |
| `app/feedback.delivery_failed` | `feedbackDeliveryFailed` | `routes/feedback.ts:126` (safeSend) | Retry failed feedback email deliveries |

### DB tables primarily owned by this domain

| Table | Owner feature |
|---|---|
| `notification_preferences` | Notifications settings, push token |
| `learning_modes` | Celebration level (self), median response seconds |
| `learning_profiles.celebration_level` | Child celebration level (parent-controlled) |
| `learning_profiles.accommodation_mode` | Accommodation mode |
| `withdrawal_archive_preferences` | Consent-withdrawal child archive preference |
| `family_preferences.pool_breakdown_shared` | Family usage breakdown sharing |
| `accounts.deletion_scheduled_at`, `deletion_cancelled_at` | Account deletion lifecycle |

### Clerk (non-API) operations in this domain

- `user.updatePassword` — change/add password (`change-password.tsx`, `add-password.tsx`)
- `user.createEmailAddress` + `email.prepareVerification` + `email.attemptVerification` + `user.update` (setPrimaryEmail) + `oldEmail.destroy` — email change (`change-email.tsx`)
- `user.getSessions` — list devices (`security-sessions.tsx`)
- `session.revoke` — revoke device (`security-sessions.tsx`)
- `signOut` (via `signOutWithCleanup`) — sign out (`more/index.tsx`, `delete-account.tsx`)

---

## Complexity signals & redesign notes

### Deep nesting / hard-to-find features

1. **Celebrations is 4 taps deep** (More → Learning Prefs → Accommodation → inline link inside a selected mode option → Celebrations). This is the most buried feature: it only becomes visible as a sub-link _inside_ a selected accommodation mode card. Users who picked `short-burst` or `predictable` never discover there is a sub-setting unless they re-open the accommodation screen.

2. **Accommodation is itself behind an intermediate screen** (Learning Preferences → Accommodation). The Learning Preferences screen shows only the current value and a link. It is a pure intermediary with no controls of its own. This adds a redundant hop.

3. **Security controls are inline-expanded inside Account** (change password, change email, manage devices). They look like rows but expand in-place rather than navigating. "Manage Devices" breaks this pattern by pushing to a separate screen. The inconsistency will confuse users expecting all three to behave the same way.

4. **Two rows on More index lead to Account** (`more-row-account` and `more-row-mentor-language`). Both push `/(app)/more/account`. The second row's label ("Mentor language") implies it goes somewhere different, but it opens the entire Account screen and requires scrolling to find the language picker.

5. **Profile rename** is at depth 2 (`/profiles`) accessed from Account. It is non-obvious that changing your name lives inside Account → Profile row → /profiles, not in a dedicated "Edit profile" screen.

### Modal-on-modal / compound gestures

6. **Language picker is a modal-inside-a-screen** (`account.tsx:109-179`). When the user opens the Account screen and taps App Language, a bottom-sheet modal overlays the stack-screen. This works but adds implementation complexity and a visual layer that differs from the simple inline-expand pattern used for security rows.

7. **Delete account is a 3-stage flow** on a single screen (`delete-account.tsx`). Stage transitions are in-screen state. This is reasonable UX practice (progressive disclosure for a destructive action) but means the confirmation input at stage 2 is never indexed by accessibility scanners looking for text fields in a "settings" context.

### Owner-gated features hidden in otherwise shared screens

8. **Privacy screen is split**: non-owners see Privacy Policy + Terms of Service; owners additionally see Export and Delete. The screen has no visual indication of which rows are owner-only until they are rendered. A non-owner using the app sees a suspiciously thin Privacy screen and may conclude there is no data export.

9. **Account screen is split similarly**: non-owners see profile name link only; owners also see security controls + billing. The security section appears to all owners regardless of whether they signed in with SSO or email — the Add Password vs Change Password branch is entirely invisible from the outside.

10. **Withdrawal archive preference** (`more/privacy.tsx:98-128`) appears only when `isOwner && hasLinkedChildren`. This is a parent-only preference about what happens to child data if consent is withdrawn. It is placed inside the Privacy screen alongside ToS/PP links and data export, making its audience and purpose difficult to infer.

### Features never exposed / only backend-wired

11. **`reviewReminders` and `dailyReminders`** are stored in `notification_preferences` and passed in every notification mutation (`notifications.tsx:29-30`) but have no UI toggles. They exist in the DB contract and API but users cannot change them from the app. This is invisible backlog.

12. **`/settings/subjects/:subjectId/analogy-domain`** and **`/settings/subjects/:subjectId/native-language`** are wired in `use-settings.ts` and `routes/settings.ts` but the `native-language` route is not used by any screen (the subject detail screen uses `useAnalogyDomain` but not `useNativeLanguage`). The API exists; the mobile surface does not.

13. **2FA was commented out** in `account-security.tsx:52-55` with a note that the original implementation conflated email verification with TOTP. No UI surface for 2FA exists.

### Redundancy

14. **Celebrations and accommodation are sibling preferences** logically, but are split across two separate sub-screens under "Learning Preferences". The only connection is a hard-to-find inline link in accommodation. In a flat redesign they are a single preference group.

15. **More index has a three-way split** into learning-preferences/accommodation/celebrations (user-facing tutor config), account/notifications/security (account management), and privacy/help (compliance + support). These groups reflect backend service boundaries more than user mental models.

### Proxy-mode lockout

16. **When `isParentProxy` (parent viewing as child), the entire More screen is replaced** with a warning card (`more/index.tsx:83-111`). No settings at all are accessible in proxy mode, including notifications. This is correct security behaviour but means a parent cannot toggle notifications on behalf of a child.

---

## Overlaps with other domains

| Feature | This domain (Settings/Account/Privacy) | Other domain |
|---|---|---|
| Accommodation mode | `more/accommodation.tsx` (self + child) | Also reachable via `/(app)/child/[profileId]/index.tsx?mode=settings` (Parent family domain). Two separate entry points for the same write. `child/[profileId]/index.tsx:1064` pushes the same `/(app)/more/accommodation?childProfileId=` route. |
| Celebration level | `more/celebrations.tsx` (self + child) | Also configurable via child settings panel in `child/[profileId]/index.tsx` (via same route with `?childProfileId=`). |
| Mentor memory | `/(app)/mentor-memory` linked from More index | Also accessible mid-session via session UI (session domain) and from the progress tab. |
| Profile name | `/profiles` (via Account) | Also linked from parent-family domain child management. |
| Subscription / billing | `/(app)/subscription` (via Account, owner-gated) | Billing domain. Entry from More → Account → Subscription. Subscription is also surfaced from paywalls mid-flow (learning-session domain). |
| Notifications preferences | `more/notifications.tsx` | Notification settings also written by the system when push tokens are registered on app launch (background, not user-visible). |
| Privacy policy / terms | `/privacy`, `/terms` (linked from more/privacy.tsx) | Also linked from onboarding flows (consent domain). Static content is duplicated in two contexts. |
| Family pool breakdown sharing | `more/index.tsx` (owner-gated toggle) | Progress domain: affects whether progress tab shows combined vs per-profile quota view. |
| Child consent-withdrawal archive | `more/privacy.tsx` | Also affects consent-revocation Inngest flow (consent domain). |
| Data export | `more/privacy.tsx` | Reads from essentially all tables — touches session, billing, assessment, streaks, retention, and profile domains. |
| Account deletion | `/delete-account` | Deletion Inngest function (`account-deletion.ts`) cascades through ALL data — cross-domain but orchestrated from this domain. |
| Sign-out | `more/index.tsx` | `signOutWithCleanup` clears query cache (TanStack Query) and SecureStore keys that span session, billing, and profile domains. |
