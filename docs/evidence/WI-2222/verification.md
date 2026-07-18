# WI-2222 Mentor capability contract verification

Date: 2026-07-18
Branch: `wi-2222-mentor-capability-contract-tests`

## Consumer map

The single exported `MENTOR_CAPABILITY_CASES` table contains catalog jump,
freeform Mentor session, clarification, unsupported route, and wrong-scope
denial rows. It directly drives these existing boundaries:

| Boundary | Consumer |
| --- | --- |
| Deterministic matcher | `apps/mobile/src/lib/bar-intent-match.test.ts` |
| Adversarial/property matcher | `apps/mobile/src/lib/bar-intent-match.adversarial.test.ts` |
| Closed deep-link mapper | `apps/mobile/src/lib/now-deep-link.test.ts` |
| Learner/person scope and route composition | `apps/mobile/src/app/(app)/mentor.test.tsx` |
| Persisted session composition | `tests/integration/learning-session.integration.test.ts` |

The adversarial generated/property corpus remains intact. No product code,
provider wire contract, schema, migration, live-LLM test, Maestro journey, or
Playwright journey changed. Mobile already declared `@eduagent/test-utils` as
a development dependency, so no manifest, workspace mapping, Jest mapping, or
lockfile edit was required.

## Baseline and test-first proof

Before the shared export existed, the four mobile consumers passed with 4
suites and 90 tests. The focused persisted-session composition test passed 1
test with 21 skipped (22 total). After consumers were written but before the
export was added, the focused matcher run failed because
`MENTOR_CAPABILITY_CASES` was undefined: 1 suite failed, with 1 new failure and
25 existing tests passing.

```bash
rtk pnpm exec jest --config apps/mobile/jest.config.cjs --runTestsByPath \
  "$PWD/apps/mobile/src/lib/bar-intent-match.test.ts" \
  "$PWD/apps/mobile/src/lib/bar-intent-match.adversarial.test.ts" \
  "$PWD/apps/mobile/src/lib/now-deep-link.test.ts" \
  "$PWD/apps/mobile/src/app/(app)/mentor.test.tsx" \
  --runInBand --forceExit --no-coverage
rtk pnpm exec jest --config tests/integration/jest.config.cjs --runTestsByPath \
  "$PWD/tests/integration/learning-session.integration.test.ts" \
  --runInBand --forceExit --no-coverage \
  --testNamePattern 'persists a question opener before a Yes follow-up'
```

## Disposable mutation proof

Both mutations were uncommitted, single-field expectation edits in
`packages/test-utils/src/lib/mentor-capability-cases.ts`. Each was restored to
the exact candidate text before the green reruns; neither mutation appears in
branch history.

### Mutation A — exact raw Mentor opener

Changed only the freeform session row's expected raw input from
`Why do apples fall toward the ground?` to `MUTATED opener expectation`, while
leaving its input unchanged.

```bash
rtk pnpm exec jest --config apps/mobile/jest.config.cjs --runTestsByPath \
  "$PWD/apps/mobile/src/lib/bar-intent-match.test.ts" \
  "$PWD/apps/mobile/src/lib/bar-intent-match.adversarial.test.ts" \
  "$PWD/apps/mobile/src/app/(app)/mentor.test.tsx" \
  --runInBand --forceExit --no-coverage
rtk pnpm exec jest --config tests/integration/jest.config.cjs --runTestsByPath \
  "$PWD/tests/integration/learning-session.integration.test.ts" \
  --runInBand --forceExit --no-coverage \
  --testNamePattern 'persists a question opener before a Yes follow-up'
```

Observed detection:

- Deterministic matcher: expected the mutated raw text but received the real
  opener.
- Adversarial matcher: the mapped deterministic assertion failed on the same
  raw-text mismatch; generated/property cases remained present.
- Learner-scope route composition: the session push retained the real
  `rawInput` and failed against the mutated expected route data.
- Persisted session composition: the database retained the real opener and
  failed against the mutated expectation.
- Mobile result: 3 suites failed, 3 tests failed, 84 passed (87 total).
- Integration result: 1 suite failed, 1 test failed, 21 skipped (22 total).

### Mutation B — closed catalog route

Changed only the catalog row's expected href from
`/(app)/subject-hub/subject-123` to `/(app)/subject-hub/MUTATED`, while leaving
the matcher deep link unchanged.

```bash
rtk pnpm exec jest --config apps/mobile/jest.config.cjs --runTestsByPath \
  "$PWD/apps/mobile/src/lib/now-deep-link.test.ts" \
  "$PWD/apps/mobile/src/app/(app)/mentor.test.tsx" \
  --runInBand --forceExit --no-coverage
```

Observed detection:

- Closed deep-link mapper: emitted the real subject route and failed against
  the mutated expected href.
- Learner-scope catalog dispatch: emitted the real subject route and failed
  against the same mutated expectation.
- Result: 2 suites failed, 2 tests failed, 55 passed (57 total).

After exact restoration, the four mobile suites returned to 4 suites and 99
passing tests; the focused integration returned to 1 passing test with 21
skipped (22 total). A search across `packages/test-utils`, `apps/mobile`, and
`tests/integration` found neither mutation marker in candidate source, and
`git diff --check` exited zero.

## Final verification

| Command | Result |
| --- | --- |
| Four impacted mobile Jest suites, command above | 4 suites passed; 99 tests passed; 0 snapshots |
| Focused learning-session integration, command above | 1 suite passed; 1 passed, 21 skipped, 22 total |
| Focused closed deep-link rerun after compile narrowing fix | 1 suite passed; 12 tests passed |
| `rtk pnpm exec nx run @eduagent/test-utils:build` | passed |
| `rtk pnpm exec nx run @eduagent/mobile:typecheck` | passed |
| `rtk pnpm exec nx run @eduagent/mobile:lint` | passed with 0 errors and 51 pre-existing warnings |
| `rtk pnpm prepush` | passed after the test-only narrowing fix |
| `rtk pnpm format:check` | passed for all configured workspace projects |
| `rtk git diff --check` | passed |
| non-mutating `complete --validate` | passed; reported no Notion writes |

The first `pnpm prepush` attempt exposed a TypeScript control-flow narrowing
gap in the new deep-link test. The validated matcher and route variants were
captured as narrowed constants; the 12-test suite and the full pre-push build
then passed. Runtime warnings were limited to the existing stale
`baseline-browser-mapping` notice, Expo/Jest environment notices, expected
missing live-provider credentials in the deterministic integration harness,
`react-test-renderer` deprecation, Jest force-exit/open-handle guidance, and the
local Node 24 versus repository Node 22 engine warning.
