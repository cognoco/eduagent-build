# E2E Test Bugs

Bugs discovered during Maestro E2E testing on Android emulator (WHPX).
Each bug has a status, root cause, and fix/workaround.

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

## BUG-7: OkHttp Chunked Transfer Encoding (2026-03-08)

**Status:** Partially resolved
**Severity:** Low (only affects specific emulator configurations)
**Affects:** Bundle loading on some WHPX emulators

OkHttp's chunked transfer encoding fails on some WHPX configurations when connecting directly to Metro (port 8081).

**Workaround:** Bundle proxy on port 8082 (`e2e/bundle-proxy.js`). Not needed on all emulators — port 8081 works on E2E_Device_2. Flows now use configurable `${METRO_URL}`.

---

## BUG-11: Theme Re-render Destabilizes Maestro Text Recognition (2026-03-09)

**Status:** Workaround in flows
**Severity:** Medium
**Affects:** `settings-toggles.yaml`

After tapping a theme button (e.g., "Teen (Dark)"), NativeWind re-renders the entire tree with new CSS variables. During the transition, Maestro briefly can't find text elements.

**Workaround:** `extendedWaitUntil: visible: text: "Appearance"` after each theme tap to wait for re-render to stabilize.

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

**Status:** Fixed (workaround)
**Severity:** High — affects 12+ flows
**Affects:** All flows that navigate via tab bar

`tabBarTestID: 'tab-more'` set in Expo Router `Tabs.Screen` options does not appear as `resource-id` in the Android UIAutomator hierarchy. The element has `resource-id=""`. This is a React Navigation / Expo Router issue on Android.

**Workaround:** Use `tapOn: text: "More"` (text-based matching) instead of `tapOn: id: "tab-more"`.

**Applied in:** 12 flow files across account, billing, onboarding, parent, subjects categories.

**Note:** Some flows use `tapOn: point: "50%,97%"` for "Learning Book" tab because the text wraps to 2 lines on some screen sizes, making text matching unreliable.

---

## BUG-17: Parent Theme Switch Redirects Away from More Screen (2026-03-09)

**Status:** Fixed
**Severity:** Medium
**Affects:** `settings-toggles.yaml`

Tapping "Parent (Light)" theme button changes persona to `parent`, triggering the layout guard in `(learner)/_layout.tsx:575`: `if (persona === 'parent') return <Redirect href="/(parent)/dashboard" />`. The More screen is replaced by the parent dashboard.

**Root cause:** Persona change is a first-class routing concern — changing it triggers cross-route-group redirects by design.

**Fix:** Restructured `settings-toggles.yaml` — test Eager Learner ↔ Teen first (both stay in learner route group), then Parent last. Parent theme section is at the end of the flow so if it crashes (BUG-18), all other validations are already captured.

---

## BUG-18: Persona Switch Crashes App (~50% of the time) (2026-03-10)

**Status:** Open (app code bug)
**Severity:** High — crashes app, corrupts emulator state
**Affects:** `settings-toggles.yaml` (Parent theme section), any flow using persona switch

After tapping "Switch to Teen view (demo)" button on the parent dashboard, the app crashes to the Android home screen approximately 50% of the time. The crash corrupts Maestro's driver connection, requiring an emulator cold restart.

**Root cause:** `setPersona('teen')` in `(parent)/dashboard.tsx:170` triggers a re-render cascade through Expo Router's layout guards. The `(learner)/_layout.tsx` detects persona change and redirects, while simultaneously the `(parent)` layout may also be redirecting. This creates a navigation race condition that crashes the React Navigation tree.

**Reproduction:**
1. Sign in → navigate to More → tap "Parent (Light)" → lands on parent dashboard
2. Tap "Switch to Teen view (demo)" → app crashes ~50% of the time

**Mitigation (flow-level):** Parent theme test moved to end of `settings-toggles.yaml` so the crash can't affect earlier validations.

**Proper fix needed:** The `setPersona()` call needs to be coordinated with navigation — e.g., navigate to a neutral route before changing persona, or use `router.replace()` synchronously with the persona change to avoid the layout guard race.

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

**Status:** Open (app code bug)
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

**Status:** Open (app code bug — systemic across 6 screens)
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

**Not affected:** `ChatShell.tsx` (input in fixed footer, different layout), `session-summary/[sessionId].tsx` (has `keyboardVerticalOffset={0}`).

**Fix (per screen):**
1. Change `behavior` to work on both platforms: `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`
2. Add `keyboardVerticalOffset` for iOS header compensation
3. Consider changing `justifyContent: 'center'` to `'flex-start'` with a flexible spacer, so content can scroll above the keyboard

**E2E workaround (already applied):** Maestro flows tap the "Welcome back" heading to defocus the input and dismiss the keyboard between email and password entry (BUG-3 + BUG-20).
