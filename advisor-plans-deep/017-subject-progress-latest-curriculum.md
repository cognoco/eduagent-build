# Plan 017: Make `getSubjectProgress` read the LATEST curriculum version

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/progress.ts apps/api/src/services/curriculum.ts packages/database/src/schema/subjects.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

`getSubjectProgress` fetches a subject's curriculum with **no `orderBy`**. A
subject can legitimately have multiple curriculum *versions* — the schema has a
unique index on `(subjectId, version)`, which only makes sense if multiple
versions per subject are expected. Every other version-sensitive read in the
codebase explicitly sorts `desc(version)` to get the latest. This one does not.

The result: the **single-subject Progress screen** can render
`topicsTotal` / `topicsCompleted` from a *stale* curriculum version while the
**Overall Progress screen** (which sorts correctly) shows the latest for the same
subject. Two screens disagree about the same subject, and the single-subject view
is the wrong one.

Worse, `curricula.id` is a **UUIDv7** — which is time-ordered. An index scan with
no `ORDER BY` therefore tends to return the **oldest** row, not a random one. So
this doesn't fail intermittently; it fails toward stale.

This exact bug class has already been fixed twice elsewhere in this codebase
(BUG-884 comments at `curriculum.ts:1017-1024` and `:1278-1282`; a dedicated
regression test at `progress.test.ts:1389`, "[WI-916] uses the latest curriculum
when a subject has multiple versions"). That test covers `getOverallProgress`
only — it never exercised `getSubjectProgress`, which is why this survived.

## Current state

### The bug

`apps/api/src/services/progress.ts:177-179`:

```ts
  // Find curriculum for this subject
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
  });
```

No `orderBy`. That is the entire defect.

### The correct pattern, three times over

`apps/api/src/services/curriculum.ts:457-461` — `getLatestCurriculumRow`:

```ts
async function getLatestCurriculumRow(
  db: Database,
  subjectId: string,
): Promise<typeof curricula.$inferSelect | undefined> {
  return db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
    orderBy: desc(curricula.version),
  });
}
```

`apps/api/src/services/progress.ts:533-536` — `getOverallProgress` (same file as
the bug!):

```ts
  const allCurricula = await db.query.curricula.findMany({
    where: inArray(curricula.subjectId, subjectIds),
    orderBy: desc(curricula.version),
  });
```

`apps/api/src/services/progress.ts:822-826` — `getOverallProgressBatch` does the
same.

### Proof that multiple versions are a real, defended-against case

`packages/database/src/schema/subjects.ts:125-128`:

```ts
    uniqueIndex('curricula_subject_version_idx').on(
      table.subjectId,
      table.version,
    ),
```

A unique index on `(subjectId, version)` exists precisely because one subject can
carry several versioned curriculum rows.

### Repo conventions

- Reads must scope by `profileId`. Note this function already verifies subject
  ownership immediately above (`progress.ts:174-175`, via
  `repo.subjects.findFirst`), so the curriculum read is reached only for a
  subject the caller owns. Do not remove that check.
- Tests are co-located. No `__tests__/` folders.
- Do NOT add internal `jest.mock('./...')` — GC1 CI ratchet.
- `desc` is imported from `drizzle-orm`. Confirm it is already imported in
  `progress.ts` (it is used at `:533` in the same file) — no new import needed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck API | `pnpm exec nx run api:typecheck` | exit 0 |
| Lint API | `pnpm exec nx run api:lint` | exit 0 |
| Progress tests | `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/progress --no-coverage` | all pass |

## Scope

**In scope:**
- `apps/api/src/services/progress.ts` — the one-line fix at `:177-179`.
- `apps/api/src/services/progress.test.ts` — the regression test.

**Out of scope (do NOT touch):**
- `getOverallProgress` / `getOverallProgressBatch` — already correct; they are
  your reference.
- `getLatestCurriculumRow` in `curriculum.ts` — do **not** export it and import
  it across the service boundary just to save one line. It is currently private
  to `curriculum.ts`, and widening its visibility is a bigger change than this
  bug warrants. Inline the `orderBy` instead (see Step 2).
- Any change to the `curricula` schema or a migration. The unique index is
  correct as-is.
- The curriculum *versioning* logic itself (when/why a new version is written).

## Git workflow

- Branch from `main`: `advisor/017-subject-progress-latest-curriculum`
- Conventional commits (e.g. `fix(progress): read latest curriculum version in getSubjectProgress`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Write the failing regression test

In `apps/api/src/services/progress.test.ts`, add a test that mirrors the existing
`[WI-916]` test at `progress.test.ts:1389` — but targeting **`getSubjectProgress`**
instead of `getOverallProgress`.

The test must:
1. Seed a subject with **two** curriculum rows: `version: 1` (with, say, 2 topics)
   and `version: 2` (with, say, 5 topics).
2. Call `getSubjectProgress(...)` for that subject.
3. Assert the returned `topicsTotal` reflects **version 2** (5), not version 1.

Read the existing `[WI-916]` test first and copy its seeding/assertion structure —
it already solves the "how do I create two curriculum versions in a test" problem.

**Verify**: run the progress tests. The new test **MUST FAIL**, returning the
version-1 numbers.

**If it PASSES before the fix, STOP and report** — that means either the seeding
isn't producing two versions, or something else already orders the read, and this
plan's premise is wrong.

### Step 2: Add the `orderBy`

`apps/api/src/services/progress.ts:177-179` becomes:

```ts
  // Find curriculum for this subject. MUST order by version desc — a subject
  // can carry multiple curriculum versions (unique index on
  // (subjectId, version)), and curricula.id is a time-ordered UUIDv7, so an
  // unordered findFirst returns the OLDEST row. Matches getOverallProgress
  // (progress.ts:533) and getLatestCurriculumRow (curriculum.ts:457).
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
    orderBy: desc(curricula.version),
  });
```

`desc` is already imported in this file (used at `:533`). If it is not, add it to
the existing `drizzle-orm` import.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0.

### Step 3: Green, then revert-check

1. Run the progress tests → the new test **PASSES**.
2. Remove the `orderBy` line you just added.
3. Re-run → the new test **FAILS**.
4. Restore it. Re-run → **PASSES**.

This proves the test actually pins the behavior rather than passing by accident.

### Step 4: Sweep for the same defect

This bug class has now been found three times. Check whether any *other*
unordered `curricula` read exists:

```
rg -n 'curricula\.findFirst|curricula\.findMany' apps/api/src packages
```

For each hit, confirm it either has `orderBy: desc(curricula.version)` or is
provably version-insensitive (e.g. it filters by an explicit `curriculumId`).
Report anything you find — **but do not fix it in this PR** unless it is a
literal one-line `orderBy` addition on the same pattern, in which case include it
and note it in the PR description.

**Verify**: you can state, for every `curricula` read in the repo, that it is
either version-ordered or version-insensitive.

### Step 5: Validate

**Verify**, all of:
- `pnpm exec nx run api:typecheck` → exit 0
- `pnpm exec nx run api:lint` → exit 0
- `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/progress --no-coverage` → all pass

## Test plan

- **New test** in `apps/api/src/services/progress.test.ts`: `getSubjectProgress`
  with a two-version curriculum returns the latest version's topic counts.
  Model it on the existing `[WI-916]` test at `progress.test.ts:1389`.
- **Optional but valuable**: a test asserting the two screens *agree* — that
  `getSubjectProgress(subjectId)` and the entry for that subject inside
  `getOverallProgress()` report the same `topicsTotal`. That directly encodes the
  user-visible symptom (two screens disagreeing) and would catch any future
  divergence between the two code paths.
- Do NOT add internal `jest.mock('./...')`.

## Done criteria

ALL must hold:

- [ ] `pnpm exec nx run api:typecheck` exits 0
- [ ] `pnpm exec nx run api:lint` exits 0
- [ ] All `apps/api/src/services/progress` tests pass
- [ ] The new test provably fails when the `orderBy` is removed (Step 3 performed)
- [ ] Every `curricula.findFirst` / `findMany` in the repo is either version-ordered or documented version-insensitive (Step 4)
- [ ] No schema or migration file modified
- [ ] `advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- The Step-1 test passes **before** the fix. The plan's premise is then wrong.
- Adding the `orderBy` breaks an existing test. That would suggest some caller
  *depends* on reading the oldest curriculum — surprising and worth surfacing, not
  papering over.
- Step 4's sweep turns up more than ~2 additional unordered reads. That makes this
  a systemic pattern deserving a guard (a lint rule or a shared accessor) rather
  than N one-line fixes — report and let the team decide.

## Maintenance notes

- **The real lesson**: this is the *fourth* instance of the same bug class
  (BUG-884 ×2, WI-916, and now this). The durable fix is not another `orderBy` —
  it is making the unordered read impossible. Consider exporting a single
  `getLatestCurriculumRow(db, subjectId)` accessor from a shared module and
  routing **all** curriculum-by-subject reads through it. That is deliberately
  **not** in this plan's scope (it widens the blast radius well beyond a P2 bug
  fix), but it is the right follow-up, and Step 4's sweep gives you the evidence
  to size it.
- **What a reviewer should scrutinize**: that the subject-ownership check at
  `progress.ts:174-175` is untouched — the curriculum read must remain reachable
  only for a subject the caller owns.
- **Why UUIDv7 matters here**: because ids are time-ordered, "no ORDER BY" is not
  "random order" — it reliably skews to the oldest row. Any future code reading a
  versioned table without an explicit sort has the same trap.
