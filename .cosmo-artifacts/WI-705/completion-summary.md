What was done:

Modernized the ASSUMP-F14 RLS coverage scanner so it detects real Drizzle profile-column declarations instead of bare profile_id text in comments, and documented the post-cutover person_id ownership boundary.

What changed:

Added profile-scoped scanner regression tests, replaced the raw substring scan with a declaration-aware matcher, removed the stale topic_connections false-positive exception, and kept curriculum_topics as a specific non-ownership profile-like exception. Updated RLS coverage comments/tests to make person-model RLS explicit-manifest-owned rather than blanket person_id-scanned. No live RLS manifest metadata was widened.

Verification:

Ran pnpm exec nx test @eduagent/database --skip-nx-cache; 27 suites and 299 tests passed. Ran pnpm exec jest --config apps/api/jest.config.cjs --runInBand --no-coverage apps/api/src/services/database-rls-coverage.test.ts; 7 tests passed. Ran Prettier check on touched files. Pre-push validation passed tsc --build and related API Jest. GitHub required checks passed: API Quality Gate, CI main, Claude review, E2E changes, Merge completeness, run-smoke, Playwright smoke, and CodeRabbit status. The Flag-ON integration lane failed with the known non-blocking identity-v2 diagnostic failure.

Caveats / Follow-ups:

The API Jest command emitted the existing ts-jest esModuleInterop warning. No follow-ups for WI-705.
