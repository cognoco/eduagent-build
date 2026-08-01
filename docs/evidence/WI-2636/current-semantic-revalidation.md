# WI-2636 revision-coherent semantic revalidation

Recorded 2026-07-30 against `e90b6c94a2f92d76a8a566d642946779df7033ff`.

## Program and command

The documented program remains `tests/integration/tsconfig.json`. It inherits the
strict repository base and selects the seventy-one tracked
`tests/integration/*.integration.test.ts` roots plus `tests/integration/setup.ts`,
matching `tests/integration/jest.config.cjs`; TypeScript follows their transitive
imports. The repeatable command is:

```text
pnpm typecheck:integration
```

That command expands to `tsc --project tests/integration/tsconfig.json` and exited
zero with no diagnostics on the clean current tree. The program has no selected-file
or import exclusions, suppressions, filename allowlists, quarantines, or relaxed
strictness settings.

## Before and after inventories

The original landing inventory is retained in
`docs/evidence/WI-2636/completion-summary.md`: 263 actionable diagnostics across
14 TypeScript codes before repair, then zero. The later review bounce was reproduced
in this coherent worktree by temporarily restoring the pre-`d0968c525` form of
`tests/integration/memory-facts-dedup.integration.test.ts`. The exact command then
exited 2 with exactly five `TS2345` diagnostics: all five reported a missing required
`provider` property in the dedup LLM fixture calls.

The diagnostic positions 95, 173, 235, 296, and 374 are historical positions from
that temporary pre-`d0968c525` source shape, not current-tree citations. In the
landed repaired source, the five `llmDeps` calls begin at lines 103, 182, 245, 307,
and 386; their required `provider` fields are at lines 110, 186, 249, 311, and 390.

Restoring the independently landed WI-2896 fixture revision
`d0968c525543d53008a238d64654c652d67bdf8a` restored the same semantic command to
zero diagnostics. Its provider fields and real `llmDeps` adapter are therefore part
of the repaired graph rather than an ignored or suppressed exception.

## Guard-consumer check

Temporarily adding the exact WI-2578 fixture
`const x: number = 'deliberate type error';` to the selected setup root made the
same command exit 2 with `TS2322` (and the expected unused-binding `TS6133`).
Removing only that fixture restored a clean command exit. This verifies that WI-2578
can consume the baseline unchanged and that the guard still detects a deliberate
type error.

## Behaviour evidence

No integration database was accessed during this semantic revalidation. Behaviour
evidence remains the merged WI-2636 disposable-database CI job recorded in
`docs/evidence/WI-2636/ci-results.json`: 71 cross-package suites, 589 passed tests,
and 3 explicitly reported skips. The revalidation changed no runtime or test code.

## Governed landing evidence

The evidence-only revalidation was merged through
[PR #2723](https://github.com/cognoco/eduagent-build/pull/2723). Its reviewed PR
head was `65eacb9caf69b8ebaf757268f43f40ba2f95ead0`; the later merge commit on
`main` was `81e1aa43f81501fef7dde85d0541f4b29ef3f86a`. The CI and Claude approval
therefore validate the reviewed PR head, not the later merge commit.

[`governed-landing.json`](governed-landing.json) preserves the source URLs and the
durable job and approval facts that would otherwise be lost to external retention or
editing: CI workflow/run/job identity, exact head, status, conclusion, and timestamps;
and the Claude APPROVED verdict, author, timestamp, Must-fix/Should-fix counts, and
full approval body. The preserved CI job is the successful
[Flag-ON integration job](https://github.com/cognoco/eduagent-build/actions/runs/30579841099/job/90997051001),
and the source approval remains linked from the record.
