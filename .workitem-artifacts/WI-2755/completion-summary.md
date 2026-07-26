What was done:

Eliminated the teardown race in the profiles-dropped migration replay test without changing its scratch-database setup, migration replay, isolation, or assertions. Teardown now waits for the scratch database's PostgreSQL backends to disappear before dropping it and never force-terminates a closing pool client.

What changed:

Added one focused teardown helper that closes the scratch pool, polls `pg_stat_activity` by the generated database name, and performs a normal quoted `DROP DATABASE` only after the count reaches zero. Source-artifact QA then showed that the real backend could remain visible through the original ten-second deadline even though every migration replay assertion had passed. The bounded default drain window is now thirty seconds, while timeout still preserves the database and reports the lingering connection instead of falling back to `WITH (FORCE)` or terminating a backend. The integration suite delegates its `afterAll` cleanup to this helper while retaining admin-pool shutdown and temporary-directory cleanup in `finally` blocks.

Verification:

Initial implementation evidence remains green: the full API unit gate completed at 493/493 suites and 9,462 assertions with 11 pre-existing skips, and the project-reference TypeScript build plus changed-file ESLint and Prettier checks completed cleanly. For this rework, the new ten-second-linger regression was first observed red against the original default, throwing `Timed out waiting for connections to close for scratch database \"wi2755_replay_test\"`; after extending the bounded default it passed with the complete focused suite at 4/4. The suite now proves both eventual safe cleanup after the observed linger and preservation on an explicit genuine timeout. No DB-backed local command was run. Successful non-DB runs used a process-only localhost port-1 placeholder and the unit Jest config, which excludes integration tests.

Caveats / Follow-ups:

This host has no proven disposable local PostgreSQL endpoint, while both `.env.development.local` and the Doppler default resolve to shared staging. Therefore the real profiles-dropped replay suite was deliberately not executed locally. The pull request's CI workflow is the real-database gate: its required main lane and independent flag-on diagnostic lane each provision a disposable pgvector Postgres service and run the co-located integration suite. The direct `tsc -p apps/api/tsconfig.app.json` probe is not a valid clean-worktree gate because project-reference outputs are initially absent and it surfaces unrelated downstream diagnostics; the canonical `tsc --build` invocation is used instead. The full API unit command emits an existing ts-jest `esModuleInterop` configuration warning.
