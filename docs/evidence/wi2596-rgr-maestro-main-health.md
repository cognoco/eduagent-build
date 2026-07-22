# WI-2596 — red-green-revert evidence

Maestro E2E shards 2+3 are red on main and invisible to change-class routing.

The guard landed for the invisibility defect (AC-3) is the Maestro-on-main health
surfacer: `scripts/check-maestro-main-health.ts` + `scripts/check-maestro-main-health.test.ts`.
Its job is to read the last-known Maestro-on-main status from workflow-run history
and classify it green / red / stale, INDEPENDENT of change-class routing, so a
scheduled workflow can go visibly red when main is unhealthy. RGR proves the guard's
red-detection is load-bearing, not vacuous.

## Scope confirmed at baseline

- Baseline: `origin/main` at claim time (`3f2e421e`).
- Both failing assertions confirmed red in real CI: run `29859762770` over
  `ba6c01b28` (2026-07-21) — shard 2 `Assert id: more-row-subscription is visible
  ... FAILED`; shard 3 `Assert id: progress-subject-back is visible ... FAILED`.
  Shards 1 and 4 green. (Full attribution in the completion summary / AC-1.)
- The two testIDs still exist in source (`more/account.tsx:137`,
  `progress/[subjectId]/index.tsx:381`) — the app is behaving correctly; the
  seed/fixtures drifted under the V2 supportership-aware seed. The assertions are
  therefore left intact (AC-5) and the flows are quarantined (AC-2), not weakened.

## Cycle executed

The regression guard is the pure classifier `classifyMaestroHealth` in
`scripts/check-maestro-main-health.ts`, exercised by
`scripts/check-maestro-main-health.test.ts` (9 cases: green / red / red-behind-a
change-class-skipped-run / stale-no-execution / stale-too-old / fresh / non-main
filtered, plus the `isMaestroJob` / `runExecutedMaestro` helpers).

Command (Node 22 on PATH; see toolchain note):
`pnpm exec jest --config scripts/jest.config.cjs scripts/check-maestro-main-health.test.ts --no-coverage --verbose`

1. **GREEN (guard present)** — full suite green:

   ```
   Tests:       9 passed, 9 total
   ```

2. **RED (revert the fix)** — `failingMaestroShards()` neutralised to `return []`
   (red detection disabled), guard test re-run. Exactly the two red-detection
   cases fail; stale/green/filter cases stay green:

   ```
     classifyMaestroHealth
       ✓ GREEN when the most recent executed run passed every shard (1 ms)
       ✕ RED when the most recent executed run has a failing shard (3 ms)
       ✕ ignores change-class-skipped runs and reads the most recent EXECUTED run (1 ms)
       ✓ STALE when no fetched run executed Maestro at all (1 ms)
       ✓ STALE when the last executed run is older than the freshness window (2 ms)
       ✓ does not go stale when the last executed run is within the window
       ✓ filters out runs whose head branch is not main (1 ms)

     ● classifyMaestroHealth › RED when the most recent executed run has a failing shard

       expect(received).toBe(expected) // Object.is equality

       Expected: "red"
       Received: "green"

       > 83 |     expect(result.verdict).toBe('red');

     ● classifyMaestroHealth › ignores change-class-skipped runs and reads the most recent EXECUTED run

       expect(received).toBe(expected) // Object.is equality

       Expected: "red"
       Received: "green"

       > 107 |     expect(result.verdict).toBe('red');

   Test Suites: 1 failed, 1 total
   Tests:       2 failed, 7 passed, 9 total
   ```

3. **RESTORE + GREEN** — `failingMaestroShards()` restored to its real body; full
   suite green again:

   ```
   PASS scripts/check-maestro-main-health.test.ts
   Test Suites: 1 passed, 1 total
   Tests:       9 passed, 9 total
   ```

## Quarantine verification (AC-2)

The quarantine (drop `pr-blocking` → `blocked` on the two flows and remove their
`ci-maestro-manifest.json` `pr` entries) is a routing change, not a local-runnable
guard, so it is verified rather than RGR'd: `apps/mobile/e2e/scripts/ci-maestro-plan.mjs
--suite pr --all` still validates the manifest (bidirectional `pr-blocking`↔`manifest.pr`
consistency stays green) and no longer emits either flow. Command + observed output are
in the completion summary. The two assertions remain byte-for-byte intact in the flow
files (AC-5); only the tag and the manifest membership changed.

## Toolchain note

Local system Node is v24 (breaks eduagent-build's pre-push `helpers.test.ts` per
repo convention); every jest run above used a local Node 22 binary
(`~/.local/node22/bin`) on `PATH`, matching the repo's declared `engines.node: 22.x`.
Commit/push hooks run under Node 22 the same way. Verbatim captures were taken via
redirected files (the terminal proxy compresses inline test output).
