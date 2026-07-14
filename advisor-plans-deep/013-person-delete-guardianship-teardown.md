# Plan 013: Tear down guardianship/supportership edges in the four person-scoped delete paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/identity-v2/deletion-v2.ts packages/database/src/schema/identity.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security / compliance / bug
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

The four person-scoped hard-delete functions in `deletion-v2.ts` delete a
`person` row **without first tearing down that person's `guardianship` and
`supportership` edges**. Both of those FKs are declared `ON DELETE RESTRICT`.
Every managed child gets a guardian→child `guardianship` row unconditionally at
creation. Therefore: **deleting a managed child raises a Postgres foreign-key
violation, the transaction rolls back, and the deletion never happens.**

All three statutory auto-erasure pipelines route through these functions:

- consent withdrawal → grace period → delete (`consent-revocation.ts`, `consent-email-revocation.ts`)
- archive → 30-day retention → delete (`archive-cleanup.ts`)
- no-consent-received → day-30 COPPA auto-delete (`consent-reminders.ts`)

Each one currently fails, retries up to 5 times, and lands in the Inngest
`onFailure` handler, which escalates to Sentry with "GDPR cascade delete may not
have completed". So this presents as a *monitored-but-unresolved alert*, not as
an outage — which is exactly why it has survived. **The erasure that COPPA/GDPR
require is not happening, for any managed child, ever, without manual ops.**

The fix already exists in this very file. `executeDeletionV2` (the whole-org
path) does the teardown correctly — it was added as "WI-849 Gap 3". That fix was
simply never applied to the person-granularity siblings.

## Current state

### The files

- `apps/api/src/services/identity-v2/deletion-v2.ts` — all four broken functions
  and the one correct exemplar.
- `packages/database/src/schema/identity.ts` — the `RESTRICT` FK declarations.
- `apps/api/src/services/identity-v2/child-profile-v2.ts` — proves every managed
  child has a guardianship edge.

### The FKs that block the delete

`packages/database/src/schema/identity.ts:378-383`:

```ts
guardianPersonId: uuid('guardian_person_id')
  .notNull()
  .references(() => person.id, { onDelete: 'restrict' }),
chargePersonId: uuid('charge_person_id')
  .notNull()
  .references(() => person.id, { onDelete: 'restrict' }),
```

`supportership` declares the same `restrict` pattern on `supporterPersonId` /
`supporteePersonId`.

### Every managed child has an edge

`apps/api/src/services/identity-v2/child-profile-v2.ts:191-199` — step (3) of
the standard add-child flow, unconditional:

```ts
// (3) owner→child guardianship edge. MUST precede the consent grant — the
// grant treats the edge as a precondition (consent-v2.ts inv 14).
const [edge] = await txDb
  .insert(guardianship)
  .values({
    guardianPersonId: ownerPersonId,
    chargePersonId: childRow.id,
  })
  .returning();
```

### The CORRECT exemplar — copy this pattern

`apps/api/src/services/identity-v2/deletion-v2.ts:442-459`, inside
`executeDeletionV2`'s transaction (this is "Step 2a", documented in the file
header at lines 16-18):

```ts
if (personIds.length > 0) {
  await tx
    .delete(guardianship)
    .where(
      or(
        inArray(guardianship.guardianPersonId, personIds),
        inArray(guardianship.chargePersonId, personIds),
      ),
    );
  await tx
    .delete(supportership)
    .where(
      or(
        inArray(supportership.supporterPersonId, personIds),
        inArray(supportership.supporteePersonId, personIds),
      ),
    );
}
```

### The FOUR broken functions

All four sit in `deletion-v2.ts` and share the identical tail. None deletes the
edges.

1. **`deletePersonV2`** (declared line 561). Tail at ~line 578-585:

```ts
    await acquirePersonLockTx(tx, personId);
    if (!(await personExistsTx(tx, personId))) return;
    await rehomeGrantsTx(tx, personId);
    await writeFinancialRecordsForPersonTx(tx, personId);
    await tx.insert(deletionAudit).values({
      personId,
      deletedBy,
      reason,
      retentionPeriod: null,
    });
    await tx.delete(person).where(eq(person.id, personId));
```

2. **`deletePersonIfConsentWithdrawnV2`** (declared line 594). Tail at ~line 649-661:

```ts
    if (!(await personExistsTx(tx, personId))) return false;
    await rehomeGrantsTx(tx, personId);
    await writeFinancialRecordsForPersonTx(tx, personId);
    await tx.insert(deletionAudit).values({
      personId,
      deletedBy: null,
      reason: 'guardian_initiated',
      retentionPeriod: null,
    });
    const deleted = await tx
      .delete(person)
      .where(eq(person.id, personId))
      .returning({ id: person.id });
    return deleted.length > 0;
```

3. **`deletePersonIfNoConsentV2`** (declared line 674). Same tail shape,
   `reason: 'abandonment'`, around lines 745-757.

4. **`deleteArchivedPersonIfStillEligibleV2`** (declared line 761). Same tail
   shape, `reason: 'abandonment'`, around lines 803-815.

### Imports are already present — no new imports needed

`deletion-v2.ts:62-89` already imports `and`, `eq`, `or`, `inArray` from
`drizzle-orm` and `guardianship`, `supportership`, `person` from
`@eduagent/database`. The fix is purely additive.

### Repo conventions to honor

- Writes go through the existing transaction (`tx`), never a fresh `db` handle.
- This repo requires a **red-green-revert break test** for security/compliance
  fixes (AGENTS.md → "Fix Development Rules"): write the test, watch it pass,
  revert the fix, watch it fail, restore the fix.
- Tests are **co-located**. Do NOT create a `__tests__/` folder.
- Do NOT add a new internal `jest.mock('./...')` — the GC1 CI ratchet blocks it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck API | `pnpm exec nx run api:typecheck` | exit 0 |
| Lint API | `pnpm exec nx run api:lint` | exit 0 |
| Unit tests (targeted) | `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/identity-v2 --no-coverage` | all pass |
| Integration (the real gate here) | `node scripts/doppler-run.mjs run -- pnpm exec nx run api:integration-api` | all pass |

Integration tests need a real DB via Doppler. If Doppler is not authenticated,
STOP and report — do not fabricate a passing result.

## Scope

**In scope:**
- `apps/api/src/services/identity-v2/deletion-v2.ts` (the fix)
- `apps/api/src/services/identity-v2/consent-v2.integration.test.ts` (the break test)
- `docs/adr/MMT-ADR-0026-whole-org-erasure-tears-down-surviving-edges.md` (one clarifying paragraph — see Step 4)

**Out of scope (do NOT touch):**
- `executeDeletionV2` and its Step 2a — it is already correct; it is your model.
- The Inngest callers (`consent-revocation.ts`, `consent-email-revocation.ts`,
  `archive-cleanup.ts`, `consent-reminders.ts`). The fix belongs in the service,
  not scattered across four callers.
- Any schema/migration change. **Do NOT "fix" this by changing the FKs to
  `CASCADE`.** The `RESTRICT` FKs are deliberate and load-bearing (see the
  `deletion-v2.ts` header comment on `consent_grant.charge_person_id`) — they
  exist to make "delete a person with live relationships" fail loudly rather
  than silently shred a consent receipt. The correct fix is an explicit,
  ordered teardown inside the transaction.
- `rehomeGrantsTx` / `writeFinancialRecordsForPersonTx` — leave their semantics
  alone.

## Git workflow

- Branch from `main`: `advisor/013-person-delete-guardianship-teardown`
- Conventional-commit style, matching `git log` (e.g. `fix(identity): tear down guardianship edges before person delete`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Write the break test FIRST, and watch it fail

In `apps/api/src/services/identity-v2/consent-v2.integration.test.ts`, add a
test that seeds a child **through the real production path** so it actually has
a guardianship edge.

This is the crux: the existing tests pass only because their local `seedPerson()`
helper never creates a guardianship edge, so they never reproduce the real
invariant. Your test must not use that shortcut — create the child via the same
code path production uses (`createChildProfileV2` in
`apps/api/src/services/identity-v2/child-profile-v2.ts`), or explicitly insert a
`guardianship` row for the child, so the edge exists.

Then assert the delete **succeeds**:

```ts
it('[WI-XXXX] hard-deletes a managed child that has a live guardianship edge', async () => {
  // seed guardian + child WITH a real guardianship edge (production path)
  // ...
  const deleted = await deletePersonIfConsentWithdrawnV2(db, childPersonId);
  expect(deleted).toBe(true);
  // the person row is gone
  // the guardianship edge is gone
  // the deletion_audit row was written
});
```

**Verify**: run the targeted integration test. It **MUST FAIL** right now, with
a Postgres foreign-key violation on `guardianship` (error code `23503`,
mentioning `guardianship_charge_person_id_fkey` or similar).

**If it PASSES before you write the fix, STOP and report** — that means the
premise of this plan is wrong and something else already tears the edge down.

### Step 2: Add the teardown to all four functions

In each of `deletePersonV2`, `deletePersonIfConsentWithdrawnV2`,
`deletePersonIfNoConsentV2`, and `deleteArchivedPersonIfStillEligibleV2`, insert
the teardown **inside the existing transaction**, immediately **before** the
final `tx.delete(person)` and **after** `rehomeGrantsTx(...)`:

```ts
    // Tear down the person's own relationship edges before the person drop.
    // guardianship/supportership FK to person is ON DELETE RESTRICT, so the
    // person delete fails without this. Mirrors executeDeletionV2's Step 2a
    // (WI-849 Gap 3) at the single-person granularity: we drop the EDGE, never
    // the counterpart person.
    await tx
      .delete(guardianship)
      .where(
        or(
          eq(guardianship.guardianPersonId, personId),
          eq(guardianship.chargePersonId, personId),
        ),
      );
    await tx
      .delete(supportership)
      .where(
        or(
          eq(supportership.supporterPersonId, personId),
          eq(supportership.supporteePersonId, personId),
        ),
      );
```

Note this is the single-person form (`eq`, not `inArray`) — same shape, one id.

Ordering matters: it must be inside the transaction, and before the person
delete. Placing it after `rehomeGrantsTx` keeps the existing consent-receipt
semantics untouched.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0.

### Step 3: Red-green-revert on the break test

1. Run the Step-1 test → it must now **PASS**.
2. Comment out the teardown block in `deletePersonIfConsentWithdrawnV2` only.
3. Re-run → it must **FAIL** with the FK violation again.
4. Restore the teardown. Re-run → **PASS**.

This proves the test actually exercises the fix rather than passing vacuously.
AGENTS.md requires this for compliance-class fixes.

**Verify**: the full sequence behaves exactly as above. If step 3.3 still
passes with the fix removed, your test is not reaching the real code path —
STOP and report.

### Step 4: Correct the ADR (lockstep — required by repo policy)

`docs/adr/MMT-ADR-0026-whole-org-erasure-tears-down-surviving-edges.md` currently
states that person-granularity delete paths are "unchanged: there, the edges
still survive and the RESTRICT FKs remain load-bearing."

That is now demonstrably wrong for its own most common caller: consent
revocation, archive cleanup, and the day-30 no-consent sweep all delete the
*charge* of a guardianship edge. An edge cannot "survive" when one of its two
endpoints is deleted.

Add a short amendment paragraph recording that person-granularity deletes tear
down the edges **incident to that person only** (never the counterpart person),
and that the RESTRICT FKs remain load-bearing as an ordering constraint rather
than a survival guarantee.

This repo enforces ADR↔code lockstep, and `check:decision-adr-link` runs in CI.
Do not skip this step.

**Verify**: `pnpm exec tsx scripts/check-adr-provenance.ts` → exit 0.

### Step 5: Full validation

**Verify**, all of:
- `pnpm exec nx run api:typecheck` → exit 0
- `pnpm exec nx run api:lint` → exit 0
- `node scripts/doppler-run.mjs run -- pnpm exec nx run api:integration-api` → all pass

## Test plan

- **New test** (the break test) in
  `apps/api/src/services/identity-v2/consent-v2.integration.test.ts`: a managed
  child seeded **with** a real guardianship edge is successfully hard-deleted by
  `deletePersonIfConsentWithdrawnV2`, the edge row is gone, and the
  `deletion_audit` row is written.
- **Extend to the siblings**: add the equivalent assertion for
  `deleteArchivedPersonIfStillEligibleV2` (the archive-cleanup path — the
  *normal* path for children over 13) and `deletePersonIfNoConsentV2` (the
  day-30 COPPA path). These are the two highest-volume real callers.
- **Supportership**: add one case where the deleted person is a *supportee* with
  a live `supportership` edge, proving the second teardown works too.
- **Structural pattern to copy**: the existing integration tests in the same
  file (`consent-v2.integration.test.ts:1280-1327` shows the delete-path test
  shape; `:1588-1705` shows guardian-edge seeding). Follow their setup/teardown
  conventions.
- Do NOT add internal `jest.mock('./...')` — GC1 ratchet.

## Done criteria

ALL must hold:

- [ ] `pnpm exec nx run api:typecheck` exits 0
- [ ] `pnpm exec nx run api:lint` exits 0
- [ ] `node scripts/doppler-run.mjs run -- pnpm exec nx run api:integration-api` exits 0
- [ ] The new break test exists, passes with the fix, and **provably fails** when the fix is reverted (Step 3 performed and its result stated in the PR description)
- [ ] All four functions (`deletePersonV2`, `deletePersonIfConsentWithdrawnV2`, `deletePersonIfNoConsentV2`, `deleteArchivedPersonIfStillEligibleV2`) contain the teardown:
      `grep -c "delete(guardianship)" apps/api/src/services/identity-v2/deletion-v2.ts` returns **5** (1 pre-existing in `executeDeletionV2` + 4 new)
- [ ] MMT-ADR-0026 carries the amendment paragraph
- [ ] No schema/migration file was modified (`git status` shows nothing under `apps/api/drizzle/`)
- [ ] `advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- The Step-1 break test **passes before the fix is applied**. That falsifies this
  plan's core premise (something else already tears the edge down) and the whole
  plan must be re-examined.
- You find yourself wanting to change the FK from `RESTRICT` to `CASCADE`. That
  is explicitly the wrong fix and out of scope (see Scope).
- The teardown causes any *existing* test to fail — especially anything asserting
  that a delete is correctly **refused** (e.g. the restore-vs-delete race test at
  `consent-v2.integration.test.ts:1588-1705`). Those refusals are deliberate;
  do not "fix" them by weakening a guard.
- Doppler is not authenticated and you cannot run the integration suite. Do not
  claim the work is done on unit tests alone — the unit tests are exactly what
  missed this bug.

## Maintenance notes

- **What a reviewer should scrutinize**: that the teardown is *inside* the
  transaction and *before* the person delete, and that it deletes only the EDGE,
  never the counterpart person. A guardian being deleted along with their charge
  would be a catastrophic regression.
- **Why the unit tests missed this**: the test-local `seedPerson()` helper never
  creates a guardianship edge, so no unit test reproduces the real invariant.
  Any future test of a deletion path must seed the child through the production
  path (or explicitly add the edge) or it will re-open this blind spot.
- **Future interaction**: if a new relationship table with a `RESTRICT` FK to
  `person` is added (e.g. a co-parent or classroom edge), it must be added to
  BOTH `executeDeletionV2`'s Step 2a and these four functions. Consider
  extracting a shared `tearDownPersonEdgesTx(tx, personId)` helper if a third
  edge type appears — with only two, inline is clearer.
- **Deferred out of this plan**: the spurious Sentry alarm on benign retry
  (`deletion-v2.ts:396-417` fires `captureException` on the normal
  "already deleted" retry path). Once this fix lands, that alarm's signal
  quality matters more, but it is a separate change.
