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

After the initial repair: 2 suites passed, 50 tests passed. The PR #2664-shaped normal-merge case emits `REVIEW_SCOPE_CORRUPTION`, sets `merge_eligible: false`, identifies the base-only path, and exits non-zero. In-diff findings, no-finding approval, unchanged-head rerun, malformed metadata, absent fresh-verdict, and removed post-capture head-check variants pass their distinct assertions.

## REVIEW-FINDING RED

After Codex identified that the writable reviewer could overwrite the prompt-facing manifest, the new tampering regression was run before the workflow amendment:

```bash
pnpm exec jest --config scripts/jest.config.cjs --runInBand scripts/claude-review-scope-workflow.test.ts
```

Result: 1 suite failed, 1 of 7 tests failed with `Missing workflow run step: Refresh authoritative PR files`. The other 6 tests remained green. This proves the evaluator had no post-review authoritative refresh.

## REVIEW-FINDING GREEN

After adding the exact-head refresh and structural ordering ratchet:

```bash
pnpm exec jest --config scripts/jest.config.cjs --runInBand scripts/claude-review-scope-workflow.test.ts scripts/check-github-workflow-security.test.ts
```

Result: 2 suites passed, 52 tests passed. The tampering fixture first widens the manifest with a base-only path, then executes the workflow's real post-review refresh; the fresh GitHub manifest removes that path and the evaluator fails closed on the out-of-scope finding.
