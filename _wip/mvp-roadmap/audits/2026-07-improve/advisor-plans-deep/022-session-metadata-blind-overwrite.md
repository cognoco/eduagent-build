# Plan 022: Stop the blind metadata full-replace from clobbering challenge-round state

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/session/session-exchange.ts apps/api/src/services/session/session-crud.ts`
> If either file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `8c049b93f`, 2026-07-13
- **Audit finding**: #7

## Why this matters

Inside a single call to `prepareExchangeContext`, the code does this:

1. **`:2782`** — writes `metadata.challengeRound` to the database, via
   `persistChallengeRoundState`.
2. **`:2869`** — reads `session.metadata` from the **in-memory `session` object**,
   which was loaded *before* step 1. This snapshot does **not** contain the
   `challengeRound` key that was just written.
3. **`:2916` / `:2928`** — spreads that **stale** snapshot into a new object and
   calls `updateSessionMetadata`, which does a blind `.set({ metadata })` — a
   **full column replace**, not a merge.

Step 3 therefore writes back a metadata blob that predates step 1, and the
challenge-round state written seconds earlier is **silently erased**. The learner's
challenge-round progress resets, with no error and no log line.

This is **latent today**: `CHALLENGE_ROUND_RUNTIME_ENABLED` defaults to `'false'`
(`config.ts:162`), so `shouldPersist` is false and there is nothing to clobber. That
is precisely what makes it dangerous — it is a landmine sitting **directly on the
rollout path** of the feature it destroys. The day that flag flips on for a cohort,
any session that also takes a continuation-opener branch loses its challenge round.

The correct primitive already exists, is already exported, and is already used
elsewhere in the same module family: `persistSessionMetadata` in `session-crud.ts`
does a transaction + `SELECT … FOR UPDATE` + **partial merge**. The fix is to route
both call sites through it and delete the unsafe helper.

## Current state

### The unsafe helper

`apps/api/src/services/session/session-exchange.ts:454-469`:

```ts
async function updateSessionMetadata(
  db: Database,
  profileId: string,
  sessionId: string,
  nextMetadata: Record<string, unknown>,
): Promise<void> {
  await db
    .update(learningSessions)
    .set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
      ),
    );
}
```

No re-read. No lock. `.set({ metadata })` replaces the **entire** JSONB column with
whatever the caller assembled from a snapshot of unknown age.

### The write it clobbers

`apps/api/src/services/session/session-exchange.ts:2782-2790`:

```ts
  if (challengeRoundStart.shouldPersist) {
    await persistChallengeRoundState(
      db,
      profileId,
      sessionId,
      challengeRoundStart.challengeRound,
    );
    challengeRound = challengeRoundStart.challengeRound;
  }
```

### The stale snapshot

`apps/api/src/services/session/session-exchange.ts:2869`:

```ts
  const sessionMetadata = session.metadata as Record<string, unknown> | null;
```

`session` was loaded earlier in the function — **before** `:2782` wrote
`challengeRound`. So `sessionMetadata` is missing that key.

### The two clobbering call sites

`apps/api/src/services/session/session-exchange.ts:2911-2917`:

```ts
  if (continuationOpenerActive && session.exchangeCount >= 3) {
    continuationDepth = 'mid';
    const nextMetadata = { ...(sessionMetadata ?? {}) };
    delete nextMetadata['continuationOpenerActive'];
    delete nextMetadata['continuationOpenerStartedExchange'];
    nextMetadata['continuationDepth'] = continuationDepth;
    await updateSessionMetadata(db, profileId, sessionId, nextMetadata);
  }
```

`apps/api/src/services/session/session-exchange.ts:2924-2932`:

```ts
    continuationOpenerPhase = 'probe';
    await updateSessionMetadata(db, profileId, sessionId, {
      ...(sessionMetadata ?? {}),
      continuationOpenerActive: true,
      continuationOpenerStartedExchange: 0,
    });
```

Both spread `sessionMetadata` — the stale snapshot — and full-replace with it.

### The safe helper that already exists

`apps/api/src/services/session/session-crud.ts:643-680`:

```ts
export async function persistSessionMetadata(
  db: Database,
  profileId: string,
  sessionId: string,
  partial: Partial<SessionMetadata>,
): Promise<LearningSession | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ metadata: learningSessions.metadata })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId),
        ),
      )
      .for('update')
      .limit(1);

    if (!current) return null;

    const nextMetadata: Record<string, unknown> = {
      ...((current.metadata as Record<string, unknown> | null) ?? {}),
    };
    for (const [key, value] of Object.entries(
      partial as Record<string, unknown>,
    )) {
      if (value === undefined) {
        delete nextMetadata[key];
      } else {
        nextMetadata[key] = value;
      }
    }
    …
```

Three properties that make it exactly right here:

- It **re-reads inside a transaction** with `FOR UPDATE`, so it merges against
  what is actually in the row — not against a stale in-memory snapshot.
- It takes a **partial**, so callers stop hand-assembling the whole blob.
- `undefined` means **delete the key** — which maps precisely onto the two
  `delete nextMetadata[...]` lines at `:2913-2914`.

### Repo conventions

- Business logic lives in `services/`. Both files already are.
- Writes must be `profileId`-scoped. `persistSessionMetadata` already enforces this
  in its `WHERE`.
- Remove code your change orphans. After both call sites migrate,
  `updateSessionMetadata` has **zero** callers — delete it.
- Do NOT add internal `jest.mock('./...')` — GC1 CI ratchet.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck API | `pnpm exec nx run api:typecheck` | exit 0 |
| Lint API | `pnpm exec nx run api:lint` | exit 0 |
| Session tests | `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/session --no-coverage` | all pass |

## Scope

**In scope:**
- `apps/api/src/services/session/session-exchange.ts` — migrate `:2916` and `:2928`
  to `persistSessionMetadata`; delete the now-orphaned `updateSessionMetadata`.
- `apps/api/src/services/session/session-exchange.test.ts` — the regression test.

**Out of scope (do NOT touch):**
- `persistSessionMetadata` itself. It is correct. Do not "improve" it.
- `persistChallengeRoundState`. Step 1 asks you to *check* whether it has the same
  blind-replace shape — if it does, that is a **finding to report**, not a fix to
  bundle in. One defect, one PR.
- The challenge-round state machine, `resolveChallengeRoundRuntimeStartState`, or
  the continuation-opener product logic. This plan changes **how** metadata is
  written, never **what** is written.
- The `CHALLENGE_ROUND_RUNTIME_ENABLED` flag default. Leave it `'false'`.
- Any other `.set({ metadata })` outside these two call sites.

## Git workflow

- Branch from `main`: `advisor/022-session-metadata-blind-overwrite`
- Conventional commits (e.g. `fix(session): merge session metadata instead of blind replace`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Confirm the blast radius

```
rg -n 'updateSessionMetadata' apps/api/src
rg -n 'set\(\{ metadata' apps/api/src
```

Expected for the first: the definition at `:454` and exactly **two** call sites
(`:2916`, `:2928`), all in `session-exchange.ts`.

For the second: check whether `persistChallengeRoundState` also does a blind
`.set({ metadata })`. **If it does, report it — do not fix it here.** If it turns
out `persistChallengeRoundState` is *itself* a full-replace, then the two writes
clobber each other in *both* directions and the finding is bigger than this plan;
that is a STOP condition.

### Step 2: Write the failing regression test

In `apps/api/src/services/session/session-exchange.test.ts`, add a test that
reproduces the clobber. It must exercise the real DB write path — do **not** mock
the metadata helpers.

```ts
it('[WI-XXXX] preserves challengeRound when the continuation-opener branch writes metadata', async () => {
  // 1. Seed a session whose metadata ALREADY contains a challengeRound blob
  //    (simulating persistChallengeRoundState having just written it), plus
  //    continuationOpenerActive: true and exchangeCount >= 3 so the :2911 branch fires.
  // 2. Call prepareExchangeContext with challengeRoundRuntimeEnabled: true.
  // 3. Re-read the session row from the DB.
  const row = await db.query.learningSessions.findFirst({ where: eq(learningSessions.id, sessionId) });
  const meta = row!.metadata as Record<string, unknown>;

  expect(meta['challengeRound']).toBeDefined();          // <-- FAILS today: erased
  expect(meta['continuationDepth']).toBe('mid');          // the intended write still lands
  expect(meta['continuationOpenerActive']).toBeUndefined(); // the intended delete still lands
});
```

The three assertions together are the point: the fix must **preserve the untouched
key** while still performing **both** the intended set and the intended delete. A
fix that preserves `challengeRound` but stops deleting `continuationOpenerActive`
is not a fix.

Add the mirror test for the `:2928` branch (`exchangeCount === 0`, resume path),
asserting `challengeRound` survives there too.

**Verify**: both tests **MUST FAIL** on `challengeRound` being `undefined`.

**If they pass before the fix, STOP and report** — either the seeding isn't
reproducing the ordering, or `session` is being re-read somewhere I did not find,
and the plan's premise is wrong.

### Step 3: Migrate call site 1 (`:2911-2917`)

```ts
  if (continuationOpenerActive && session.exchangeCount >= 3) {
    continuationDepth = 'mid';
    await persistSessionMetadata(db, profileId, sessionId, {
      continuationOpenerActive: undefined,
      continuationOpenerStartedExchange: undefined,
      continuationDepth,
    });
  }
```

`undefined` deletes the key (see the helper's merge loop). The two `delete`
statements and the hand-assembled `nextMetadata` object both disappear.

If `Partial<SessionMetadata>` does not permit explicitly-`undefined` properties
under this repo's TS config (`exactOptionalPropertyTypes`), the typecheck will tell
you. In that case widen the helper's parameter type at its definition — that is a
legitimate, minimal change to `session-crud.ts` and is **in** scope; a `// @ts-expect-error`
or a cast is **not**.

### Step 4: Migrate call site 2 (`:2924-2932`)

```ts
    continuationOpenerPhase = 'probe';
    await persistSessionMetadata(db, profileId, sessionId, {
      continuationOpenerActive: true,
      continuationOpenerStartedExchange: 0,
    });
```

Note what vanished: the `...(sessionMetadata ?? {})` spread. The caller no longer
assembles the blob at all — which is the whole point. The helper merges against the
live row.

Add the import from `./session-crud` if it is not already present.

### Step 5: Delete the orphan

`updateSessionMetadata` (`:454-469`) now has zero callers. Delete it, and remove any
imports it alone was using.

**Verify**:
```
rg -n 'updateSessionMetadata' apps/api/src
```
→ **zero matches**. Then `pnpm exec nx run api:typecheck` → exit 0 (this also
proves no orphaned imports).

Check `:481`, which mentions `updateSessionMetadata` in a **comment**. Update that
comment to name `persistSessionMetadata` — a stale comment pointing at a deleted
function is exactly the kind of false signal the repo's docs rules warn about.

### Step 6: Green, then revert-check

1. Both tests from Step 2 pass.
2. Revert Step 3 (restore the blind `updateSessionMetadata` call at site 1).
3. Re-run → that test **FAILS** on `challengeRound` being erased.
4. Restore. Re-run → **PASSES**.

### Step 7: Validate

**Verify**, all of:
- `pnpm exec nx run api:typecheck` → exit 0
- `pnpm exec nx run api:lint` → exit 0
- `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/session --no-coverage` → all pass
- `rg -n 'updateSessionMetadata' apps/api/src` → zero matches

## Test plan

- **Clobber regression, branch 1** (`:2911`): `challengeRound` survives; the
  intended set and both intended deletes still land. Red-green.
- **Clobber regression, branch 2** (`:2928`): `challengeRound` survives. Red-green.
- **Delete-semantics test**: `persistSessionMetadata(…, { foo: undefined })` removes
  `foo` rather than storing a literal `null`. If `session-crud.test.ts` already
  covers this, cite it and skip; if not, add it — the whole migration rests on it.
- Exercise the **real** DB write path. Do NOT `jest.mock` the metadata helpers —
  a mock here would assert the mock, not the merge, and would have hidden this bug
  in the first place.

## Done criteria

ALL must hold:

- [ ] `pnpm exec nx run api:typecheck` exits 0
- [ ] `pnpm exec nx run api:lint` exits 0
- [ ] All `apps/api/src/services/session` tests pass
- [ ] Both new tests provably fail when the fix is reverted (Step 6 performed)
- [ ] `rg -n 'updateSessionMetadata' apps/api/src` returns **zero** matches
- [ ] The comment at `:481` no longer names the deleted function
- [ ] `CHALLENGE_ROUND_RUNTIME_ENABLED` still defaults to `'false'` (untouched)
- [ ] No `@ts-expect-error`, no cast, no `eslint-disable` introduced
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- Step 1 shows `persistChallengeRoundState` **also** blind-replaces the metadata
  column. The two writes then clobber each other in both directions, the defect is
  larger than this plan, and it needs re-scoping before any fix.
- The Step-2 tests pass before the fix — the premise is wrong; report rather than
  proceed.
- The typecheck forces you toward a cast or `@ts-expect-error` to express
  "delete this key". Widening `persistSessionMetadata`'s parameter type is the
  correct answer; if that seems impossible, stop and report.
- Migrating the call sites changes **which** keys get written. It must not — this
  plan changes only *how* the write happens.

## Maintenance notes

- **Why this was invisible**: the feature that gets destroyed is behind a flag that
  defaults off, so the clobber has no observable victim in any environment today.
  It would have surfaced as "challenge rounds mysteriously reset" during rollout —
  at which point the flag, not the metadata write, would have taken the blame.
- **What a reviewer should scrutinize**: that `undefined` still *deletes* the two
  continuation-opener keys after the migration. If those keys start persisting as
  `null` instead of being removed, downstream `=== true` checks still work but the
  blob grows monotonically — a quiet regression the tests above are designed to catch.
- **The generalisable rule**: a full-column JSONB `.set()` is only safe if the
  caller re-read the column inside the same transaction. Anywhere else, use a
  merging helper. `persistSessionMetadata` is that helper — new metadata writers
  should route through it rather than hand-rolling a spread.
