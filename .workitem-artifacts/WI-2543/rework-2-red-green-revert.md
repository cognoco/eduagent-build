# WI-2543 rework 2 red-green-revert receipt

Date: 2026-07-31

Revision under test: `44f31db`

The mutation check used a disposable detached worktree. It retained the new
regression tests while restoring only the production and manifest files from
the parent revision. No database connection was made; Jest received an
explicit loopback-only placeholder `DATABASE_URL`.

## Production-revert RED

Command:

```text
DATABASE_URL=postgresql://test:test@localhost:5432/mentomate_test pnpm exec jest --config apps/api/jest.config.cjs --runInBand --no-coverage --runTestsByPath apps/api/src/middleware/metering.coverage.guard.test.ts apps/api/src/services/session/session-summary.test.ts apps/api/src/services/recall-bridge.test.ts
```

Result: 3 suites failed; 6 tests failed and 38 passed. The failures showed that
the parent production revision lacked the exhaustive route inventory, ignored
the injected summary consent boundary, and still dispatched Recall Bridge
after consent withdrawal.

Machine result: `/tmp/WI-2543-red.json` during execution.

## Exact restore GREEN

The same disposable worktree then restored every reverted production and
manifest file byte-for-byte from `44f31db` and reran the identical command.

Result: 3 suites passed; 50 tests passed and 0 failed.

Machine result: `/tmp/WI-2543-restore-green.json` during execution.

## Broader focused GREEN

The 15 affected original and rework suites passed at the candidate revision:
15 suites, 595 tests, 0 failures. API type-check, changed-file ESLint, Prettier,
and `git diff --check` also passed.

Machine result: `/tmp/WI-2543-focused.json` during execution.
