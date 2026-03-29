# E2E Test Conventions (Maestro)

## hideKeyboard

Maestro's `hideKeyboard` on Android sends a BACK key event. This causes unintended navigation if no keyboard is open.

**Rules:**

- Only call `hideKeyboard` immediately after `inputText`
- Never call `hideKeyboard` twice consecutively
- Never call `hideKeyboard` at the start of a flow
- If the keyboard might already be dismissed, skip `hideKeyboard`

See BUG-5 in `docs/e2e-test-results.md`.

## Text matching

Maestro uses **literal** string matching, not regex. `text: ".*"` searches for the four characters `.*`, which will never match anything.

- Use exact text for assertions
- Use `id:` (testID) when text is dynamic
- Use `takeScreenshot` for visual verification of dynamic content

## Dev-client launch

All dev-client flows should use the shared setup flow:

```yaml
- runFlow: _setup/launch-devclient.yaml
```

This handles `clearState: true`, dev-client launcher, dev menu overlay, and the sign-in screen wait.

## Sign-in screen detection

**Always use `id: "sign-in-button"` to detect the sign-in screen — never heading text.**

The sign-in heading is conditional:
- First-time user (clean SecureStore): `"Welcome to MentoMate"`
- Returning user (`hasSignedInBefore` in SecureStore): `"Welcome back"`

Since E2E tests always start from clean state (`pm clear`), the heading is always first-time.
Using the testID makes flows resilient to both states.

```yaml
# ✅ Correct — works for both first-time and returning users
- extendedWaitUntil:
    visible:
      id: "sign-in-button"
    timeout: 30000

# ❌ Wrong — breaks after pm clear (shows "Welcome to MentoMate")
- extendedWaitUntil:
    visible:
      text: "Welcome back"
    timeout: 30000
```

## Bundle proxy (Windows only)

Metro on Windows has a chunked encoding bug (BUG-7). Start the bundle proxy before running E2E tests:

```bash
node e2e/bundle-proxy.js           # port 8082
adb reverse tcp:8082 tcp:8082
# Connect dev-client to http://10.0.2.2:8082
```

## Trailing spaces in JSX

React Native `{' '}` spacers become part of accessibility text. Include trailing spaces in assertions:

```yaml
- assertVisible: "Already have an account? "  # note trailing space
```

## Timeouts (WHPX emulator)

- Initial bundle load: 300s
- Screen transitions: 15–30s
- Element visibility: 10–15s

These are much higher than defaults due to WHPX emulator performance.

## Screenshots

`takeScreenshot` saves PNGs to the flow's working directory. These are gitignored via `apps/mobile/e2e/**/*.png`.
