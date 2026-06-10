# Migration history

This directory contains Drizzle ORM migration SQL files and their associated metadata.

## Baseline

**Date:** 2026-06-10  
**ADR:** [`docs/adr/MMT-ADR-0012-one-time-baseline-reset.md`](../docs/adr/MMT-ADR-0012-one-time-baseline-reset.md)  
**Migration:** `0108_identity_foundation_baseline.sql`

Migration `0108` is the **one-time documented baseline reset** for the Identity Foundation
rewrite (`WI-569` / `WP-W0-baseline`). It creates the 8-table identity/tenancy/consent schema
from empty, including the pre-baseline amendment tables from `MMT-ADR-0013/0014/0015`.

**Pre-baseline chain (0000–0105):** applied and live. The effective history.

**Reference-only entries (0106–0107):** committed for archaeology; never applied to any
environment; removed from the effective chain (not in `_journal.json`).
- `0106_identity_t1_org_membership.sql` — stage T1 of the abandoned 6-stage identity plan
  (empty `organizations`/`memberships`). Reset-incompatible.
- `0107_gorgeous_cardiac.sql` — concept-capture tables with FKs to `profiles` (renamed to
  `person` by the baseline). Reset-incompatible.

**From 0108 forward, append-only migrations are absolute.** This baseline is the only
exception, ever. See `MMT-ADR-0012` for the rationale.
