# /goal Spike: GC1 Internal Mock Drain (API) — Claude Code Edition

## Goal Statement

Remove all internal `jest.mock()` calls from API test files, replacing them with the sanctioned `jest.requireActual()` pattern or real test infrastructure. Every internal mock must be converted — there is no exemption mechanism.

## Scope

- **In scope:** all `*.test.ts` files under `apps/api/src/` and `*.integration.test.ts` files under `tests/integration/`
- **Out of scope:** `apps/mobile/`, `eslint-rules/`, any file already fully exempt via `gc1-allow`

## Exit Metric

```bash
# Metric 1: zero SHADOW internal mocks (jest.mock('./...') whose factory does not use requireActual).
# Pattern A (requireActual + targeted overrides) is the canonical conversion — those mocks are
# considered converted, even though the `jest.mock('./...')` line still exists. A "shadow mock" is
# one that returns a fully synthetic factory with no requireActual call, hiding the real module.
count=$(
  rg -n "jest\.mock\(['\"]\.\.?/" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ \
  | while IFS=: read -r f l _; do
      tail -n +"$l" "$f" | head -25 | grep -q "requireActual" || echo "$f:$l"
    done \
  | wc -l | tr -d ' '
)
echo "Shadow internal mocks remaining: $count"
# Target: 0

# Metric 2: no NEW gc1-allow annotations added (do not increase from current baseline).
exempt=$(rg "gc1-allow" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ | wc -l | tr -d ' ')
echo "gc1-allow annotations: $exempt"
# Target: ≤ 180 (current baseline as of 2026-05-14 — must not increase)
```

**Current baseline (2026-05-14):**
- 274 internal `jest.mock('./...')` call sites across 96 test files (apps/api + tests/integration).
- 180 pre-existing `gc1-allow` annotations.
- An earlier draft of this doc cited 288 / 70 — those numbers reflected an earlier snapshot.

**Why the metric was reframed.** A literal `rg "jest\.mock\(['\"]\.\.?/"` count cannot reach 0 if we use Pattern A, because Pattern A keeps the `jest.mock('./...')` call (it merely puts `requireActual` inside the factory). Since Pattern A is the canonical conversion in this codebase (per `CLAUDE.md` GC1/GC6), the metric was changed to count only **shadow** mocks — `jest.mock('./...')` calls whose factory body does not contain `requireActual` within the next 25 lines. Pattern A and Pattern B both drive this count to 0.

The goal is complete when Metric 1 returns **0** AND Metric 2 returns **≤ 180**. Adding `gc1-allow` annotations to pass Metric 1 is not a valid strategy — every shadow mock must be converted to Pattern A (`requireActual` with targeted overrides) or Pattern B (real Hono app + test DB).

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

Do not add `gc1-allow` annotations. The exit metric counts them and will reject the goal if the count increases from the baseline of 180. Every shadow mock must be genuinely converted using Pattern A or Pattern B.

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
# Metric 1: zero shadow internal mocks
rg -n "jest\.mock\(['\"]\.\.?/" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ \
  | while IFS=: read -r f l _; do
      tail -n +"$l" "$f" | head -25 | grep -q "requireActual" || echo "$f:$l"
    done | wc -l
# Must be 0

# Metric 2: no new gc1-allow annotations (current baseline 180)
rg "gc1-allow" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ | wc -l
# Must be ≤ 180

# Tests pass
pnpm exec nx run api:test

# Types pass
pnpm exec nx run api:typecheck

# Lint passes
pnpm exec nx run api:lint
```

All five must succeed for the goal to be met.
