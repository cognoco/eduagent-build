What was done:

Eliminated the teardown race in the profiles-dropped migration replay test without changing its scratch-database setup, migration replay, isolation, or assertions. Teardown now waits for the scratch database's PostgreSQL backends to disappear before dropping it and never force-terminates a closing pool client.

What changed:

Added one focused teardown helper that closes the scratch pool, polls `pg_stat_activity` by the generated database name, and performs a normal quoted `DROP DATABASE` only after the count reaches zero. The wait is bounded at ten seconds; timeout preserves the database and reports the lingering connection instead of falling back to `WITH (FORCE)`. The integration suite delegates its `afterAll` cleanup to this helper while retaining admin-pool shutdown and temporary-directory cleanup in `finally` blocks. Added a non-DB unit/static regression covering integration wiring, multi-poll ordering, normal DROP, and the no-force timeout path.

Verification:

Observed red before implementation: the focused regression failed because the integration source had no drain-aware teardown call and still contained `DROP DATABASE ... WITH (FORCE)`. Observed green after implementation: 3/3 focused assertions. The full API unit gate completed at 493/493 suites and 9,462 assertions green with 11 pre-existing skips; project-reference TypeScript build completed with no diagnostics; changed-file ESLint and Prettier checks completed cleanly. No DB-backed local command was run. The first unit attempt without an explicit process-local URL was refused by the existing shared-environment guard, confirming that the ambient staging target remained protected; successful non-DB runs used a process-only localhost port-1 placeholder and the unit Jest config, which excludes integration tests.

Caveats / Follow-ups:

This host has no proven disposable local PostgreSQL endpoint, while both `.env.development.local` and the Doppler default resolve to shared staging. Therefore the real profiles-dropped replay suite was deliberately not executed locally. The draft PR's CI workflow is the real-database gate: its required main lane and independent flag-on diagnostic lane each provision a disposable pgvector Postgres service and run the co-located integration suite. The direct `tsc -p apps/api/tsconfig.app.json` probe is not a valid clean-worktree gate because project-reference outputs are initially absent and it surfaces unrelated downstream diagnostics; the canonical `tsc --build` invocation was used instead. The full API unit command emits an existing ts-jest `esModuleInterop` configuration warning.
