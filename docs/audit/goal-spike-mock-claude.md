# /goal Spike: GC1 Internal Mock Drain (API) — Claude Code Edition

## Goal Statement

Eliminate all **shadow internal mocks** from API test files. A shadow mock is `jest.mock('./relative-path', ...)` whose factory returns a fully synthetic module — no `jest.requireActual()` call, no spread of the real module. Shadow mocks hide real bugs because the test exercises only the fake.

Every shadow mock must be converted to either:
- **Pattern A** — `jest.mock('./x', () => { const actual = jest.requireActual('./x'); return { ...actual, <overrides> }; })`
- **Pattern B** — Real Hono `app.request()` against a real test DB (route tests only).

There is no exemption mechanism. `gc1-allow` is the audit marker on the `jest.mock(` line — it accompanies the conversion, it does not replace it.

## Scope

- **In scope:** all `*.test.ts` files under `apps/api/src/` and `*.integration.test.ts` files under `tests/integration/`
- **Out of scope:** `apps/mobile/`, `eslint-rules/`

## Exit Metrics

```bash
# Metric 1 (substantive): zero shadow internal mocks.
# A jest.mock('./...') call qualifies as Pattern A when, within the next ~25 lines,
# the factory body contains BOTH `requireActual` AND a spread of the actual exports
# (`...actual` or equivalent rest-spread). Missing either → shadow mock.
shadow_count=$(
  rg -n "jest\.mock\(['\"]\.\.?/" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ \
  | while IFS=: read -r f l _; do
      window=$(tail -n +"$l" "$f" | head -25)
      echo "$window" | grep -q "requireActual" && echo "$window" | grep -qE '\.\.\.[A-Za-z_$][A-Za-z0-9_$]*' && continue
      echo "$f:$l"
    done \
  | wc -l | tr -d ' '
)
echo "Shadow internal mocks remaining: $shadow_count"
# Target: 0

# Metric 2 (audit): every internal mock has gc1-allow on the call line.
# Inverted form — we count UNTAGGED internal mocks. Target: 0 (within spike scope).
untagged_count=$(
  rg -n "jest\.mock\(['\"]\.\.?/" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ \
  | while IFS=: read -r f l _; do
      line=$(sed -n "${l}p" "$f")
      echo "$line" | grep -q "gc1-allow" || echo "$f:$l"
    done \
  | wc -l | tr -d ' '
)
echo "Internal mocks without gc1-allow: $untagged_count"
# Target: 0
```

**Baseline (2026-05-14, post-Batch-1 commit):**
- 274 internal `jest.mock('./...')` call sites across 96 test files.
- 214 shadow mocks remaining (5 converted in Batch 1).
- 180 pre-existing `gc1-allow` annotations.
- Number of untagged internal mocks: run Metric 2 to determine current state.

The goal is met when **both metrics return 0** AND all tests / types / lint pass.

## Why Metric 2 is inverted (not a ceiling)

An earlier draft of this doc capped `gc1-allow` count at 180 ("don't increase from baseline"). That framing was wrong:

- The pre-commit GC1 hook in `.husky/pre-commit` flags any added `jest.mock('./...')` line that lacks `gc1-allow`. Pattern A conversions inherently modify the `jest.mock(` line (the factory body changes), so the diff shows an added line.
- Every Pattern A conversion therefore requires adding `gc1-allow` on the call line to pass the hook honestly. Without it, the only options are `--no-verify` (forbidden) or sticker-stamping shadow mocks (cheating).
- In this codebase, `gc1-allow` is the **audit marker for an audited internal mock**, not an exception to the rule. The hook is admittedly weak (it only checks for the string, not for actual Pattern A compliance — see filed Notion issue), but the convention is honest when paired with the Metric 1 substantive check.

Inverting the metric — "untagged internal mocks → 0" — captures the correct intent: every internal mock should be **deliberately audited**. Combined with Metric 1, every internal mock is also **runtime-correct Pattern A**.

## Constraints

1. **No test deletion.** Every `it()` / `test()` / `describe()` block must survive.
2. **No `eslint-disable`.** Do not suppress lint rules to make changes pass.
3. **No `--no-verify`.** Use `gc1-allow` honestly on every converted mock. The hook stays intact.
4. **No mobile changes.** Do not touch `apps/mobile/`.
5. **Tests pass between batches.** Run `pnpm exec nx run api:test` after each commit batch; all suites must pass.
6. **Types pass between batches.** `tsc --build` (auto-runs in the pre-commit hook).
7. **Commit incrementally.** Commit after each coherent batch (5–10 files). Use the `/commit` skill.

## Sanctioned Replacement Patterns

### Pattern A — `jest.requireActual()` with targeted overrides AND audit tag

```typescript
jest.mock('../services/llm' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../services/llm') as typeof import('../services/llm');
  return {
    ...actual,
    routeAndCall: jest.fn().mockResolvedValue({ /* mock response */ }),
  };
});
```

**Required components:**
1. `jest.requireActual(...)` to load the real module.
2. `...actual` (or equivalent rest-spread) to include every real export by default.
3. `/* gc1-allow: <reason> */` on the same line as `jest.mock(` — typically `pattern-a conversion`.

**When to use:** The test mocks a module but other exports from that module are used directly or transitively. This is the default for service-layer, middleware, and Inngest function tests.

**Reference files (with same-line `gc1-allow`):**
- `apps/api/src/routes/quiz.test.ts`
- `apps/api/src/services/bookmarks.test.ts`
- `apps/api/src/inngest/functions/trial-expiry.test.ts`

### Pattern B — Real Hono `app.request()` against test DB

```typescript
import { app } from '../index';

const res = await app.request('/v1/some-route', {
  method: 'POST',
  headers: AUTH_HEADERS,
  body: JSON.stringify(payload),
}, TEST_ENV);

expect(res.status).toBe(200);
```

**When to use:** Route tests where the mock only controlled what the route received. Calling through `app.request()` with the real service layer and test DB is more faithful — and removes the mock entirely (no `gc1-allow` needed since there's no `jest.mock` call).

**Reference file:** `apps/api/src/routes/billing.test.ts`

### Why no Pattern C

There is no "exempt with `gc1-allow` and skip the conversion" path. The `gc1-allow` comment is part of the Pattern A conversion (the audit marker), not an alternative to it. Adding `gc1-allow` to a shadow mock without converting it would pass the hook but fail Metric 1 and defeat the rule's purpose.

## Sub-Agent Strategy

The orchestrator classifies and dispatches. Sub-agents do the file-level conversion. The orchestrator does NOT edit files directly.

### Tier classification

| Shadow-mock count per file | Model |
|---|---|
| 1–2 | `haiku` |
| 3–5 | `sonnet` |
| 6+ or service-layer-restructuring needed | `opus` |

### Escalation

If a sub-agent fails (tests break, types break, or the conversion is incorrect): retry once at the same tier, then escalate to the next model. Cap at two attempts per tier before escalating.

### Per-file inventory command

```bash
rg -n "jest\.mock\(['\"]\.\.?/" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ \
  | while IFS=: read -r f l _; do
      window=$(tail -n +"$l" "$f" | head -25)
      echo "$window" | grep -q "requireActual" && echo "$window" | grep -qE '\.\.\.[A-Za-z_$][A-Za-z0-9_$]*' && continue
      echo "$f"
    done | sort | uniq -c | sort -nr
```

Sort by descending count, tier appropriately, work simple → hard.

### Sub-agent brief template

Use this template for every file-level conversion sub-agent. Fill in `<TARGET_FILE>` and `<EXPECTED_SHADOW_COUNT>`.

```
You're converting shadow jest.mock() calls in ONE test file to Pattern A.

REPO ROOT: /Users/vetinari/_dev/eduagent-build/goal/mock-claude
TARGET FILE: <TARGET_FILE>
EXPECTED SHADOW MOCKS IN THIS FILE: <EXPECTED_SHADOW_COUNT>

## What is a shadow mock
A `jest.mock('./relative-path', ...)` whose factory does NOT contain BOTH:
- a `jest.requireActual(...)` call, AND
- a `...actual` (or equivalent rest-spread) inside the returned object

## Required conversion: Pattern A

Convert each shadow mock to:

    jest.mock('./x' /* gc1-allow: pattern-a conversion */, () => {
      const actual = jest.requireActual('./x') as typeof import('./x');
      return {
        ...actual,
        // original overrides here, unchanged
      };
    });

Three required components:
1. `jest.requireActual('./x')` loading the real module.
2. `...actual` spread inside the returned object — this is non-negotiable; without it the mock still hides everything.
3. `/* gc1-allow: pattern-a conversion */` on the same line as `jest.mock(`. The pre-commit hook requires this — do not omit.

## Steps
1. Read the target file. Identify every shadow mock (test against the criteria above).
2. Convert each to Pattern A as shown.
3. Run targeted tests:
   `cd /Users/vetinari/_dev/eduagent-build/goal/mock-claude && pnpm exec jest --config apps/api/jest.config.ts --findRelatedTests <TARGET_FILE> --no-coverage`
4. If tests pass, report SUCCESS.
5. If tests fail, fix and re-run. Max 2 attempts. If still failing, report FAILURE with output.

## Hard constraints (NEVER violate)
- Do NOT delete any `it()` / `test()` / `describe()` block.
- Do NOT use `eslint-disable`.
- Do NOT use `--no-verify` or skip hooks.
- Do NOT modify any file other than the target.
- Do NOT commit or push.
- `gc1-allow` must be on the SAME line as `jest.mock(`, not the line below.
- The `...actual` spread is mandatory. A `requireActual` call whose result is never spread is still a shadow mock.

## Report back
1. File modified.
2. Number of shadow mocks converted (should match EXPECTED_SHADOW_COUNT).
3. Test result: PASS or FAIL (with output if FAIL).
4. Anything unusual.
```

### Orchestrator verification between batches

After each batch completes (all sub-agents report SUCCESS):
1. **Verify shadow count dropped** by exactly the expected amount:
   ```bash
   # Run Metric 1 from the Exit Metrics section
   ```
2. **Spot-check 1–2 files visually** — confirm `...actual` spread is present, `gc1-allow` is on the call line.
3. **Run full `pnpm exec nx run api:test`** — every suite must pass.
4. **Commit using `/commit`** — no `--no-verify`. The hook should pass because every modified `jest.mock(` line now has `gc1-allow`.
5. **Update tracking** — note batch number, files converted, mock-count delta.

If verification fails at any step, do not commit. Investigate the discrepancy and re-dispatch as needed.

## Final Verification

After all batches are complete:

```bash
# Metric 1: zero shadow internal mocks
rg -n "jest\.mock\(['\"]\.\.?/" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ \
  | while IFS=: read -r f l _; do
      window=$(tail -n +"$l" "$f" | head -25)
      echo "$window" | grep -q "requireActual" && echo "$window" | grep -qE '\.\.\.[A-Za-z_$][A-Za-z0-9_$]*' && continue
      echo "$f:$l"
    done | wc -l
# Must be 0

# Metric 2: zero untagged internal mocks
rg -n "jest\.mock\(['\"]\.\.?/" --glob "*.test.ts" apps/api/ --glob "*.integration.test.ts" tests/integration/ \
  | while IFS=: read -r f l _; do
      sed -n "${l}p" "$f" | grep -q "gc1-allow" || echo "$f:$l"
    done | wc -l
# Must be 0

# Tests pass
pnpm exec nx run api:test

# Types pass
pnpm exec nx run api:typecheck

# Lint passes
pnpm exec nx run api:lint
```

All five must succeed for the goal to be met.

## How to Resume

This spike runs in batches. To resume after a session ends:

1. **Read this doc.** The patterns, metrics, and sub-agent template are stable.
2. **Run Metric 1.** It tells you the current shadow-mock count.
3. **Read recent commits.** `git log --oneline | head` shows which batches have landed.
4. **Pick up.** Inventory the remaining shadow mocks (per-file inventory command above), tier them, dispatch the next batch.

No session state lives in this doc. Every signal you need is in the working tree or in git history.

## Related

- Pre-commit hook source: `.husky/pre-commit` (GC1 ratchet, weak — only checks for the comment string).
- ESLint companion: `eslint-rules/no-internal-jest-mock.mjs` (severity `warn`, same weakness).
- Filed Notion issue for hook-weakness improvement: https://www.notion.so/3608bce91f7c81258ec7ca2b77bd5022
- CLAUDE.md → "No new internal `jest.mock()` (GC1 ratchet)" and "GC6 — Boy-scout internal mocks".
