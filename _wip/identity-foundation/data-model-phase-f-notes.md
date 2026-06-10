# Data model — Phase-F build notes (migration sequencing + vs-legacy diffs + handoff)

**What this is.** Forward-looking **Phase-F build input** extracted from `data-model.md` during the J0
canon scrub: the migration sequencing against the legacy state, the per-table "vs-legacy" diffs, and
the Phase-F / counsel handoff. This is the precursor to the eventual Phase-F **migration runbook** — it
is **not canon** and **not decision-history**; it is the build aide for executing the clean cut. Live
open threads are tracked in `ROADMAP.md`; this file holds the mechanics.

> Terminology: target-schema names use the live rename (`supportership` table; `supporter`/`supportee`);
> legacy names (`family_links`, the `mentor` role value) are kept where they literally name old code.
> `file:line` cites are pre-cut and will rot — verify against HEAD before relying on them.

---

## Per-table vs-legacy diffs (moved out of canon §4)

- **`person`** — `profiles` is renamed to `person`; `birth_year` (integer) → `birth_date` (date);
  `is_owner` dropped (derived from admin-role + payer-self-reference); `clerk_user_id` becomes a 1:1
  mirror of `login.clerk_user_id`; nullable `login_id` FK added (realises Person ≠ Login).
- **`login`** — no table before; `accounts` carried the Clerk binding as columns. Splitting makes the
  binding explicit and keeps a future "one Person, two logins" add cheap.
- **`organization`** — `accounts` (container role) → `organization`; the inert `organizations` table is
  dropped by the reset; deletion-timestamp columns carry forward.
- **`membership`** — no analogue in the active schema; the inert `memberships` table (with the
  `owner/mentor/student` enum) is dropped; the non-empty `cardinality(roles) >= 1` CHECK carries forward.
- **`subscription`** — `subscriptions.account_id` FK → `organization_id`; `payer_person_id` added as the
  access-inert snapshot.
- **`guardianship`** — `family_links` (parent→child) renamed + re-purposed; consent record lives on this
  edge; operational powers do *not*.
- **`supportership`** — the legacy `mentor` role value dissolves into this edge.
- **`consent_grant`** — `consent_states` (stamped status) → an append-only event log; the
  `UNIQUE(profileId, consentType)` constraint that blocked cross-org consent is gone; the new key is
  `(charge × purpose × organization)` and history is preserved.
- **`person_retain` set** — currently no retain-tier exists; the columns that would have been it
  (`accounts.deletion_scheduled_at` etc.) are operational deletion-coordination, not the legal
  retain-tier.

---

## Migration sequencing against the legacy state (the inert-table revert)

Although the squash makes this theoretical, the planned order against the legacy state is:

1. Drop `family_links` rows (their data migrates conceptually into `guardianship`).
2. Drop the inert `organizations` + `memberships` tables.
3. Drop the `consent_states` table.
4. Drop the `accounts` table (replaced by `organization` + `login`).
5. Rename `profiles` → `person`; add new columns; drop `is_owner`, `birth_year` (→ `birth_date`); add
   `login_id` FK.
6. Re-anchor `subscriptions.account_id` → `subscriptions.organization_id` (values are 1:1 because the
   inert-table reuse made `account.id = organization.id` for existing rows).
7. Create `guardianship`, `supportership`, `consent_grant`, the `person_retain` set, and the `login`
   table.
8. Add the new indexes.

In the squash, all of the above happens in one baseline migration. Listed here so a future reader who
needs to re-derive it can.

---

## Handoff to Phase F (the build)

- The `drizzle-kit` baseline migration that creates the eight tables + the `person_retain` set in one
  statement (`MMT-ADR-0012` is the cut; `MMT-ADR-0011` is the *what*).
- The RLS rollout: `person_id` scope for learning data; `organization_id` scope for
  membership/subscription; the `person_retain` role-gated read carve-out.
- The `isOwner`→`admin-role` rekey sweep across the app. Every `assertOwnerProfile` / `isOwner` gate
  becomes an `admin`-role check. A build-time sweep, not a schema change.
- The `login` table's per-person binding — populate from the existing `profiles.clerk_user_id` during
  the baseline (1:1 in v1; the unique constraint prevents drift).
- The inert-table revert execution: in the squash, this is the migration's drop list.

## To counsel (the legal-review register — live in ROADMAP)

- Which Person is recorded as `payer_person_id` under Family Sharing / Ask-to-Buy (column in place;
  value is a counsel call).
- Retention *values*: the `retention_period` column on `consent_receipt`, `deletion_audit`,
  `financial_record` is a seam; counsel fills the periods.
- Dormancy period + pre-deletion notice length.
- Moved-country grace window length.
- Boundary-crossing verification method (ties to the VPC vendor pick).
- The co-guardian one-of/all-of rule.

## To the architect (open canon calls, not blocking)

- The "11" age-floor final product call (tracked roadmap thread, gated on the store-rating /
  directed-to-children posture).
- VPC vendor pick (technical reviewer, after legal requirements are clear).
- *(The `inv 17` rephrase — store-delegation covers payment mechanics only — has since closed; the
  rephrased text is graduated as inv 17.)*
