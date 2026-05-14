# E2E Spec — Android SSO Fallback Coverage

**Status:** Draft 2026-05-14
**Owner:** _TBD — pick up by E2E rotation_
**Related Notion:** Android E2E Issues Tracker `AUTH-08 OAuth happy path beyond button rendering` (Medium) + extends existing AUTH-09 SSO callback fallback

## Goal

Today the only SSO-related Maestro flow is `e2e/flows/auth/sso-callback-fallback.yaml`, which covers Google OAuth + airplane-mode network kill + `sso-fallback-back` recovery. Apple and OpenAI strategies share the **same** `apps/mobile/src/app/sso-callback.tsx` and the same 10-second `SSO_TIMEOUT_MS` fallback, but are not exercised by any flow. A regression that broke Apple's `useSSO` wiring or OpenAI's strategy lookup (`getOpenAISSOStrategy`, `sign-in.tsx:329`) would ship invisibly.

This spec defines:

1. The minimum SSO surface that must be E2E-covered on Android.
2. The mechanism choice (Maestro vs. ADB vs. emulator network shaping) for each scenario.
3. The shape of three new flow files + the shared wrapper changes.

## Surface to cover

| Strategy | Visible on Android? | Current coverage | Target coverage |
|---|---|---|---|
| `oauth_google` | yes (Platform.OS !== 'ios') | sso-callback-fallback.yaml | + happy-path-button-renders + callback-completes-with-test-token |
| `oauth_apple` | iOS-only — out of scope for Android suite | — | none on Android |
| `oauth_custom_openai` | yes when `EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY` set | none | callback-fallback (network kill) + button-renders-when-key-set / hidden-when-unset |

Apple SSO Android coverage is deliberately out of scope — `sign-in.tsx:1244` gates the Apple button behind `Platform.OS === 'ios'`. iOS coverage is tracked separately.

## Mechanism decision

Three orthogonal triggers exist for the SSO fallback; pick per scenario:

| Mechanism | Where it lives | Use when |
|---|---|---|
| **ADB airplane mode** (`settings put global airplane_mode_on 1` + `am broadcast -a android.intent.action.AIRPLANE_MODE`) | wrapper script (existing `e2e/scripts/seed-and-run-sso-fallback.sh`) | The 10-second `SSO_TIMEOUT_MS` fallback must fire — Chrome Custom Tab must actually fail to reach the OAuth endpoint. The current AUTH-09 flow has proven this is reliable on WHPX. (Note: `svc wifi disable` / `svc data disable` were considered but airplane mode was chosen for parity with `seed-and-run-permdenied.sh`.) |
| **Maestro `pressKey: Back` / `tapOn` on the in-app browser back gesture** | per-flow YAML | Testing user-initiated cancel (the `authSessionResult.type !== 'success'` silent-cancel path read at `sign-in.tsx:649-650`). Slower / flakier; only use when no ADB equivalent exists. |
| **Clerk testing-token rejection** | env var injection | Would be cleanest for happy-path-completes but `CLERK_TESTING_TOKEN` is a placeholder per CLAUDE.md (rate-limited if real). Defer until token strategy is decided (see `2026-05-14-mfa-clerk-testing-token.md` if/when written). |

**Default:** ADB airplane mode for all new fallback flows. It is what AUTH-09 uses and is the only mechanism that exercises the real 10-second timer without depending on Clerk infrastructure. Note that the existing wrapper enables airplane mode **before** Maestro launches (the YAML can't toggle ADB mid-flow without `runScript`, which has known bugs — see `seed-and-run.sh` header re: Issue 13).

## Flows to add

### 1. `flows/auth/sso-buttons-render.yaml` (no-seed, no network kill)

Asserts the correct SSO buttons render based on platform + env. Replaces the implicit assumption inside `sso-buttons.yaml`.

- With `EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY` set: `google-sso-button` AND `openai-sso-button` visible; `apple-sso-button` NOT visible.
- With key unset: only `google-sso-button` visible.

Mechanism: Maestro env vars + `assertVisible` / `assertNotVisible`. No network shaping.

### 2. `e2e/flows/auth/sso-callback-fallback-openai.yaml` (extends AUTH-09)

Same shape as `sso-callback-fallback.yaml` but taps `openai-sso-button`. Verifies that the OpenAI strategy hits the same `sso-callback.tsx` fallback timer.

Mechanism: reuse `seed-and-run-sso-fallback.sh` — no new wrapper needed.

Pre-req: the OpenAI key (`EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY`) must be present **in the dev-client APK at build time** — `EXPO_PUBLIC_*` vars are baked into the JS bundle by Expo and cannot be injected by the wrapper at run time. The wrapper has no way to remediate a missing key; it can only short-circuit the flow before Maestro runs.

Two options for gating:

1. **YAML-level skip:** add a preflight step in the new OpenAI flow that asserts `openai-sso-button` is visible, with a clear failure message: "OpenAI key missing from APK — rebuild with `EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY` set." Keeps the shared wrapper untouched.
2. **Flow-specific wrapper:** create a thin `seed-and-run-sso-fallback-openai.sh` that fails fast if the key is unset **in the host shell** (advisory — does not actually prove the APK has it), then delegates to `seed-and-run-sso-fallback.sh`. Do **not** add the env check to the shared wrapper — it would break the existing Google AUTH-09 flow.

Option 1 is preferred: it surfaces the real precondition (key compiled into the APK) rather than the host-shell shadow of it.

### 3. `e2e/flows/auth/sso-user-cancel.yaml` (no network kill)

Validates the `authSessionType !== 'success'` silent-cancel path: user dismisses the Custom Tab without completing OAuth. The sign-in form must stay visible with no error banner.

Mechanism: Maestro `pressKey: Back` after `google-sso-button` tap, before the Custom Tab loads.

| Step | Assertion |
|---|---|
| Tap `google-sso-button` | Loading state visible |
| Press Back (system) within 2s | App returns to sign-in screen |
| Assert `sign-in-screen` visible | No error banner (no `accessibilityRole="alert"` element with text) |

## Failure Modes table

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Network kill, callback never resolves | airplane mode enabled before Custom Tab dispatch | `sso-callback` spinner → after 10s, `sso-fallback-back` button | Tap fallback → sign-in screen |
| Custom Tab dismissed by user (Back) | hardware Back during loading | Sign-in screen, no error, no spinner | None needed — already on entry screen |
| Provider page errors before redirect (DNS / TLS fail mid-load) | airplane mode toggled after Custom Tab opened | Custom Tab error page; user must Back manually — sso-callback is **not** entered because the provider never redirects | Hardware Back returns to sign-in (covered by sso-user-cancel.yaml shape, not the fallback-timer flow) |
| OpenAI key missing at runtime | env var stripped from build | `openai-sso-button` not rendered | N/A (the absence is the correct behavior) — covered by sso-buttons-render.yaml |
| `setActive` throws after createdSessionId | Clerk session activation race | Error banner with retry button (`sign-in-oauth-retry`) | Tap retry — calls `retrySessionActivation` |

The last row is already covered by unit tests; consider one Maestro flow if Clerk testing-token strategy unblocks it.

## Tests this spec spawns

- `e2e/flows/auth/sso-buttons-render.yaml` — new
- `e2e/flows/auth/sso-callback-fallback-openai.yaml` — new (uses existing wrapper or thin OpenAI-specific wrapper)
- `e2e/flows/auth/sso-user-cancel.yaml` — new

Each flow is a separate PR-sized unit. Estimated effort: 2–3 h each, including dev-client APK rebuild when env vars change.

## Non-goals

- Apple SSO on Android (gated out by `Platform.OS === 'ios'`).
- Real OAuth completion (depends on Clerk testing-token strategy — out of scope here).
- Web SSO flow (Playwright covers it separately).
