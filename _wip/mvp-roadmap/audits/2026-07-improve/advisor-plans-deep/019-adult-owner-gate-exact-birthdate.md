# Plan 019: Make the adult-owner gate use the exact birthdate, not year-only math

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- packages/schemas/src/age.ts apps/mobile/src/components/home/ParentHomeScreen.tsx apps/mobile/src/components/home/LearnerScreen.tsx apps/mobile/src/lib/navigation-contract.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug / safety gate
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

`isAdultOwner()` — the shared helper that decides whether a user is an adult
account owner — computes age by **subtracting birth years**. It never looks at
the birth month or day, and its input type physically cannot carry them.

So a **17-year-old** whose birthday has not yet occurred this calendar year is
classified as an **adult**, for up to **11 months**. They are then shown the
"Add child" capability and the family-plan branch.

This is not a subtle interpretation. AGENTS.md names this gate explicitly:

> `computeAgeBracketFromDate()` … is the canonical function for **feature-gating
> and safety-adjacent age decisions** (family-mode gate, **adult-owner gate**,
> LLM safety preamble, suitability-judge sampling). Use it — **not**
> `computeAgeBracket()` — for any gate that turns on the learner's age.

`isAdultOwner` **is** the adult-owner gate, and it does year-only math.

The clinching evidence that this is an oversight rather than a decision: the
navigation layer **already has a second, correct copy** of this exact function.
`apps/mobile/src/lib/navigation-contract.ts:209` calls
`computeAgeBracketFromDate(birthYear, birthMonth, birthDay)`. Someone fixed the
nav gate and never fixed the shared helper.

The two therefore **disagree for up to 11 months**: `navigation-contract.ts` says
`adolescent`, `ParentHomeScreen` says `adult`. In a product for minors, an
age gate that two layers answer differently is a defect regardless of which
answer you prefer.

## Current state

### The broken shared helper

`packages/schemas/src/age.ts:96-107`:

```ts
export function isAdultOwner(
  profile: AgeGateProfile | null | undefined,
  currentYear?: number,
): boolean {
  if (!profile) return false;
  if (profile.role !== undefined && profile.role !== 'owner') return false;
  if (profile.role === undefined && profile.isOwner !== true) return false;
  if (profile.birthYear == null) return false;

  const year = currentYear ?? new Date().getFullYear();
  return year - profile.birthYear >= PARENT_ACCOUNT_MINIMUM_AGE;   // <-- year-only
}
```

### Its input type cannot express a birthdate

`packages/schemas/src/age.ts:24-34`:

```ts
export interface AgeGateProfile {
  role?: AgeGateRole | null;
  isOwner?: boolean | null;
  birthYear?: number | null;
}
```

No `birthMonth`, no `birthDay`. That is why the call sites cannot pass them.

### The canonical function already exists and is correct

`packages/schemas/src/age.ts:76-92`:

```ts
export function computeAgeBracketFromDate(
  birthYear: number,
  birthMonth?: number,
  birthDay?: number,
): AgeBracket {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  let age = currentYear - birthYear;
  if (birthMonth != null && birthDay != null) {
    const birthdayThisYear = new Date(
      Date.UTC(currentYear, birthMonth - 1, birthDay),
    );
    if (now < birthdayThisYear) age -= 1;      // <-- the correction that's missing
  }
  ...
}
```

Note it **degrades gracefully**: with no month/day it falls back to year-only.
So threading the fields through is safe even for profiles that lack them.

### The correct implementation already exists — in the nav layer

`apps/mobile/src/lib/navigation-contract.ts:209-218`:

```ts
function isAdultOwner(profile: NavigationProfile | null): boolean {
  if (!profile?.isOwner || profile.birthYear == null) return false;
  return (
    computeAgeBracketFromDate(
      profile.birthYear,
      profile.birthMonth ?? undefined,
      profile.birthDay ?? undefined,
    ) === 'adult'
  );
}
```

**This is your target shape.** The shared helper should behave identically.

### The call site that leaks the bug to users

`apps/mobile/src/components/home/ParentHomeScreen.tsx:748-751` — the "Add child"
gate, passing only `birthYear` because the type allows nothing more:

```tsx
  const showAddChild = isAdultOwner({
    role,
    birthYear: activeProfile?.birthYear,
  });
```

Other consumer: `apps/mobile/src/components/home/LearnerScreen.tsx:142`
(family-plan branch).

### The data is already available on the client

`packages/schemas/src/profiles.ts:211-217` exposes `birthMonth` / `birthDay` on
the client profile **precisely so** — per its own comment — "mobile
family-capable pre-checks can match the server's `computeAgeBracketFromDate`
decision (WI-367)". The fields are there, already fetched, and simply unused by
`isAdultOwner`.

### Repo conventions

- `@eduagent/schemas` is the shared contract — fix it there, not by patching
  each call site.
- Tests are co-located. No `__tests__/` folders.
- Do NOT add internal `jest.mock('./...')` — GC1 CI ratchet.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Schemas tests | `pnpm exec jest --config apps/api/jest.config.cjs packages/schemas/src/age.test.ts --no-coverage` | all pass |
| Typecheck mobile | `cd apps/mobile && pnpm exec tsc --noEmit` | exit 0 |
| Typecheck API | `pnpm exec nx run api:typecheck` | exit 0 |
| Lint mobile | `pnpm exec nx lint mobile` | exit 0 |
| Mobile suite | `pnpm test:mobile:unit` | all pass |

## Scope

**In scope:**
- `packages/schemas/src/age.ts` — extend `AgeGateProfile`; make `isAdultOwner` delegate to `computeAgeBracketFromDate`.
- `packages/schemas/src/age.test.ts` — the boundary tests.
- `apps/mobile/src/components/home/ParentHomeScreen.tsx` — pass `birthMonth`/`birthDay`.
- `apps/mobile/src/components/home/LearnerScreen.tsx` — same, if it constructs the object.

**Out of scope (do NOT touch):**
- `computeAgeBracketFromDate` itself — it is correct and is the reference.
- `computeAgeBracket` (the year-only one) — it is **legitimate** for theming and
  age-appropriate copy. AGENTS.md keeps both deliberately. Do **not** delete it or
  "unify" the two.
- The `PARENT_ACCOUNT_MINIMUM_AGE` / `PROFILE_MINIMUM_AGE` constants.
- **Deduplicating the two `isAdultOwner` implementations.** Tempting — the nav
  layer's local copy becomes redundant once the shared one is correct — but
  `navigation-contract.ts` is under an active, flag-gated nav migration whose
  shipped states must not regress. Collapsing them is a separate change. See
  Maintenance notes.
- Any server-side gate. This plan is the client helper only.

## Git workflow

- Branch from `main`: `advisor/019-adult-owner-gate-exact-birthdate`
- Conventional commits (e.g. `fix(schemas): use exact birthdate in adult-owner gate`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Write the failing boundary test

In `packages/schemas/src/age.test.ts`, add a test that pins the exact defect. Use
fake timers or an injected clock so it is deterministic — read the existing tests
in that file first; they already handle "current date" (note `isAdultOwner` takes
an optional `currentYear` param, and `computeAgeBracketFromDate` reads `new Date()`,
so you will likely need `jest.useFakeTimers().setSystemTime(...)`).

The case that matters — a 17-year-old who reads as 18 under year-only math:

```ts
it('[WI-XXXX] treats a 17-year-old whose birthday has not yet passed as NOT an adult owner', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-01-15T00:00:00Z'));
  // Born 2008-12-01 → on 2026-01-15 they are 17 years, 1.5 months old.
  // Year-only math: 2026 - 2008 = 18 → WRONG.
  expect(
    isAdultOwner({
      role: 'owner',
      birthYear: 2008,
      birthMonth: 12,
      birthDay: 1,
    }),
  ).toBe(false);
});
```

Add the passing counterpart too (birthday already passed → `true`), and the
degradation case (month/day absent → falls back to year-only, current behavior
preserved).

**Verify**: the 17-year-old test **MUST FAIL** now — it will not even typecheck
until Step 2 widens `AgeGateProfile`. A compile error counts as red.

### Step 2: Widen the type and delegate to the canonical function

`packages/schemas/src/age.ts` — extend the interface:

```ts
export interface AgeGateProfile {
  role?: AgeGateRole | null;
  isOwner?: boolean | null;
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
}
```

Rewrite the age check to delegate (keep the role/owner guards exactly as they
are — they are not the bug):

```ts
export function isAdultOwner(
  profile: AgeGateProfile | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.role !== undefined && profile.role !== 'owner') return false;
  if (profile.role === undefined && profile.isOwner !== true) return false;
  if (profile.birthYear == null) return false;

  // Safety-adjacent age gate — MUST use the exact birthdate, not year-only
  // math (AGENTS.md: computeAgeBracketFromDate is canonical for the
  // adult-owner gate). Year-only subtraction classifies a 17-year-old as an
  // adult for up to 11 months. Mirrors navigation-contract.ts:209.
  // Degrades to year-only when month/day are absent.
  return (
    computeAgeBracketFromDate(
      profile.birthYear,
      profile.birthMonth ?? undefined,
      profile.birthDay ?? undefined,
    ) === 'adult'
  );
}
```

**On the `currentYear` parameter**: the old signature accepted `currentYear?: number`
for testability. `computeAgeBracketFromDate` reads `new Date()` directly and takes
no clock. Prefer **removing** the parameter and having tests use fake timers (as
`computeAgeBracketFromDate`'s own tests presumably do). If any **production** call
site passes `currentYear`, STOP and report rather than silently changing its
meaning — check with:
`rg -n 'isAdultOwner\(' apps packages --glob '!*.test.*'`

**Verify**: `pnpm exec nx run api:typecheck` and `cd apps/mobile && pnpm exec tsc --noEmit` → both exit 0 (the widened optional fields are backward-compatible; existing callers still compile).

### Step 3: Pass the birthdate at the call sites

`apps/mobile/src/components/home/ParentHomeScreen.tsx:748-751`:

```tsx
  const showAddChild = isAdultOwner({
    role,
    birthYear: activeProfile?.birthYear,
    birthMonth: activeProfile?.birthMonth,
    birthDay: activeProfile?.birthDay,
  });
```

Do the same at `apps/mobile/src/components/home/LearnerScreen.tsx:142` if it
constructs an object literal; if it passes `activeProfile` straight through, the
widened type already picks the fields up — confirm by reading it.

Then re-run the sweep and confirm **every** call site now supplies the fields
where the profile has them:

```
rg -n -A4 'isAdultOwner\(' apps/mobile/src --glob '!*.test.*'
```

**Verify**: `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0.

### Step 4: Green, then revert-check

1. Run the age tests → the 17-year-old test **PASSES**.
2. Revert `isAdultOwner`'s body to the old year-only `return year - profile.birthYear >= PARENT_ACCOUNT_MINIMUM_AGE;`.
3. Re-run → the 17-year-old test **FAILS**.
4. Restore. Re-run → **PASSES**.

### Step 5: Validate

**Verify**, all of:
- `pnpm exec jest --config apps/api/jest.config.cjs packages/schemas/src/age.test.ts --no-coverage` → all pass
- `pnpm exec nx run api:typecheck` → exit 0
- `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0
- `pnpm exec nx lint mobile` → exit 0
- `pnpm test:mobile:unit` → all pass

## Test plan

In `packages/schemas/src/age.test.ts` (co-located, follow the existing structure):

1. **The bug**: born 2008-12-01, "today" 2026-01-15 → `isAdultOwner` is `false` (they are 17).
2. **The pass**: born 2008-01-01, "today" 2026-01-15 → `true` (they are 18).
3. **Exact-birthday boundary**: born 2008-01-15, "today" 2026-01-15 → `true` (18 today, not tomorrow).
4. **Graceful degradation**: `birthMonth`/`birthDay` absent → falls back to year-only, matching today's behavior (proves you did not break profiles lacking exact dates).
5. **Role guards unchanged**: a non-owner, and a null profile, still return `false`.
6. **Consistency with the nav layer**: for the same profile input, `isAdultOwner` and `navigation-contract.ts`'s `isAdultOwner` return the same answer. This is the test that *actually* pins the bug — the two layers must not disagree.

## Done criteria

ALL must hold:

- [ ] `packages/schemas/src/age.test.ts` passes, including the 17-year-old case
- [ ] The 17-year-old test provably fails when the fix is reverted (Step 4 performed)
- [ ] `pnpm exec nx run api:typecheck` exits 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm exec nx lint mobile` exits 0
- [ ] `pnpm test:mobile:unit` exits 0
- [ ] `isAdultOwner` contains **no** `- profile.birthYear` arithmetic: `grep -n "profile.birthYear >=" packages/schemas/src/age.ts` returns nothing
- [ ] Every `isAdultOwner(` call site in `apps/mobile/src` supplies `birthMonth`/`birthDay` where the profile carries them
- [ ] `computeAgeBracket` (the year-only function) still exists and is untouched
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- A **production** call site passes the `currentYear` argument. Removing the
  parameter would then change real behavior, not just test ergonomics.
- Widening `AgeGateProfile` breaks a consumer you did not expect (e.g. an API-side
  caller constructing it from a DB row without month/day). The optional fields
  should be backward-compatible — if they are not, report what broke.
- Tightening the gate causes an existing test to fail by asserting a 17-year-old
  **is** an adult owner. That would mean the loose behavior was somewhere
  deliberately relied upon — surface it; do not delete the test to make yours pass.
- You are tempted to also delete `computeAgeBracket` or collapse the duplicate
  nav-layer `isAdultOwner`. Both are out of scope (see Scope).

## Maintenance notes

- **What a reviewer should scrutinize**: test 6 — that the shared helper and
  `navigation-contract.ts`'s local copy now agree for every input. Two age gates
  that answer differently is the actual defect; making them agree is the actual fix.
- **The duplicate is now redundant.** Once the shared `isAdultOwner` is correct,
  `navigation-contract.ts:209`'s local copy is doing the same job. Collapsing them
  is the right follow-up but **not** this plan: `navigation-contract.ts` sits under
  the flag-gated V0/V1/V2 nav migration whose shipped states must not regress, so
  it needs its own change with the nav test matrix run against it.
- **The generalizable rule** (already in AGENTS.md, evidently not yet enforced):
  `computeAgeBracket` is for **theming and copy**; `computeAgeBracketFromDate` is
  for **gates**. There is no automated check for this. If a third age gate appears,
  a lint rule banning `computeAgeBracket` outside theming modules would be cheap
  insurance — this bug is exactly what it would have caught.
- **Server-side**: this plan fixes the *client* gate. Whether the corresponding
  server route independently enforces an adult check on add-child was not verified
  by this audit. A client-only gate is a UX affordance, not a security boundary —
  worth confirming separately.
