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
| `pr-blocking` | Must pass for PR merge. Stable, deterministic, <90s each, combined set <8 min. | Every PR |
| `smoke` | Broad coverage of critical paths. Superset of `pr-blocking`. | Nightly + on-demand |
| `nightly` | Full regression suite. | Nightly CI |
| `weekly` | Extended/slow flows (camera, OCR, complex multi-step). | Weekly CI |
| `manual` | Requires human interaction or special device setup. | Manual only |
| `wi1651-evidence` | Branch-only exit-propagation evidence flow. | Manual dispatch only |

`pr-blocking` qualification criteria (all must hold): currently passes on a clean Pixel API 34 emulator; covers a top-of-funnel or critical user path; deterministic (no flakiness from AI responses, timing, or network); runs in under 90 seconds individually.

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
