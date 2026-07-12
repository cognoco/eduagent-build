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

## Tag Registry

Every non-`_setup` flow YAML must declare at least one tag in its frontmatter. The Maestro flow validator (`scripts/validate-maestro-flows.sh`, check C7) reads this registry and fails on tags that are not listed here. To introduce a new tag, add it to the appropriate section below in the same PR.

Tag tokens below are wrapped in backticks so the validator's parser can extract them.

### Execution tiers

| Tag | Meaning | Run cadence |
|---|---|---|
| `pr-blocking` | Small deterministic trusted-CI set. Every tagged flow must appear in `ci-maestro-manifest.json`. | Trusted post-push CI + on-demand `pr` suite |
| `smoke` | Broad coverage of critical paths. | Nightly + on-demand |
| `nightly` | Full regression suite. | Nightly CI |
| `weekly` | Extended/slow flows (camera, OCR, complex multi-step). | Weekly CI |
| `manual` | Requires human interaction or special device setup. | Manual only |
| `v2` | V2-only native shell flow; requires an APK bundle built with `EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true`. | Manual publish-readiness dispatch |

`pr-blocking` qualification criteria (all must hold): currently passes on a clean Pixel API 34 emulator; covers a top-of-funnel or critical user path; deterministic (no flakiness from AI responses, timing, or network); runs in under 90 seconds individually.

The secret-backed native job cannot safely execute untrusted pull-request head
code. Pull-request-triggered `workflow_run` events are therefore skipped; the
explicit four-shard `pr` manifest runs after trusted pushes and can be selected
manually with `workflow_dispatch`. The eight-shard nightly suite discovers
`smoke`, `nightly`, and `pr-blocking` tags recursively, then reseeds before each
flow. The CI-plan regression guard fails when a `pr-blocking` tag falls outside
the manifest or a scheduled flow has no valid seed mapping.

### Domain tags

`account`, `assessment`, `auth`, `billing`, `chat`, `consent`, `dictation`, `edge`, `homework`, `learning`, `library`, `navigation`, `onboarding`, `parent`, `practice`, `preview`, `progress`, `quiz`, `regression`, `retention`, `session`, `settings`, `subjects`, `summary`

### Special tags

| Tag | Meaning |
|---|---|
| `devclient` | Requires dev-client build (not release / Expo Go) |
| `gdpr` | GDPR-specific consent flows |
| `coppa` | COPPA-specific age-verification flows |
| `critical` | Business-critical path (revenue, legal) |
| `visual` | Primarily screenshot-based verification |
| `local` | Runs against local Expo Go / dev tooling only |
| `slow-net` | Exercises throttled-network or offline paths |
| `blocked` | Parked flow — not executed in CI; documents an intended scenario blocked by emulator, tooling, or infra limits, with the gating condition recorded in the flow header |

### Pending review

These tags appear in current flows. They are recognised by the validator to keep C7 green, but a future PR should rationalise each one — promote into a domain/special tag with a clear definition, or remove from the flows that carry it.

`archive`, `camera`, `classifier`, `comprehensive`, `epic-10`, `experimental`, `home`, `nudge`, `placeholder`, `post-auth`, `quick`, `quota`, `stress`, `subject-creation`, `ux-dead-end`, `voice`
