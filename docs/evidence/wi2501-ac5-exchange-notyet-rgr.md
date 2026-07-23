# WI-2501 — Red-Green-Revert evidence (Bug DoD, AC-5, bounce #1)

**Item:** WI-2501 — Terminalize completed `not_yet` mentor-notice offers idempotently.
**Bounce:** reviewer:codex:global flagged that AC-5's red/green streaming AND
non-streaming coverage existed for the `deferred` recheck outcome
(`session-exchange.integration.test.ts` → `mentor-notice defer derives the
learning day from local 04:00`) but NOT for the completed `not_yet` variant —
the only regression covering `not_yet` called `applyMentorNoticeOutcome`
directly (`tests/integration/mentor-notice-lifecycle.integration.test.ts`),
never through the two production exchange call sites.

**Fix under test (already landed, unchanged by this PR):** the terminal-status
mapping in `apps/api/src/services/mentor-notices/state.ts` (`applyMentorNoticeOutcome`,
around lines 229-254) — every non-`deferred` outcome (`locked_in`, `dismissed`,
`not_yet`) writes its own value as `status`, rather than the old bug where
`not_yet` fell back to `status: 'open'`.

**New coverage added by this PR:** `apps/api/src/services/session/session-exchange.integration.test.ts`
→ `describe('mentor-notice not_yet terminalization through the exchange call
sites')` — two cases, one per production call site
(`processMessage` at `session-exchange.ts:4274-4287`, `streamMessage` at
`session-exchange.ts:4895-4908`), mirroring the existing `deferred` paired
coverage. Both drive a completed `not_yet` re-check through the real exchange
functions (never `applyMentorNoticeOutcome` directly) and assert the notice's
`status` moves to `'not_yet'` (never stays `'open'`).

## GREEN — fix present (baseline)

```
mentor-notice not_yet terminalization through the exchange call sites
  ✓ processMessage terminalizes a completed not_yet re-check to a non-open status (45 ms)
  ✓ streamMessage terminalizes a completed not_yet re-check to a non-open status (42 ms)
...
Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
```

Full command: `DATABASE_URL=postgresql://test@localhost:54331/eduagent_test
pnpm exec jest --config apps/api/jest.integration.config.cjs --forceExit
--testPathPatterns='session-exchange.integration.test.ts'` — full local
disposable-Postgres suite (`apps/api/src/**/*.integration.test.ts` co-located
file), all 19 cases in the file pass, not just the 2 new ones.

## RED — not_yet terminal mapping reverted (proves the new cases are load-bearing)

Temporary local edit to `apps/api/src/services/mentor-notices/state.ts`
(`applyMentorNoticeOutcome`), reproducing the pre-fix bug:

```diff
-  const nextStatus = input.outcome;
+  const nextStatus =
+    // TEMP RED-PHASE REVERT (WI-2501 AC-5 evidence capture) — reproduces the
+    // pre-fix bug: a completed not_yet re-check fell back to 'open'.
+    input.outcome === 'not_yet' ? 'open' : input.outcome;
```

Same command, same file:

```
mentor-notice defer derives the learning day from local 04:00
  ✓ processMessage re-defers a notice deferred in the previous learning day (106 ms)
  ✓ streamMessage re-defers a notice deferred in the previous learning day (58 ms)
mentor-notice not_yet terminalization through the exchange call sites
  ✕ processMessage terminalizes a completed not_yet re-check to a non-open status (54 ms)
  ✕ streamMessage terminalizes a completed not_yet re-check to a non-open status (55 ms)
mentor-notice creation (WI-2500)
  ✓ processMessage produces an accepted mentor notice from a genuine slip (65 ms)
  ✓ streamMessage produces an accepted mentor notice from a genuine slip (56 ms)

  ● ... processMessage terminalizes a completed not_yet re-check to a non-open status

    expect(received).toBe(expected) // Object.is equality

    Expected: "not_yet"
    Received: "open"

  ● ... streamMessage terminalizes a completed not_yet re-check to a non-open status

    expect(received).toBe(expected) // Object.is equality

    Expected: "not_yet"
    Received: "open"

Test Suites: 1 failed, 1 total
Tests:       2 failed, 17 passed, 19 total
```

Exactly the two new cases fail; the sibling `deferred` and `creation` describe
blocks — which exercise the same two exchange call sites for different
outcomes — stay green, confirming the RED is specific to the `not_yet`
terminal-status mapping and not an artifact of the harness or fixture.

## RESTORE — fix re-applied

```diff
-  const nextStatus =
-    // TEMP RED-PHASE REVERT (WI-2501 AC-5 evidence capture) — reproduces the
-    // pre-fix bug: a completed not_yet re-check fell back to 'open'.
-    input.outcome === 'not_yet' ? 'open' : input.outcome;
+  const nextStatus = input.outcome;
```

`git diff apps/api/src/services/mentor-notices/state.ts` after restore: empty
(`git status --porcelain` shows nothing for that file) — confirming this PR
ships a test-only change; production code is untouched.

Re-ran the full command a third time: 19/19 pass (identical output to the
GREEN section above).
