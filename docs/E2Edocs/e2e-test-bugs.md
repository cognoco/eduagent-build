# E2E Test Bugs

Bugs discovered during Maestro E2E testing on Android emulator (WHPX).
Each bug has a status, root cause, and fix/workaround.

---

## BUG-1: App Viewport / Resolution Mismatch (2026-03-08)

**Status:** Open (emulator-specific, likely not user-facing)
**Severity:** Low
**Affects:** All screens (visual only)

The app's content appears slightly narrower than the emulator screen in some views. When the emulator window is resized, text on the right edge gets clipped (e.g., "Show" button truncated to "Sh", "Forgot password?" truncated).

**Root cause:** The app may not be handling edge-to-edge / safe area insets correctly on this AVD configuration, or the emulator window scaling doesn't match the virtual display resolution.

**Note:** Does NOT affect Maestro assertions (all testIDs and text elements found correctly). May be emulator-specific and not reproduce on real devices.

---

## BUG-2: Dev Menu "Continue" Overlay Blocks UI (2026-03-08)

**Status:** Workaround in flows
**Severity:** High — blocks every test run
**Affects:** All flows that launch the app

After the JS bundle loads, the Expo dev-client always shows a "Continue" overlay (dev menu). This blocks Maestro from interacting with elements behind it.

**Root cause:** Expo dev-client behavior — the dev menu overlay is always shown on bundle load in development builds.

**Workaround:** Every flow waits for "Continue" to appear (up to 600s on WHPX) and taps it.

---

## BUG-3: Android Keyboard Covers Password Field (2026-03-08)

**Status:** Workaround in flows (updated for BUG-20). See BUG-24 for the underlying app code root cause.
**Severity:** Medium
**Affects:** Sign-in flow

On Android, the software keyboard covers the password field and sign-in button when the email field is focused.

**Workaround (E2E flows):** Tap on static "Welcome back" heading text to defocus the input and dismiss the keyboard. Originally used `hideKeyboard`, but that fails on some Android configs (see BUG-20).

**Root cause:** See BUG-24 — `KeyboardAvoidingView` has `behavior={undefined}` on Android across all auth screens, so it does nothing. Combined with `justifyContent: 'center'` on the ScrollView, inputs can't scroll into view when the keyboard is open.

---

## BUG-4: Pressable `testID` Not Reliably Exposed to Maestro on Android (2026-03-08)

**Status:** Workaround (use text-based assertions)
**Severity:** Low (testing infrastructure only)
**Affects:** `PasswordInput` show/hide toggle

The `PasswordInput` component's show/hide toggle `Pressable` has `testID="sign-in-password-toggle"`, but Maestro cannot find it by ID. The toggle IS visible and functional (verified by asserting the "Show" text), but the `testID` on `Pressable` may not map to an accessibility identifier that Maestro can locate on Android.

**Root cause:** React Native's `Pressable` does not consistently map `testID` to Android's UIAutomator accessibility tree. `TextInput` testIDs work fine; `Pressable` is unreliable.

**Workaround:** Use text-based assertions (`assertVisible: "Show"`) instead of testID for the toggle.

---

## BUG-5: Maestro `hideKeyboard` Exits App When No Keyboard Is Open (2026-03-08)

**Status:** Workaround (never call `hideKeyboard` without preceding text input)
**Severity:** Low (testing infrastructure only)
**Affects:** All flows using `hideKeyboard`

On Android, Maestro's `hideKeyboard` command sends a BACK key event. When the keyboard is NOT actually open, this BACK event navigates the app backward — potentially exiting the app entirely to the Android home screen.

**Root cause:** Maestro implements `hideKeyboard` as a BACK key press on Android. Without an open keyboard to dismiss, the BACK event propagates to the navigation stack.

**Workaround:** Never call `hideKeyboard` unless text was just entered. Never call it twice in a row. See also BUG-20 for `hideKeyboard` failure even with keyboard open.

---

## BUG-6: Stale `appId` in Flow Files (2026-03-08)

**Status:** Fixed (commit `08abeaa`)
**Severity:** Low (test files only)
**Affects:** 5 flow files

Five flow files used `appId: com.zwizzly.eduagent` instead of the correct `appId: com.mentomate.app`: `seed-and-sign-in.yaml`, `sign-out.yaml`, `first-session.yaml`, `core-learning.yaml`, `recall-review.yaml`.

**Fix:** All updated to `com.mentomate.app`. Zero occurrences of the old appId remain.

---

## BUG-7: OkHttp Chunked Transfer Encoding (2026-03-08)

**Status:** Partially resolved
**Severity:** Low (only affects specific emulator configurations)
**Affects:** Bundle loading on some WHPX emulators

OkHttp's chunked transfer encoding fails on some WHPX configurations when connecting directly to Metro (port 8081).

**Workaround:** Bundle proxy on port 8082 (`e2e/bundle-proxy.js`). Not needed on all emulators — port 8081 works on E2E_Device_2. Flows now use configurable `${METRO_URL}`.

---

## BUG-8: Dev-Client Launcher Text Not in Maestro Accessibility Tree (2026-03-08)

**Status:** Workaround (use Maestro `launchApp` instead of `adb shell am start`)
**Severity:** Low (testing infrastructure only)
**Affects:** Dev-client launcher interaction

When the app is launched manually via `adb shell am start`, Maestro's `hierarchy` command shows no text elements from the dev-client launcher (e.g., "http://10.0.2.2:8081" is not found). However, when launched via Maestro's own `launchApp` command, the same text IS visible and tappable.

**Root cause:** Maestro's `launchApp` performs additional accessibility setup beyond `adb am start`. Without this setup, the dev-client launcher's React Native views don't expose their text to Maestro's accessibility queries.

**Workaround:** Use Maestro's `launchApp` command, not manual `adb shell am start`, when Maestro needs to interact with the launcher. Note: In v3 architecture, `seed-and-run.sh` uses ADB + `uiautomator dump` parsing instead of Maestro for launcher interaction, bypassing this issue entirely.

---

## BUG-9: Trailing Spaces in JSX Text Break Maestro Assertions (2026-03-08)

**Status:** Workaround (include trailing space in assertions)
**Severity:** Low (testing only)
**Affects:** Sign-up screen ("Already have an account?" link)

The JSX `Already have an account?{' '}` renders with a trailing space that becomes part of the accessibility text. Maestro's exact text matching fails if the assertion doesn't include the trailing space.

**Root cause:** React Native's `<Text>` component concatenates `{' '}` spacers into the parent text node's value, which is exposed to accessibility.

**Workaround:** Include the trailing space in Maestro assertions: `assertVisible: "Already have an account? "`.

---

## BUG-10: Hidden Expo Router Tabs Render in Dev-Client Tab Bar (2026-03-09)

**Status:** Workaround (accessibility labels bypass visual tab issues)
**Severity:** Medium (E2E testing only)
**Affects:** All post-auth flows in dev-client builds

Expo Router tabs with `href: null` (hidden from tab bar) still render as visible tabs in dev-client builds. All tab labels truncate: "Home" → "Ho...", "Learning Book" → "boo...", "More" stays readable. Hidden screens like onboarding, session, topic show as "onb...", "ses..." etc.

**Root cause:** Dev-client builds may not apply the same tab filtering as production builds. Extra tabs shift positions and make point-based and text-based tab navigation unreliable. CSS approaches (`tabBarItemStyle: { display: 'none' }`, `tabBarButton: () => null`) do not hide tabs in dev-client.

**Workaround (applied 2026-03-10):** Added `tabBarAccessibilityLabel` to all 3 visible tabs in both `(learner)/_layout.tsx` and `(parent)/_layout.tsx`:
- `tabBarAccessibilityLabel: 'Home Tab'`
- `tabBarAccessibilityLabel: 'Learning Book Tab'`
- `tabBarAccessibilityLabel: 'More Tab'`

Maestro matches these via Android `contentDescription`, bypassing visual label truncation and position shifting. All E2E flows updated to use `tapOn: "Learning Book Tab"` (and similar) instead of point-tap or truncated text matching.

**Note:** Production builds correctly hide tabs with `href: null`. The accessibility labels are a durable fix that works in both dev-client and production.

---

## BUG-11: Theme Re-render Destabilizes Maestro Text Recognition (2026-03-09)

**Status:** Workaround in flows
**Severity:** Medium
**Affects:** `settings-toggles.yaml`

After tapping a theme button (e.g., "Teen (Dark)"), NativeWind re-renders the entire tree with new CSS variables. During the transition, Maestro briefly can't find text elements.

**Workaround:** `extendedWaitUntil: visible: text: "Appearance"` after each theme tap to wait for re-render to stabilize.

---

## BUG-12: Parent Theme Switch Triggers Persona Routing Redirect (2026-03-09)

**Status:** Expected behavior (documenting for E2E awareness)
**Severity:** Low (by design, not a bug)
**Affects:** `settings-toggles.yaml`, any flow involving persona change

Selecting "Parent (Light)" on the More screen triggers `<Redirect href="/(parent)/dashboard" />` in `(learner)/_layout.tsx:575`. The user lands on the parent dashboard, not the More screen.

**Root cause:** Each persona has its own route group (`(learner)/`, `(parent)/`) with a layout guard. Changing persona to `parent` while in the `(learner)` route group triggers the cross-redirect. This is intentional architectural behavior.

**Workaround:** E2E flows must handle the redirect — use `testID="switch-to-teen"` on the parent dashboard's demo link to navigate back. See also BUG-17 for the flow restructuring applied to handle this.

---

## BUG-14: `pressKey: back` Exits App from Navigation Root (2026-03-09)

**Status:** Fixed
**Severity:** High — crashes test flow
**Affects:** All setup flows

When no dev tools sheet is present after the "Continue" overlay, `pressKey: back` navigates back from the sign-in screen (the navigation root) to the dev-client launcher, effectively exiting the app. The second dev tools sheet (showing "Reload", "Connected to", etc.) appears non-deterministically.

**Root cause:** Sign-in screen is the navigation root. Back from root = exit app.

**Fix:** Conditional execution: `runFlow: when: visible: "Reload"` + `dismiss-devtools.yaml`. Only presses Back if the sheet is actually detected.

**Applied in:** `seed-and-sign-in.yaml`, `post-auth-comprehensive-devclient.yaml`, `connect-server.yaml`, `launch-devclient.yaml`

---

## BUG-15: `tabBarTestID` Not Propagating to Android (2026-03-09)

**Status:** Partially fixed (prop rename + text workaround)
**Severity:** High — affects 12+ flows
**Affects:** All flows that navigate via tab bar

`tabBarTestID: 'tab-more'` set in Expo Router `Tabs.Screen` options does not appear as `resource-id` in the Android UIAutomator hierarchy. The element has `resource-id=""`.

**Root cause (updated 2026-03-10):** Two issues:
1. **Wrong prop name:** Expo Router uses `tabBarButtonTestID` (not `tabBarTestID`) for the tab bar button component. Fixed in commit `35ef433` — changed in both `(learner)/_layout.tsx` and `(parent)/_layout.tsx`.
2. **Android accessibility:** Even with the correct prop, React Navigation may not propagate `testID` to the Android UIAutomator accessibility tree consistently.

**Workaround (still recommended):** Use `tapOn: text: "More"` (text-based matching) instead of `tapOn: id: "tab-more"`.

**Applied in:** 12 flow files across account, billing, onboarding, parent, subjects categories.

**Note (updated 2026-03-10):** The `tabBarAccessibilityLabel` approach (BUG-10/BUG-30 fix) is now the preferred navigation method. All flows that previously used point-tap or text matching for Learning Book have been migrated to `tapOn: "Learning Book Tab"` (matching `contentDescription`). This is more reliable than both text matching and testID on Android.

---

## BUG-17: Parent Theme Switch Redirects Away from More Screen (2026-03-09)

**Status:** Fixed
**Severity:** Medium
**Affects:** `settings-toggles.yaml`

Tapping "Parent (Light)" theme button changes persona to `parent`, triggering the layout guard in `(learner)/_layout.tsx:575`: `if (persona === 'parent') return <Redirect href="/(parent)/dashboard" />`. The More screen is replaced by the parent dashboard.

**Root cause:** Persona change is a first-class routing concern — changing it triggers cross-route-group redirects by design.

**Fix:** Restructured `settings-toggles.yaml` — test Eager Learner ↔ Teen first (both stay in learner route group), then Parent last. Parent theme section is at the end of the flow so if it crashes (BUG-18), all other validations are already captured.

---

## BUG-18: Persona Switch — `switch-to-teen` Button Below Fold (2026-03-10, updated 2026-03-12)

**Status:** FIXED (2026-03-12, Session 17) — `scrollUntilVisible` added before `switch-to-teen` tap.
**Severity:** Medium — E2E test failure, not a crash. No real user impact.
**Affects:** `settings-toggles.yaml` (Parent theme section)

Originally reported as a ~50% crash on persona switch. Crash was fixed in Session 11 (`router.replace` before deferred `setPersona`). Residual failure in Session 14 was actually a **scroll issue**: the `switch-to-teen` dev button on the parent dashboard was below the visible fold. Maestro's `tapOn` couldn't find it without scrolling first.

**Root cause (original crash):** `setPersona('teen')` in `(parent)/dashboard.tsx:170` triggered a re-render cascade through Expo Router's layout guards. Fixed by coordinating `router.replace` with `setPersona`.

**Root cause (Session 14 residual failure):** The `switch-to-teen` button is rendered near the bottom of the parent dashboard `ScrollView`. On the 1080x1920 emulator, it's below the fold. Maestro's `tapOn` only searches the visible viewport.

**Fix:** Added `scrollUntilVisible` before the `tapOn: id: "switch-to-teen"` step in `settings-toggles.yaml`.

**Files:** `apps/mobile/e2e/flows/account/settings-toggles.yaml` (step 21).

---

## BUG-19: Maestro `launchApp` / `clearState` Unreliable on WHPX (2026-03-10)

**Status:** Fixed (workaround — evolved through 3 iterations)
**Severity:** Critical — blocks all test execution
**Affects:** All flows

Maestro's `launchApp` command (with or without `clearState: true`) fails intermittently on WHPX emulators with "Unable to launch app". The failure becomes persistent after certain conditions (app crashes, concurrent Maestro sessions).

Additionally, Maestro's UIAutomator2 gRPC driver crashes during resource-intensive bundle loading on WHPX (`io.grpc.StatusRuntimeException: UNAVAILABLE: io exception`). This makes it unreliable for Maestro to handle the entire launcher → Metro → bundle → Continue flow.

**Root cause:** Multiple factors:
1. Maestro's `pm clear` + `am start` sequence has timing issues on WHPX
2. After app crashes (BUG-18), the UIAutomator driver state gets corrupted
3. Port 7001 is hardcoded — concurrent sessions conflict
4. gRPC driver drops connection during heavy CPU/memory usage (bundle compilation)

**Final workaround (v3):** `seed-and-run.sh` handles the entire app lifecycle via ADB, including launcher navigation and bundle loading. Maestro only starts after the app is on the stable sign-in screen:
1. `adb shell am force-stop` + `adb shell pm clear` — kill and wipe
2. `adb shell am force-stop com.android.bluetooth` — prevent BUG-21
3. `adb shell pm grant ... POST_NOTIFICATIONS` — pre-grant permissions (BUG-22)
4. `adb shell am start` — launch app
5. `uiautomator dump` polling for "DEVELOPMENT" text (launcher screen, 120s)
6. Parse 8081 entry bounds from dump, `adb shell input tap` at center
7. Escalating sleep loop (15/30/60/90/120s) + `KEYCODE_BACK` to dismiss Continue overlay + verify via dump (polling for "Continue" text is unreliable — dump OOM-killed during React Native bottom sheet)
8. If "Welcome back" visible → break; if "DEVELOPMENT" → re-tap Metro
9. Dismiss dev tools sheet if "Reload" visible
10. **Then** Maestro starts — app is already on sign-in screen

**Additional operational note:** After emulator cold restart, Maestro's driver must be reinstalled with `--reinstall-driver` flag on the first test run. Without this, all gRPC connections fail with "Connection refused: localhost:7001".

---

## BUG-20: Maestro `hideKeyboard` Fails on Some Android Configs (2026-03-10)

**Status:** Fixed (workaround)
**Severity:** Medium — blocks sign-in flow
**Affects:** `seed-and-sign-in.yaml` (and any flow using `hideKeyboard`)

Maestro's `hideKeyboard` command fails with "Couldn't hide the keyboard. This can happen if the app uses a custom input or doesn't expose a standard dismiss action." React Native's `TextInput` doesn't always expose the standard Android `InputMethodManager` dismiss API.

**Root cause:** Maestro calls `InputMethodManager.hideSoftInputFromWindow()` which requires the currently focused view to cooperate. React Native's custom input views don't always implement this correctly.

**Workaround:** Replace `hideKeyboard` with tapping a static text element (e.g., `tapOn: text: "Welcome back"`) to defocus the input, which implicitly dismisses the keyboard.

**Applied in:** `seed-and-sign-in.yaml`, `consent-withdrawn-gate.yaml`, `post-approval-landing.yaml`

---

## BUG-21: "Bluetooth keeps stopping" Dialog Blocks UI on WHPX (2026-03-10)

**Status:** Fixed (workaround)
**Severity:** High — blocks test execution on fresh/rebooted emulators
**Affects:** All flows (system-level dialog)

After emulator boot or cold restart, Android shows a "Bluetooth keeps stopping" system dialog. This overlays the entire screen and blocks Maestro from interacting with the app behind it.

**Root cause:** WHPX emulators don't have real Bluetooth hardware. The Bluetooth service crashes on boot and Android's crash reporter shows the dialog.

**Workaround (two layers):**
1. `seed-and-run.sh` kills Bluetooth via `adb shell am force-stop com.android.bluetooth` before launching the app
2. `seed-and-run.sh` checks `uiautomator dump` for "Bluetooth" text and taps dismiss coordinates as a safety net

**Applied in:** `seed-and-run.sh`, `dismiss-bluetooth.yaml`

---

## BUG-22: Notification Permission Dialog Blocks UI After Sign-in (2026-03-10)

**Status:** Fixed (workaround)
**Severity:** High — blocks all flows after sign-in
**Affects:** All flows (appears on first home screen load after `pm clear`)

Android 13+ (API 33+) requires explicit `POST_NOTIFICATIONS` permission. The app's `usePushTokenRegistration` hook triggers the system permission dialog on the home screen after sign-in. Since `pm clear` wipes previously granted permissions, this dialog appears on every test run.

**Root cause:** Expected Android behavior — `pm clear` resets all runtime permissions. The app correctly requests notification permission on mount.

**Workaround:** `seed-and-sign-in.yaml` conditionally dismisses the dialog by tapping "Allow" via `dismiss-notifications.yaml` after the home screen loads.

**Applied in:** `seed-and-sign-in.yaml`, `dismiss-notifications.yaml`

---

## BUG-23: Missing `href: null` on `subject` Route Breaks Tab Bar (2026-03-10)

**Status:** Fixed (commit `6536032`)
**Severity:** Medium — visual glitch, does not block functionality
**Affects:** All screens in `(learner)` route group

The bottom tab bar shows ~9 tabs instead of the intended 3 (Home, Learning Book, More). Extra tabs appear with broken icons (missing character rectangle glyphs ▯) and truncated labels like "sub…". The `subject/` directory inside `(learner)/` is auto-discovered by Expo Router as a visible tab because it lacks a `<Tabs.Screen>` declaration with `href: null`.

**Root cause:** Expo Router's file-system routing automatically creates a tab for every file/directory inside a `Tabs` layout group. Routes that should be hidden (navigated to programmatically, not via tab bar) need an explicit `<Tabs.Screen name="..." options={{ href: null }} />`. The `subject/` route is missing this declaration — likely dropped during a previous commit (`08abeaa`, E2E flows/testIDs).

**Broken icons explained:** The `iconMap` in `_layout.tsx` only defines icons for `Home`, `Book`, and `More`. The `TabIcon` component falls back to `'ellipse-outline'` for unknown route names, which renders as a broken glyph when the tab shouldn't exist at all.

**Fix:** Add the missing `Tabs.Screen` entry in `apps/mobile/src/app/(learner)/_layout.tsx`:

```tsx
<Tabs.Screen
  name="subject"
  options={{
    href: null,
  }}
/>
```

**Verify:** Confirm no other routes are missing — cross-reference all files/directories in `(learner)/` against `Tabs.Screen` declarations. Currently declared with `href: null`: `onboarding`, `session`, `topic`, `subscription`, `homework`. The `subject` directory is the only one missing.

---

## BUG-24: KeyboardAvoidingView Broken on Android — Keyboard Covers Inputs (2026-03-10)

**Status:** Fixed — all 10 instances updated to `behavior='height'` on Android
**Severity:** High — blocks user input on sign-in/sign-up (first interaction)
**Affects:** All screens with text inputs in auth and onboarding flows

On Android, the software keyboard covers input fields (especially password) because `KeyboardAvoidingView` is configured with `behavior={undefined}` for Android, making it a no-op. Combined with `justifyContent: 'center'` on the `ScrollView` content container, inputs cannot scroll into view when the keyboard opens.

The sign-in screen is the worst case: Google + Apple SSO buttons (~120px combined) sit above the email/password fields, consuming space that pushes the password field into the keyboard zone.

**Root cause:** All 6 affected screens share the same broken pattern:

```tsx
<KeyboardAvoidingView
  className="flex-1 bg-background"
  behavior={Platform.OS === 'ios' ? 'padding' : undefined}  // ← Android gets undefined
>
  <ScrollView
    contentContainerStyle={{
      flexGrow: 1,
      justifyContent: 'center',  // ← Centers content, can't scroll up
    }}
  >
```

Two issues:
1. `behavior={undefined}` on Android — `KeyboardAvoidingView` does nothing
2. `justifyContent: 'center'` + `flexGrow: 1` — content is vertically centered; when the keyboard shrinks visible space, the form can't reflow upward

`AndroidManifest.xml` has `android:windowSoftInputMode="adjustResize"` which resizes the window, but without `KeyboardAvoidingView` cooperation, the `ScrollView` doesn't scroll the focused input into view.

**Affected screens (priority order):**

| Screen | File | Above-input content | Severity |
|--------|------|---------------------|----------|
| Sign-in | `(auth)/sign-in.tsx` | SSO buttons + heading + subheading (~120px) | **High** |
| Sign-up | `(auth)/sign-up.tsx` | SSO buttons + heading + subheading (~120px) | **High** |
| Forgot password | `(auth)/forgot-password.tsx` | Heading + description | Medium |
| Create profile | `create-profile.tsx` | Heading + description | Medium |
| Create subject | `create-subject.tsx` | Heading + description | Medium |
| Consent | `consent.tsx` | Heading + description | Medium |

**Fix (applied to all 10 instances):** Changed `behavior` from `undefined` to `'height'` on Android across all files:
- `(auth)/sign-in.tsx` — 1 instance
- `(auth)/sign-up.tsx` — 2 instances (email step + verification step)
- `(auth)/forgot-password.tsx` — 2 instances (email step + reset step)
- `ChatShell.tsx` — 1 instance (also fixed for consistency)
- `session-summary/[sessionId].tsx` — 1 instance (also fixed for consistency)
- `consent.tsx`, `create-profile.tsx`, `create-subject.tsx` — already had `'height'` (3 instances)

Zero instances of `behavior={undefined}` remain in the codebase.

**E2E workaround (still in place):** Maestro flows tap the "Welcome back" heading to defocus the input and dismiss the keyboard between email and password entry (BUG-3 + BUG-20). The KAV fix should make this unnecessary but the workaround is kept for robustness.

---

## BUG-25: `profileScopeMiddleware` Falls Back to `account.id` — Empty Data (2026-03-10)

**Status:** Fixed (commit `35ef433`)
**Severity:** Critical — blocks ~30 E2E flows
**Affects:** ALL seeded flows using `learning-active`, `retention-due`, `multi-subject`, and other scenarios with subjects

When the mobile app sends API requests without an `X-Profile-Id` header, `profileScopeMiddleware` previously skipped without setting `profileId` in the Hono context. All 52 route handlers used the fallback pattern `const profileId = c.get('profileId') ?? account.id`, where `account.id` is NEVER a valid `profile_id` in any database table. This caused all scoped queries (`createScopedRepository(db, profileId)`) to return empty results.

**Visible symptoms:**
- Home screen shows "add your first subject" empty state despite subjects existing in DB
- Streak shows 0 days despite streak data in DB
- Coaching card shows generic content instead of personalized card
- Redirects to create-subject modal immediately after sign-in

**Root cause:** The `profileScopeMiddleware` was designed to only set `profileId` when `X-Profile-Id` header is explicitly provided. When absent (e.g., during the initial profile bootstrap sequence, or when the mobile client hasn't yet resolved `activeProfile`), the middleware called `next()` without setting anything. The `?? account.id` fallback in route handlers silently returned empty data instead of failing loudly.

**Fix:** `profileScopeMiddleware` now auto-resolves to the owner profile when `X-Profile-Id` is absent:
1. New `findOwnerProfile(db, accountId)` function in `services/profile.ts`
2. Middleware calls it when header is missing, wrapped in try-catch for robustness
3. If owner profile found, sets both `profileId` and `profileMeta` on the context
4. If no profiles exist yet (new user), falls through gracefully

**Debug endpoints added:** `GET /__test/debug/:email` and `GET /__test/debug-subjects/:clerkUserId` for tracing the account → profile → subjects chain during seed verification.

---

## BUG-26: `trial-active` Seed Scenario Fails — DB Schema Drift (2026-03-10)

**Status:** Fix available — runtime only (`pnpm run db:push:dev`)
**Severity:** High — blocks 2 billing E2E flows
**Affects:** `billing/subscription-details.yaml`, `billing/child-paywall.yaml`

The `trial-active` seed scenario crashes with a 500 error when inserting into the `subscriptions` table:

```
column "revenuecat_original_app_user_id" of relation "subscriptions" does not exist
```

**Root cause (corrected):** The seed code does NOT explicitly reference `revenuecatOriginalAppUserId` in `.values()`. However, Drizzle ORM generates INSERT SQL that includes ALL columns defined in the table schema — including nullable ones not specified in the values object. Since `packages/database/src/schema/billing.ts` defines `revenuecatOriginalAppUserId` and `lastRevenuecatEventId` (Epic 9 prep), Drizzle includes them as `NULL` in the generated SQL. The dev database hasn't been migrated to include these columns (`db:push:dev` not run since they were added).

**Fix:** Run `pnpm run db:push:dev` to sync the dev database schema with the Drizzle definitions. This is a runtime fix — no code change needed. The RevenueCat columns are intentional Epic 9 prep and should NOT be removed from the schema.

**Also affects:** `trial-expired-child` scenario (same subscription insert path).

---

## BUG-27: Consent-Withdrawn Gate Not Rendered After Sign-In (2026-03-10)

**Status:** FIXED (Session 15 — flow updated to use `consent-withdrawn-solo` scenario)
**Severity:** High — blocks consent E2E flows
**Affects:** `consent/consent-withdrawn-gate.yaml`

After signing in with the `consent-withdrawn` seed scenario, the app lands on the **home screen** instead of displaying the `ConsentWithdrawnGate` blocking screen. The home screen shows "add your first subject" empty state and the coaching card.

**Screenshot evidence:** Home screen visible with coaching card, "Your subjects" section, and "Start learning — add your first subject" CTA. No consent-withdrawn gate overlay.

**Root cause (confirmed via code review):** The `consent-withdrawn` seed creates TWO profiles under one account:
1. **Parent profile** (owner, `isOwner: true`, personaType: `PARENT`) — NO consent state set
2. **Child profile** (non-owner, `isOwner: false`, personaType: `TEEN`) — consent state: `WITHDRAWN`

After sign-in, the BUG-25 fix auto-resolves to the **owner** (parent) profile via `findOwnerProfile()`. The `(learner)/_layout.tsx` consent gate checks `activeProfile?.consentStatus === 'WITHDRAWN'` — but `activeProfile` is the parent profile, which has no withdrawn consent. The gate never triggers.

The flow returns `profileId: childProfileId` from the seed, but the mobile client doesn't use the seed's profileId — it resolves its own activeProfile via the API.

**Fix options (choose one):**
1. **Restructure the seed** — make the child profile the owner (single-profile account). Simpler but doesn't match the real multi-profile parent-child flow.
2. **Add profile switch in the E2E flow** — after sign-in, switch to the child profile before checking the gate. Requires `ProfileSwitcher` interaction.
3. **Change the layout guard** — check ALL profiles' consent status (not just `activeProfile`). More defensive but a product logic change.

---

## BUG-28: Post-Approval Landing Not Rendered After Sign-In (2026-03-10)

**Status:** FIXED (BUG-38 confirmed PostApprovalLanding renders for `onboarding-complete`; no `isOwner` check)
**Severity:** Medium — blocks 1 consent E2E flow
**Affects:** `consent/post-approval-landing.yaml`

After signing in with the `onboarding-complete` seed scenario, the app lands on the home screen instead of the one-time `PostApprovalLanding` celebration screen. The `post-approval-landing` testID is not found.

**Root cause (likely flow design mismatch):** The `PostApprovalLanding` screen requires:
1. `consentStatus === 'CONSENTED'` on the profile (set by seed)
2. `SecureStore.getItemAsync('postApprovalSeen') === null` (ensured by `pm clear`)
3. Profile must be a **child** profile (not owner/parent)

The `onboarding-complete` scenario creates an **owner** profile (not a child), so condition #3 likely fails. The post-approval landing is designed for child profiles whose parent just approved consent — the seed scenario may need a dedicated `consent-just-approved` variant that creates a child profile with fresh consent.

**Fix:** Either create a new seed scenario (`consent-approved-child`) that creates the right conditions, or adjust the flow to use `consent-withdrawn` scenario's child profile with consent re-approved.

---

## BUG-29: Parent Demo Dashboard — `demo-banner` testID Missing (2026-03-10)

**Status:** Fixed (app code — dashboard loading state)
**Severity:** Medium — blocks 1 parent E2E flow
**Affects:** `parent/demo-dashboard.yaml`

The `parent-solo` seed scenario successfully signs in, switches to parent persona, and lands on the parent dashboard. The dashboard shows "Home", "How your children are doing", "No children linked yet", and "Switch to Teen view (demo)". However, the `demo-banner` testID is not found.

**Screenshot evidence:** Parent dashboard renders with correct content but no demo banner overlay. The tab bar shows 4 tabs (Home, Learning Book, More, child/[profilel...) — the extra tab is BUG-10 in the parent layout.

**Root cause (confirmed via code review):** The `demo-banner` testID exists in `dashboard.tsx` (line 38) and the `useDashboard()` hook correctly falls back to `GET /v1/dashboard/demo` when `children.length === 0`. However, after persona switch, `activeProfile` (from `useProfile()`) is briefly `null`, which disables the TanStack Query (`enabled: !!activeProfile`). When the query is disabled, `isLoading` is `false` (TanStack Query v5: `isLoading = isPending && isFetching`, disabled query never fetches). The component skips the skeleton and renders "No children linked yet" immediately — before the demo data ever loads.

The subtitle "How your children are doing" (non-demo text) confirms `dashboard` was `undefined` at render time (`dashboard?.demoMode === true` → `false`).

**Fix (applied):** Changed the loading check in `dashboard.tsx` from `dashboardLoading` to `dashboardLoading || !dashboard`. This shows the skeleton when the query data is not yet available (query disabled or pending), preventing the premature empty state. Once `activeProfile` resolves and the query fires, the demo data loads and the demo banner renders correctly.

---

## BUG-30: Learning Book Tab Unreachable via Point-Tap — BUG-10 Escalation (2026-03-10)

**Status:** Fixed (accessibility labels + book route flattening)
**Severity:** High — blocks 5+ E2E flows that navigate to Learning Book
**Affects:** `subjects/multi-subject.yaml`, `retention/topic-detail.yaml`, `retention/learning-book.yaml`, `retention/recall-review.yaml`, `retention/retention-review.yaml`, and any flow using `tapOn: point: "50%,97%"` for tab navigation

The point-tap workaround at `(50%, 97%)` for navigating to the Learning Book tab hits the **wrong tab** due to BUG-10 (hidden routes visible in dev-client tab bar). In dev-client builds, the tab bar shows ~9 tabs instead of 3, shifting all tab positions. The 50% horizontal position lands on the 4th-5th tab (a hidden route like `topic/` or `homework/`) instead of the 2nd tab (Learning Book).

**Root cause:** BUG-10 (dev-client exposes hidden tabs) + Expo Router directory route behavior. The `book/index.tsx` directory route caused Expo Router to render `content-desc="⏷, book/index"` instead of the configured `tabBarAccessibilityLabel`. This meant Maestro couldn't find the tab by any reliable selector.

**Fix (applied 2026-03-10, 3 parts):**

1. **Flattened `book/` directory to `book.tsx` file route:**
   - Moved `(learner)/book/index.tsx` → `(learner)/book.tsx` (updated all 6 import paths from `../../../` to `../../`)
   - Moved `(learner)/book/index.test.tsx` → `(learner)/book.test.tsx` (updated 3 mock paths + require path)
   - Updated `(parent)/book.tsx` re-export from `'../(learner)/book/index'` → `'../(learner)/book'`
   - **Why:** Expo Router treats directory routes differently — `book/index.tsx` exposes the raw path `book/index` in the tab bar, ignoring configured `title` and `tabBarAccessibilityLabel`. File routes (`book.tsx`) correctly use the configured options.

2. **Added `tabBarAccessibilityLabel` to all visible tabs** (both layouts):
   - `tabBarAccessibilityLabel: 'Home Tab'`, `'Learning Book Tab'`, `'More Tab'`
   - Maestro matches these via Android `contentDescription`, bypassing visual truncation

3. **Updated 7 E2E flow YAML files** to use `tapOn: "Learning Book Tab"`:
   - `flows/subjects/multi-subject.yaml` (was `point: "50%,97%"`)
   - `flows/retention/topic-detail.yaml` (was `point: "50%,97%"`)
   - `flows/retention/learning-book.yaml` (was `tapOn: "Learning Book"`)
   - `flows/retention/relearn-flow.yaml` (was `tapOn: "Learning Book"`)
   - `flows/onboarding/view-curriculum.yaml` (was `tapOn: "Learning Book"`)
   - `flows/parent/parent-tabs.yaml` (was `tapOn: text: "Learning Book"`)
   - `flows/parent/parent-learning-book.yaml` (was `tapOn: text: "Learning Book"`)

**Verified on emulator:** `Tap on "Learning Book Tab"... COMPLETED` — Learning Book screen loads correctly with header, subtitle, and tab highlighted. TypeScript passes, unit tests pass.

---

## BUG-31: Seeded Subjects Not Visible on Home Screen — `useProfiles()` Missing Auth Guard (2026-03-10)

**Status:** Fixed (mobile code — `use-profiles.ts`)
**Severity:** Critical — blocked ALL data-dependent E2E flows (~30 flows)
**Affects:** Every flow that expects seeded data (subjects, retention, progress) to appear after sign-in

After signing in with any seed scenario, the home screen showed "Start learning — add your first subject" empty state despite confirmed data in the DB. Debug endpoints proved the full chain (account → profile → subjects) was correctly seeded with real Clerk user IDs.

**Root cause (confirmed):** The `useProfiles()` hook in `apps/mobile/src/hooks/use-profiles.ts` had **no `enabled` guard**. Because `ProfileProvider` is placed in the root `_layout.tsx` (above the auth routes), it mounts and fires `useProfiles()` **before the user signs in**:

1. App starts → `ClerkLoaded` renders → `ProfileProvider` mounts
2. `useProfiles()` fires immediately (no auth token available)
3. `getToken()` returns null → API request has no `Authorization` header → 401
4. TanStack Query retries 3× → all fail → query enters **error state**, `data = undefined`
5. `ProfileProvider` defaults to `profiles = []`
6. User signs in → `ProfileProvider` re-renders → but TanStack Query does NOT auto-retry errored queries on re-render (observer is already subscribed, retries exhausted)
7. `profiles` stays `[]` → `activeProfile` stays null → `useSubjects()` has `enabled: !!activeProfile` → never fires → empty home screen

**Why previous BUG-31 theories were wrong:**
- BUG-25 (server-side auto-resolve) was already fixed and working
- Seed data was correctly linked to real Clerk user IDs (not `clerk_seed_*`)
- Debug endpoint bug (now fixed) was a red herring — the data WAS in the DB
- The bug was purely **client-side**: a React Query lifecycle issue

**Fix:** Added `enabled: !!isSignedIn` guard to `useProfiles()`:
```typescript
import { useAuth } from '@clerk/clerk-expo';
// ...
const { isSignedIn } = useAuth();
return useQuery({
  queryKey: ['profiles'],
  queryFn: async () => { /* ... */ },
  enabled: !!isSignedIn,  // ← NEW: don't fire before auth
});
```

This ensures:
- Before sign-in: query is **disabled** (never fires, no 401 error)
- After sign-in: `isSignedIn` flips to true → query is **enabled** → fires with valid token → profiles arrive → `activeProfile` set → `useSubjects()` fires → subjects visible

**Files changed:**
- `apps/mobile/src/hooks/use-profiles.ts` — added `enabled: !!isSignedIn`
- `apps/mobile/src/hooks/use-profiles.test.ts` — added Clerk mock + new test case
- `apps/mobile/src/lib/profile.test.tsx` — added Clerk mock

**Verification:** Both `multi-subject` and `view-curriculum` flows now pass the home screen assertions:
- `"Physics" is visible... COMPLETED` (multi-subject)
- `"Your subjects" is visible... COMPLETED` (view-curriculum)

**Pattern lesson for future agents:** Any TanStack Query hook used inside a provider that mounts before auth MUST have an `enabled: !!isSignedIn` guard. Without it, the query fires unauthenticated, enters error state, and never recovers — even after auth succeeds. Compare with `useSubjects()` which already had `enabled: !!activeProfile`.

---

## BUG-32: More Tab — "Account" Section Not Visible After Delete-Account Cancel (2026-03-10)

**Status:** Fixed (flow-level fix — `scrollUntilVisible` UP)
**Severity:** Low — affects only the final step of `more-tab-navigation.yaml`
**Affects:** `account/more-tab-navigation.yaml` (last assertion only — flow passes 95% of steps)

After navigating to the Delete Account screen and tapping `delete-account-cancel`, the assertion `"Account" is visible` fails. The flow completed all 40+ prior steps successfully, including navigating to Profile, Subscription, Privacy Policy, Terms of Service, Export Data, and Delete Account screens.

**Screenshot evidence:** The More screen is visible with items: Profile (truncated at top), Subscription, Help & Support, Privacy Policy, Terms of Service, Export my data, Delete account, Sign out, MentoMate v1.0.0. The More tab is active in the bottom bar. But "Account" as a section header is not visible at this scroll position.

**Root cause:** The More screen organizes items under section headers (Appearance, Notifications, Learning Mode, Account). After returning from the Delete Account screen, the ScrollView maintains its scroll position (scrolled to bottom). The "Account" section header is above the visible viewport — it would only be visible if the ScrollView scrolled back to show the section headers.

**Fix (applied):** Changed `extendedWaitUntil` (line 199) to `scrollUntilVisible` with `direction: UP` in `more-tab-navigation.yaml`. After returning from Delete Account, the scroll position is at the bottom — scrolling up finds the "Account" section header reliably.

---

## BUG-33: Learning Book Tab Crash — react-native-svg ClassCastException on Fabric (2026-03-10)

**Status:** FIXED (2026-03-11) — replaced animated SVG `<G>` transform with pure Reanimated `<Animated.View>` scaleX (no SVG dependency). Tests pass (14 suites, 137 tests).
**Severity:** High — blocks ALL flows that navigate to the Learning Book tab
**Affects:** `subjects/multi-subject.yaml`, `onboarding/view-curriculum.yaml`, `retention/learning-book.yaml`, `retention/topic-detail.yaml`, and any flow navigating to the Learning Book tab

After tapping "Learning Book Tab", the app crashes with a red error screen:

```
There was a problem loading the project.
java.lang.ClassCastException: java.lang.String cannot be cast to...
  at com.facebook.react.uimanager.BaseViewManagerDelegate
  at com.facebook.react.viewmanagers.RNSVGGroupManagerDelegate
  at com.facebook.react.fabric.mounting.SurfaceMountingManager.updateProp
  at com.facebook.react.fabric.mounting.mountitems.IntBu...
```

**Root cause:** The `BookPageFlipAnimation` component (`components/common/BookPageFlipAnimation.tsx`) uses `react-native-svg` (`Svg`, `Rect`, `Line`, `G`) combined with `react-native-reanimated` animated props. The `G` (Group) component's Fabric delegate (`RNSVGGroupManagerDelegate`) receives a String prop where Fabric expects a different type, causing a ClassCastException.

**Environment:**
- `react-native-svg: 15.12.1`
- `newArchEnabled=true` (Fabric / New Architecture)
- `react-native-reanimated` animated SVG transforms
- The crash is **100% reproducible** — confirmed in both `multi-subject` and `view-curriculum` flows

**Why it crashes on Learning Book but not Home:**
- Home screen: `PenWritingAnimation` (also SVG) shows only during `coachingCard.isLoading` — likely resolves before render on the test's fast API
- Learning Book: `BookPageFlipAnimation` renders during `isLoading` (subjects + retention queries) — the loading state lasts long enough for SVG to mount and crash

**This is NOT a test issue — it's a genuine app bug.** Per CLAUDE.md Rule 4: "The implemented app code is the source of truth... It is forbidden to modify app code to make a test pass." The animation component needs a proper fix.

**Fix options (for app developer):**
1. **Replace SVG animation with non-SVG alternative** — use `ActivityIndicator` or Lottie for the loading state
2. **Update react-native-svg** — check if a newer version has Fabric ClassCastException fix
3. **Wrap SVG in error boundary** — prevent crash from taking down the whole screen
4. **Disable Fabric for react-native-svg** — use `unstable_enablePackageFabric` to exclude it

**Confirmed fix approach (2026-03-11 code review):** The crash is in `BookPageFlipAnimation.tsx` which uses `Animated.createAnimatedComponent(G)` and passes `transform` as a string via `useAnimatedProps()`. The `RNSVGGroupManagerDelegate` on Fabric (New Architecture) expects a typed transform object, not a string. **This is fixable without the emulator** — replace the animated SVG `<G>` transform with a reanimated `<Animated.View>` wrapper using standard `style.transform`, or replace the entire component with a simple `ActivityIndicator`. The component is only used during loading states.

**Files:** `apps/mobile/src/components/common/BookPageFlipAnimation.tsx` (source), `BookPageFlipAnimation.test.tsx` (test), `apps/mobile/src/app/(learner)/book.tsx` (consumer), `apps/mobile/src/components/common/index.ts` (barrel export).

**E2E workaround (temporary):** Flows that navigate to Learning Book will fail at the tab switch. Home screen assertions (subjects, retention strip) remain testable. Skip Learning Book tab assertions until BUG-33 is fixed.

**Parent routing fix (commit `93e5646`):** BUG-33 also manifested as a parent routing mismatch — parent scenarios create a PARENT owner profile, so the app routes to `(parent)/dashboard` (testID: `dashboard-scroll`), not `(learner)/home` (testID: `home-scroll-view`). Fixed in `seed-and-sign-in.yaml` (accepts both landing screens) and 6 parent flow YAMLs (replaced `switch-to-parent.yaml` with direct `dashboard-scroll` wait). The SVG crash on Learning Book tab remains open.

---

## BUG-34: `onboarding-complete` Scenario Auto-Redirects Away from Home Screen (2026-03-10)

**Status:** PARTIALLY FIXED — subjects added to `onboarding-complete`, `trial-active`, `trial-expired` seeds + `topicId` now exposed in all three. Remaining: `parent-solo` and `parent-with-children` still have no subjects (parent owner profiles route to `(parent)/dashboard` anyway, so this is expected behavior, not a bug). BUG-33 (SVG crash) is now fixed separately.
**Severity:** Medium (reduced from High) — remaining parent scenarios are handled by dashboard-scroll fallback in seed-and-sign-in.yaml
**Affects:** Parent scenarios (`parent-solo`, `parent-with-children`) — these land on dashboard, not home, by design

After signing in with `onboarding-complete` (and other subject-less scenarios), the home screen appears briefly but auto-redirects to `/create-subject` because `subjects.length === 0`. The `seed-and-sign-in.yaml` setup flow's `extendedWaitUntil visible id: home-scroll-view timeout: 30000` sometimes passes (race condition — catches the home screen before redirect) but the main flow's subsequent check fails.

**Root cause:** `home.tsx` lines 41-51 auto-redirect to `/create-subject` when `subjects` is an empty array:
```tsx
if (subjects.length === 0) {
  router.replace('/create-subject');
}
```

This is **correct app behavior** — users with no subjects should be guided to create one. The issue is that the seed scenarios and flow expectations don't align:

- `onboarding-complete`: creates account + profile + consent, but NO subjects
- `parent-solo`: creates parent profile only, NO subjects for learner
- `trial-active`/`trial-expired`: creates subscription only, NO subjects

**Affected flows (expect home screen but get redirected):**
- `account/more-tab-navigation.yaml`
- `account/settings-toggles.yaml`
- `account/account-lifecycle.yaml`
- `account/delete-account.yaml`
- `account/profile-switching.yaml` (parent-with-children — parent is owner, lands on home but no subjects)
- `assessment/assessment-cycle.yaml`
- `onboarding/create-profile-standalone.yaml`
- `billing/subscription.yaml` (trial-active)
- `billing/subscription-details.yaml` (trial-active)

Additionally, `parent-solo` and `parent-with-children` scenarios create a PARENT as the owner profile. After sign-in, the app routes to `(parent)/dashboard` (not `(learner)/home`), so `home-scroll-view` is never rendered.

**Fix applied (Option 1):** Subject added to `onboarding-complete`, `trial-active`, `trial-expired` seeds. `topicId` now exposed in return `ids` for all three.

**Semantic drift note:** `onboarding-complete` no longer represents "just finished onboarding, no subjects." To test the empty-state `/create-subject` redirect, a new `onboarding-no-subject` scenario would be needed (Option 2). This is tracked but deferred — no current flow tests the empty-state path.

**For parent scenarios (Option 4):** Already handled — `seed-and-sign-in.yaml` accepts `dashboard-scroll` as an alternative landing screen.

---

## BUG-35: Keyboard Covers Chat Input Bar and Send Button in Session Screen (2026-03-10)

**Status:** RE-OPENED (2026-03-13) — `undefined` was never a real fix (KAV does nothing, keyboard still covers input). Reverted to `behavior='height'` on Android (2026-03-13). Needs verification after rebuild — BUG-35 originally reported `'height'` conflicting with `adjustResize` on FlatList-based ChatShell, but `undefined` leaves keyboard coverage unresolved. If `'height'` still conflicts, next approach: remove `adjustResize` from AndroidManifest for ChatShell screens or switch to `behavior='padding'`.
**E2E workaround:** `pressKey: Enter` remains in all flows as defense-in-depth.
**Workaround confirmed:** Session 10 ran 4 chat flows (start-session, core-learning, first-session, recall-review) — all PASS with `pressKey: Enter`.
**Severity:** Critical — blocks ALL E2E flows that use ChatShell (~15 flows)
**Affects:** All learning, homework, retention, and recall flows that enter a chat session

When the keyboard opens on the session/chat screen, the app's input bar (TextInput + send button) is completely hidden behind the keyboard. The `KeyboardAvoidingView` does not push the content up.

**Screenshot evidence:** Session screen shows header + AI message + empty space + keyboard. The input bar is not visible. After pressing Enter (keyboard send key), the message sends and the keyboard dismisses, revealing the input bar correctly.

**Root cause:** `ChatShell.tsx` line 228-232:
```tsx
<KeyboardAvoidingView
  className="flex-1 bg-background"
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={0}
>
```

`AndroidManifest.xml` already has `android:windowSoftInputMode="adjustResize"`. When `adjustResize` is active, the system resizes the activity's window. Adding `KeyboardAvoidingView behavior="height"` on top of this creates a double-adjustment conflict on Fabric/New Architecture — the view's height calculation interferes with the system's resize, resulting in the input bar being hidden behind the keyboard.

**Note:** BUG-24 changed all `KeyboardAvoidingView` instances from `behavior={undefined}` to `behavior='height'` on Android. The auth screens (ScrollView-based) work correctly with this change because `adjustResize` + ScrollView handle keyboard avoidance. But the `ChatShell` (FlatList-based, no ScrollView wrapper for the input area) behaves differently — `behavior='height'` actively conflicts with `adjustResize`.

**Workaround (confirmed via ADB):** `KEYCODE_ENTER` triggers `onSubmitEditing={handleSend}` (the TextInput has `returnKeyType="send"`). This sends the message and dismisses the keyboard. Maestro's `pressKey: Enter` command can replace `tapOn: send-button` in affected flows.

**Affected flows (all use `tapOn: send-button` in ChatShell):**
- `learning/core-learning.yaml`
- `learning/first-session.yaml`
- `learning/freeform-session.yaml`
- `learning/session-summary.yaml`
- `learning/start-session.yaml`
- `homework/homework-flow.yaml`
- `homework/homework-from-entry-card.yaml`
- `homework/camera-ocr.yaml`
- `retention/recall-review.yaml`
- `retention/retention-review.yaml`
- `retention/failed-recall.yaml`

**Fix options:**
1. **App fix (recommended, fixable without emulator):** Change `ChatShell.tsx` to `behavior={undefined}` on Android (let `adjustResize` handle everything). Unlike auth screens (ScrollView-based, where `behavior='height'` works), ChatShell uses FlatList — `adjustResize` already handles the window resize, and `behavior='height'` double-adjusts. Setting `behavior={undefined}` on Android for ChatShell specifically (while keeping `'padding'` on iOS) should resolve the conflict. File: `apps/mobile/src/components/session/ChatShell.tsx`.
2. **E2E workaround:** ~~Replace `tapOn: send-button` with `pressKey: Enter` in all affected flow files. Keep `tapOn: send-button` as an optional fallback assertion.~~ **DONE (Session 10).**
3. **Alternative app fix:** Switch `windowSoftInputMode` to `adjustPan` for the session screen (per-activity or via `useEffect` toggle) — but this affects all inputs on the screen.

---

## BUG-36: `freeform-session` Flow Expects Wrong Coaching Card Layout (2026-03-11)

**Status:** FIXED (flow updated to use `coaching-card-primary` testID instead of text tap)
**Severity:** Low — 1 flow affected
**Affects:** `learning/freeform-session.yaml`

The flow taps `"Just ask something"` text, expecting the AdaptiveEntryCard's teen three-action layout (primary: "Homework help", secondary: "Practice for a test" / "Just ask something"). But with `learning-active` scenario, the coaching card renders as a "Continue: World History" card with "Let's go" and "I have something else in mind" — no "Just ask something" text.

**Root cause:** The coaching card type depends on the precomputed card result. `learning-active` creates a continue-learning card because there's an active session/topic. The three-action teen entry card only appears when there's no active learning context.

**Fix options:**
1. Create a `learning-fresh` scenario that has subjects but no active sessions — this would render the three-action entry card.
2. Change the flow to use the existing card layout and navigate to freeform via a different path (e.g., session mode selector).

---

## BUG-37: `session-summary` Flow Can't Find `end-session-button` (2026-03-11)

**Status:** Dependent on BUG-47 — flow is correct, LLM reliability blocks it
**Severity:** Low — 1 flow affected
**Affects:** `learning/session-summary.yaml`

After 3 exchanges, the flow expects `end-session-button` to appear. The session timer is at 11:42 but no end/close button is visible. The session is still active (not auto-closed).

**Root cause:** The session's exchange cap may be set higher than 3 in the seeded data, so auto-close doesn't trigger. The `end-session-button` testID may not exist in the app, or it may only appear after a certain condition (timer expiry, exchange cap reached, manual back navigation).

**Fix options:**
1. Investigate what testID the close/end session UI uses in `ChatShell.tsx` and update the flow.
2. Configure the seed to set a lower exchange cap so auto-close triggers after 3 exchanges.
3. Use back navigation to exit the session instead.

---

## BUG-38: `onboarding-complete` Scenario Triggers PostApprovalLanding Screen (2026-03-11)

**Status:** FIXED (commit `93e5646`)
**Severity:** HIGH — blocked 9 flows
**Affects:** All flows using `onboarding-complete` scenario: `more-tab-navigation`, `settings-toggles`, `delete-account`, `account-lifecycle`, `create-profile-standalone`, `empty-first-user`, `analogy-preference-flow`, `assessment-cycle`, `curriculum-review-flow`

After sign-in, the "You're approved!" PostApprovalLanding screen appears instead of the home screen. This screen has a "Let's Go" button that navigates to subject creation.

**Root cause:** The `onboarding-complete` scenario seeds a user with approved consent. The `PostApprovalLanding` screen checks SecureStore for whether this interstitial has been shown (`postApprovalSeen_${profileId}`). Since `pm clear` wipes SecureStore before each test run, the app thinks this is a fresh consent approval and shows the landing screen.

**Screenshot:** Shows party emoji 🎉, "You're approved!", "Your parent said yes — time to start learning. Let's set up your first subject.", "Let's Go" button.

**Fix applied:** Setup flow fix in `seed-and-sign-in.yaml` — added `tapOn text: "Let's Go" optional: true` after sign-in, followed by a wait for `home-scroll-view`. The dismiss callback sets `setShouldShow(false)` → layout re-renders normal tabs → home screen appears.

---

## BUG-39: Homework Flows Need Camera Permission Handling (2026-03-11)

**Status:** FIXED (commit `93e5646`)
**Severity:** Medium — blocked 3 flows
**Affects:** `homework/homework-flow.yaml`, `homework/homework-from-entry-card.yaml`, `homework/camera-ocr.yaml`

After navigating to the homework screen, the "Camera Access Needed" screen appears with an "Allow Camera" button. Tapping it triggers the Android system permission dialog ("Allow MentoMate to take pictures and record video?") with three options: "While using the app", "Only this time", "Don't allow". The flow doesn't handle this system dialog.

**Screenshots:** Camera Access Needed screen → Android permission dialog

**Fix applied:** Pre-grant CAMERA permission via ADB in `seed-and-run.sh`: `$ADB $DEVICE_FLAG shell pm grant "$APP_ID" android.permission.CAMERA 2>/dev/null || true`. Same pattern as BUG-22 notification permission fix.

---

## BUG-40: `retention-review` and `failed-recall` Flows Expect Non-Existent `recall-test-screen` testID (2026-03-11)

**Status:** FIXED (commit `93e5646`)
**Severity:** Medium — blocked 2 flows
**Affects:** `retention/retention-review.yaml`, `retention/failed-recall.yaml`

Both flows asserted `id: recall-test-screen` after tapping the coaching card, but the app renders a standard `ChatShell` session screen (with `chat-input`, `send-button`, etc.). The `recall-test-screen` testID doesn't exist in the app — retention reviews go through the same ChatShell as learning sessions.

**Fix applied:** Replaced `recall-test-screen` with `chat-input` in both flows, matching the pattern used by the smoke-tier `recall-review.yaml`.

---

## BUG-41: Learning Book SVG Crash (= BUG-33) — RNSVGGroupManagerDelegate ClassCastException (2026-03-11)

**Status:** FIXED (2026-03-11) — resolved by BUG-33 fix (BookPageFlipAnimation rewritten without SVG).
**Severity:** HIGH — blocks 5 flows
**Affects:** `retention/learning-book.yaml`, `retention/topic-detail.yaml`, `retention/relearn-flow.yaml`, `subjects/multi-subject.yaml` (at LB step), any future flow navigating to Learning Book tab

Same `ClassCastException: java.lang.String cannot be cast` in `com.facebook.react.viewmanagers.RNSVGGroupManagerDelegate` as BUG-33. Confirmed reproducible in Session 10 across multiple scenarios (retention-due, failed-recall-3x, multi-subject).

**Note:** BUG-41 is a duplicate of BUG-33, tracked separately because Session 10 confirmed it across more scenarios. Fix BUG-33 to resolve both. See BUG-33 for confirmed fix approach (replace animated SVG with non-SVG alternative — code-only fix, no emulator needed).

---

## BUG-42: No "Subscription" or "Billing" Entry on More Tab (2026-03-11)

**Status:** FIXED (2026-03-11) — replaced `extendedWaitUntil` with `scrollUntilVisible` in `subscription-details.yaml` step 5.
**Severity:** Medium — blocks 1 flow (subscription-details), partial impact on subscription flow
**Affects:** `billing/subscription.yaml` (optional assertions → PASS with warnings), `billing/subscription-details.yaml` (mandatory → FAIL)

The More tab shows APPEARANCE, ACCENT COLOR, NOTIFICATIONS, and LEARNING MODE sections, but no "Subscription", "Billing", "Trial", or "Upgrade" entry. This may be:
1. Below the fold (needs scroll) — the More tab content extends beyond viewport
2. Not rendered for the `trial-active` scenario / learner persona
3. A missing feature (subscription UI not yet wired to More tab)

**Screenshot:** More tab showing themes, accent colors, notification toggles. No billing section visible.

**Root cause (confirmed via code review 2026-03-11):** The "Subscription" row **IS implemented** in `more.tsx:279-289` under the "Account" section header (line 271). The layout order is: Appearance → Accent Color → Notifications → Learning Mode → Account (Profile, **Subscription**, Help & Support, Privacy Policy, Terms of Service, Export my data, Delete account, Sign out). The "Account" section is below the fold — the flow screenshot only shows content through Learning Mode. The row renders `label="Subscription"` with a tier value from `useSubscription()`.

**Fix (YAML only, no emulator needed):** Add `scrollUntilVisible` for "Subscription" text before asserting. Same pattern as BUG-32 fix. If `useSubscription()` returns `undefined` for `trial-active` (KV cache not populated by seed), the row still renders with the "Subscription" label but no value — still findable by text.

---

## BUG-43: Coaching Card Auto-Navigation After PostApprovalLanding Dismissal (2026-03-11)

**Status:** Workaround applied (Back press guard in seed-and-sign-in.yaml); auto-navigation not reproducible in code review — coaching card components are purely presentational with no useEffect-based auto-nav
**Severity:** HIGH — blocks 4+ flows
**Affects:** `homework/homework-flow.yaml`, `homework/camera-ocr.yaml`, `retention/retention-review.yaml`, `retention/failed-recall.yaml`, and any flow using a scenario with active sessions/retention cards + CONSENTED status

After sign-in, the PostApprovalLanding screen appears (BUG-38 behavior — SecureStore wiped by `pm clear`). The BUG-38 fix in `seed-and-sign-in.yaml` taps "Let's Go" to dismiss it. However, for scenarios that seed active sessions or due retention cards (`homework-ready`, `retention-due`, `failed-recall-3x`), the coaching card on the home screen immediately auto-navigates the user into a "Practice Session" (ChatShell). The flow's subsequent `home-scroll-view` assertion fails because the user is on the session screen.

**Screenshots:** "Practice Session" / "Test your knowledge" screen with "Your answer..." input and timer.

**Why it doesn't affect `onboarding-complete`:** That scenario has no active session or due retention card — the coaching card doesn't auto-navigate.

**Why it doesn't affect parent scenarios:** Parent profiles route to `(parent)/dashboard` which doesn't have the coaching card auto-navigation behavior.

**Root cause:** The BUG-38 fix (tapping "Let's Go") works correctly — PostApprovalLanding is dismissed and the home screen renders. But the coaching card's auto-navigation fires immediately on home render for scenarios with active content, taking the user away from home before the flow can assert `home-scroll-view`.

**Fix options:**
1. **Add `pressKey: Back` after PostApproval dismiss** in `seed-and-sign-in.yaml` — if the coaching card navigated, Back returns to home. If it didn't navigate, Back is harmless (optional).
2. **Individual flow fix:** Each affected flow adds `pressKey: Back` or `tapOn: back-button optional: true` before its `home-scroll-view` assertion.
3. **Seed fix:** Don't set CONSENTED status for scenarios that have active sessions — use a different consent status that doesn't trigger PostApprovalLanding. Complex because consent is required for the session to function.

---

## BUG-44: `add-subject-button` TestID Not Found on Home Screen (2026-03-11)

**Status:** Fixed in flows (Session 12)
**Severity:** Medium — blocks 3 flows
**Affects:** `onboarding/analogy-preference-flow.yaml`, `assessment/assessment-cycle.yaml`, `onboarding/curriculum-review-flow.yaml`

After successful sign-in with `onboarding-complete` scenario (BUG-38 PostApprovalLanding dismissed, home screen reached), the flow taps `id: add-subject-button` but it's not found. The home screen is visible (`home-scroll-view` assertion passes) but the button is not in the viewport.

**Root cause:** Button is below the fold. With the `onboarding-complete` seed (which creates a "General Studies" subject), the home screen has enough content to push the "Add Subject" button below the visible viewport.

**Fix:** Added `scrollUntilVisible` before `tapOn: add-subject-button` in all affected flows. Verified working in Session 12 — Maestro successfully scrolls down and finds the button.

---

## BUG-45: Maestro Can't Find Text in ChatShell Header on Android (2026-03-11)

**Status:** Workaround in flows (Session 12)
**Severity:** Medium — blocks interview-dependent flows
**Affects:** `onboarding/analogy-preference-flow.yaml`, `onboarding/curriculum-review-flow.yaml`

Maestro `assertVisible: text: "Interview"` fails on the ChatShell header. The header text "Interview: Biology" is rendered as a React Native `<Text>` inside a complex view hierarchy but is not exposed to Android's accessibility tree in a way Maestro's text matcher can discover.

**Root cause:** React Native `<Text>` components inside certain view hierarchies (custom headers with back buttons, status bar insets) may not be discoverable by Maestro's `text:` selector. The text IS visually rendered but not in the Android accessibility tree.

**Workaround:** Replaced `text: "Interview"` with `id: "chat-input"` — the TextInput's testID is reliably exposed. The presence of `chat-input` confirms the interview/chat screen has loaded.

---

## BUG-46: Maestro Can't Find Text Inside Chat Message Bubbles (2026-03-11)

**Status:** Workaround in flows (Session 12)
**Severity:** Low — cosmetic assertion, not blocking
**Affects:** `onboarding/analogy-preference-flow.yaml`, `onboarding/curriculum-review-flow.yaml`

Maestro `assertVisible: text: "learning coach"` fails even when the AI opening message ("Hi! I'm your learning coach...") is visually rendered in a `MessageBubble`. Same root cause as BUG-45 — text inside React Native chat bubble components isn't reliably exposed to Maestro's text matcher on Android.

**Workaround:** Removed the `text: "learning coach"` assertion. The `id: "chat-input"` check (BUG-45 fix) is sufficient to confirm the chat screen loaded. The opening message in the interview screen is a hardcoded constant, not an LLM call, so its presence is guaranteed by the component mounting.

---

## BUG-47: Gemini LLM Intermittently Fails/Hangs During E2E Runs (2026-03-11)

**Status:** Partially mitigated — retry logic added to `routeAndCall()` (non-streaming). Streaming paths rely on circuit breaker + fallback. Environment issue persists for Gemini-only deployments without OpenAI fallback.
**Severity:** High — blocks all interview-dependent flows
**Affects:** `onboarding/analogy-preference-flow.yaml`, `onboarding/curriculum-review-flow.yaml`, any flow requiring LLM responses

During Session 12 (and previously in Sessions 10-11), the Gemini LLM API (`gemini-2.0-flash`) intermittently fails or hangs when called from the interview service. The interview requires at least one AI response exchange before showing the "View Curriculum" button.

**Observed behaviors (5 consecutive runs, Session 12):**
1. AI opening message appeared (hardcoded, not LLM). User message sent. AI responded with error: "I'm having trouble connecting right now. Please try again." (LLM call failed, catch handler fired)
2. Same as #1
3. AI opening message appeared. User message appeared. No AI response — LLM call hung (no success or error callback)
4. Disk full error (cleaned 38GB from `/c/tools/tmp/`)
5. Empty chat area — even the hardcoded opening message not rendering (possible rendering glitch after disk pressure, or component mount issue)

**Root cause:** Gemini API intermittency. The `/v1/health` endpoint reports `"llm":{"providers":["gemini"]}` (config check, not live call), so health checks pass even when the LLM is unresponsive. The interview's `sendInterview.mutateAsync()` either times out or returns an error.

**Impact:** The `view-curriculum-button` never appears → analogy preference and curriculum review flows can't proceed past the interview screen. All flow logic before the LLM call is validated and working.

**Mitigations applied (Session 19):**
- **Retry logic added to `routeAndCall()`** — up to 3 attempts with exponential backoff (1s, 2s delays) before recording circuit breaker failure. Helps non-streaming LLM calls (coaching card precompute, session-completed chain).
- **Retry also added to fallback provider path** (`attemptProvider`) — fallback calls also retry before giving up.

**Remaining mitigations (not yet applied):**
1. Add LLM health probe to `/v1/health` (actual Gemini ping, not just config check)
2. For E2E streaming: configure OpenAI as fallback provider (`OPENAI_API_KEY` env var) — eliminates Gemini single point of failure
3. For E2E: consider a mock/stub LLM mode that returns canned interview responses
4. For E2E: run interview flows in a retry loop (re-seed + re-run on LLM failure)

---

## BUG-48: Parent-Redirect Timing Race in seed-and-sign-in.yaml (2026-03-12)

**Status:** FIXED (2026-03-12) — created `return-to-home-safe.yaml` with dual-guard logic
**Severity:** HIGH — blocks all parent flows that use `seed-and-sign-in.yaml`
**Affects:** `parent/parent-dashboard.yaml`, `parent/parent-learning-book.yaml`, and any parent scenario using `seed-and-sign-in.yaml` with `return-to-home.yaml`

After sign-in with a parent scenario, the app briefly shows `home-scroll-view` (learner layout) then redirects to `dashboard-scroll` (parent layout). The existing `return-to-home.yaml` conditional (`when: notVisible: id: home-scroll-view`) evaluates **after** the redirect has occurred, so `home-scroll-view` is indeed not visible (because the parent dashboard is showing). This causes it to incorrectly press Back, navigating away from the dashboard.

**Root cause:** Maestro's `when: notVisible` evaluates at check time, not at the moment of sign-in. The brief learner layout appearance followed by parent redirect creates a race condition. By the time the conditional runs, the parent dashboard has loaded, `home-scroll-view` is gone, so the `notVisible` condition is true — and the Back press fires, leaving the dashboard.

**Fix:** Created `return-to-home-safe.yaml` which adds a second guard: if `dashboard-scroll` IS visible, skip the Back press entirely (the parent is already where they should be). Updated `seed-and-sign-in.yaml` to use `return-to-home-safe.yaml` instead of `return-to-home.yaml`.

**Files changed:**
- `e2e/flows/_setup/return-to-home-safe.yaml` (new)
- `e2e/flows/_setup/seed-and-sign-in.yaml` (updated to reference safe variant)

---

## BUG-49: Maestro Text Matching Failures on Android (2026-03-12)

**Status:** DOCUMENTED — workarounds applied in Session 15 flows
**Severity:** MEDIUM — affects any flow using `text:` selectors for taps/assertions
**Affects:** `topic-detail`, `relearn-flow`, `subscription-details`, and any flow matching text inside nested elements

Three distinct patterns where Maestro fails to match visible text on Android:

1. **Nested `<Text>` inside `<Pressable>` with testID:** Text like "2 sessions" rendered in a `<Text>` child inside a `<Pressable testID="topic-row-{id}">` is invisible to Maestro's `text:` selector. Root cause: Maestro may treat the `<Pressable>` as a single accessible element and not traverse children.

2. **Long wrapping text in single `<Text>` node:** Text like "Every topic needs its own approach. Let's find what clicks for you!" wraps across 2+ lines. Maestro's regex matcher fails to find even substrings like "Every topic needs its own approach". Root cause: possible line-break injection in accessibility text.

3. **Regex special characters:** Text containing literal parentheses, e.g. "Bring your own key (coming soon)", fails because Maestro treats `text:` as regex. Unescaped `(` `)` create malformed regex groups.

**Workarounds:**
- Pattern 1 & 2: Use `testID` selectors or tap specific known text (e.g., topic names from seed)
- Pattern 3: Escape regex chars with `\\(` `\\)`

---

## BUG-50: consent-withdrawn Seed Creates Parent+Child (Wrong Profile Selected) (2026-03-12)

**Status:** FIXED (2026-03-12) — new `consent-withdrawn-solo` seed scenario
**Severity:** HIGH — consent-withdrawn-gate flow could never pass
**Affects:** `consent/consent-withdrawn-gate.yaml`

The `consent-withdrawn` seed scenario creates a parent profile (isOwner: true) and a child profile (TEEN, WITHDRAWN consent) under one account. After sign-in, the app's profile selection logic picks the parent (owner) profile, showing the parent dashboard instead of the child's consent-withdrawn-gate.

**Root cause:** The app picks the first/owner profile on sign-in. The child profile with WITHDRAWN consent is never selected, so the consent-withdrawn-gate component never renders.

**Fix:** Created `consent-withdrawn-solo` seed scenario with a single LEARNER profile that has WITHDRAWN consent. No parent profile, no profile switching needed. Updated `consent-withdrawn-gate.yaml` to use the new scenario.

**Files changed:**
- `apps/api/src/services/test-seed.ts` — added `seedConsentWithdrawnSolo()` + type + map entry
- `e2e/flows/consent/consent-withdrawn-gate.yaml` — use `consent-withdrawn-solo` scenario

---

## BUG-51: empty-first-user Breaks seed-and-sign-in Return-to-Home Logic (2026-03-12)

**Status:** FIXED (2026-03-12) — new `sign-in-only.yaml` setup flow
**Severity:** MEDIUM — only affects flows where post-auth screen is not home/dashboard
**Affects:** `edge/empty-first-user.yaml`

With `onboarding-no-subject` seed (0 subjects), `home.tsx` immediately redirects to `/create-subject`. The `seed-and-sign-in.yaml` recovery logic detects `home-scroll-view` is gone and fires `return-to-home-safe.yaml`, which presses Back — but there's no home to return to (it keeps redirecting). This creates a fatal loop.

Additionally, the PostApprovalLanding ("You're approved!") intercepts after `pm clear` wipes SecureStore. The sign-in-only flow needs explicit handling for this screen.

**Fix:**
1. Created `sign-in-only.yaml` — minimal sign-in without any post-auth recovery
2. Flow uses `sign-in-only.yaml` instead of `seed-and-sign-in.yaml`
3. Added explicit PostApproval wait + dismiss before checking for create-subject
4. Changed "learning coach" text assertion to "Your coach is here" header text (chat bubble text invisible to Maestro)

**Files changed:**
- `e2e/flows/_setup/sign-in-only.yaml` (new)
- `e2e/flows/edge/empty-first-user.yaml` — rewritten setup sequence

---

## BUG-52: child-paywall Flow Signs In as Parent, Not Child (2026-03-12)

**Status:** FIXED (2026-03-12) — new `switch-to-child.yaml` setup flow
**Severity:** HIGH — flow fails at step 2 (never reaches ChildPaywall)
**Affects:** `billing/child-paywall.yaml`

The `trial-expired-child` seed creates a parent-owned account with a parent profile (owner) and child profile (non-owner). Sign-in authenticates as the parent, landing on the parent dashboard (`dashboard-scroll`). The flow then waits for `home-scroll-view` (step 2), which never appears → timeout failure.

Even if step 2 were fixed, the ChildPaywall would not render because the active profile is the parent (owner). The ChildPaywall component gates on `!activeProfile.isOwner && subscription.status === 'expired'` — it requires the non-owner child profile to be active.

**Same class of issue as BUG-50** (consent-withdrawn multi-profile seed). BUG-50 was solved by creating a solo seed variant. That approach doesn't work here because the ChildPaywall *requires* a non-owner profile — you can't make a solo profile that is both owner and non-owner.

**Fix:**
1. Created `switch-to-child.yaml` — reusable setup flow that navigates More → Profile → taps child by name → waits for learner home after persona redirect
2. Updated `child-paywall.yaml` to run `switch-to-child.yaml` after `seed-and-sign-in.yaml`
3. Includes PostApprovalLanding dismiss (BUG-38 safety) since `pm clear` wipes SecureStore

**Files changed:**
- `e2e/flows/_setup/switch-to-child.yaml` (new)
- `e2e/flows/billing/child-paywall.yaml` — added profile switch step

## BUG-53: Tab Bar Icons Missing — Ionicons Font Not Loading (2026-03-12)

**Severity:** Medium (visual only — navigation labels still visible)
**Status:** FIXED (Session 19 — added `...Ionicons.font` to `useFonts()` in root `_layout.tsx`)

Tab bar icons render as empty squares with X marks (broken font glyphs) instead of Ionicons. Affects all tabs: Home, Learning Book, More, and the hidden dev-only route tabs (session, topic, homework, subject). The text labels ("Ho...", "Lea...", "More") are visible and truncated but functional.

**Root cause hypothesis:** Ionicons vector font not loaded in the dev-client APK. Expo's `@expo/vector-icons` bundles Ionicons as a font asset. On debug builds served by Metro, the font may not be pre-loaded before the tab bar renders. Alternatively, the font asset path may be broken on the WHPX emulator.

**Why tests pass:** Jest doesn't render actual fonts — it only checks the component tree. The `Ionicons` component renders a `<Text>` node with a font glyph codepoint, which Jest sees as present regardless of whether the font file loads.

**Impact on E2E:** No direct impact — Maestro navigates via `testID` not icon recognition. Visual-only bug.

**Fix applied (Session 19):** Added `import Ionicons from '@expo/vector-icons/Ionicons'` and `...Ionicons.font` to the `useFonts()` call in `apps/mobile/src/app/_layout.tsx`. This ensures the Ionicons font is explicitly loaded alongside the Atkinson Hyperlegible custom fonts before the splash screen is dismissed. The root layout's existing font gate (`if (!fontsLoaded) return null`) ensures no tabs render before Ionicons is available.

## BUG-54: Session Close Fails — `inngest.send()` Throws Without Inngest Dev Server (2026-03-12)

**Severity:** High (blocks session-summary and all session close flows in E2E)
**Status:** FIXED (2026-03-12) — wrapped `inngest.send()` in try-catch in `routes/sessions.ts`

After streaming works and 3 exchanges complete, tapping "End Session" → confirm shows error dialog: "Failed to close session. Please try again." The `POST /v1/sessions/:sessionId/close` handler calls `inngest.send()` (line 183 of `routes/sessions.ts`) to dispatch the `app/session.completed` background event. Without the Inngest dev server running (port 8288), this throws a network error that crashes the entire endpoint.

**Root cause:** `inngest.send()` is not wrapped in a try-catch. In local dev without Inngest running, the network error propagates to the Hono error handler, returning a 500 to the client. The mobile `useCloseSession` hook catches this and shows the "Failed to close" alert.

**Fix options:**
1. **Start Inngest dev server** for E2E sessions: `npx inngest-cli@latest dev` (port 8288). Add to the E2E operational checklist.
2. **Wrap `inngest.send()` in try-catch** in the close handler — log warning but don't fail the response. The background job is important but shouldn't block the synchronous session close. This would also improve production resilience if Inngest is temporarily unavailable.
3. Both — fix the code AND add Inngest to the E2E checklist.

**Affects:** `session-summary.yaml`, `core-learning.yaml`, `first-session.yaml`, `freeform-session.yaml`, `homework-flow.yaml` — any flow that closes a session.

---

## BUG-55: Clerk Email Verification Blocks Pre-Auth E2E Flows (2026-03-12)

**Status:** FIXED (2026-03-12) — bypassed via `pre-profile` and `consent-pending` seed scenarios
**Severity:** High — was blocking 4 flows from achieving full PASS
**Affects:** `coppa-flow.yaml`, `profile-creation-consent.yaml`, `consent-pending-gate.yaml` (FIXED). `sign-up-flow.yaml` remains PARTIAL (intentionally — tests sign-up UI itself).

After submitting the sign-up form with valid email + password, Clerk sends a 6-digit verification code to the email address. The verification screen (`sign-up-code` testID) renders correctly. However, entering the test code "424242" and tapping "Verify" results in "Incorrect code" — Clerk dev mode does NOT auto-verify or accept a fixed test code.

**Root cause:** Clerk's email verification is a server-side check against a real code sent via email. Development mode provides no bypass mechanism for automated testing. The emails are sent to `*@example.com` addresses (which don't have real inboxes), so the codes cannot be retrieved.

**Fix implemented (solution 2):** Two new seed scenarios added to `test-seed.ts`:

- **`pre-profile`** — Creates Clerk user + DB account, but NO profile. Flows sign in (bypassing sign-up + verification), then navigate to create-profile via More → Profiles → "Create first profile". Used by `coppa-flow.yaml` and `profile-creation-consent.yaml`.
- **`consent-pending`** — Creates Clerk user + account + TEEN profile with `PARENTAL_CONSENT_REQUESTED` consent status. The learner layout renders `ConsentPendingGate` directly. Used by `consent-pending-gate.yaml`.

Both scenarios call `createClerkTestUser()` which uses Clerk's Backend API to create pre-verified users server-side — no email verification needed.

**Remaining limitation:** `sign-up-flow.yaml` stays PARTIAL because it intentionally tests the sign-up form UI (email, password, "Create account" button, verification screen). Post-verification steps remain `optional: true`. This is acceptable — the sign-up UI coverage is still valuable.

---

## BUG-56: AnalogyDomainPicker Not Scrollable — Gaming Option Clipped (2026-03-13)

**Status:** FIXED (2026-03-13) — ScrollView added to analogy-preference.tsx
**Severity:** Medium — 7th option not reachable on smaller screens
**Affects:** `analogy-preference-flow.yaml` (FAIL), `analogy-preference.tsx` screen

The `AnalogyDomainPicker` component renders 7 domain options (none, cooking, sports, building, music, nature, gaming) in a plain `View` container — not a `ScrollView`. On 360x640dp screens (emulator default), the gaming option (7th, index 6) is clipped below the fold.

**Layout math:** Header (~124dp) + Actions (~120dp) = ~244dp overhead. Remaining ~396dp for picker. 7 options × ~72dp each = 504dp needed. Gap: ~108dp.

**Root cause:** `analogy-preference.tsx` wraps the picker in `<View className="flex-1 px-5">` (no scroll). The `AnalogyDomainPicker` component itself uses `<View>` for its container, not `<ScrollView>`.

**E2E impact:** `scrollUntilVisible` cannot scroll a non-scrollable container — Maestro correctly fails.

**Fix needed:** Wrap `AnalogyDomainPicker` or its container in `analogy-preference.tsx` with a `ScrollView`. The picker already handles selection state correctly — only the container needs to scroll.

**Files:**
- `apps/mobile/src/components/common/AnalogyDomainPicker.tsx` — 7 options in `<View>`
- `apps/mobile/src/app/(learner)/onboarding/analogy-preference.tsx` — picker container `<View className="flex-1 px-5">`
- `apps/mobile/e2e/flows/onboarding/analogy-preference-flow.yaml` — `scrollUntilVisible` for gaming fails

---

## BUG-57: consent-pending-gate Text Assertion Failure — PreviewSubjectBrowser (2026-03-13)

**Status:** FIXED (2026-03-13) — full text match + scrollUntilVisible for footer
**Severity:** Medium — flow was PASSING in Session 18
**Affects:** `consent-pending-gate.yaml` (FAIL at step 14)

The flow fails at:
```yaml
- assertVisible:
    text: "Here's a preview of what you can learn."
```

The `PreviewSubjectBrowser` component (`_layout.tsx:172-174`) renders:
```
Here's a preview of what you can learn. You'll unlock these once your parent approves.
```

The full text is a single `<Text>` node containing both sentences. The assertion matches only the first sentence. This passed in Session 18 with identical code — no changes to `_layout.tsx` between sessions.

**Possible causes:**
1. **Maestro text matching inconsistency** — substring matching may have failed due to emulator rendering timing or accessibility tree state. Related to BUG-49 pattern.
2. **Screen not fully rendered** — the `PreviewSubjectBrowser` may not have completed rendering when the assertion fired.

**Investigation needed:** Re-run the single flow with screenshots to capture the actual screen state at the assertion point. If text matching is the issue, consider using `id`-based assertion instead.

**Note:** No code changes to `_layout.tsx` between Session 18 and Session 20 (`git log --since="2026-03-12" -- "apps/mobile/src/app/(learner)/_layout.tsx"` returns empty).

---

## BUG-58: Pre-Profile Accounts — "Profile" Not Visible on More Tab (2026-03-13)

**Status:** FIXED (2026-03-13) — scrollUntilVisible + Android date picker OK tap
**Severity:** Medium — 2 flows affected, both PASSING in Session 18
**Affects:** `coppa-flow.yaml` (FAIL at step 5), `profile-creation-consent.yaml` (FAIL at step 5)

Both flows use the `pre-profile` seed scenario (Clerk user + account, no profile). After sign-in, they navigate: `tab-more` → wait for `text: "Profile"` → tap "Profile" → "No profiles yet" → "Create profile".

The failure occurs at:
```yaml
- extendedWaitUntil:
    visible:
      text: "Profile"
    timeout: 10000
```

**Code analysis:**
- `more.tsx:274-278` — The "Profile" `SettingsRow` is rendered **unconditionally** (no `activeProfile` guard)
- `_layout.tsx:640` — `tab-more` testID exists and is rendered for all authenticated users
- `_layout.tsx:573-596` — None of the consent gates trigger for `null` activeProfile (all check `activeProfile?.consentStatus`)
- No code changes to `more.tsx` or `(learner)/_layout.tsx` between sessions

**Possible causes:**
1. **Race condition** — Profile loading state (`isProfileLoading`) returns `null` layout briefly, then the More tab renders but Maestro's assertion window may have expired
2. **Maestro text matching** — "Profile" appears as `SettingsRow` label; if the row renders with Clerk display name alongside, Maestro may not isolate the "Profile" text node (BUG-49 pattern)
3. **Tab navigation timing** — After `tapOn: id: tab-more`, the More screen may not be fully rendered within 10s on WHPX emulator

**Investigation needed:** Re-run one of the flows with increased timeout and screenshots before/after `tab-more` tap. Check if the More screen renders at all, or if a gate/redirect is intercepting.

---

## BUG-59: Tab Bar Overflow — Hidden Routes Render as Visible Tabs (2026-03-13)

**Status:** FIXED (2026-03-13) — added `tabBarItemStyle: { display: 'none' }` to all hidden tabs
**Severity:** High — visual defect on EVERY screen in the app (learner + parent layouts)
**Affects:** All flows — the tab bar is visible on every screen except fullscreen (session, homework, onboarding)

**Observed behavior:** The bottom tab bar shows 9 tabs instead of 3. The 6 hidden routes (`onboarding`, `session`, `topic`, `subscription`, `homework`, `subject`) render as visible tab buttons with truncated labels ("ses...", "topi...", "ho...", "sub...") and placeholder rectangle icons (no `tabBarIcon` defined for hidden routes). The 3 real tabs (Home, Learning Book, More) are squeezed to accommodate the extra buttons.

**Screenshot evidence:** Learning Book screen shows tab bar with: `Ho... Lea... More ses... topi... ho... topi... sub... topi...`

**Root cause:** In Expo Router's `<Tabs>`, `href: null` prevents a tab from being a **navigation target** (no deep linking, no programmatic navigation from tab bar), but does NOT remove the tab **button** from the visual layout. The underlying `@react-navigation/bottom-tabs` still allocates space and renders the button.

- `tabBarStyle: { display: 'none' }` (already on `onboarding`, `session`, `homework`) hides the **entire tab bar** when that screen is active — it does NOT hide the tab button when another screen is active
- `tabBarItemStyle: { display: 'none' }` hides the tab **button** from the bar regardless of which screen is active — this is the correct property

**Fix applied:**

`apps/mobile/src/app/(learner)/_layout.tsx` — Added `tabBarItemStyle: { display: 'none' }` to all 6 hidden `Tabs.Screen` entries:
- `onboarding` (line 649)
- `session` (line 656)
- `topic` (line 663)
- `subscription` (line 669)
- `homework` (line 675)
- `subject` (line 681)

`apps/mobile/src/app/(parent)/_layout.tsx` — Added `tabBarItemStyle: { display: 'none' }` to the hidden `child` tab (line 101).

**Verification:** No direct unit tests for layout files. Fix is purely additive CSS. Needs visual verification after rebuild — tab bar should show exactly 3 tabs (Home, Learning Book, More) with correct icons and full labels.

---

## BUG-60: ChatShell Keyboard Avoidance — Unresolved on Android (2026-03-13)

**Status:** FIXED (2026-03-14) — unified all screens to `behavior="padding"`, confirmed no `adjustResize` in AndroidManifest
**Severity:** High — keyboard covers chat input and send button during active typing
**Affects:** All learning, homework, retention, and recall flows that use ChatShell (~15 flows)
**Related:** BUG-24 (original KAV fix for auth screens), BUG-35 (ChatShell-specific revert)

**History:**
1. **BUG-24 (2026-03-10):** All screens had `behavior={undefined}`. Fixed to `behavior='height'` on Android for all 10 instances.
2. **BUG-35 (2026-03-11):** ChatShell specifically had issues with `'height'` — reported double-adjustment conflict with `adjustResize` in AndroidManifest. Reverted ChatShell to `behavior={undefined}`. Used `pressKey: Enter` workaround in E2E.
3. **Session 20c (2026-03-13):** User confirmed keyboard still covers input with `undefined`. Audit confirmed ChatShell is the ONLY remaining screen with `undefined`. Reverted to `behavior='height'`.
4. **Session 21 (2026-03-14):** Unified ALL screens (including ChatShell) to `behavior="padding"`. Grep confirmed no `adjustResize` or `windowSoftInputMode` in AndroidManifest.xml or app.json — the original BUG-35 conflict concern was moot (Expo managed builds don't set `adjustResize` by default). `'padding'` is the safest cross-platform behavior: it adds padding above the keyboard without conflicting with OS-level window resizing.

**Current state (all screens):**
```tsx
behavior="padding"
```

**E2E flows are unaffected** — all chat flows use `pressKey: Enter` workaround (BUG-35) which bypasses the need to tap the send button behind the keyboard. Visual verification pending next emulator rebuild.
