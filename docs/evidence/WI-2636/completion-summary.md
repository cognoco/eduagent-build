**What was done:**

Added a strict semantic TypeScript program for every integration suite and setup root selected by `tests/integration/jest.config.cjs`, repaired the existing type debt throughout its imported graph, and exposed the checker as `pnpm typecheck:integration`. This evidence-only follow-up publishes the WI-specific manifest and completion record at unambiguous tracked paths; it does not change the landed implementation.

**What changed:**

- `tests/integration/tsconfig.json` inherits the repository's strict base configuration, mirrors the Jest suite and setup roots, and follows all transitive imports. Its compatibility options make the existing import closure representable without excluding files or weakening strictness.
- The landed repair covers integration fixture API/signature drift, unsafe union and indexed access, null/undefined handling, external mock contracts, Drizzle inserts, stale unused bindings, the named session pipeline and session service failures, and the transitive mobile Hono/Worker response contract.
- The unadjusted graph began with 334 diagnostics across 16 codes: TS2322 80, TS2345 73, TS5097 52, TS2532 34, TS6142 24, TS2339 14, TS7006 14, TS2769 12, TS6133 8, TS7019 7, TS2352 5, TS18048 4, TS2353 4, TS2554 1, TS2740 1, and TS6192 1.
- After required compiler/import-closure compatibility, the actionable inventory was 263 diagnostics across 14 codes: TS2322 81, TS2345 77, TS2532 34, TS2339 14, TS7006 14, TS2769 12, TS6133 8, TS7019 7, TS2352 5, TS18048 4, TS2353 4, TS2554 1, TS2740 1, and TS6192 1. The final inventory is zero.
- The machine-readable manifest is tracked at `docs/evidence/WI-2636/evidence.json`; no claim or summary relies on the unrelated repository-root manifest.

**Verification:**

- `pnpm exec tsc --project tests/integration/tsconfig.json --pretty false` exited successfully with zero diagnostics. The compiler root listing matched all seventy-one tracked integration suites and the single Jest setup root.
- Temporarily adding the exact fixture `const x: number = 'deliberate type error';` to the setup root produced TS2322 and TS6133. Removing it restored the exact semantic command to zero.
- Changed-file ESLint, `pnpm exec nx run @eduagent/mobile:typecheck`, the affected mobile response/parsing/SSE/query/subscription tests, and `git diff --check` all exited successfully during implementation verification.
- The authoritative disposable-database CI job is [Flag-ON integration](https://github.com/cognoco/eduagent-build/actions/runs/30206001832/job/89804052076), which concluded successfully for PR #2624. `pnpm exec nx run api:test:integration` completed all seventy-one cross-package suites with five hundred eighty-nine passing and three skipped tests. `pnpm exec nx run api:integration-api` completed one hundred fifty of one hundred fifty-two co-located suites with one thousand one hundred thirty-seven passing and eight skipped tests; the other two suites were skipped. Exact numeric totals and provenance are tracked in `docs/evidence/WI-2636/ci-results.json`.
- The tracked manifest at `docs/evidence/WI-2636/evidence.json` covers every acceptance-criteria unit with revision-resolvable repository paths.

**Caveats / Follow-ups:**

No ambient database was accessed for this evidence-only rework. Integration behavior is supported by the successful disposable-database CI job above; its reported skips are preserved exactly rather than reclassified as passes. The earlier local shell used Node 24 while the repository declares Node 22, but every recorded non-DB check exited successfully.
