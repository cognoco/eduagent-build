# Neon PITR/Snapshot Recovery — `person_id` Data Mistakes

> Scope: recovering from a **`person_id` mistake** (e.g. data attached to the
> wrong `person` row, a bad merge, a mis-keyed write) via Neon point-in-time
> restore (PITR), pre-launch, while the dedicated forward-repair primitives
> (`WI-2057` — person merge/reparent/alias) do not yet exist. This is the
> recovery half of the identity canon amendment
> (`docs/canon/identity/data-model.md` §8); that section states the doctrine,
> this runbook states the mechanics.
>
> **Not in scope:** deletion recovery (undoing a legitimate account/person
> deletion) — tracked separately as `WI-2390`. This runbook's only job
> regarding deletion is the opposite direction: making sure a PITR restore
> performed for a `person_id` mistake never **resurrects** someone who was
> validly deleted. See §5.

## 1. When to use this runbook

Use Neon PITR/snapshot restore when a `person_id` mistake has corrupted or
misattributed data and no safer, narrower fix exists — e.g. a bad migration,
a bug that wrote learning data under the wrong `person_id`, or an operator
data-entry error. **Manual, ad hoc SQL "data surgery" against `person_id` in
production is prohibited** (see the canon amendment, §8) — PITR restore is
the sanctioned path today. If a targeted primitive (merge/reparent/alias)
would fix the problem without a full restore, that primitive does not exist
yet (`WI-2057`, Backlog) — do not hand-roll it; use this runbook or escalate
to the operator for an explicit one-off exception.

## 2. PITR window and snapshot cadence

Neon provides continuous, WAL-based point-in-time restore within a
plan-dependent retention window, plus scheduled snapshots. **The exact
retention window is a Neon project/plan setting, not a fixed number this doc
can safely hardcode** — confirm it in the Neon console (project → Branches →
history/restore settings) before relying on a specific point in time being
recoverable. Treat "PITR window" as "however far back the console currently
lets you pick," and re-verify after any plan change.

Scheduled snapshots follow a **project-configured cadence** which — like the
retention window above — is a Neon console setting, not a value this runbook
hardcodes. Confirm the current snapshot schedule and the concrete list of
available restore points in the Neon console (project → Backups / snapshot
schedule, alongside the history/restore settings) before assuming any
particular snapshot exists to restore from. Treat the console as the source of
truth for **both** the PITR window and the snapshot cadence, and re-verify
after any plan change.

## 3. Restore procedure

Follow these steps **in order**. Steps 1 and 2 are both non-negotiable, and
step 2 (capture) is only valid **after** step 1 (write freeze) is confirmed
active — a deletion that commits in the gap between "capture" and "restore"
is later than `T_restore` (so the restore resurrects it) and would be
invisible to the capture query, escaping replay entirely. Freezing writes
first closes that gap.

1. **Freeze writes — hold until replay (step 5) is complete.** Before
   capturing anything, stop the live database from accepting further writes,
   and keep it frozen through step 6 (only step 6 lifts it). Use whichever of
   these is available and least disruptive:
   - `ALTER ROLE <app_role> SET default_transaction_read_only = on;` on the
     Postgres role the API connects as — standard, reversible with
     `... SET default_transaction_read_only = off`.
   - `REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM
     <app_role>;` (reverse with the matching `GRANT`).
   - Take the API out of service entirely (scale the Worker deployment to
     zero / maintenance page) if a DB-level freeze isn't practical.

   Whichever mechanism is used, **verify it actually blocks writes** (attempt
   a harmless write and confirm it is rejected) before moving to step 2 — an
   unverified freeze is not a freeze.
2. **Capture the deletion-replay set from the live (frozen) database.** With
   writes frozen, query the current, un-restored primary branch for every
   `deletion_audit` row (the durable per-person deletion record — see
   `MMT-ADR-0011`, canon §4.9, and the deletion mechanics documented in
   `docs/runbooks/deletion-irreversible-boundary.md`, `WI-2058`) with a write
   time later than the timestamp you intend to restore to (`T_restore`). For
   each row, also resolve its **organization** and **deletion granularity**
   (see the schema note below for why this join is safe and sufficient):
   - Join to `financial_record` on `person_id` to read `organization_id` —
     every `deletion_audit` row has a matching `financial_record` row written
     in the same transaction.
   - For each distinct `organization_id` found, check whether the
     `organization` row still exists in this same live (frozen) database.
     **Absent** = this deletion was part of a **whole-org erasure**
     (`executeDeletionV2` deletes the `organization` row itself, in the same
     transaction, as one of its last steps — a person-scoped delete never
     touches `organization`). **Present** = a **person-scoped** delete.
   - Group every `person_id` that shares an absent `organization_id` — they
     are victims of the same whole-org erasure event and must be replayed
     together (§5), not as independent person deletes.

   Record, per row: `person_id`, `retained_at`, `reason`, `organization_id`,
   `granularity` (`person` | `org`). This list is the **replay set** — see
   §5. If you skip the freeze, skip this step, or run it before the freeze is
   confirmed active, the rewound-window deletion records are not guaranteed
   complete and cannot be reconstructed after the fact.
3. **Choose the restore point** (`T_restore`) — the latest timestamp/LSN
   that predates the `person_id` mistake.
4. **Restore.** Use the Neon console's restore/branch-history control to
   restore to `T_restore` — either an in-place restore of the working branch
   or a new branch created at that point that is then promoted/swapped in.
   Validate the restored data addresses the original mistake before treating
   the restore as final. Writes stay frozen (step 1) through this step.
5. **Run the mandatory deletion-replay step** (§5) against the restored
   database using the replay set captured in step 2.
6. **Lift the write freeze** — only after step 5's replay is confirmed
   complete and verified. Reverse whichever mechanism step 1 used.
7. **Reconcile external systems** (§4) — restoring Neon does not touch Clerk
   or RevenueCat state.
8. **Run the verification drill** (§6) before declaring the recovery
   complete.

**Schema note (verified against `packages/database/src/schema/identity.ts`
and `apps/api/src/services/identity-v2/deletion-v2.ts`).** `deletion_audit`
itself carries only `person_id`, nullable `deleted_by`, `reason`, and
`retained_at` — no `organization_id` and no granularity flag, so it cannot
answer "which org, and was this a whole-org erasure?" on its own. This
runbook does **not** ask `WI-2058` to add columns for that: every
`deletion_audit` row is written in the same transaction as a
`financial_record` row for the same person
(`writeFinancialRecordsForPersonTx` / `writeFinancialRecordsTx` in
`deletion-v2.ts`), and `financial_record` already carries `organization_id`
and outlives both `person` and `organization` (no FK to either). Combined
with a live check of whether the `organization` row itself survived, that is
sufficient to recover both the org and the granularity from data that
already exists today — no schema change or `WI-2058` dependency needed for
this. If a future schema change ever removes the `financial_record` ↔
`organization_id` join path, this capture step breaks silently; flag that as
a `WI-2058` compatibility dependency if it comes up.

## 4. What a restore does — and does not — recover

A Neon PITR/snapshot restore affects **only the Neon Postgres database**. It
does not reach, and cannot roll back, any external system:

| System | Recovered by a Neon restore? | Notes |
|---|---|---|
| Neon Postgres (all in-DB tables: `person`, `login`, `membership`, `consent_grant`, `person_retain` set, etc.) | **Yes** | This is what PITR restores. |
| **Clerk** (login identity, credentials, OAuth links) | **No** | Clerk is a separate system of record. A restore does not undo a Clerk-side change (e.g. a `deleteClerkUser` call already made) and does not recreate a Clerk user deleted after `T_restore`. Reconcile manually — compare `login.clerk_user_id` rows in the restored DB against current Clerk state. |
| **RevenueCat / Stripe** (subscriptions, entitlements) | **No** | Same reasoning — store state is authoritative on the store side. A restore that resurrects a `subscription` row does not resurrect a cancelled RevenueCat/Stripe subscription, and vice versa. Reconcile via the store's own dashboard/API before trusting restored billing state. |

Because of this, a `person_id`-mistake restore is a **Neon-only rollback**;
always reconcile Clerk and RevenueCat/Stripe state as a follow-up step (§3
step 7) rather than assuming the restore made the account state consistent
end-to-end.

## 5. Mandatory post-restore deletion-replay step

**Deletion always wins.** A PITR restore to `T_restore` necessarily brings
back the database as it existed at that moment — including any `person` (and,
for a whole-org erasure, `organization`) row whose deletion happened *after*
`T_restore` (i.e. is recorded in the replay set from §3 step 2). Left alone,
the restore would **resurrect** them, which is never acceptable — it violates
the deletion-supremacy invariant stated in the canon amendment
(`docs/canon/identity/data-model.md` §8).

This step is **mandatory, not optional**, and runs immediately after the
restore (§3 step 5), before the write freeze is lifted (§3 step 6):

1. For every entry in the replay set captured in §3 step 2, confirm the
   corresponding `person` (and, for `granularity = 'org'`, `organization`)
   row is present again in the restored database — it will be, by
   construction, since the restore predates the original deletion.
2. **Person-scoped entries** (`granularity = 'person'`): re-run the deletion
   via `deletePersonV2`, using the recorded `reason`
   (`user_initiated`/`guardian_initiated`/`abandonment`). This is
   **re-applying an existing, already-decided deletion** — not a new
   deletion decision, no fresh consent/guardian check is needed, because the
   deletion already happened and was already recorded.
3. **Org-wide entries** (`granularity = 'org'`): replay the *whole* erasure
   for that `organization_id` — re-deleting only the individual persons and
   leaving the resurrected `organization`/`subscription` row(s) behind is not
   a complete replay. `executeDeletionV2` requires an **active deletion
   schedule** (`organization.deletionScheduledAt IS NOT NULL` and not
   cancelled); after a restore, the resurrected `organization` row will not
   have a schedule that satisfies this (or will have a stale one), so calling
   `executeDeletionV2` directly will silently no-op (`'cancelled'` or
   `'already_deleted'`) instead of erasing anything — this is exactly the gap
   a reviewer flagged on this runbook. Re-establish the precondition first:
   1. Call `scheduleDeletionV2(db, organizationId)` to stamp a fresh
      `deletionScheduledAt`.
   2. Call `executeDeletionV2` immediately after — do **not** wait out a
      fresh grace period. The 7-day grace period is enforced by the Inngest
      workflow's `step.sleep`, not by `executeDeletionV2` itself, so calling
      it directly right after scheduling is the correct, already-shipped
      code path for an immediate re-erasure.
   3. Read `ownerEmail`, `reason`, and `deletedBy` fresh from the restored
      database (the resurrected `login`/`organization` rows and the captured
      replay-set entry) rather than assuming they were captured pre-restore.
4. Confirm each replayed entry is gone again: `person` row(s) absent,
   `deletion_audit` row present with a `retained_at` at-or-after the replay;
   for `granularity = 'org'` entries, also confirm the `organization` row is
   gone again (not just its persons).

This step consumes the deletion mechanics documented for `WI-2058`
(`docs/runbooks/deletion-irreversible-boundary.md`) and the schema in
`docs/canon/identity/data-model.md` §4.9 — it does not define new deletion
primitives; `deletePersonV2`, `scheduleDeletionV2`, and `executeDeletionV2`
are the existing, already-shipped functions this step calls.

## 6. Verification drill

Prove the deletion-supremacy invariant holds through a real restore+replay
cycle, using **three** named cases — the trivial case is not enough on its
own, because a broken replay step (or a broken granularity/org resolution)
would still pass a drill that only checks it:

**Case A — deleted before the restore point (the AC's named case).**
Create a test user *Alice*. Delete Alice (person-scoped, `user_initiated`).
Wait past `T_restore`, then run a restore+replay drill for an unrelated,
simulated `person_id` mistake. After restore + replay: confirm **Alice is
still deleted** (no `person` row, `deletion_audit` row unchanged). This is
expected to hold even without the replay step — the restored snapshot at
`T_restore` already reflects Alice as deleted, since her deletion is at or
before `T_restore`.

**Case B — deleted inside the rewound window (the case that actually
exercises replay).** Create a second test user *Bob*. Note `T_restore`.
After noting `T_restore`, delete Bob. Then run the same restore-to-`T_restore`
+ replay drill. The restore alone would resurrect Bob (his deletion happened
after `T_restore`); confirm the replay step (§5) catches Bob via the replay
set captured in §3 step 2 and re-deletes him — **Bob must not be present
after restore + replay completes.**

**Case C — whole-org erasure inside the rewound window (proves the
granularity fix).** Create a third test org, *Org-Carol*, with two test
persons in it. Note `T_restore`. After noting it, run a whole-org erasure on
Org-Carol (`scheduleDeletionV2` + `executeDeletionV2`, or the normal
delete-account flow). Then run the same restore-to-`T_restore` + replay
drill. Confirm: (a) the capture step (§3 step 2) correctly tags both
Org-Carol persons as `granularity = 'org'` sharing one `organization_id`
(resolved via the `financial_record` join, §3 step 2's schema note); (b)
after replay, the `organization` row for Org-Carol is gone again — not just
its two person rows — proving the replay didn't silently no-op
(`executeDeletionV2`'s schedule precondition) or leave a resurrected
org/subscription behind.

Also confirm, for every case, that the write freeze (§3 step 1) was verified
active before capture and was not lifted until after replay completed — a
freeze that silently failed to hold would reopen the exact race the freeze
exists to close, even if all three named cases otherwise pass.

The drill passes only when Alice, Bob, and Org-Carol (both persons *and* the
org row) remain deleted after the full restore + replay cycle. Record the
drill's run date, the test IDs used, and pass/fail for all three cases
wherever this repo tracks verification evidence for runbooks.

## 7. Related work

- `WI-2057` — person merge/reparent/alias forward-repair primitives
  (Backlog). Once shipped, these may reduce how often this runbook's full
  restore path is needed for narrower `person_id` mistakes; they do not
  change §5's deletion-replay obligation.
- `WI-2058` — deletion irreversible-boundary runbook
  (`docs/runbooks/deletion-irreversible-boundary.md`) — source of the
  deletion-record semantics (`deletion_audit`) this runbook consumes.
- `WI-2390` — deletion recovery (out of scope here; do not conflate with
  `person_id`-mistake recovery).
