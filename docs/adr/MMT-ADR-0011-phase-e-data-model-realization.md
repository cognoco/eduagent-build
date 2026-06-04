# MMT-ADR-0011 — Phase-E identity data-model realization

**Status:** Accepted · 2026-06-04 · **Scope:** the physical schema for the identity foundation —
the eight tables (and their per-class retain-tier set) that the Phase-E baseline migration
creates. · **Deciders:** Architect (jjoerg) + Claude · **Realizes:** the 8 Phase-E decisions
(D1–D8, 2026-06-04); `domain-model.md` v1.1 (RATIFIED); the counsel walkthrough of 2026-06-03
(`I-C1` / `I-C2` / `I-C4`, `I-PB-B2a` / `I-PB-B2b` / `I-PB-B3b`, `I-A2`, `I-D1`, `I-E3`). ·
**Builds on:** `MMT-ADR-0001`, `0007`, `0008`, `0009`, `0010`; companion to `MMT-ADR-0012`
(the one-time cut).

> **Placement.** Global L2 from birth; lockstep canon partner is
> `_wip/identity-foundation/data-model.md` (the Phase-E deliverable).

## Context

- **All 8 Phase-E decisions ruled (D1–D8, 2026-06-04).** The full lockstep grid is in `data-model.md` §8.
- **`domain-model.md` v1.1 (RATIFIED) carries the logical model; this ADR and its lockstep doc carry the physical realization.** The two are not redundant — one is the *what* (the entities, edges, invariants), the other is the *how* (tables, columns, FKs, indexes, retain-tier).
- **Counsel walkthrough (`725e84694`, 2026-06-03) closed five structural findings the schema must satisfy by design:** `I-C1` (consent receipt must survive deletion — a *live* defect today), `I-C4` (consent must refresh at age transitions — also *live* today), `I-PB-B2b` (the direction-aware birth gate must retain the prior value + audit fact before relaxing protection), `I-D1` (consent must be org-scoped, not globally stamped), and `I-E3` (moved-country grace window must be enforceable).
- **The legacy state cannot be evolved safely.** The current `consent_states` UNIQUE shape is the `I-D1` blocker; migration `0106` (`T1`) is the inert scaffolding; carrying either forward is the half-migration anti-pattern. The target is a fresh create-from-empty on the documented baseline (`MMT-ADR-0012`).
- **Pre-launch, zero production data** — schema fidelity is the only cost; the only available product posture is "as designed, not as evolved."

## Decision

The Phase-E baseline creates **eight tables** (six active + two edge + the `consent_grant` event log) and a **`person_retain` per-class retain-tier set** (the structural fix for `I-C1`).

### 1. Topology — `person` / `organization` / `membership` / `subscription`

**`person`** *(D2, D6b, D6c, D7b)*

- `id` `uuid PK` (v7).
- `display_name` `text NOT NULL`.
- `birth_date` `date NOT NULL` *(D6b — supersedes the year-only `profiles.birth_year`; the existing `birthMonth`/`birthDay` in the signup schema become the storage shape, not an unpersisted intermediate).*
- `residence_jurisdiction` `text NOT NULL` *(D6c — country ISO 3166-1 alpha-2, not the `EU/US/OTHER` coarse enum).*
- `login_id` `uuid NULL` *(D2 — nullable FK to `login`; null = managed child, set = credentialed). See `login` below.*
- `clerk_user_id` `text UNIQUE NULL` *(per-person, mirroring the existing in-code `profiles.clerk_user_id`; null = managed, set = credentialed; one Clerk user aggregates email + OAuth providers per Clerk's model).*
- `last_activity_at` `timestamptz NULL` *(D7b — denormalized; the dormancy check reads this index, not a session aggregate).*
- `is_premium_llm` `bool NOT NULL DEFAULT false`, `default_app_context` `text NULL` (existing fields).
- `created_at` / `updated_at` / `archived_at` (existing semantics; see §3 below for the archive-vs-retain distinction).

**`login`** *(D2 — realized as a table because Clerk is the *store* of credentials, not the *shape* of our model; we keep the per-person binding explicit so a "one Person, two logins" addition is additive, not a re-shape.)*

- `id` `uuid PK`.
- `person_id` `uuid NOT NULL → person.id ON DELETE CASCADE` *(1:1 in v1; nullable-by-design on `person.login_id`).*
- `clerk_user_id` `text UNIQUE NOT NULL` *(1:1 with the `person.clerk_user_id` for now; the unique constraint prevents drift; a future "multi-login" feature lifts the constraint and the unique-to-`person` coupling, additively).*
- `email` `text UNIQUE NOT NULL`, `timezone` `text NULL`.
- `created_at` / `updated_at`, `deletion_scheduled_at` / `deletion_cancelled_at` (the latter pair carried forward from `accounts`).

**`organization`** *(D3 — thin container)*

- `id` `uuid PK`.
- `name` `text NOT NULL`, `timezone` `text NULL`.
- `created_at` / `updated_at`, `deletion_scheduled_at` / `deletion_cancelled_at`.
- A solo adult = an org-of-one; a family = one home org (per `ADR-0010`).

**`membership`** *(D4 — roles dissolved into `{admin, learner}`)*

- `id` `uuid PK`.
- `person_id` `uuid NOT NULL → person.id ON DELETE CASCADE`.
- `organization_id` `uuid NOT NULL → organization.id ON DELETE CASCADE`.
- `roles` `membership_role[] NOT NULL` *(values `admin | learner`; non-empty CHECK preserves the `cardinality() >= 1` pattern; `is_owner` and the `owner/mentor/student` enum from `T1` are dropped).*
- `created_at` / `updated_at`.
- `UNIQUE (person_id, organization_id)`; `INDEX (organization_id)`.

**`subscription`** *(D3 — billing anchor moves from account to org)*

- `id` `uuid PK`.
- `organization_id` `uuid NOT NULL → organization.id ON DELETE CASCADE` *(replaces the `accounts.id` FK in the current `subscriptions` row).*
- `plan_tier` `text NOT NULL` *(lookup into plan catalog; quota is derived from the plan, not stored).*
- `status` `text NOT NULL` *(active / past_due / canceled — the store is the source of truth per `MMT-ADR-0002`; this is a cached read).*
- `payer_person_id` `uuid NULL → person.id` *(D3 — access-inert snapshot, the local stored attribution; the E3 question "which Person under Family Sharing" populates this column later, not as a schema change).*
- `store_customer_ref` `text NULL` *(RevenueCat / store customer id; the link to the store; never authoritative on its own).*
- `started_at` / `period_end` / `created_at` / `updated_at`.

### 2. Edges — `guardianship` / `mentorship`

**`guardianship`** *(D5, ADR-0008 — global edge, derived operation)*

- `id` `uuid PK`.
- `guardian_person_id` `uuid NOT NULL → person.id ON DELETE CASCADE`.
- `ward_person_id` `uuid NOT NULL → person.id ON DELETE CASCADE`.
- `residence_jurisdiction` `text NOT NULL` *(the jurisdiction at the time the edge was created; per `I-PB-B2a`, the consent record snapshots its jurisdictional context).*
- `granted_at` `timestamptz NOT NULL`, `revoked_at` `timestamptz NULL`.
- `CHECK (guardian_person_id <> ward_person_id)` *(the F1-BT-a no-self-guardian guard; one of the invariants the schema makes structural).*
- `UNIQUE (guardian_person_id, ward_person_id)` *where `revoked_at IS NULL`* *(a partial unique; re-granting after revoke is allowed only via a new row, preserving the append-only history of guardian links).*
- Operate / manage / view powers are *not* columns on this edge. Per `ADR-0008` they are derived at query time: `guardian-link ∧ shared-org-membership ∧ charge-has-no-Login` — a single named resolver function in services (the successor to the buggy `getFamilyOwnerProfileId`).

**`mentorship`** *(D5, `inv 19` — opt-in grant, never auto-conferred)*

- `id` `uuid PK`.
- `mentor_person_id` `uuid NOT NULL → person.id ON DELETE CASCADE`.
- `mentee_person_id` `uuid NOT NULL → person.id ON DELETE CASCADE`.
- `granted_at` `timestamptz NOT NULL`, `revoked_at` `timestamptz NULL`.
- `CHECK (mentor_person_id <> mentee_person_id)`, `UNIQUE (mentor, mentee) where revoked_at IS NULL`.
- `family_links` (the current `parent_profile_id → child_profile_id` table) migrates into `guardianship`; `mentor` as a role value is dissolved (mentorship is now an edge, not a role).

### 3. Consent — `consent_grant` (append-only event log)

*(D6 — computed requirement, stored record.)*

- `id` `uuid PK`.
- `ward_person_id` `uuid NOT NULL → person.id ON DELETE RESTRICT` *(the RESTRICT is load-bearing: a person with active consent records cannot be hard-deleted without first re-homing those records to the `consent_receipt` retain-tier — see §5).*
- `organization_id` `uuid NOT NULL → organization.id ON DELETE RESTRICT` *(D6e slimmed: kept and enforced; in v1 it's always the home org; pre-wires `I-D1` for future cross-org consent).*
- `purpose` `text NOT NULL` *(purpose taxonomy, the LLM-disclosure purpose is one of them per `I-PB-B2a` — the consent gate fires on the LLM-disclosure trigger, not the payment trigger).*
- `lawful_basis` `text NOT NULL` *(D6d, `I-A2` — `vpc` / `art8_2` / `art6_1_a` / `contract`; per-purpose, never bundled into ToS).*
- `assurance_token` `text NULL` *(D6d — tokenised pass/fail only; the *method* of the VPC check, no IDs/artifacts, per `I-PB-B2a` and `Art 5(1)(c)` minimisation).*
- `assurance_method` `text NULL` *(e.g. `payment_card` / `gov_id` / `vendor_attested` — which method the vendor ran; the token is the result, the method is the process, no artifact).*
- `granted_at` `timestamptz NOT NULL`, `withdrawn_at` `timestamptz NULL`.
- `snapshot_age_at_grant` `integer NOT NULL` *(the age at grant; the request was computed against this; an auditor can verify the requirement was correct at the time).*
- `snapshot_jurisdiction_at_grant` `text NOT NULL` *(country code at grant; survives a later residence move, so the consent record is self-contained and defensible).*
- `prior_value` `text NULL`, `audit_fact` `text NULL` *(the `I-PB-B2b` capture — when a protection-lowering birth-year change is requested, the prior value + the audit fact are written here before the protection relaxes. Required for verification-gated transitions; null for protection-adding or initial grants).*
- `INDEX (ward_person_id, purpose, organization_id)` *(the resolution hot path).*
- `controller_role` column **deliberately omitted** *(D6e slimmed — no dormant column, no half-migration; the D1-gated external-tutor feature adds it additively when it lands).*

The `resolveConsentRequirement(age × residence_jurisdiction × purpose)` function (the `AgeConsentDecision` seam) is the *read-time* computation that consults these rows. No stamped `consent_status` column exists, by design.

### 4. Scheduler physicals — the unified daily sweep

*(D7; ratified at `MMT-ADR-0009`.)*

- One daily Inngest cron (mirrors `apps/api/src/inngest/functions/daily-snapshot.ts`) fans out one event per `person` per day.
- Idempotency: the per-person fan-out event carries an Inngest-native `idempotency_key = "personId+day"` (D7c) — no dedicated dedup table.
- **Indexes** (D7a): `person(birth_date)`, `person(residence_jurisdiction)`, `person(last_activity_at)`. (Dormant accounts still age, so the sweep cannot be limited to recently-active.)
- **`last_activity_at` is denormalized** (D7b) — one indexed column per person, written on activity, read at sweep time. No `max(session.created_at)` aggregate at sweep time.
- **Consumers** (now broader than the original D7 grill): **(a) age-crossing** (the `I-PB-B2b` direction-aware gate fires here for the *up* direction and holds the more-protective state until it clears; the *down* direction is trust-instant per B2b); **(b) consent refresh at every age transition** (the `I-C4` fix — the sweep *owns* consent re-evaluation, not ad-hoc code); **(c) moved-country grace window maturation** (`I-E3` — suspend-to-browse-preview, with a grace period; the `residence_jurisdiction` change is the trigger and the residence-effective date is the maturation signal); **(d) dormancy notice + window** (`I-C3` — the inactivity-deletion notice + grace before any abandonment cleanup).

### 5. Retention seam — the `person_retain` per-class retain-tier set

*(D8 — the structural fix for `I-C1` and the home for `I-PB-B2b`'s prior-value + audit fact.)*

The deletion seam is **structural, not column-based.** Learning data and the `person` row drop on person-delete; records that legitimately outlive a person live in a small set of per-class tables, each with its own legal basis and retention period (counsel fills the values). This is the *only* way to close `I-C1` by structure: a `deleted_at` column would have left the receipt destruction intact (it *is* the current defect).

- **`consent_receipt`** — the durable record of every `consent_grant` (and its later withdrawal) for a person. Created from the active `consent_grant` row at deletion-time by the C1 forward-only ratchet. Carries: `ward_person_id`, `organization_id`, `purpose`, `lawful_basis`, `assurance_method` (no token — the token is purged at deletion since it was the *live* verification; the receipt is the *fact* that consent was given, not the means to re-verify), `granted_at`, `withdrawn_at`, `snapshot_age_at_grant`, `snapshot_jurisdiction_at_grant`, `prior_value`, `audit_fact`, `retained_at`, `retention_period` (from counsel). This is the only record that survives a person-delete; it makes `I-C1` an artifact of where records live, not a column.

- **`deletion_audit`** — the `I-PB-B2b` capture *generalised*; for every person-delete, write one row: `person_id`, `deleted_at`, `deleted_by`, `reason` (parent-initiated / abandonment / user-requested / etc.), `prior_value_birth_date`, `prior_value_residence_jurisdiction`, `prior_value_last_activity_at`, `audit_fact`. This is the audit trail that proves the deletion was authorized, the prior state was captured, and the move from active → retained is reconstructable.

- **`financial_record`** — the per-person references that tax/chargeback/regulatory retention requires (the `MMT-ADR-0002` "store is the merchant of record, we are the Art 28 processor" duty; some jurisdictions require the processor to retain transaction references for N years). Carries: `person_id`, `organization_id`, `subscription_id` (nullable), `transaction_ref` (RevenueCat / store id), `occurred_at`, `amount_cents`, `currency`, `retention_period`. Subscription row continues to live on `organization`; this is the *person-scoped* financial reference that must outlive a person-delete.

- **Read access** to `person_retain` is role-gated (a named service role, not a default RLS scope) — the audit-trail must not be torn open to per-member reads.

- **Retention periods** are the `retention_period` column on each retain-tier table — populated by counsel, not by this phase. The schema designs the seam; counsel fills the value.

### 6. Roles — `{admin, learner}` array

*(D4.)*

- The `membership_role` enum is restated as `{admin, learner}`. `student`→`learner`. `owner` is dissolved; the `is_owner` column is dropped.
- "Owner" is *derived*: the `admin` role (for management powers) + the `payer_person_id == self` self-reference (for the billing-attribution half). Every `isOwner`-gated screen in the app rekeys to an `admin`-role check.
- `mentor` and `guardian` are not roles. They are capacities on the `mentorship` and `guardianship` edges respectively.

## Consequences

- **The schema and the design doc are one artifact** (lockstep with `MMT-ADR-0012`'s clean baseline; reading `data-model.md` §1–§2 and the baseline migration tells the same story).
- **`I-C1` has a structural fix**, not a column-based one. The C1 forward-only ratchet (the CI guard named in the counsel handoff) installs against the new baseline and cannot regress to a `consent_states`-shape column because that table does not exist in the new world.
- **The unified daily sweep closes a live defect** (`I-C4` — consent was never refreshed at any age transition; the sweep is now the owner of consent re-evaluation).
- **`I-PB-B2b` is satisfied by structure**: the `prior_value` + `audit_fact` fields on `consent_grant` (and the `deletion_audit` row at delete) make the direction-aware gate auditable.
- **`I-D1` v1-stance is pre-wired**: `consent_grant` is org-scoped from birth (one home org in v1); the cross-org + controller-role feature is the gated addition, not a refactor.
- **Every `isOwner` gate in the app rekeys to an `admin`-role check.** Tracked in the Phase-F handoff as a build-time sweep, not a schema change.
- **`controller-role` is deferred entirely, not parked as a dormant column** — `D6e` slimmed. The clean baseline makes the later add a clean forward migration; a dormant column would have been the half-migration anti-pattern.
- **Dormant accounts still age.** The sweep is per-person, not per-active, so the `I-C4` refresh and the `I-PB-B2b` direction gate fire even for accounts no one is using.
- **`family_links` migrates into `guardianship`; `mentor` as a role value is dissolved**; the existing `accounts.isOwner` boolean is dropped.

## Alternatives considered

1. **Forward-only revert (no squash).** Rejected — see `MMT-ADR-0012`; the pre-launch zero-data window makes archaeology free-to-avoid and costly to keep.
2. **Separate `login` table mirroring Clerk.** A `login` row would mostly mirror data Clerk already owns, adding a join and a sync seam to buy multi-login-per-person, which isn't a v1 requirement. **Adopted the *minimal* `login` table** — a thin binding rather than a Clerk mirror, so the future "multi-login" add is a constraint lift, not a re-shape.
3. **`is_owner` preserved as a denormalised cache.** Rejected — a column meaning two things is the inverse of the derived-admin-role pattern; the cache is always stale relative to the role truth.
4. **Stamped `consent_status` column** (the `consent_states` shape, evolved). Rejected — by counsel ruling, by canon (consent is computed not stamped), and by the `I-D1` structural blocker.
5. **Soft-delete only (`deleted_at` column).** Rejected — the `I-C1` finding verifies that this *is* the current defect, not a fix for it.
6. **Single polymorphic `relationship` table for guardianship + mentorship.** Rejected — the two edges differ in payload, in invariants, and in their governing ADRs; fusing them buys speculative flexibility for YAGNI complexity. (See D5 grill.)
7. **Dormancy `max(session.created_at)` derived at sweep time.** Rejected — the dormancy check is a hot, repeated read; a denormalized column is the honest shape.
8. **Dedicated `transition_run_log` for sweep idempotency.** Rejected — `MMT-ADR-0009` already specifies the `personId+day` Inngest-native key; a run-log table is only worth it if observability needs to query run history, which nothing here asks for (addable later).
9. **Build the `controller-role` column now, no logic.** Rejected — a dormant column reads as "handled" to the next contributor (the half-migration pattern); YAGNI for v1's single-org world.

## What this ADR does NOT do

- Run the baseline migration. (Phase F.)
- RLS rollout. (T3 obligation, Phase F.)
- Fill the retention *values* on `person_retain`. (Counsel.)
- Pick the VPC vendor. (Procurement, after legal requirements are clear.)
- Resolve the **`inv 17` rephrase** (the `I-PB-B3a` architect call). The data model carries the consent gate per the ratified model; the rephrase is canon-language, not schema.
- Settle the **"11" age-floor final product call** (now a tracked roadmap thread, gated on the store-rating/directed-to-children posture).
- Add **`E3` — which Person is recorded as `payer_person_id` under Family Sharing / Ask-to-Buy.** The column is in place; the value is a Phase-F product + counsel call.
