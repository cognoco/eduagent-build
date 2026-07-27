# WI-2840 red-green evidence

## RED

Command:

```bash
pnpm exec jest --config scripts/jest.config.cjs scripts/claude-review-scope-workflow.test.ts --runInBand --no-coverage
```

Before production changes: 1 suite failed, 5 tests failed. Every case stopped at `Missing workflow run step: Capture authoritative PR files`, proving the workflow had no authoritative-manifest seam.

## GREEN

Command:

```bash
pnpm exec jest --config scripts/jest.config.cjs scripts/claude-review-scope-workflow.test.ts scripts/check-github-workflow-security.test.ts --runInBand --no-coverage
```

After the repair: 2 suites passed, 49 tests passed. The PR #2664-shaped normal-merge case now emits `REVIEW_SCOPE_CORRUPTION`, sets `merge_eligible: false`, identifies the base-only path, and exits non-zero. In-diff findings, no-finding approval, unchanged-head rerun, malformed metadata, and absent fresh-verdict variants also pass their distinct assertions.
