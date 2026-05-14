# /goal Spike: GC1 Internal Mock Drain (API) — Claude Code Edition

## Goal Statement

Remove all internal `jest.mock()` calls from API test files, replacing them with the sanctioned `jest.requireActual()` pattern or real test infrastructure. Every internal mock must be converted — there is no exemption mechanism.

## Scope

- **In scope:** all `*.test.ts` files under `apps/api/src/` and `*.integration.test.ts` files under `tests/integration/`
- **Out of scope:** `apps/mobile/`, `eslint-rules/`, any file already fully exempt via `gc1-allow`

## Exit Metric

```bash
# Metric 1: zero internal mocks with relative paths (no exemptions, no annotations — removed means removed)
count=$(rg "jest\.mock\(['\"]\.\.?/" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ | wc -l | tr -d ' ')
echo "Internal mocks remaining: $count"
# Target: 0

# Metric 2: no new gc1-allow annotations added (baseline: 70)
exempt=$(rg "gc1-allow" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ | wc -l | tr -d ' ')
echo "gc1-allow annotations: $exempt"
# Target: ≤ 70 (must not increase from baseline)
```

**Current baseline:** 288 internal mock calls across 92 API test files + 4 cross-package integration test files. 70 pre-existing `gc1-allow` annotations.

The goal is complete when Metric 1 returns **0** AND Metric 2 returns **≤ 70**. Adding `gc1-allow` comments to pass Metric 1 is not a valid strategy — the mock call itself must be replaced or removed.

## Constraints

1. **No test deletion.** Every test case (`it()` / `test()`) that exists before you start must still exist and pass when you finish. You may change test setup, but not remove coverage.
2. **No `eslint-disable`.** Do not suppress lint rules to make changes pass.
3. **No mobile changes.** Do not touch anything under `apps/mobile/`.
4. **Tests must pass.** Run `pnpm exec nx run api:test` and confirm zero failures. A change that removes a mock but breaks the test is not progress.
5. **Types must pass.** Run `pnpm exec nx run api:typecheck` and confirm no new errors.
6. **Commit incrementally.** Commit after each coherent batch of changes so progress is preserved.

## Sanctioned Replacement Patterns

Use these patterns. Do not invent alternatives.

### Pattern A: `jest.requireActual()` with targeted overrides

The default approach. Spread all real exports, override only the specific function being stubbed.

```typescript
jest.mock('../services/llm', () => {
  const actual = jest.requireActual('../services/llm') as typeof import('../services/llm');
  return {
    ...actual,
    routeAndCall: jest.fn().mockResolvedValue({ /* mock response */ }),
  };
});
```

**When to use:** The test mocks a module but other exports from that module are used (directly or transitively). This is the most common case.

**Reference files:**
- `apps/api/src/routes/quiz.test.ts` — mocks `routeAndCall` while preserving `CircuitOpenError`
- `apps/api/src/services/bookmarks.test.ts` — spreads database exports without overrides
- `apps/api/src/inngest/functions/trial-expiry.test.ts` — preserves Inngest `createFunction` binding

### Pattern B: Hono `app.request()` test client

For route tests, call the route through the real Hono app instead of mocking the service layer.

```typescript
import { app } from '../index';

const res = await app.request('/v1/some-route', {
  method: 'POST',
  headers: AUTH_HEADERS,
  body: JSON.stringify(payload),
}, TEST_ENV);

expect(res.status).toBe(200);
```

**When to use:** The test mocks a service only to control what the route receives. Calling through `app.request()` with a real service and test DB is more faithful.

**Reference file:** `apps/api/src/routes/billing.test.ts`

### ~~Pattern C: Exempt with `gc1-allow`~~ — NOT AVAILABLE

Do not add `gc1-allow` annotations. The exit metric counts them and will reject the goal if the count increases from the baseline of 70. Every internal mock must be genuinely converted using Pattern A or Pattern B.

## Sub-Agent Strategy

Use sub-agents to do the file-level conversion work. The orchestrator should classify, dispatch, and track progress — not do the edits itself.

Sub-agents in Claude Code accept a `model` parameter. Use this to match model capability to file complexity:

| File complexity | Signal | Model |
|----------------|--------|-------|
| Simple (1-2 mocks, single module) | Grep the mock count per file | `haiku` |
| Medium (3-5 mocks, multiple modules) | — | `sonnet` |
| Complex (6+ mocks, deep dependency chains, or service-layer restructuring needed) | — | `opus` |

**Escalation on failure:** if a sub-agent at a given tier fails to produce a passing conversion (tests break, types break, or the mock wasn't actually removed), retry once at the same tier, then escalate to the next model up. Do not retry more than twice at the same tier — escalate instead.

**Classification step:** before starting conversions, run a quick inventory to count internal mocks per file and sort into tiers:

```bash
rg "jest\.mock\(['\"]\.\.?/" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ -c | sort -t: -k2 -nr
```

This gives mock count per file. Use it to assign tiers and plan the work order — start with the simplest files to build momentum and verify the pattern works, then progress to harder ones.

## Verification

After all changes are complete, run:

```bash
# Metric 1: zero internal mocks
rg "jest\.mock\(['\"]\.\.?/" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ | wc -l
# Must be 0

# Metric 2: no new gc1-allow annotations
rg "gc1-allow" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ | wc -l
# Must be ≤ 70

# Tests pass
pnpm exec nx run api:test

# Types pass
pnpm exec nx run api:typecheck

# Lint passes
pnpm exec nx run api:lint
```

All five must succeed for the goal to be met.
