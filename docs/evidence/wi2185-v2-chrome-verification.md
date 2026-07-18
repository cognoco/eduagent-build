# WI-2185 — V2 chrome geometry verification

**Item:** WI-2185 — Reserve fixed V2 chrome space before pushed-screen content

**Captured:** 2026-07-18

**Cycle-3 review base:** `e0026d5a82675bc6e5654d807c9abdb89d5b8bff`

**Cycle-3 code candidate:** `7b038d8e989f6b0be8e9a2f79299d6e8fd8d642a`

**Cycle-3 fetched integration base:** `acfe90399eb5b38f13db205e668de373ca783ce8`

**P1 corrective base:** `47e196c2fa6aa9542ac5c812c5ede3c515a4c4fe`

**P1 corrective code candidate:** `69431b94f55b8994d0e5e5964a294ae8937c1949`

**Latest fetched integration base:** `1c11fa4a8e74ef28bedf7781c898243ec3ce4778`

**Latest integration merge:** `53bad989168bd18c29c467513b094d378ba8157d`

**Adversarial remediation base:** `092d4ebefa3aca800fd2301005b668260c2c866a`

**Adversarial fetched integration head:** `ba9775edba0eaafa95f65ee1ccd072e744bc757c`

The fetched integration head changes only WI-2099 evidence and is intentionally
not merged into this exact remediation candidate.

The historical cycle-3 review delta is pinned as
`e0026d5a82675bc6e5654d807c9abdb89d5b8bff..7b038d8e989f6b0be8e9a2f79299d6e8fd8d642a`.
That candidate hash contains the production and test changes from the historical
cycle; its evidence-only commit and integration merge follow it.

## Adversarial ownership remediation

The latest remediation replaces the blanket V2 root-owned safe-area rule with a
central, machine-checked ownership audit. Every chrome-bearing route hidden from
the V2 tab bar is registered by its Expo root route name. New user-navigable
pushed routes fail closed until they are added to the audit; colocated
underscore-prefixed implementation modules are treated as child-owned because
Expo exposes them to `screenOptions` even though they are not navigable routes.

The default is now composed ownership: the child screen or nested navigator owns
the native safe-area inset, and the root layout contributes only
`pushedSceneTopInset - insets.top`, the remaining fixed-control band. Root-full
ownership is limited to four path-bound exceptions proven not to consume the
safe area themselves:

- `/dashboard`;
- `/billing` and descendants;
- `/subject-hub` and descendants; and
- `/progress/saved` and descendants.

`/mentor-memory`, `/more/accommodation`, and `/subscription` once again own their
native top inset unconditionally in flags-off, V0, V1, and V2. Subject, topic,
notes, and More's nested navigator follow the same child-owned default. This
keeps the V2 avatar/chip chrome at `y=55..99` with the screen root contributing
47px and the root scene contributing the remaining 52px at a native top inset
of 47px.

### Latest red → green → production-only revert → red → restore → green

The representative composed-geometry test was first added against the prior
production implementation. It failed on the child-owned subject, topic, and
notes routes with the exact doubled-safe-area symptom:

```text
Expected complete composed clearance: 99
Received:                           146
```

After central ownership was implemented, the representative matrix passed. For
the required behavioral revert, only the production root-scene resolver call was
temporarily restored to the blanket full-band behavior while the tests remained
unchanged. All seven representative routes failed with the same exact result:

```text
/mentor-memory, /more/accommodation, /subscription, /more/account,
/subject/subject-1, /topic/topic-1, /my-notes

Expected: 99
Received: 146
Tests:    7 failed
```

Restoring the resolver returned the same seven-route matrix to GREEN. The full
root-layout suite then passed 107 tests, including exact registry coverage,
path-bound exceptions, nested Expo route-name normalization, the fail-closed
future-route invariant, and measured chrome growth.

### Latest real native composition coverage

W-05 now exercises the real seeded subject, topic, and notes screens in addition
to the named Mentor Memory, Accommodation, and Subscription screens in every
shell mode. V2 also retains the real nested `/more/account` header/content
geometry check. Topic navigation carries the seeded subject ID explicitly, so
the route resolves the same domain fixture rather than falling into its missing
topic state.

At native `top=47`, W-05 measures the fixed V2 chrome bottom at 99px and verifies
that the root's 52px remaining band plus each child-owned 47px inset composes to
99px exactly. Flags-off, V0, and V1 verify the same screens retain their 47px
child-owned inset without V2 chrome. The mode runs use separately compiled
bundles; changing flags only in the Playwright process is not counted as
evidence.

During the first real routed V2 run, Expo surfaced the nested name
`billing/manage` and the non-navigable module `_lib/proxy-chrome` to
`screenOptions`. The former is normalized to its audited root route and the
latter follows the explicit implementation-module rule. These were candidate
hardening discoveries, not waived failures.

### Latest remediation verification

```text
Focused Jest:                    6 suites passed, 244 tests passed
Uncached mobile typecheck:       passed (mobile + 6 dependencies)
Uncached mobile lint:            passed, 0 errors / 51 baseline warnings
Repository prepush (tsc build):  passed
Prettier + git diff check:        passed

flags-off W-05 native top=47:    3 passed
V0 W-05 native top=47:           3 passed
V1 W-05 native top=47:           3 passed
V2 W-05 native top=47:           3 passed
V2 W-05 wide + 360x760:          4 passed
```

The focused Jest command uses `--forceExit` because the existing mobile Jest
harness leaves asynchronous handles open after reporting all results. The same
run without `--forceExit` reported all 244 tests green before remaining alive;
the forced run exited zero with the identical result set.

## Historical ownership contract (superseded by adversarial remediation)

- Under V2, the root app layout owns the complete pushed-scene band:
  `chromeTopInset + 8px gap + max(measured ScopeChip, measured avatar)`.
- Under flags-off, V0, and V1, `/mentor-memory`, `/more/accommodation`, and
  `/subscription` retain their native top-safe inset because those roots do not
  reserve clearance. Under V2 they contribute zero, avoiding a double inset.
  Mentor Memory's loading/error roots follow the same conditional rule.
- Under V2, nested `/more/account` receives the complete root band before its real More
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

Under flags-off, V0, and V1 it verifies the three direct pushed routes have
computed `paddingTop: 47`, their first real content begins at or below `y=47`,
and the V2 avatar chrome is absent. Under V2 it verifies all four named routes:

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

## P1 corrective pass — non-V2 inset retention

The corrective test was added against the pushed cycle-3 tree before production
changes. The root-layout tests remained green, while flags-off, V0, and V1
failed for each of the three direct routes:

```text
Test Suites: 3 failed, 1 passed, 4 total
Tests:       9 failed, 212 passed, 221 total
expected paddingTop: 47
received paddingTop: 0
```

A fresh flags-off export reproduced the issue in the real routed app. With a
CDP native-safe override of `top=47`, Mentor Memory's first real content began at
`y=0` rather than at or below `y=47` (`1 failed, 2 setup cases passed`).

The implementation conditionally applies each direct root's native inset only
when `FEATURE_FLAGS.MODE_NAV_V2_ENABLED` is false. It does not change V2 root
clearance, exact `/more`, ScopeChip measurement, or account-header geometry.
The first GREEN was:

```text
Test Suites: 4 passed, 4 total
Tests:       221 passed, 221 total
```

For the behavioral revert, only those production imports, inset reads, and root
styles were removed while the tests stayed in place. The unit result returned
to the exact `9 failed, 212 passed` RED, and a freshly rebuilt flags-off app
again placed its real first content at `y=0`. Restoring the same production
change returned the focused suite to `221 passed`.

Each shell was then compiled into its own fresh exported bundle, rather than
changing flags only in the Playwright process:

```text
flags-off W-05 native top=47: 3 passed (38.2s)
V0 W-05 native top=47:        3 passed (34.6s)
V1 W-05 native top=47:        3 passed (34.4s)
V2 W-05 native top=47:        3 passed (48.5s)
```

The counts include the two setup cases for each run.

## Cycle-3 red → green → revert → red → restore → green

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

## Corrective post-integration verification

Latest `origin/main` at `1c11fa4a8e74ef28bedf7781c898243ec3ce4778`
merged cleanly as `53bad989168bd18c29c467513b094d378ba8157d`.
The merged tree then passed fresh focused verification:

```text
Test Suites: 4 passed, 4 total
Tests:       221 passed, 221 total
NX Successfully ran target typecheck for project @eduagent/mobile and 6 tasks it depends on
flags-off W-05 native top=47: 3 passed (38.9s)
V2 W-05 native top=47:        3 passed (38.4s)
pnpm prepush (tsc --build):   passed
```

The full uncached mobile lint gate also completed with zero errors and the same
51-warning repository baseline recorded above.
