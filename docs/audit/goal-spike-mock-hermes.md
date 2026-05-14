# /goal Spike: GC1 Internal Mock Drain (API) - Hermes Edition

> **For Hermes agentic workers:** Execute this as one continuous `/goal` session. This version is intentionally more prescriptive than the Codex plan because it may be run by a less capable coding model. Prefer sequential coordinator-local edits. Use subagents only for simple, disjoint, one-file work when explicitly supported. The coordinator owns verification, commits, and final status.

**Goal:** Eliminate all shadow internal mocks from API and integration test files.

**Architecture:** Convert relative-path `jest.mock()` and `jest.doMock()` calls from fully synthetic internal module mocks to partial real-module mocks, or remove route-layer mocks by testing through real Hono `app.request()` when that is clearly safer. Preserve test intent and all test cases.

**Tech Stack:** Jest, TypeScript, Hono, Nx, pnpm, Husky GC1 ratchet.

---

## Hermes Execution Rules

This plan is optimized for reliable execution by Qwen/Gemma-class coding models:

- Follow the commands and file scope literally.
- Do not infer broader scope from nearby files.
- Do not start a conversion batch if the recomputed exit metrics are already `0`.
- Prefer small, sequential batches over parallel edits.
- Treat worker success reports as untrusted until the coordinator verifies `git diff`, metrics, and tests.
- When a choice is ambiguous, choose the smaller edit that preserves existing test behavior.

## Goal Statement

Eliminate all **shadow internal mocks** from API test files. A shadow mock is a relative-path internal mock such as `jest.mock('./x', ...)`, `jest.mock('../x', ...)`, or `jest.doMock('../x', ...)` whose factory does not preserve the real module exports.

A mock is acceptable only when the factory contains both:

1. `jest.requireActual(...)`
2. A spread of the real exports, such as `...actual`

Every shadow mock must be converted to one of these patterns:

- **Pattern A:** Partial real-module mock with `jest.requireActual()` and `...actual`.
- **Pattern B:** Remove the mock and exercise the route with real Hono `app.request()` against the test DB, for route tests only.

There is no exemption path. `gc1-allow` is an audit marker on the mock call line; it does not replace Pattern A or Pattern B.

## One-Session Contract

This plan is optimized for a single `/goal` session:

- Do not intentionally stop after a small batch and leave normal continuation to a later session.
- Use batches for risk control, not for session boundaries.
- Commit incrementally inside the same session after verified coherent batches.
- If context compacts, continue from git, this file, and the metrics below. Treat resume as failure recovery, not the expected path.
- Do not push unless the user explicitly asks for push.

## Scope

In scope:

- `*.test.ts` under `apps/api/src/`
- `*.integration.test.ts` under `tests/integration/`
- Relative internal mocks using `jest.mock()` or `jest.doMock()`

Out of scope:

- `apps/mobile/`
- `eslint-rules/`
- Non-relative package mocks such as `@eduagent/database`, unless a touched test needs a local cleanup to keep the file coherent.

Protect unrelated work:

- Current known unrelated dirty file: `.vscode/settings.json`
- Do not stage, edit, or revert unrelated changes.

## Authoring Baseline

Informational baseline from the original checkout on 2026-05-14:

- `275` relative internal `jest.mock` / `jest.doMock` call sites
- `222` shadow mocks
- `227` internal mock call lines without same-line `gc1-allow`
- `103` files with relative internal mocks
- `100` files with at least one shadow internal mock

Do not use these numbers as a gate. Recompute before execution and follow the live metrics. The working tree may have moved.

If recomputed Metric 1 and Metric 2 are already `0`, stop editing immediately. Run final verification, inspect the existing diff, and commit only the already-present coherent changes via the commit skill.

## Exit Metrics

Metric 1 is substantive: zero shadow internal mocks.

```bash
shadow_count=$(
  rg -n "jest\.(mock|doMock)\(['\"\`]\.\.?/" --glob "*.test.ts" apps/api/src/ --glob "*.integration.test.ts" tests/integration/ \
  | while IFS=: read -r f l _; do
      window=$(tail -n +"$l" "$f" | head -30)
      echo "$window" | grep -q "requireActual" && echo "$window" | grep -qE '\.\.\.[A-Za-z_$][A-Za-z0-9_$]*' && continue
      echo "$f:$l"
    done \
  | wc -l | tr -d ' '
)
echo "Shadow internal mocks remaining: $shadow_count"
```

Target: `0`

Metric 2 is audit coverage: zero untagged relative internal mocks.

```bash
untagged_count=$(
  rg -n "jest\.(mock|doMock)\(['\"\`]\.\.?/" --glob "*.test.ts" apps/api/src/ --glob "*.integration.test.ts" tests/integration/ \
  | while IFS=: read -r f l _; do
      line=$(sed -n "${l}p" "$f")
      echo "$line" | grep -q "gc1-allow" || echo "$f:$l"
    done \
  | wc -l | tr -d ' '
)
echo "Internal mocks without gc1-allow: $untagged_count"
```

Target: `0`

Metric detail output:

```bash
rg -n "jest\.(mock|doMock)\(['\"\`]\.\.?/" --glob "*.test.ts" apps/api/src/ --glob "*.integration.test.ts" tests/integration/ \
| while IFS=: read -r f l _; do
    window=$(tail -n +"$l" "$f" | head -30)
    echo "$window" | grep -q "requireActual" && echo "$window" | grep -qE '\.\.\.[A-Za-z_$][A-Za-z0-9_$]*' && continue
    echo "$f:$l"
  done
```

The heuristic intentionally requires `requireActual` and `...actual` near the mock call. If a valid conversion remains a false positive, prefer making the mock factory locally obvious instead of weakening the metric.

The heuristic is not a behavioral proof. For every changed mock, also verify the per-file checklist below.

## Constraints

1. Do not delete any `describe()`, `it()`, or `test()` block.
2. Do not use `eslint-disable`.
3. Do not use `--no-verify`.
4. Do not touch `apps/mobile/`.
5. Do not edit `eslint-rules/` as part of this spike.
6. Preserve original mock behavior except for adding real-export passthrough.
7. Subagents must not run `git add`, `git commit`, or `git push`.
8. Coordinator commits sequentially with the repo commit skill.
9. If a touched file has unrelated user edits, work with them. Do not revert them.

## Pattern A - Partial Real-Module Mock

Use Pattern A as the default.

```typescript
jest.mock('../services/llm' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/llm',
  ) as typeof import('../services/llm');

  return {
    ...actual,
    routeAndCall: jest.fn().mockResolvedValue({
      content: 'mock response',
    }),
  };
});
```

Required:

- `gc1-allow` on the same line as `jest.mock(` or `jest.doMock(`
- `jest.requireActual(...)`
- `...actual` in the returned object
- The `jest.requireActual()` specifier exactly matches the mock call specifier
- `...actual` appears before test-specific overrides
- Typed `typeof import('<same module specifier>')` where practical

Equivalent compact form is acceptable when it passes both metrics:

```typescript
jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/account'),
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
  }),
}));
```

For `jest.doMock`, use the same rule:

```typescript
jest.doMock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');

  return {
    ...actual,
    inngest: {
      createFunction: jest.fn((cfg, _trigger, handler) => ({
        fn: handler,
        opts: cfg,
        _config: cfg,
        id: cfg.id,
      })),
      send: jest.fn(),
    },
  };
});
```

## Pattern B - Real Route Request

Use Pattern B only when a route test is better expressed through the real route boundary and the test already has workable auth/test DB setup.

```typescript
import { app } from '../index';

const res = await app.request(
  '/v1/some-route',
  {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify(payload),
  },
  TEST_ENV,
);

expect(res.status).toBe(200);
```

Pattern B removes the mock entirely, so no `gc1-allow` is needed for that removed call. Do not rewrite route tests wholesale unless Pattern A is materially worse or impossible.

## Per-File Conversion Checklist

Before leaving each modified file, verify:

1. The file contains the same `describe()`, `it()`, and `test()` blocks as before.
2. Every changed mock uses the exact same specifier in `jest.mock()`/`jest.doMock()` and `jest.requireActual()`.
3. `...actual` appears before all overrides in each partial mock.
4. Existing mock return values, thrown errors, and `jest.fn()` behavior are preserved.
5. Same-line `gc1-allow` exists on every remaining relative internal `jest.mock()`/`jest.doMock()` call.
6. No unrelated fixtures, setup helpers, route paths, or assertions were rewritten.
7. The targeted test command for that file passed.

## Execution Strategy

### Step 0 - Snapshot

Run:

```bash
git status --short --branch
git log --oneline -5
```

Record unrelated dirty files and avoid them.

### Step 1 - Inventory

Run:

```bash
rg -n "jest\.(mock|doMock)\(['\"\`]\.\.?/" --glob "*.test.ts" apps/api/src/ --glob "*.integration.test.ts" tests/integration/ \
| while IFS=: read -r f l _; do
    window=$(tail -n +"$l" "$f" | head -30)
    echo "$window" | grep -q "requireActual" && echo "$window" | grep -qE '\.\.\.[A-Za-z_$][A-Za-z0-9_$]*' && continue
    echo "$f"
  done | sort | uniq -c | sort -nr
```

Classify files:

- **Simple:** 1-2 shadow mocks, no large fixture restructuring.
- **Medium:** 3-5 shadow mocks, route or service file with normal setup.
- **Hard:** 6+ shadow mocks, Inngest lifecycle tests, route files with auth/DB setup, or tests needing Pattern B.

If the inventory output is empty, do not edit. Go directly to Final Verification.

### Step 2 - Pilot Batch

Convert 5 simple files first, or all remaining simple files if fewer than 5 exist. For each file:

1. Convert all shadow mocks in that file to Pattern A.
2. Add same-line `gc1-allow` to every relative internal mock call in that file.
3. Run targeted tests:

```bash
pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath <TARGET_FILE> --no-coverage
```

If the target is under `tests/integration/`, run the relevant integration config instead:

```bash
pnpm exec jest --config tests/integration/jest.config.cjs --runTestsByPath <TARGET_FILE> --no-coverage --maxWorkers=2
```

After the 5-file pilot, run both metrics. Expected shadow-count drop must equal the number of converted shadow mocks.

### Step 3 - Main Batches

Use these batch sizes after the pilot:

- Simple files: 8-12 files per batch.
- Medium files: 4-6 files per batch.
- Hard files: 1-2 files per batch.

Within each batch:

1. Work file-by-file.
2. Run targeted tests for every modified file.
3. Run metrics after all files in the batch.
4. Spot-check 2 changed files visually.
5. Run full API tests before committing:

```bash
pnpm exec nx run api:test
```

6. If the batch modified any `tests/integration/*.integration.test.ts` file, also run:

```bash
pnpm exec nx run api:test:integration
```

7. Commit the verified batch with the commit skill. Do not push.

If a batch fails full API tests, do not commit. Bisect inside the batch using targeted tests and `git diff`.

### Step 4 - Hard Files

Save hard files for after the simple and medium backlog is lower. Do not start with the largest file.

High-count examples from the original authoring snapshot:

- `apps/api/src/inngest/functions/session-completed.test.ts` - 18 shadows
- `apps/api/src/routes/sessions.test.ts` - 7 shadows
- `apps/api/src/services/session/session-cache.test.ts` - 6 shadows

Hard-file rules:

- Prefer coordinator-local edits unless subagent support is clearly available.
- Do one hard file at a time if it touches shared lifecycle setup.
- Run targeted tests immediately after each hard file.
- Run full `api:test` before committing.

## Parallel Worker Template

Default for Hermes: do not use subagents.

Use workers only when all of these are true:

- The platform clearly supports same-session parallel workers.
- The target files are simple, disjoint, and have 1-2 shadow mocks each.
- At most 2 workers run at the same time.
- Each worker owns exactly one file.
- The coordinator has enough context to review the full worker diff.

Use this template only for disjoint single-file work inside the same `/goal` session.

```text
You are converting shadow internal Jest mocks in ONE test file.

REPO ROOT: /Users/vetinari/_dev/eduagent-build/goal/mock-codex
TARGET FILE: <TARGET_FILE>
EXPECTED SHADOW MOCKS IN THIS FILE: <EXPECTED_SHADOW_COUNT>

Definition:
A shadow internal mock is a relative-path jest.mock() or jest.doMock() call whose factory does not contain BOTH:
- jest.requireActual(...)
- a spread of real exports such as ...actual

Required Pattern A:
jest.mock('<specifier>' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('<specifier>') as typeof import('<specifier>');
  return {
    ...actual,
    // preserve existing overrides
  };
});

Rules:
- Modify only TARGET FILE.
- Convert every shadow mock in TARGET FILE.
- Add same-line gc1-allow to every relative internal jest.mock/jest.doMock call in TARGET FILE.
- Preserve every describe(), it(), and test() block.
- Do not use eslint-disable.
- Do not commit, stage, push, or revert unrelated changes.
- Run:
  pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath <TARGET_FILE> --no-coverage
- If TARGET FILE is under tests/integration, use:
  pnpm exec jest --config tests/integration/jest.config.cjs --runTestsByPath <TARGET_FILE> --no-coverage --maxWorkers=2

Report:
1. File modified.
2. Number of shadow mocks converted.
3. Targeted test result.
4. Any unusual behavior or files intentionally left untouched.
```

The coordinator must verify worker output with `git diff`, metrics, and tests. Do not trust worker success text alone.

## Commit Rhythm

Commit after each verified coherent batch, not after every file.

Use the repo commit skill. Expected commit shape:

```text
test(api): convert internal mocks batch <N>
```

Commit body should include:

```text
Verified by:
- test: pnpm exec nx run api:test
- audit: shadow internal mocks remaining: <N>
- audit: untagged internal mocks remaining: <N>
```

Do not push unless explicitly asked.

## Final Verification

Run all of these before claiming the goal is complete:

```bash
# Metric 1
rg -n "jest\.(mock|doMock)\(['\"\`]\.\.?/" --glob "*.test.ts" apps/api/src/ --glob "*.integration.test.ts" tests/integration/ \
| while IFS=: read -r f l _; do
    window=$(tail -n +"$l" "$f" | head -30)
    echo "$window" | grep -q "requireActual" && echo "$window" | grep -qE '\.\.\.[A-Za-z_$][A-Za-z0-9_$]*' && continue
    echo "$f:$l"
  done | wc -l

# Metric 2
rg -n "jest\.(mock|doMock)\(['\"\`]\.\.?/" --glob "*.test.ts" apps/api/src/ --glob "*.integration.test.ts" tests/integration/ \
| while IFS=: read -r f l _; do
    sed -n "${l}p" "$f" | grep -q "gc1-allow" || echo "$f:$l"
  done | wc -l

pnpm exec nx run api:test
pnpm exec nx run api:typecheck
pnpm exec nx run api:lint
```

If any `tests/integration/*.integration.test.ts` files were modified, also run:

```bash
pnpm exec nx run api:test:integration
```

The goal is complete only when:

- Metric 1 returns `0`
- Metric 2 returns `0`
- Required tests pass
- Typecheck passes
- Lint passes
- All commits are made without `--no-verify`

## Failure Handling

If a conversion breaks import-time behavior:

1. Confirm the mock factory uses the exact same specifier in `jest.requireActual()` as the mock call.
2. Confirm `...actual` appears before overrides.
3. Keep mock variable declarations above the mock when Jest hoisting requires it.
4. Use `jest.fn((...args) => mockFn(...args))` when direct references trigger hoisting errors.
5. Run the targeted test again before moving on.

If a full batch fails after targeted tests passed:

1. Run the failing suite directly.
2. Inspect shared mock state and `beforeEach` reset behavior.
3. Split the batch if needed.
4. Do not commit a failing batch.

## Emergency Resume

Expected execution is one `/goal` session. If interrupted:

1. Read this file.
2. Run both exit metrics.
3. Run `git status --short --branch`.
4. Read recent commits with `git log --oneline -10`.
5. If both metrics are `0`, do not edit. Run final verification and commit verified existing changes if appropriate.
6. Otherwise continue from the remaining inventory, preserving unrelated dirty files.
