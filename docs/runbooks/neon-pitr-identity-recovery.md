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

## 3. Restore procedure

Follow these steps **in order**. Step 1 is non-negotiable and must happen
**before** any restore action — the records it captures live in the
production branch you are about to roll back, and once the restore is
initiated they are the state you're rolling back *from*, not *to*.

1. **Capture the deletion-replay set from the live (pre-restore) database.**
   Query the current, un-restored primary branch for every `deletion_audit`
   row (the durable per-person deletion record — see `MMT-ADR-0011`, canon
   §4.9, and the deletion mechanics documented in
   `docs/runbooks/deletion-irreversible-boundary.md`, `WI-2058`) with a
   write time later than the timestamp you intend to restore to
   (`T_restore`). Record each row's `person_id`, `retained_at`, and `reason`.
   This list is the **replay set** — see §5. If you skip this step, or run
   it after the restore, the rewound-window deletion records are gone and
   cannot be reconstructed.
2. **Choose the restore point** (`T_restore`) — the latest timestamp/LSN
   that predates the `person_id` mistake.
3. **Restore.** Use the Neon console's restore/branch-history control to
   restore to `T_restore` — either an in-place restore of the working branch
   or a new branch created at that point that is then promoted/swapped in.
   Validate the restored data addresses the original mistake before treating
   the restore as final.
4. **Run the mandatory deletion-replay step** (§5) against the restored
   database using the replay set captured in Step 1.
5. **Reconcile external systems** (§4) — restoring Neon does not touch Clerk
   or RevenueCat state.
6. **Run the verification drill** (§6) before declaring the recovery
   complete.

## 4. What a restore does — and does not — recover

A Neon PITR/snapshot restore affects **only the Neon Postgres database**. It
does not reach, and cannot roll back, any external system:

| System | Recovered by a Neon restore? | Notes |
|---|---|---|
| Neon Postgres (all in-DB tables: `person`, `login`, `membership`, `consent_grant`, `person_retain` set, etc.) | **Yes** | This is what PITR restores. |
| **Clerk** (login identity, credentials, OAuth links) | **No** | Clerk is a separate system of record. A restore does not undo a Clerk-side change (e.g. a `deleteClerkUser` call already made) and does not recreate a Clerk user deleted after `T_restore`. Reconcile manually — compare `login.clerk_user_id` rows in the restored DB against current Clerk state. |
| **RevenueCat / Stripe** (subscriptions, entitlements) | **No** | Same reasoning — store state is authoritative on the store side. A restore that resurrects a `subscription` row does not resurrect a cancelled RevenueCat/Stripe subscription, and vice versa. Reconcile via the store's own dashboard/API before trusting restored billing state. |

Because of this, a `person_id`-mistake restore is a **Neon-only rollback**;
always reconcile Clerk and RevenueCat/Stripe state as a follow-up step (§3.5)
rather than assuming the restore made the account state consistent
end-to-end.

## 5. Mandatory post-restore deletion-replay step

**Deletion always wins.** A PITR restore to `T_restore` necessarily brings
back the database as it existed at that moment — including any `person` row
whose deletion happened *after* `T_restore` (i.e. is recorded in the replay
set from §3 Step 1). Left alone, the restore would **resurrect** that
person, which is never acceptable — it violates the deletion-supremacy
invariant stated in the canon amendment (`docs/canon/identity/data-model.md`
§8).

This step is **mandatory, not optional**, and runs immediately after the
restore, before any other post-restore work:

1. For every `person_id` in the replay set captured in §3 Step 1, confirm
   the person row is present again in the restored database (it will be, by
   construction — that's why it's in the replay set).
2. Re-run the deletion for each: use the same deletion service path
   `deletion_audit.reason` indicates the original deletion took
   (`deletePersonV2` for a person-scoped delete —
   `user_initiated`/`guardian_initiated`/`abandonment`; `executeDeletionV2`
   if the original deletion was a whole-org erasure). This is **re-applying
   an existing, already-decided deletion** — not a new deletion decision, no
   fresh consent/guardian check is needed, because the deletion already
   happened and was already recorded.
3. Confirm each replayed person is gone again (`person` row absent,
   `deletion_audit` row present with a `retained_at` at-or-after the
   replay), before moving to §6.

This step consumes the deletion-record semantics documented for `WI-2058`
(`docs/runbooks/deletion-irreversible-boundary.md`) and the `person_retain`
schema in `docs/canon/identity/data-model.md` §4.9 — it does not define new
deletion mechanics of its own.

## 6. Verification drill

Prove the deletion-supremacy invariant holds through a real restore+replay
cycle, using **two** named cases — the trivial case is not enough on its own,
because a broken replay step would still pass a drill that only checks it:

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
set captured in §3 Step 1 and re-deletes him — **Bob must not be present
after restore + replay completes.**

The drill passes only when both Alice and Bob remain deleted after the full
restore + replay cycle. Record the drill's run date, the test `person_id`s
used, and pass/fail for both cases wherever this repo tracks verification
evidence for runbooks.

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
