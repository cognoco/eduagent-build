# Plan 018: Prevent double-submit on visibility-link creation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- "apps/mobile/src/app/(app)/link/initiate.tsx"`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: S (genuinely one line of production code + a test)
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

The "Create Link" button on the visibility-link screen has **no `disabled`
prop**. While the create mutation is in flight, only the button's *label*
changes (to "Creating…") — the `Pressable` stays fully active.

A rapid double-tap therefore fires `POST /visibility/links` **twice**, which can
create two supporter-visibility contracts for the same supporter/supportee pair.
`onSuccess` calls `router.replace()` to the new `contractId` each time, so the
duplicate contract persists server-side regardless of which response the UI
happens to land on.

Double-taps are most likely exactly when the request is slowest — a poor network
— which is precisely when the window is widest.

The correct pattern already exists **160 lines below, in the same file**: the
sibling `ExistingTeenInvite` submit button computes `canSubmit` (which includes
`!inviteMutation.isPending`) and sets `disabled={!canSubmit}`.

Codebase-wide there are exactly **two** `onPress={() => x.mutate()}` sites, both
in this one file. One is guarded; this one isn't. This is an isolated oversight,
not a widespread pattern — which is what makes it a clean, contained fix.

## Current state

### The bug

`apps/mobile/src/app/(app)/link/initiate.tsx:183-194`:

```tsx
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('visibility.link.createAction')}
        className="min-h-[48px] items-center justify-center rounded-button bg-primary px-4 py-3"
        onPress={() => createMutation.mutate()}
        testID="visibility-link-create"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {createMutation.isPending
            ? t('visibility.link.creating')
            : t('visibility.link.createAction')}
        </Text>
      </Pressable>
```

Note: it *knows* about `createMutation.isPending` — it uses it for the label — but
never uses it to gate the press.

### The correct sibling pattern, same file

`apps/mobile/src/app/(app)/link/initiate.tsx:319`:

```tsx
  const canSubmit = email.trim().length > 0 && !inviteMutation.isPending;
```

`apps/mobile/src/app/(app)/link/initiate.tsx:347-362`:

```tsx
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('visibility.link.existingTeenInviteAction')}
        disabled={!canSubmit}
        className={`mt-4 min-h-[48px] items-center justify-center rounded-button px-4 py-3 ${
          canSubmit ? 'bg-primary' : 'bg-primary/50'
        }`}
        onPress={() => inviteMutation.mutate()}
        testID="visibility-link-initiate-existing-teen-submit"
      >
```

Two things to copy: the `disabled` prop **and** the dimmed styling
(`bg-primary/50`) so the disabled state is visible, not just inert.

### The mutation's success path (why a duplicate is not harmless)

`apps/mobile/src/app/(app)/link/initiate.tsx:93-95` — `onSuccess` navigates via
`router.replace()` to `/(app)/link/[contractId]` with the new contract's id. Two
successful calls means two contracts created; the UI only ever shows one.

### Test file already exists

`apps/mobile/src/app/(app)/link/initiate.test.tsx` (9.0K) — extend it; do not
create a new file, and do not create a `__tests__/` folder.

### Repo conventions

- Semantic design tokens only (`bg-primary`, `bg-primary/50`) — **no hardcoded
  hex** in a screen component.
- User-visible copy goes through `t('…')`. This fix adds **no new copy** (the
  "Creating…" label already exists), so no `en.json` change is needed.
- Do NOT add internal `jest.mock('./...')` — GC1 CI ratchet.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck mobile | `cd apps/mobile && pnpm exec tsc --noEmit` | exit 0 |
| Lint mobile | `pnpm exec nx lint mobile` | exit 0 |
| Targeted test | `pnpm exec jest --config apps/mobile/jest.config.cjs --no-coverage "apps/mobile/src/app/\(app\)/link/initiate.test.tsx"` | all pass |

## Scope

**In scope:**
- `apps/mobile/src/app/(app)/link/initiate.tsx` — the `disabled` prop + dimmed styling.
- `apps/mobile/src/app/(app)/link/initiate.test.tsx` — the regression test.

**Out of scope (do NOT touch):**
- The `ExistingTeenInvite` button (`:347-362`) — it is already correct and is your
  reference.
- The mutation logic, the API route, or `onSuccess`/`router.replace`.
- **Server-side idempotency for `POST /visibility/links`.** A client-side guard
  does not make the endpoint idempotent — a retry, a flaky network, or a
  non-app client could still create duplicates. That is a real and separate
  concern; note it as a follow-up (see Maintenance notes), but do **not** expand
  this plan to cover it.
- Any other screen. The sweep in Step 1 is to *confirm* the scope is one line,
  not an invitation to refactor.

## Git workflow

- Branch from `main`: `advisor/018-link-create-double-submit`
- Conventional commits (e.g. `fix(mobile): disable create-link button while pending`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Confirm the scope is exactly this one site

```
rg -n 'onPress=\{.*\.mutate\(\)\}' apps/mobile/src
```

Expected: exactly **2** matches, both in
`apps/mobile/src/app/(app)/link/initiate.tsx` (lines ~186 and ~354). The one at
~354 is already guarded.

If you find **more** than 2, STOP and report — the fix is then a pattern sweep,
not a one-liner, and the plan needs re-scoping.

### Step 2: Write the failing regression test

Extend `apps/mobile/src/app/(app)/link/initiate.test.tsx`. Read the existing
tests there first and follow their render/interaction conventions.

The test must prove a **double-tap fires the request only once**:

```tsx
it('[WI-XXXX] does not create a second link when the create button is double-tapped', async () => {
  // render the screen with a create mutation whose promise is still pending
  const button = screen.getByTestId('visibility-link-create');

  fireEvent.press(button);
  fireEvent.press(button);   // second tap while the first is still in flight

  // the POST fired exactly once
  expect(createLinkSpy).toHaveBeenCalledTimes(1);
});
```

Assert on the **network/mutation call count**, not on the button's `disabled`
prop — assert the behavior, not the implementation. A test that only checks
`disabled === true` would pass even if `onPress` still fired.

**Verify**: run the targeted test. It **MUST FAIL** now, with 2 calls instead of 1.

**If it passes before the fix, STOP and report** — either the harness is
swallowing the second press, or something else already guards it.

### Step 3: Add the guard

`apps/mobile/src/app/(app)/link/initiate.tsx:183-194` becomes:

```tsx
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('visibility.link.createAction')}
        disabled={createMutation.isPending}
        className={`min-h-[48px] items-center justify-center rounded-button px-4 py-3 ${
          createMutation.isPending ? 'bg-primary/50' : 'bg-primary'
        }`}
        onPress={() => createMutation.mutate()}
        testID="visibility-link-create"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {createMutation.isPending
            ? t('visibility.link.creating')
            : t('visibility.link.createAction')}
        </Text>
      </Pressable>
```

This mirrors the sibling at `:347-362` exactly: `disabled` gates the press, and
the dimmed `bg-primary/50` makes the disabled state visible rather than silently
inert. Semantic tokens only — no hex.

**Verify**: `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0.

### Step 4: Green, then revert-check

1. Run the targeted test → **PASSES** (1 call).
2. Remove the `disabled` prop you just added.
3. Re-run → **FAILS** (2 calls).
4. Restore it. Re-run → **PASSES**.

### Step 5: Validate

**Verify**, all of:
- `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0
- `pnpm exec nx lint mobile` → exit 0
- `pnpm exec jest --config apps/mobile/jest.config.cjs --no-coverage "apps/mobile/src/app/\(app\)/link/initiate.test.tsx"` → all pass (including the pre-existing tests — the `ExistingTeenInvite` tests must be untouched)

## Test plan

- **New test** in `apps/mobile/src/app/(app)/link/initiate.test.tsx`: a
  double-press on `testID="visibility-link-create"` while the mutation is pending
  results in exactly **one** call to the create endpoint.
- **Accessibility assertion** (cheap, worth it): while pending, the button
  reports as disabled to the a11y tree — a screen-reader user should not be
  offered a control that does nothing.
- **Structural pattern to follow**: the existing tests in the same file, and the
  existing `ExistingTeenInvite` submit tests, which already cover the guarded
  sibling.
- Do NOT add internal `jest.mock('./...')`.

## Done criteria

ALL must hold:

- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm exec nx lint mobile` exits 0
- [ ] The `initiate.test.tsx` suite passes, including all pre-existing tests
- [ ] The new double-tap test provably fails when `disabled` is removed (Step 4 performed)
- [ ] `rg -n 'onPress=\{.*\.mutate\(\)\}' apps/mobile/src` still returns exactly 2 matches, and **both** are now guarded
- [ ] No hardcoded hex colors introduced (semantic tokens only)
- [ ] No new i18n keys added (the "Creating…" label already exists)
- [ ] `advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- Step 1 finds more than 2 `.mutate()`-on-`Pressable` sites. The fix is then a
  sweep and needs re-scoping.
- The double-tap test passes **before** the fix — the test harness may be
  debouncing presses, in which case the test proves nothing and needs rethinking.
- You find yourself changing the API route or adding server-side idempotency.
  That is out of scope (see Scope) — valuable, but a different piece of work.

## Maintenance notes

- **What this fix does NOT do**: it does not make `POST /visibility/links`
  idempotent. A client-side `disabled` guard closes the double-tap window, but a
  network retry, a background re-dispatch, or any non-app client can still create
  duplicate contracts. **The durable fix is server-side** — a uniqueness
  constraint on the (supporter, supportee, relation) triple, or an idempotency
  key on the create endpoint. Strongly worth filing as a follow-up; this plan
  deliberately stays client-side because that is where the observed bug is and it
  is a one-line, zero-risk win.
- **What a reviewer should scrutinize**: that the test asserts the **call count**,
  not the `disabled` prop. Asserting the prop tests the implementation and would
  not catch a regression where `onPress` fires despite `disabled`.
- **The generalizable rule**: any `onPress={() => x.mutate()}` needs
  `disabled={x.isPending}`. With only two sites, a lint rule is overkill — but if
  a third appears, that is the moment to write one.
