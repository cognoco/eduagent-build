# Migration history

This directory contains Drizzle ORM migration SQL files and their associated metadata.

## Baseline

**Date:** 2026-06-10  
**ADR:** [`docs/adr/MMT-ADR-0012-one-time-baseline-reset.md`](../../../docs/adr/MMT-ADR-0012-one-time-baseline-reset.md)  
**Migration:** `0108_identity_foundation_baseline.sql`

Migration `0108` is the **one-time documented baseline reset** for the Identity Foundation
rewrite (`WI-569` / `WP-W0-baseline`). It creates the 8-table identity/tenancy/consent schema
from empty, including the pre-baseline amendment tables from `MMT-ADR-0013/0014/0015`.

**Pre-baseline chain (0000–0105):** applied and live. The effective history.

**Reference-only entries (0106–0107):** committed for archaeology; removed from the
effective chain (not in `_journal.json`).
- `0106_identity_t1_org_membership.sql` — stage T1 of the abandoned 6-stage identity plan
  (empty `organizations`/`memberships`). Reset-incompatible.
- `0107_gorgeous_cardiac.sql` — concept-capture tables with FKs to `profiles` (renamed to
  `person` by the baseline). Reset-incompatible.

**From 0108 forward, append-only migrations are absolute.** This baseline is the only
exception, ever. See `MMT-ADR-0012` for the rationale.

## Reset execution record (2026-06-10, WI-569)

Factual erratum to the planning premise "0106/0107 never applied to any environment",
discovered in the pre-reset audit and corrected during the reset:

- **`0106` WAS applied to staging** (drizzle journal row id=107). Its artifacts
  (`organizations` 49 rows / `memberships` 28 rows — backfill/spillover-test data, no
  user data) were dropped via `DROP TABLE ... CASCADE` during the reset.
- **Staging journal row id=108 was an orphaned early-0107** — `0107_sturdy_monster_badoon`
  (nudge-direction migration, later renumbered out of the chain; feature since removed).
  Its artifacts (`nudges.direction` column, `nudge_direction` enum) were dropped. The two
  stale journal rows (id=107, id=108) were deliberately left in place — Drizzle's migrator
  cuts off on `when`, so they are inert.
- **Hygiene drops performed on staging** (dev reached the same end-state automatically via
  `db:push`): `profiles.clerk_user_id`, `subscriptions.organization_id`, `nudges.direction`,
  `nudge_direction` enum.
- **T2-era residuals dropped under extended shepherd approval** (same reset pass): the
  `organization_invitations` table (T2-era, verified 0 rows, not present in the staging
  journal — origin unaccounted) and the `membership_role` enum it depended on. Pre-drop
  verification confirmed `organization_invitations.invited_roles` was the sole reference to
  the enum, and that the baseline `membership.roles` is `text[]` + CHECK (not the enum).
- **Dev** is push-managed (its journal is stale at 0021 by design); the baseline tables were
  created there by applying `0108`'s SQL directly. Until the Drizzle schema definitions for
  the new tables land (`WI-570`), a `db:push:dev` will offer to drop them — answer NO, or
  re-apply the baseline SQL afterwards.
