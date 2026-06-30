What was done:
- Strengthened /now route integration coverage for WI-1129.

What changed:
- Added real database fixtures for due retention cards in apps/api/src/routes/now.integration.test.ts.
- Added integration coverage proving retention_due cards rank before ledger_moment cards for the active profile.
- Added integration coverage proving the route caps visible cards at three and reports overflowCount for additional candidates.
- Confirmed existing now-feed unit coverage already verifies resolveDeepLink missing-param failures and valid deep-link metadata.

Verification:
- pnpm exec prettier --check apps/api/src/routes/now.integration.test.ts
- pnpm exec jest --config apps/api/jest.integration.config.cjs apps/api/src/routes/now.integration.test.ts --runInBand --no-coverage
- pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/now-feed.test.ts --runInBand --no-coverage
- pnpm exec nx run api:typecheck
- pnpm exec nx run api:test
- git diff --check
- GitHub PR #1683: API Quality Gate, main, Flag-ON integration, Merge completeness, Playwright web smoke, CodeRabbit, claude-review, and run-smoke passed.

Caveats / Follow-ups:
- None.
