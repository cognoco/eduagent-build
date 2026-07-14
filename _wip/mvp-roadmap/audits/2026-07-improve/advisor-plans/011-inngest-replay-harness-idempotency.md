# Plan 011: Adopt the replay harness to test Inngest step idempotency (or delete it)

> **Executor instructions**: Follow step by step; run every verification. Honor
> "STOP conditions". When done, update the status row in
> `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/inngest/functions/_test-harness.ts`
> On any change, compare the excerpt to live code; mismatch → STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

Inngest steps are retried; on a retry the engine replays completed `step.run(...)` calls from cache and re-executes only what's past the failure point. A side effect placed OUTSIDE a `step.run` (a bare write, email, or Stripe call) runs again on every replay — a double-charge/double-send/double-write bug. 67 of 68 function unit tests exercise handlers with a **hand-rolled inline `step` double** that does not model this. The repo already built the right tool — `inngest/functions/_test-harness.ts`'s `makeReplayHarness()` memoizes `step.run` by step name, exactly what tests replay/idempotency — but it has **zero users** (the only reference, `registration-sync.guard.test.ts:186`, skips it). This is the worst state: the right tool, built, never used. Either wire it into the functions with non-idempotent side effects, or delete it as dead code.

## Current state

```ts
// inngest/functions/_test-harness.ts — the unused replay double
export function makeReplayHarness(): ReplayHarness {
  const cache = new Map<string, unknown>();
  return {
    cache,
    reset() { cache.clear(); },
    step: {
      run: async (name, fn) => {
        if (cache.has(name)) return cache.get(name);   // replay: return cached, DON'T re-run
        const result = await fn();
        cache.set(name, result);
        return result;
      },
    },
  };
}
```

Facts (verified):
- Only `inngest/functions/session-completed.test.ts` uses `@inngest/test` (the real engine). Every other function test uses an inline `step` object.
- 73 non-test function files; 68 co-located unit tests; 13 have an `*.integration.test.ts`.
- 11 source files under `inngest/` use `NonRetriableError` — the team reasons about retry classification without a test that checks replay behavior.

Repo conventions:
- Co-located tests. Internal-mock ban (GC1/GC6). External-boundary mocks (Stripe, email, push, Inngest client) are allowed with a `gc1-allow` reason.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm exec nx run api:typecheck` | exit 0 |
| Run a function test | `cd apps/api && pnpm exec jest --findRelatedTests src/inngest/functions/<fn>.ts --no-coverage` | pass |
| List functions with writes/sends | `rg -ln 'inngest.send\|db.insert\|db.update\|sendEmail\|stripe' apps/api/src/inngest/functions --glob '!*.test.ts'` | candidate set |
| Harness users today | `rg -l 'makeReplayHarness' apps/api/src` | only `_test-harness.ts` + the skip site |

## Scope

**In scope**:
- `apps/api/src/inngest/functions/<fn>.test.ts` for the ~10–15 functions with non-idempotent side effects — add a replay-idempotency test using `makeReplayHarness`.
- OR, if the review decides against adoption: delete `apps/api/src/inngest/functions/_test-harness.ts` and its skip reference in `registration-sync.guard.test.ts`.

**Out of scope**:
- Refactoring the Inngest functions themselves. If a replay test reveals a real double-effect bug, STOP and report it (fix is a separate plan).
- The 67 existing inline-`step` tests — don't rewrite them wholesale; add replay tests where side-effect idempotency matters.
- `session-completed` (already uses the real engine).

## Git workflow

- Branch: `advisor/011-inngest-replay-harness-idempotency`.
- Conventional commits, e.g. `test(api): cover Inngest step replay idempotency via replay harness`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Pick the candidate functions

Enumerate functions whose handler performs a non-idempotent side effect NOT wrapped in a `step.run` guarded by a unique constraint / `onConflictDoNothing`: writes, `inngest.send`, emails, Stripe/RevenueCat calls. Use the grep above and read each candidate to confirm the effect placement. Write the shortlist (≤15) into the PR description. Prioritize money/notification functions.

**Verify**: shortlist recorded; each entry cites the `file:line` of the side effect.

### Step 2: Add a replay-idempotency test per candidate

For each shortlisted function, add a test that runs the handler twice against the SAME `makeReplayHarness()` instance (simulating a retry/replay) and asserts the side effect fired **once** (spy on the external boundary — the Inngest client `send`, the email sender, the Stripe call). Import `makeReplayHarness` from `./_test-harness`. Keep external-boundary mocks with a `gc1-allow` reason; do not mock the function under test.

Target shape:
```ts
import { makeReplayHarness } from './_test-harness';
it('is idempotent across replay', async () => {
  const harness = makeReplayHarness();
  const sendSpy = /* spy on the external boundary */;
  await myFn.handler({ event, step: harness.step });   // first execution
  await myFn.handler({ event, step: harness.step });   // replay — cache hits, no re-run
  expect(sendSpy).toHaveBeenCalledTimes(1);
});
```
(Adjust to the actual handler-invocation shape the other tests in that file use.)

**Verify**: `cd apps/api && pnpm exec jest --findRelatedTests src/inngest/functions/<fn>.ts --no-coverage` → pass for each; the PostToolUse mock-check hook reports no new internal mocks.

### Step 3 (only if review rejects adoption): delete the dead harness

If, after Step 1, the shortlist is empty (every side effect is already idempotency-guarded) — i.e. the harness genuinely has no use — delete `_test-harness.ts` and remove the skip reference at `registration-sync.guard.test.ts:186`. Do NOT do both Step 2 and Step 3.

**Verify**: `rg -l 'makeReplayHarness' apps/api/src` → empty; `pnpm exec nx run api:typecheck` → exit 0; the guard test still passes without its skip branch.

## Test plan

- Steps 1–2 are the plan: one replay-idempotency test per shortlisted function. Structural model: `session-completed.test.ts` (real-engine reasoning) + the target file's existing inline-step tests for the invocation shape.
- The regression protected: a side effect placed outside `step.run` that re-fires on replay.
- Verification: each touched function's test passes; the full `api:test` inngest slice is green.

## Done criteria

- [ ] Either: ≥1 replay-idempotency test exists for each shortlisted non-idempotent function, all passing; OR `_test-harness.ts` is deleted with its skip reference removed (justified in the PR).
- [ ] No new internal mocks (external boundaries only, with `gc1-allow` reasons).
- [ ] `pnpm exec nx run api:typecheck` exits 0; touched function tests pass.
- [ ] Only in-scope files modified (`git status`).
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md` status row updated.

## STOP conditions

- A replay test reveals a real double-effect bug (side effect re-fires on the second run) — STOP and report it as a correctness finding; do not fix the function in this test-only plan.
- The handler-invocation shape (`myFn.handler({ event, step })`) differs from what `makeReplayHarness` provides (e.g. handlers need more context than `step`) — read a working example and adapt; if the harness genuinely can't drive the handler, report it (the harness may be under-built).
- The shortlist is large (>15) — cap at the highest-consequence 10 for this plan and record the rest as a follow-up; don't balloon the scope.

## Maintenance notes

- New Inngest functions with non-idempotent side effects should get a replay-idempotency test using this harness. Consider promoting that into a checklist item for the inngest tech skill.
- Reviewer should confirm the "fired once" assertion spies on the true external boundary, not a step-internal call — otherwise it proves nothing about replay.
- The harness models `step.run` memoization only; it does NOT model `NonRetriableError` classification (that needs `@inngest/test`). For functions where retry classification is the risk, prefer the real engine as `session-completed.test.ts` does — note which functions those are.
