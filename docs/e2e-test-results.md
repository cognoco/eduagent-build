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

### Cumulative Totals (as of Session 5)

| Category | Flows | Status |
|----------|-------|--------|
| Pre-auth (all variants, standalone) | 8 | **All PASS** |
| Post-auth (comprehensive, hardcoded creds) | 1 | **PASS** (65 steps) |
| Quick-check / misc | 1 | **PASS** (simple screenshot) |
| Seed-dependent (seeded flows, confirmed) | 5 | **PASS** (account-lifecycle, delete-account, parent-dashboard, settings-toggles, parent-tabs) |
| Seed-dependent (YAML fixed, needs validation) | 35 | **Ready to test** — YAML bugs fixed, seed-and-run.sh v2 working |
| Standalone (consent/onboarding, YAML fixed) | 5 | **Ready to test** — launch-devclient + env var fixes applied |
| Camera/native | 1 | **SKIP** (emulator has no camera) |
| ExpoGo-only | 1 | **SKIP** (wrong app type — we use dev-client) |
| **Total** | **53** | **16 passing, 35 ready to test, 2 skipped** |

**Flow inventory:** 53 unique test flows + 10 setup helpers = 63 YAML files total.

**Remaining validation plan:** Run 35 flows in batches of 5-6 with Metro restarts between batches (Metro crashes after ~15 consecutive `clearState` + bundle reload cycles).

---

## Bugs Found

### BUG-1: App viewport/resolution mismatch (visual)

**Severity:** Low-Medium
**What:** The app's content appears slightly narrower than the emulator screen in some views. When the emulator window is resized, text on the right edge gets clipped (e.g., "Show" button truncated to "Sh", "Forgot password?" truncated).
**Observed in:** Sign-in screen when emulator window is not at default size.
**Possible cause:** The app may not be handling edge-to-edge / safe area insets correctly on this particular AVD configuration, or the emulator window scaling doesn't match the virtual display resolution.
**Note:** Does NOT affect Maestro assertions (all testIDs and text elements found correctly). May be emulator-specific and not reproduce on real devices.

### BUG-2: Dev menu appears on every app launch

**Severity:** Low (dev-only, not user-facing)
**What:** When the dev-client loads the bundle, the developer menu overlay appears automatically ("This is the developer menu..."). Must be dismissed with BACK key or "Continue" button before the sign-in screen is fully accessible. Happens on every `launchApp`, not just the first time.
**Expected:** Dev menu should not auto-appear on load (only on shake gesture or Ctrl+M).
**Workaround:** Press BACK key or tap "Continue". The updated `launch-devclient.yaml` handles this automatically.
**Impact on E2E:** The dev menu overlay prevents Maestro from finding elements on the sign-in screen until dismissed. The launch flow now waits for "Continue" (dev menu) and taps it before asserting "Welcome back".

### BUG-3: Keyboard covers form buttons on Android (KeyboardAvoidingView)

**Severity:** Medium
**What:** On Android, the on-screen keyboard covers the sign-in button, sign-up link, forgot-password link, and send-reset-code button after entering text in email or password fields. Users cannot tap submit buttons without first dismissing the keyboard manually.
**Observed in:** Sign-in screen, forgot-password screen (likely all auth screens).
**Root cause:** `sign-in.tsx:106-107` — `KeyboardAvoidingView` has `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`, meaning **Android gets no keyboard avoidance behavior**. The `ScrollView` has `keyboardShouldPersistTaps="handled"` but doesn't scroll to reveal hidden content.
**Fix needed:** Add Android keyboard behavior. Options:
  - `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` on `KeyboardAvoidingView`
  - Or use `android:windowSoftInputMode="adjustResize"` in `app.json` (Expo config)
  - Or use a library like `react-native-keyboard-aware-scroll-view`
**E2E workaround:** All dev-client flows use `hideKeyboard` after `inputText` before tapping buttons.

### BUG-4: Pressable testID not reliably exposed to Maestro on Android

**Severity:** Low (testing infrastructure only)
**What:** The `PasswordInput` component's show/hide toggle `Pressable` has `testID="sign-in-password-toggle"`, but Maestro cannot find it by ID. The toggle IS visible and functional (verified by asserting the "Show" text), but the `testID` on `Pressable` may not map to an accessibility identifier that Maestro can locate on Android.
**Observed in:** `PasswordInput.tsx:48-58` — `<Pressable testID={...}>` toggle button.
**Note:** The `testID` on `TextInput` (e.g., `sign-in-password`) works fine. Only `Pressable` has the issue. This was intermittent — one run found it (COMPLETED), another didn't (WARNED).
**Workaround:** Use text-based assertions (`assertVisible: "Show"`) instead of testID for the toggle.

### BUG-5: Maestro `hideKeyboard` exits app when no keyboard is open (Android)

**Severity:** Low (testing infrastructure only)
**What:** On Android, Maestro's `hideKeyboard` command sends a BACK key event. When the keyboard is NOT actually open, this BACK event navigates the app backward — potentially exiting the app entirely to the Android home screen.
**Impact:** Any E2E flow that calls `hideKeyboard` without a preceding text input (or after the keyboard was already dismissed) will break by navigating away from the expected screen.
**Workaround:** Never call `hideKeyboard` unless text was just entered. Never call it twice in a row. Document this in all flows with a comment.

### BUG-7: OkHttp chunked encoding error blocks bundle download (Windows)

**Severity:** High (blocks all E2E testing without workaround)
**What:** Metro on Windows sends multipart/chunked HTTP responses for bundle downloads. OkHttp's `MultipartStreamReader` fails to parse the chunked transfer encoding with:
```
java.net.ProtocolException: Expected leading [0-9a-fA-F] character but was 0xd
```
The `0xd` byte is a carriage return (`\r`). The error occurs in `Http1ExchangeCodec$ChunkedSource.readChunkSize()` when reading the chunk-size line of a chunked transfer-encoded response.
**Observed in:** Every bundle download attempt from Metro on Windows to the Android emulator via the dev-client's `BundleDownloader.kt`. 100% reproducible after Metro restart.
**Root cause:** Metro's multipart streaming response (used for progress updates during bundling) contains chunked transfer encoding that OkHttp cannot parse. The dev-client sends `Accept: multipart/mixed` (line 88 of `BundleDownloader.kt`), which triggers Metro's multipart response mode. The issue is specific to Metro running on Windows — `curl` from the host fetches the bundle correctly, but the emulator's OkHttp client fails.
**Workaround:** A Node.js proxy (`e2e/bundle-proxy.js`) that strips the `Accept: multipart/mixed` header, causing Metro to respond with a plain (non-multipart) bundle. The proxy listens on port 8082, forwards to Metro on 8081. Configure `adb reverse tcp:8082 tcp:8082` and connect the dev-client to `http://10.0.2.2:8082`.
**Impact on E2E:** Without the proxy, the app shows "Bundling 100.0%" indefinitely — the bundle download fails silently and the app never loads. With the proxy, bundle loading works reliably.

### BUG-8: Dev-client launcher text not in Maestro accessibility tree

**Severity:** Low (testing infrastructure only)
**What:** When the app is launched manually via `adb shell am start`, Maestro's `hierarchy` command shows no text elements from the dev-client launcher (e.g., "http://10.0.2.2:8081" is not found). However, when launched via Maestro's own `launchApp` command, the same text IS visible and tappable.
**Root cause:** Maestro's `launchApp` performs additional accessibility setup beyond `adb am start`. Without this setup, the dev-client launcher's React Native views don't expose their text to Maestro's accessibility queries.
**Workaround:** Always use Maestro's `launchApp` command, not manual `adb shell am start`, when Maestro needs to interact with the launcher.

### BUG-9: Sign-up screen "Already have an account?" text includes trailing space

**Severity:** Low (testing only)
**What:** The JSX `Already have an account?{' '}` renders with a trailing space that becomes part of the accessibility text (`"Already have an account? "`). Maestro's exact text matching fails if the assertion doesn't include the trailing space.
**Root cause:** React Native's `<Text>` component concatenates `{' '}` spacers into the parent text node's value, which is then exposed to accessibility.
**Workaround:** Include the trailing space in Maestro assertions: `assertVisible: "Already have an account? "`.

### BUG-6: Stale `appId` in multiple flow files — FIXED

**Severity:** Low (test file only)
**What:** Five flow files used `appId: com.zwizzly.eduagent` instead of the correct `appId: com.mentomate.app`: `seed-and-sign-in.yaml`, `sign-out.yaml`, `first-session.yaml`, `core-learning.yaml`, `recall-review.yaml`.
**Fix:** All updated to `com.mentomate.app` in commit `08abeaa`. Zero occurrences of the old appId remain.

### BUG-10: Hidden Expo Router tabs render in dev-client tab bar

**Severity:** Medium (E2E testing only, not user-facing in production)
**What:** Expo Router tabs with `href: null` (hidden from tab bar) still render as visible tabs in dev-client builds. All tab labels truncate: "Home" → "Ho...", "Learning Book" → "boo...", "More" stays readable. Hidden screens like onboarding, session, topic show as "onb...", "ses..." etc.
**Impact:** Point-based and text-based tab taps are unreliable. "Ho..." is ambiguous, and extra tabs shift positions.
**Workaround:** Navigate using explicit routes or use "More" tab (short enough to not truncate). Avoid tapping "Home" or "Learning Book" tabs in E2E.
**Note:** Production builds correctly hide tabs with `href: null`.

### BUG-11: Maestro text recognition fails during NativeWind theme transitions

**Severity:** Low (E2E testing only)
**What:** After switching themes on the More screen, Maestro's `tapOn` for the next theme option fails with "element not found" even though the text is visually present.
**Root cause:** `setPersona()` triggers a full React tree re-render with new CSS variables. The accessibility tree is briefly unstable during this transition.
**Workaround:** Add `extendedWaitUntil` with a text assertion between theme switches.

### BUG-12: Parent theme switch redirects away from More screen

**Severity:** Expected behavior (not a bug — documenting for E2E awareness)
**What:** Selecting "Parent (Light)" on the More screen triggers `<Redirect href="/(parent)/dashboard" />` in `(learner)/_layout.tsx:575`. The user lands on the parent dashboard, not the More screen.
**Root cause:** Each persona has its own route group with a layout guard. Changing persona to `parent` while in the `(learner)` route group triggers the cross-redirect.
**Impact on E2E:** Cannot test "switch to Parent and back" as a simple toggle. Flow must handle the redirect.
**Workaround:** Use `testID="switch-to-teen"` on the parent dashboard's demo link to navigate back.

---

## Proposals

### P-1: Dev-client E2E launcher flow (DONE)

Created `e2e/flows/_setup/launch-devclient.yaml` — reusable setup flow that handles:
1. Launch app (without clearing state — dev-client remembers the last server)
2. (Optional) Wait for dev-client launcher and tap Metro server entry
3. (Optional) Wait for and dismiss dev menu overlay
4. Wait for sign-in screen ("Welcome back")
5. Handles both first-launch and cached-launch scenarios

All dev-client E2E flows should use `runFlow: _setup/launch-devclient.yaml` which handles dev-client launcher, dev menu overlay, and state reset via `clearState: true`.

### P-2: Existing flows need dev-client variants (PARTIAL)

The committed E2E flows use `launchApp: clearState: true` which resets the dev-client back to its launcher, losing the stored server connection. Created variants:
- `auth/sign-in-navigation-devclient.yaml` — auth screen navigation
- `auth/forgot-password-devclient.yaml` — forgot password flow
- `auth/sign-in-validation-devclient.yaml` — form validation edge cases
- `auth/sign-up-screen-devclient.yaml` — sign-up screen rendering + password requirements

Remaining flows (behind auth gate) need API + seed data to test.

### P-3: Increase timeouts for WHPX emulator

All existing flow timeouts (5-15s) are insufficient for the WHPX emulator. For dev-client testing on WHPX:
- Initial bundle load: 300s (5 min)
- Screen transitions: 15-30s (vs. 5s default)
- Element visibility: 10-15s (vs. 5s default)

### P-4: Fix KeyboardAvoidingView on Android (BUG-3)

The `behavior={undefined}` on Android in all auth screens should be changed. This is a real user-facing UX bug — users would need to manually dismiss the keyboard to reach submit buttons. Priority: Medium (should be fixed before release).

### P-6: Bundle proxy for Windows E2E testing (DONE)

Created `e2e/bundle-proxy.js` — a Node.js proxy that strips multipart/chunked encoding from Metro's responses, working around BUG-7. Usage:
1. Start Metro: `pnpm exec expo start`
2. Start proxy: `node e2e/bundle-proxy.js` (listens on port 8082)
3. Forward port: `adb reverse tcp:8082 tcp:8082`
4. In dev-client launcher, add server `http://10.0.2.2:8082`
5. Connect — bundle loads reliably without chunked encoding errors

The proxy is only needed on Windows. On macOS/Linux, Metro's multipart responses work correctly with OkHttp.

### P-5: Add `hideKeyboard` guidelines to E2E conventions

Document the BUG-5 behavior in a conventions file:
- Always call `hideKeyboard` only after `inputText`
- Never call `hideKeyboard` twice consecutively
- Never call `hideKeyboard` at the start of a flow (use BACK key via adb instead if needed)
- Consider the flow's state — if keyboard might already be dismissed, skip `hideKeyboard`

---

## Environment Notes

- **Maestro taps work** — Maestro's UI automation engine reliably taps elements by ID/text, unlike `adb shell input tap` which is unreliable on slow WHPX emulator
- **BACK key works** — `adb shell input keyevent KEYCODE_BACK` is reliable for dismissing dialogs and keyboard
- **Bundle caching** — After first load, subsequent launches are much faster (~30s vs. 3-5 min) due to Hermes bytecode cache. However, `launchApp` in Maestro can trigger a full reload
- **Maestro debug artifacts** saved at `C:\Users\<your-username>\.maestro\tests\<timestamp>\`
- **Screenshot PNGs** — Maestro saves screenshots in the flow's working directory (project root). These should be `.gitignore`d
- **State persistence** — React state (typed email/password) persists between Maestro flows within the same app session. Flows should not assume clean fields
- **Dev menu timing** — The dev menu overlay appears during/after bundle load and blocks Maestro element queries. The `launch-devclient.yaml` flow handles this by waiting for "Continue" button
- **Bundle proxy** — Required on Windows due to BUG-7 (OkHttp chunked encoding error). Start `node e2e/bundle-proxy.js` on port 8082, connect dev-client to `http://10.0.2.2:8082`. Without the proxy, bundle downloads fail 100% of the time.
- **Maestro `launchApp` required** — For Maestro to see dev-client launcher text, the app must be launched via Maestro's `launchApp`, not `adb shell am start` (BUG-8). Use `launchApp` in setup flows.
- **Trailing spaces in JSX** — React Native `{' '}` spacers become part of the accessibility text. Maestro assertions must include them (BUG-9).
- **Sign-up screen scroll** — The sign-up screen's "Already have an account?" link is below the fold. E2E flows must `scroll` before asserting bottom elements.
- **TEMP/TMP override** — Maestro on Windows requires `TEMP=C:/tools/tmp TMP=C:/tools/tmp` to avoid Unicode path issues with jansi native library (Windows username contains `č`).
