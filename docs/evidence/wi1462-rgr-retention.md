# WI-1462 — Red-Green-Revert evidence (AC-5)

**Item:** WI-1462 — Replace forced library-redirect on the 3rd failed recall with a
bounded, same-flow re-teach off-ramp (2nd consecutive failure parks the topic).
**AC-5:** *"AC-test (red-green-revert): retention/retention-data tests assert
third-failure bounded re-teach and later warm off-ramp, failing under
`redirect_to_library`-only behavior."*

**Under test:**
- `apps/api/src/services/retention.ts` — `processRecallResult` (the failure-action
  state machine).
- `apps/api/src/services/retention-data.ts` — `processRecallTest` (the wire mapping:
  internal `re_teach`/`topic_parked` → wire-compatible `failureAction` +
  additive `offRampStage`).

**Regression tests:**
- `apps/api/src/services/retention.test.ts`
- `apps/api/src/services/retention-data.test.ts`

**Runtime:** Node 22.16.0 (repo requires 22.x — see the node-version note in AGENTS.md).
**Command (run from `apps/api/`):**

```
pnpm exec jest --config jest.config.cjs \
  src/services/retention.test.ts src/services/retention-data.test.ts
```

This is a durable re-capture executed against the landed revision (the `#2212`
bounded-off-ramp change plus the `#2215` wire-compat mapping, both on `main`). The
previous evidence pointed at an untracked scratchpad path that did not exist in the
reviewed snapshot; this record replaces it with the actual captured terminal output.

---

## GREEN — fix present (baseline)

Both suites pass with the bounded off-ramp + wire mapping in place:

```
Test Suites: 2 passed, 2 total
Tests:       129 passed, 129 total
```

---

## RED — fix reverted (proves the tests are load-bearing)

The fix was reverted to the pre-`#2212` behaviour to confirm the regression tests
detect its absence. Two reversions, mirroring the two layers AC-5 names:

1. `retention.ts` `processRecallResult` — restored the pre-`#2212` computation
   (`newFailureCount >= 3 ? 'redirect_to_library' : 'feedback_only'`) in place of the
   `re_teach@3 / topic_parked@4+` state machine.
2. `retention-data.ts` `processRecallTest` — restored the pre-`#2212` passthrough
   (`failureAction: result.failureAction`, no `offRampStage`) in place of the wire
   mapping.

> Method note: the `failureAction` union types were widened to a superset during the
> revert so the *current* (fixed) test suite still compiles against the reverted
> implementation — the change under test is the runtime behaviour, not the types. No
> test file was modified.

Captured output — **2 suites fail, 6 tests fail**:

```
  ● processRecallResult › returns re_teach (bounded off-ramp) on third failure
    Expected: "re_teach"
    Received: "redirect_to_library"
  ● processRecallResult › returns topic_parked on the second consecutive failure after re-teach (4th failure)
    Expected: "topic_parked"
    Received: "redirect_to_library"
  ● processRecallResult › stays topic_parked on further consecutive failures (no infinite re-teach loop)
    Expected: "topic_parked"
    Received: "redirect_to_library"
  ● processRecallTest › returns re_teach with a hint and no remediation on the 3rd failure (WI-1462 / RR-4)
    Expected: "feedback_only"
    Received: "re_teach"
  ● processRecallTest › returns topic_parked with remediation on the 2nd consecutive failure after re-teach (4+ failures)
    Expected: "redirect_to_library"
    Received: "topic_parked"
  ● processRecallTest › remains parseable by the pre-WI-1462 response schema (re_teach and topic_parked)
    Expected: true
    Received: false

Test Suites: 2 failed, 2 total
Tests:       6 failed, 123 passed, 129 total
```

The three `retention.test.ts` failures show the bounded state machine's assertions
failing under `redirect_to_library`-only behaviour (exactly AC-5's wording). The three
`retention-data.test.ts` failures show the wire mapping absent — including the
backward-compat regression (`remains parseable by the pre-WI-1462 response schema`),
which flips `Expected: true → Received: false` when the mapping is removed, confirming
that test is load-bearing for the `#2215` compatibility guarantee.

---

## RESTORE — fix re-applied

Both source files restored (`git checkout -- …`, test files untouched); the suite
returns to green:

```
Test Suites: 2 passed, 2 total
Tests:       129 passed, 129 total
```

Red → Green → Revert-red → Restore-green confirmed: the regression tests fail without
the fix and pass with it, and the change is the runtime behaviour of the two named
services.
