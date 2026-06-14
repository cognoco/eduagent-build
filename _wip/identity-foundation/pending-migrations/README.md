# Pending cutover migrations — INERT DRAFTS (WI-586)

These are the two WI-586 convergence migrations, **authored ahead of the freeze as
reviewable drafts**. They live here under `_wip/` **on purpose**:

> **They are NOT in `apps/api/drizzle/`, so `drizzle-kit migrate` never sees them
> and they CANNOT auto-apply on any deploy.** Nothing destructive can run from
> this directory. They are promoted into the migration folder only at the freeze.

| File | Role | Runbook step | Reversibility |
|---|---|---|---|
| `m-repoint.sql` | Re-point every live FK off the legacy tables onto `person` / `subscription` (catalog-driven DO-block) | §4 **step 6** — inside freeze, **before** flip | Clean reverse re-point while frozen; PITR-only post-flip |
| `m-drop.sql` | Drop the 5 legacy tables + 5 orphaned enums | §4 **step 8** — after flip + 24h soak | **Impossible** except Neon PITR to the marker |
| `m-repoint.preview-2026-06-14.sql` | Human-review snapshot of the 58 ALTERs the DO-block emits today | — (review aid) | n/a |

Authoritative design: `../2026-06-11-cutover-plan.md` §2.7 (catalog-authoritative FK
re-point), §4 (the 9-step runbook + 3 STOP gates), §4.2 (rollback truth table).
Readiness verdict: `../wi586-readiness-2026-06-14.md`.

## Why catalog-driven, not a frozen list

`m-repoint.sql` computes its re-point set from the **live `pg_constraint` catalog
at run time** — mapping `profiles → person`, `subscriptions → subscription`, with
the drop-list children excluded. The static count drifts (plan said 56–57; the
staging catalog on 2026-06-14 yields **58**: 54 → person, 4 → subscription), which
is exactly why the plan bans a hard-coded list. The DO-block carries a **fail-loud
completeness assertion**: if any live table grows an unmapped `accounts`-target FK,
it aborts so the mapping is re-derived before running. It is **idempotent** — after
a successful run the catalog query matches nothing, so the rehearsal-then-freeze
double execution is safe.

## Promotion procedure (at the freeze — operator-driven)

1. **Do not promote early.** These apply only at §4 steps 6 and 8, each behind its
   STOP gate. The flip (`IDENTITY_V2_ENABLED=true`, step 7) sits between them and is
   the operator's call.
2. At step 6: copy `m-repoint.sql` to `apps/api/drizzle/<next>_m_repoint.sql` (next
   free number; today that would be `0117`), regenerate the preview against the
   **frozen** catalog, review the delta vs this snapshot, then apply via the normal
   `drizzle-kit migrate` path. Re-run `_journal.json` regeneration as drizzle expects.
3. At step 8 (after the flip has soaked 24h, new model verified live): copy
   `m-drop.sql` to `apps/api/drizzle/<next>_m_drop.sql`, confirm the Neon PITR marker
   from step 2 exists, then apply.
4. Both promotions are reviewable PRs. Neither is created here — PR creation is a
   separate, explicit act (repo PR policy).

## What still needs the operator (cannot be delegated)

The flip, the Neon PITR marker, the go-decisions at the 3 STOP gates (especially the
irreversible one before `m-drop`), and the prod deploy approval. Authoring (these
files) is autonomous; applying is not.
