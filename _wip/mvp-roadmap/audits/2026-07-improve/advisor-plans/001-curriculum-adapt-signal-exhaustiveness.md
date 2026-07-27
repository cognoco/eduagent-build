# Plan 001: Make the curriculum-adaptation reorder switch exhaustive over `CurriculumAdaptSignal`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/curriculum.ts apps/api/src/services/curriculum.test.ts packages/schemas/src/subjects.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (latent — hardening guard)
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

`adaptCurriculumFromPerformance()` reorders a curriculum's topics by splicing the
target topic out of a working array and re-inserting it inside a `switch` over
`request.signal`. The switch handles all four current enum members but has no
`default` and no compile-time exhaustiveness guard. If a fifth signal is ever
added to `curriculumAdaptSignalSchema` (the Zod enum in `@eduagent/schemas`),
the spliced-out topic is never re-inserted: the subsequent transaction renumbers
the remaining topics to a contiguous 0..n-2 while the dropped topic keeps its
stale `sort_order` — colliding with the unique `(curriculum_id, book_id,
sort_order)` constraint (a mid-request 500) or, where the constraint doesn't
bite, persisting a duplicate/stale order plus a `sortOrder: -1` audit row.
Today this is unreachable; the fix makes the future enum addition a typecheck
failure instead of a runtime data bug.

## Current state

- `apps/api/src/services/curriculum.ts` — `adaptCurriculumFromPerformance()`
  (exported at line 2765). The vulnerable switch, lines 2795–2812:

  ```ts
  const [topic] = reordered.splice(targetIndex, 1);
  if (topic) {
    switch (request.signal) {
      case 'struggling':
      case 'too_hard':
        reordered.splice(
          Math.min(targetIndex + 2, reordered.length),
          0,
          topic,
        );
        break;
      case 'mastered':
      case 'too_easy':
        reordered.splice(Math.max(targetIndex - 2, 0), 0, topic);
        break;
    }
  }
  ```

  The persisting transaction starts at line 2817 (`await db.transaction(...)`),
  i.e. AFTER the switch — a throw inside the switch persists nothing.

- `packages/schemas/src/subjects.ts:649-654` — the enum this must stay
  exhaustive over. Do NOT modify it:

  ```ts
  export const curriculumAdaptSignalSchema = z.enum([
    'struggling',
    'mastered',
    'too_easy',
    'too_hard',
  ]);
  ```

- `apps/api/src/services/curriculum.test.ts:928+` — existing
  `describe('adaptCurriculumFromPerformance', ...)` suite; use its existing
  `it(...)` blocks (e.g. "records an adaptation audit row", line 1038) as the
  structural pattern for the new test.

- **Repo convention — exhaustiveness idiom** (match it exactly; two exemplars):

  ```ts
  // apps/api/src/services/llm/router.ts:309-310
  const exhaustive: never = ageBracket;
  throw new Error(`Unexpected ageBracket: ${String(exhaustive)}`);
  ```

  Same pattern at `apps/api/src/services/quiz/config.ts:87-88`.

- Repo conventions that apply: named exports only; tests co-located
  (`curriculum.test.ts` next to `curriculum.ts`); never use `eslint-disable`;
  every changed line must trace to this plan (no adjacent "improvements").

## Commands you will need

Run from the repo root (`.worktrees/improve-api-audit/` if executing in the
advisor worktree) unless noted.

| Purpose   | Command                                                                 | Expected on success |
|-----------|-------------------------------------------------------------------------|---------------------|
| Typecheck | `pnpm exec nx run api:typecheck`                                        | exit 0              |
| Tests     | `cd apps/api && pnpm exec jest src/services/curriculum.test.ts --no-coverage` | all pass       |
| Lint      | `pnpm exec nx run api:lint`                                             | exit 0              |

## Scope

**In scope** (the only files you may modify):
- `apps/api/src/services/curriculum.ts` (the switch at ~2797–2810 only)
- `apps/api/src/services/curriculum.test.ts` (add one test)

**Out of scope** (do NOT touch, even though they look related):
- `packages/schemas/src/subjects.ts` — the enum is the contract; this plan
  guards against its future growth, it does not change it.
- The two other `curriculumAdaptations` insert sites in `curriculum.ts`
  (lines ~2396, ~2453) — different flows, not part of this finding.
- The transaction body at lines 2817–2871 (the CASE-expression bulk update) —
  correct as-is; the fix lands before it runs.

## Git workflow

- Work on the current branch of the worktree you were dispatched into
  (`improve-api-audit`) or a branch your operator names. Do not switch branches.
- Commit via the repo commit skill (`.agents/skills/commit/SKILL.md`) if asked
  to commit; otherwise leave changes uncommitted for review.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the exhaustiveness `default` branch

In `apps/api/src/services/curriculum.ts`, inside the `switch (request.signal)`
at ~line 2797, after the `'mastered'/'too_easy'` case, add:

```ts
default: {
  const exhaustive: never = request.signal;
  throw new Error(`Unexpected curriculum adapt signal: ${String(exhaustive)}`);
}
```

This matches the repo idiom (`services/llm/router.ts:309`). Because the throw
sits before `db.transaction(...)`, an unexpected signal fails the request
loudly with zero rows written — never a partial reorder.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0. (If it fails with
"Type 'X' is not assignable to type 'never'", the enum grew since planning —
that is a STOP condition, not something to paper over.)

### Step 2: Add a pinning test

In `apps/api/src/services/curriculum.test.ts`, inside the existing
`describe('adaptCurriculumFromPerformance', ...)` block, add one test modeled
on the neighboring `it(...)` blocks (same setup helpers/mocks):

- Name: `'throws on an unrecognized adapt signal instead of dropping the topic'`
- Call `adaptCurriculumFromPerformance` with a signal value cast past the type
  system (`'bogus' as CurriculumAdaptSignal` — import the type from
  `@eduagent/schemas` if not already imported).
- Assert it rejects with an error matching `/Unexpected curriculum adapt signal/`.
- Assert no adaptation row was persisted (reuse however the existing
  "records an adaptation audit row" test at line 1038 observes inserts, and
  assert the negative).

**Verify**: `cd apps/api && pnpm exec jest src/services/curriculum.test.ts --no-coverage` → all pass, including the new test.

### Step 3: Lint

**Verify**: `pnpm exec nx run api:lint` → exit 0. If the unused-looking
`exhaustive` const trips a lint rule, check the two exemplar files — they pass
lint with this exact shape; match them rather than suppressing.

## Test plan

- One new test (Step 2): unrecognized signal → throws, persists nothing.
- Existing suite (`curriculum.test.ts` lines 928–1060) already covers all four
  valid signals and the audit row; it must stay green untouched.
- Verification: the jest command above → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm exec nx run api:typecheck` exits 0
- [ ] `cd apps/api && pnpm exec jest src/services/curriculum.test.ts --no-coverage` exits 0, including the new throw test
- [ ] `pnpm exec nx run api:lint` exits 0
- [ ] The `switch (request.signal)` in `adaptCurriculumFromPerformance` has a `default` branch containing a `never`-typed assignment
- [ ] `git status` shows changes only to the two in-scope files
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The switch at `curriculum.ts:~2797` no longer matches the "Current state"
  excerpt (drifted).
- `curriculumAdaptSignalSchema` has more than the four listed members — the
  latent bug may already be live; report instead of silently handling the new
  member (deciding its reorder semantics is a product call, not yours).
- The new test cannot observe "no row persisted" with the suite's existing
  test setup — do not add new internal `jest.mock(...)` calls to force it
  (GC1 ratchet forbids new internal mocks); report the limitation.
- Typecheck or lint fails twice after a reasonable fix attempt.

## Maintenance notes

- Anyone adding a member to `curriculumAdaptSignalSchema` will now get a
  typecheck failure here — that is the point. The fix is to decide that
  signal's reorder semantics and add a real case, not to widen the default.
- Reviewer should scrutinize: the throw is BEFORE `db.transaction` (no partial
  write path), and the new test asserts the negative on persistence.
- Deferred (out of scope, low value): the `sortOrder: -1` findIndex fallback
  at line 2866 becomes unreachable for the target topic once the switch is
  exhaustive; left as-is.
