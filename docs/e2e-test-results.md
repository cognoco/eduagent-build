# E2E Test Results — Dev-Client on Android Emulator

**Date:** 2026-03-08
**Environment:** Windows 11 + WHPX emulator (New_Device, API 34, 1080x1920)
**Build:** Dev-client APK built in WSL2 with expo-dev-client@~6.0.20
**Metro:** Windows, `unstable_serverRoot: monorepoRoot`
**Runtime:** exposdk:54.0.0

---

## Test Results Summary

| # | Flow | Status | Steps | Notes |
|---|------|--------|-------|-------|
| 1 | `app-launch-devclient.yaml` | PASS | 8 | Dev-client launcher → server connect → bundle load → sign-in verified |
| 2 | `auth/sign-in-navigation-devclient.yaml` | PASS | 31 | All 3 auth screens + round-trip navigation verified |
| 3 | `auth/forgot-password-devclient.yaml` | PASS | 19 | Forgot-password screen, email entry, submit, back to sign-in |
| 4 | `auth/sign-in-validation-devclient.yaml` | PASS | 21 | Empty submit, email-only submit, password toggle, sign-up link |

**Total: 4 flows, 79 assertions, all PASS**

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

### BUG-6: Stale `appId` in `onboarding/sign-up-flow.yaml`

**Severity:** Low (test file only)
**What:** The existing `onboarding/sign-up-flow.yaml` uses `appId: com.zwizzly.eduagent` instead of the correct `appId: com.mentomate.app`. This flow would fail to connect to the app on the emulator.
**Fix:** Update `appId` to `com.mentomate.app`.

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

Remaining flows (behind auth gate) need API + seed data to test.

### P-3: Increase timeouts for WHPX emulator

All existing flow timeouts (5-15s) are insufficient for the WHPX emulator. For dev-client testing on WHPX:
- Initial bundle load: 300s (5 min)
- Screen transitions: 15-30s (vs. 5s default)
- Element visibility: 10-15s (vs. 5s default)

### P-4: Fix KeyboardAvoidingView on Android (BUG-3)

The `behavior={undefined}` on Android in all auth screens should be changed. This is a real user-facing UX bug — users would need to manually dismiss the keyboard to reach submit buttons. Priority: Medium (should be fixed before release).

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
