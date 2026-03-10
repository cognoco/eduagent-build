# E2E Test Results — Dev-Client on Android Emulator

**Date:** 2026-03-08 (updated 2026-03-09)
**Environment:** Windows 11 + WHPX emulator (New_Device, API 34, 1080x1920)
**Build:** Dev-client APK built in WSL2 with expo-dev-client@~6.0.20
**Metro:** Windows, `unstable_serverRoot: monorepoRoot`, bundle proxy on port 8082
**Runtime:** exposdk:54.0.0

---

## Test Results Summary

### Session 1 (2026-03-08) — Auth Flows (Pre-Auth)

| # | Flow | Status | Steps | Notes |
|---|------|--------|-------|-------|
| 1 | `app-launch-devclient.yaml` | PASS | 8 | Dev-client launcher → server connect → bundle load → sign-in verified |
| 2 | `auth/sign-in-navigation-devclient.yaml` | PASS | 31 | All 3 auth screens + round-trip navigation verified |
| 3 | `auth/forgot-password-devclient.yaml` | PASS | 19 | Forgot-password screen, email entry, submit, back to sign-in |
| 4 | `auth/sign-in-validation-devclient.yaml` | PASS | 22 | Empty submit, email-only submit, password toggle (testID found), sign-up link |
| 5 | `auth/sign-up-screen-devclient.yaml` | PASS | 25 | SSO buttons, form fields, password requirements, Terms/Privacy, scroll to bottom |

**Session 1 total: 5 flows, 105 assertions, all PASS**

### Session 2 (2026-03-09) — Bundle Proxy Re-test

Re-ran all dev-client test flows through the bundle proxy (port 8082). Flows 2-5 confirmed passing.
Bundle proxy required because BUG-7 (OkHttp chunked encoding error) became 100% reproducible.

### Session 3 (2026-03-09) — Comprehensive Post-Auth Flow

| # | Flow | Status | Steps | Notes |
|---|------|--------|-------|-------|
| 6 | `post-auth-comprehensive-devclient.yaml` | PASS | 65 | Full post-auth E2E: sign-in → home → More tab → sub-screens → themes → parent redirect |

**Details:**

| Phase | What was tested | Steps | Notes |
|-------|----------------|-------|-------|
| 1. Sign In | Dev-client launcher → Clerk auth (CAPTCHA bypass, PATCH password) | 15 | Seeded user `test-e2e@example.com` / `Mentomate2026xK` |
| 2. Home Screen | ScrollView, subjects, coaching card, add-subject button | 8 | `retention-strip` not visible (WARNED, optional) |
| 3. More Tab | Appearance (3 themes), Notifications (2 toggles), Learning Mode (2 options), Account (7 items) | 20 | Full scroll-through with screenshots |
| 4. Sub-Screens | Privacy Policy, Terms of Service — navigate in + BACK | 8 | Both screens load and return correctly |
| 5. Theme Switching | Eager Learner ↔ Teen (inline), Parent → dashboard redirect → switch back | 14 | Parent theme triggers `(learner)/_layout.tsx` routing guard (BUG-12) |

**Clerk auth for E2E:** Seed endpoint creates real Clerk user with `bypass_client_trust: true` (CAPTCHA bypass). Password set via PATCH (POST has encoding bug for special chars — Issue 12).

**Test user:** `test-e2e@example.com` / `Mentomate2026xK` (scenario: `learning-active`)

### Session 3 (continued) — Seed-and-Sign-In Setup Flow

| # | Flow | Status | Steps | Notes |
|---|------|--------|-------|-------|
| — | `_setup/seed-and-sign-in.yaml` | BLOCKED | — | `__maestro` undefined in GraalJS sub-flow (Issue 13) |

**What was tried:**
- Updated `seed-and-sign-in.yaml` with dev-client launcher handling, keyboard dismiss, dynamic password
- Updated `seed.js` to export `output.password`, fixed default email
- Made seed API idempotent (find-or-create Clerk user, delete DB data before re-seed)
- Seed API verified working via `curl` — returns `{ email, password, accountId, profileId, ids }`
- Maestro `runScript` with `env` block: `__maestro` object is `undefined` in GraalJS when script runs inside `runFlow` sub-flow
- Maestro `outputVariable` property: not recognized by Maestro 2.2.0

**Impact:** 38 flows that depend on `seed-and-sign-in.yaml` remain blocked by Issue 13.

### Session 4 (2026-03-09) — Infrastructure Fixes + Flow Expansion

**Major fixes applied (2 commits: `08abeaa`, `6356e2c`):**

| Fix | What | Files |
|-----|------|-------|
| appId unification | `com.zwizzly.eduagent` → `com.mentomate.app` | 5 YAML files |
| coaching-card-primary testID | Unified `AdaptiveEntryCard` testID so both personas produce `coaching-card-primary` | `AdaptiveEntryCard.tsx` + test |
| tabBarTestID | Added `tab-home`, `tab-book`, `tab-more` to learner + parent layouts | 2 `_layout.tsx` files |
| "Ready to learn" removal | Replaced non-existent text with `id: "home-scroll-view"` | 22 YAML files |
| sign-out.yaml fix | Replaced non-existent `more-settings` with `sign-out-button` + `tab-more` | 1 YAML file |
| New seed scenarios | Added `trial-expired-child`, `consent-withdrawn`, `parent-solo` | `test-seed.ts` + test |

**13 new Maestro flows added:**

| Team | Flow | Category | Seed Scenario |
|------|------|----------|---------------|
| A | `account/more-tab-navigation.yaml` | Account | `onboarding-complete` |
| A | `account/settings-toggles.yaml` | Account | `onboarding-complete` |
| A | `onboarding/create-profile-standalone.yaml` | Onboarding | `onboarding-complete` |
| B | `billing/subscription-details.yaml` | Billing | `trial-active` |
| B | `billing/child-paywall.yaml` | Billing | `trial-expired-child` |
| B | `consent/post-approval-landing.yaml` | Consent | `onboarding-complete` (inline) |
| B | `consent/consent-withdrawn-gate.yaml` | Consent | `consent-withdrawn` (inline) |
| B | `consent/coppa-flow.yaml` | Consent | None (fresh sign-up) |
| C | `learning/freeform-session.yaml` | Learning | `learning-active` |
| C | `homework/homework-from-entry-card.yaml` | Homework | `homework-ready` |
| C | `parent/parent-learning-book.yaml` | Parent | `parent-with-children` |
| C | `parent/demo-dashboard.yaml` | Parent | `parent-solo` |
| C | `edge/empty-first-user.yaml` | Edge | `onboarding-complete` |

**Re-ran all 5 dev-client auth flows — all PASS:**

| # | Flow | Status | Steps | Notes |
|---|------|--------|-------|-------|
| 1 | `app-launch-devclient.yaml` | PASS | 8 | Cold launch, dev menu dismiss, sign-in verified |
| 2 | `auth/sign-in-navigation-devclient.yaml` | PASS | 33 | All 3 auth screens + round-trip nav |
| 3 | `auth/sign-in-validation-devclient.yaml` | PASS | 22 | Empty submit, password toggle, sign-up link |
| 4 | `auth/sign-up-screen-devclient.yaml` | PASS | 25 | SSO, form fields, password reqs, Terms/Privacy |
| 5 | `auth/forgot-password-devclient.yaml` | PASS | 19 | Email entry, submit, back to sign-in |

### Session 4 (continued) — Production Auth Flows Fixed

The 3 production auth flows (`app-launch.yaml`, `sign-in-navigation.yaml`, `forgot-password.yaml`) originally failed because they used `launchApp: clearState: true` + direct "Welcome back" wait, but the installed build is a dev-client APK which boots to the Expo dev launcher first.

**Fix:** Replaced inline `launchApp` + wait with `runFlow: _setup/launch-devclient.yaml` in all 3 flows. Also fixed `forgot-password.yaml` keyboard dismiss — `hideKeyboard` exited the app (BUG-5), replaced with tap-on-heading pattern.

| # | Flow | Status | Steps | Notes |
|---|------|--------|-------|-------|
| 8 | `app-launch.yaml` | PASS | 8 | Now uses `launch-devclient.yaml` setup |
| 9 | `auth/sign-in-navigation.yaml` | PASS | 40 | All 3 auth screens + round-trip, dev-client launch |
| 10 | `auth/forgot-password.yaml` | PASS | 19 | Tap-heading keyboard dismiss (BUG-3/5 workaround) |

**Keyboard dismiss pattern discovered:** Instead of `hideKeyboard` (sends BACK key — BUG-5 exits app if keyboard already dismissed), tap a non-input element like the screen heading. This defocuses the `TextInput` and naturally dismisses the keyboard.

### Session 5 (2026-03-09 continued, 2026-03-10) — Batch Runs + Infrastructure Hardening

**Major infrastructure changes:**

| Change | What | Why |
|--------|------|-----|
| Batch run (42 flows) | First pass of all untested flows | 3 PASS, 36 FAIL, 2 SKIP |
| Re-run batch (36 flows) | Retry failed flows | 1 PASS (settings-toggles), 35 FAIL (Metro instability) |
| Manual test | parent-tabs | PASS |
| `switch-to-parent.yaml` | New helper: More → "Parent (Light)" → dashboard redirect | Parent flows need persona switch after sign-in |
| 20+ YAML fixes | Fixed consent, standalone, parent, retention, subjects flows | See individual flow sections |
| `seed-and-sign-in.yaml` v2 | Replaced `launchApp` + conditional `when:` with `extendedWaitUntil` | BUG-19 (launchApp fails on WHPX) |
| `seed-and-sign-in.yaml` v3 | Simplified to sign-in only; launcher/bundle handled by `seed-and-run.sh` via ADB | Maestro gRPC driver crashes during bundle loading |
| `seed-and-run.sh` v2 | Full ADB automation: `uiautomator dump` + `input tap` for launcher/Metro/Continue | Bypasses Maestro entirely for resource-intensive phase |
| BUG-20 fix | `hideKeyboard` → tap "Welcome back" heading | "Custom input" error on some Android configs |
| BUG-21 fix | Kill Bluetooth via ADB + `dismiss-bluetooth.yaml` safety net | "Bluetooth keeps stopping" dialog on WHPX |
| BUG-22 fix | Pre-grant notification permission via `adb shell pm grant` | POST_NOTIFICATIONS dialog blocks UI after sign-in |
| `--reinstall-driver` | Maestro driver reinstall needed after emulator restart | gRPC connection reset after cold boot |

**Newly confirmed PASSING (Session 5):**

| # | Flow | Status | Steps | Notes |
|---|------|--------|-------|-------|
| 14 | `account/settings-toggles.yaml` | PASS | 40+ | Full theme/accent/notification/learning-mode cycle, parent redirect + return |

**Infrastructure verification results:**
- `seed-and-sign-in.yaml` v3 + `seed-and-run.sh` v2 = stable sign-in pipeline
- Launcher detection: `extendedWaitUntil: "DEVELOPMENT SERVERS"` (120s timeout for cold boot)
- Bundle loading: ADB `uiautomator dump` polling (5s intervals, up to 600s)
- "Continue" dismissal: `KEYCODE_BACK` (resolution-independent, more reliable than coordinate tap)
- Keyboard dismissal: tap static heading text (avoids `hideKeyboard` failure)
- Notification permission: pre-granted via `adb shell pm grant` before app launch

### Session 6 (2026-03-10) — Critical API Bug Fix (BUG-25)

**Major fix: `profileScopeMiddleware` auto-resolve owner profile**

During investigation of why ALL seeded data (subjects, streaks, coaching cards) appeared empty on the home screen, discovered that `profileScopeMiddleware` was not setting `profileId` when the `X-Profile-Id` header was absent. All 52 route handlers fell back to `account.id` (which is never a valid profileId), causing scoped queries to return empty results.

| Change | What | Files |
|--------|------|-------|
| `findOwnerProfile` service | New function: finds owner profile for an account | `services/profile.ts` |
| Middleware auto-resolve | When `X-Profile-Id` absent, resolve to owner profile | `middleware/profile-scope.ts` |
| Debug endpoints | `GET /__test/debug/:email`, `GET /__test/debug-subjects/:clerkUserId` | `routes/test-seed.ts` |
| `tabBarButtonTestID` fix | Correct prop name for Expo Router tab test IDs | `(learner)/_layout.tsx`, `(parent)/_layout.tsx` |

**Tests:** All 326 related API tests pass. TypeScript compilation clean.

**Impact:** Unblocks ~30 E2E flows that depend on seeded subjects/sessions/retention data.

**Needs emulator verification:** The fix is server-side (API middleware). Next step is to restart Metro + API dev server and re-run the seeded flows to confirm subjects appear on the home screen.

### Cumulative Totals (as of Session 6)

| Category | Flows | Status |
|----------|-------|--------|
| Pre-auth (all variants, standalone) | 8 | **All PASS** |
| Post-auth (comprehensive, hardcoded creds) | 1 | **PASS** (65 steps) |
| Quick-check / misc | 1 | **PASS** (simple screenshot) |
| Seed-dependent (seeded flows, confirmed) | 5 | **PASS** (account-lifecycle, delete-account, parent-dashboard, settings-toggles, parent-tabs) |
| Seed-dependent (YAML fixed, BUG-25 fixed) | 35 | **Ready to test** — API bug fixed, needs emulator verification |
| Standalone (consent/onboarding, YAML fixed) | 5 | **Ready to test** — launch-devclient + env var fixes applied |
| Camera/native | 1 | **SKIP** (emulator has no camera) |
| ExpoGo-only | 1 | **SKIP** (wrong app type — we use dev-client) |
| **Total** | **53** | **16 passing, 35 ready to test, 2 skipped** |

**Flow inventory:** 53 unique test flows + 10 setup helpers = 63 YAML files total.

**Remaining validation plan:** Run 35 flows in batches of 5-6 with Metro restarts between batches (Metro crashes after ~15 consecutive `clearState` + bundle reload cycles). BUG-25 fix should unblock most of the 35 flows.

---

## References

- **Bug details:** See `e2e-test-bugs.md` for all bug entries (BUG-1 through BUG-25) with root causes, fixes, and workarounds.
- **Environment setup:** See `e2e-emulator-issues.md` for emulator configuration, known environment issues, and operational notes.
- **Infrastructure:** See `e2e-tech-spec.md` for flow specifications, seeding architecture, and CI integration.
