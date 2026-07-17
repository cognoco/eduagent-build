# WI-2185 — V2 chrome geometry verification

**Item:** WI-2185 — Reserve fixed V2 chrome space before pushed-screen content

**Captured:** 2026-07-18

**Cycle-3 review base:** `e0026d5a82675bc6e5654d807c9abdb89d5b8bff`

**Cycle-3 code candidate:** `7b038d8e989f6b0be8e9a2f79299d6e8fd8d642a`

**Fetched integration base:** `acfe90399eb5b38f13db205e668de373ca783ce8`

The review delta is pinned as
`e0026d5a82675bc6e5654d807c9abdb89d5b8bff..7b038d8e989f6b0be8e9a2f79299d6e8fd8d642a`.
The candidate hash contains the production and test changes below; this evidence-only
commit and the merge of the fetched integration base follow it.

## Ownership contract

- The root app layout owns the complete pushed-scene band:
  `chromeTopInset + 8px gap + max(measured ScopeChip, measured avatar)`.
- `/mentor-memory`, `/more/accommodation`, and `/subscription` no longer add a
  second top-safe inset. Their loading/error roots follow the same rule.
- Nested `/more/account` receives the complete root band before its real More
  Stack header, Account title, and scroll content.
- Exact `/more` preserves its existing split ownership: the More screen retains
  its safe inset while the root reserves only the remaining control band. At
  `top=47`, the root contributes 52px and the screen contributes 47px.
- Visible tabs retain only `chromeTopInset`; full-screen and proxy routes remain
  at zero root clearance.
- `headerTransparent: false` and its prop-presence test were removed. It was the
  default and did not establish geometry.

## Composed native-safe coverage

`apps/mobile/e2e-web/helpers/native-safe-area.ts` applies Chromium's
`Emulation.setSafeAreaInsetsOverride` to the real routed app. W-05 uses `top=47`
at 360x760 and measures DOM bounds rather than mocked navigation props.

It verifies all four named routes:

- `/mentor-memory`: screen root starts at or below the avatar bottom and has
  computed `paddingTop: 0`;
- `/more/accommodation`: same root-owned/no-double-inset contract;
- `/subscription`: same root-owned/no-double-inset contract; and
- `/more/account`: avatar `y=55..99`, then the real Stack title and Account
  scroll content in order below it.

J-03 applies the same native `top=47` override before installing five long
supporter scopes and 32px/52px scaled text. It checks the real ScopeChip and
avatar start at `y=55`, every scope remains independently scrollable/selectable
with a 44x44px target, and the measured taller chrome clears the real Account
title and content.

## Red → green → revert → red → restore → green

### Initial RED on the cycle-2 implementation

Focused Jest run before production changes:

```text
Test Suites: 4 failed, 4 total
Tests:       8 failed, 202 passed, 210 total

four pushed native routes: expected paddingTop 99, received 52
measured 64px chrome:       expected paddingTop 119, received 72
three direct children:      expected paddingTop 0, received 47
```

Real routed W-05 with the native-safe override:

```text
Expected screen y: >= 98.5
Received screen y:    52
1 failed, 2 passed
```

The avatar itself was at `y=55..99`, so the failure demonstrated missing root
clearance rather than a synthetic formula mismatch.

### GREEN after single-owner implementation

```text
Test Suites: 5 passed, 5 total
Tests:       223 passed, 223 total
```

The isolated native W-05 and measured-growth J-03 runs both passed (three tests
each, including their two setup cases).

### Behavioral revert RED

Only the ownership behavior was temporarily reverted while the tests stayed in
place:

```text
Test Suites: 4 failed, 1 passed, 5 total
Tests:       8 failed, 215 passed, 223 total
```

The rebuilt routed app again failed with `received y=52` versus `>=98.5`.

### Restored GREEN

After restoring the implementation:

```text
Test Suites: 5 passed, 5 total
Tests:       223 passed, 223 total
W-05 native-safe: 3 passed
```

The final `/more` preservation check was also test-first. The incorrect visible-tab
classification failed at 24 vs 76 on web and 47 vs 52 with a native inset; the
split-owner correction then passed both cases.

## Final unit and static verification

Final focused unit command covered the root layout, the three direct pushed
screens, Account, and ScopeChip:

```text
Test Suites: 6 passed, 6 total
Tests:       225 passed, 225 total
Snapshots:   0 total
```

Fresh static gates:

```text
NX Successfully ran target typecheck for project @eduagent/mobile and 6 tasks it depends on

NX Successfully ran target lint for project @eduagent/mobile
✖ 51 problems (0 errors, 51 warnings)
```

The warnings are the existing mobile warning set. The runner also reported Node
24 against the repository's requested Node 22 engine; all cited commands still
completed with the statuses shown.

## Post-integration verification

`origin/main` at `acfe90399eb5b38f13db205e668de373ca783ce8` merged cleanly as
`2e25f95225496710666fdaeab12f7438617ee8dd`. The merged tree then passed:

```text
Test Suites: 6 passed, 6 total
Tests:       225 passed, 225 total
NX Successfully ran target typecheck for project @eduagent/mobile and 6 tasks it depends on
W-05 native top=47 four-route matrix: 3 passed (37.5s)
```

## Final routed browser verification

All final runs used a fresh exported web bundle, V2 flags, the staging API, and
the repository's Doppler configuration. Geometry/auth-sensitive groups were run
with one worker to avoid invalidating shared staging sessions.

```text
J-01 learner + top-level More preservation: 4 passed (57.3s)
J-03 parent + native-safe measured growth:   5 passed (1.3m)
W-05 native top=47 four-route matrix:        3 passed (46.8s)
W-05 wide + 360x760 pushed routes:           4 passed (1.3m)
```

The counts include each run's two setup cases. W-04 and J-10's no-round recovery
also passed in the serial later-phase sweep.

That sweep exposed two staging-data failures outside this candidate's geometry
delta:

```text
J-10 main journey: app rendered “Couldn't create a round” after the staging
API rejected quiz-round creation.

W-05 route inventory: the freshly stored seed subject ID was absent from the
staging /library response.
```

One native W-05 attempt in that same long sweep hit the app's mentor-profile
error state. Its immediate isolated rerun against the identical bundle passed
all four named routes (`3 passed`). These failures are recorded as environment
and fixture evidence, not hidden or counted as candidate greens.
