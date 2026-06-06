# Data model — identity foundation (Phase E)

**Status:** DRAFT — ratify
**Provenance:** derived from `domain-model.md` v1.1 (RATIFIED 2026-06-03) + the 8 Phase-E decisions (D1–D8, 2026-06-04) + the counsel walkthrough of 2026-06-03 (`I-C1` / `I-C2` / `I-C4`, `I-PB-B2a` / `I-PB-B2b` / `I-PB-B3b`, `I-A2`, `I-D1`, `I-E3`)
**Lockstep partners:** `docs/adr/MMT-ADR-0011-phase-e-data-model-realization.md`, `docs/adr/MMT-ADR-0012-one-time-baseline-reset.md`, `identity-ontology.md` (newest-first §R entry), `domain-model.md` (carry of §7 handoff), `CONTEXT.md` (identity-noun parity check), `ROADMAP.md` (Phase-E box flip)
**Out of scope (Phase F):** the actual `drizzle-kit` baseline migration, the `T1` revert execution, `RLS` enforcement, the `inv 17` rephrase (architect), the "11" final product call, retention *values* (counsel), `G7` VPC vendor (procurement)

> **What this doc is.** The physical realization of the ratified domain model: the tables, columns, constraints, indexes, FKs, and the structural `person_retain` seam. It does not re-derive the *what* (the entities, edges, invariants) — that lives in the ontology. It states the *how* the schema makes the invariants true.
>
> **What this doc is NOT.** Not the design of the cleanup (the cut strategy lives in `MMT-ADR-0012`); not the Drizzle code (Phase F); not the values for the retain-tier retention columns (counsel).

---

## §1 — The cut

The target schema is stated as a **fresh create-from-empty baseline**. There is no diff language, no "migrate column X to Y" — the tables below are *born* in the shape they have. This is the documented reset (see `MMT-ADR-0012`); the pre-launch, zero-data window makes the reset free, and the archaeology of a forward-only revert would be permanent.

From the baseline forward, append-only migrations are absolute. The reset is the only exception, ever.

---

## §2 — Entity table inventory

Eight tables in the active graph, plus a per-class retain-tier set. Each row below: columns + types + constraints + the "what previously existed that this supersedes" pointer.

| Table | Purpose | Replaces (legacy) | Replaces (T1, inert) | Notes |
|---|---|---|---|---|
| `person` | The human. Learning-data scope key. | `profiles` (fused with `accounts`) | — | Renamed + `birth_date` + nullable `login_id` |
| `login` | The Clerk-binding to a Person. | `accounts.clerk_user_id` (column) | — | New table; thin binding |
| `organization` | The thin container (billing + consent + quota anchor). | `accounts` (the container role) | `organizations` (the T1 inert table) | `account.id → organization.id` reuse was the T1 hidden fact |
| `membership` | Person↔Org link with role set. | (none — `family_links` is parent→child, not person→org) | `memberships` (the T1 inert table) | roles array; `UNIQUE (person, org)`; non-empty CHECK |
| `subscription` | Billing row, anchored to the org. | `subscriptions.account_id` FK | — | Re-anchored to `organization`; quota derived |
| `guardianship` | Global edge: consent authority + consent record. | `family_links` (parent→child) | — | Per `MMT-ADR-0008` |
| `mentorship` | Opt-in mentor grant. | (the `mentor` role value) | — | Per `inv 19`; never auto-conferred |
| `consent_grant` | Append-only per-purpose consent event log. | `consent_states` (stamped status) | — | Computed requirement, stored record; per `D6` |
| `person_retain` set | Per-class retain-tier: `consent_receipt`, `deletion_audit`, `financial_record`. | (none — currently no retain-tier) | — | The structural fix for `I-C1` |

---

## §3 — Edge diagrams

### 3.1 The active graph

```
                                  ┌──────────────┐
                                  │ organization │
                                  └──────┬───────┘
                                         │ 1
                                         │
                                  ┌──────▼───────┐         ┌──────────────┐
                                  │ subscription │────────►│ store_ref    │ (external)
                                  └──────────────┘         └──────────────┘
                                         ▲
                                         │ payer_person_id (access-inert)
                                         │
   ┌─────────────┐    ┌─────────────┐    │   ┌──────────────┐
   │ person  A   │    │ person  B   │    │   │ person  C    │
   │ (charge)    │◄───┼ guardianship┼────┘   │ (mentee)     │
   └──────┬──────┘    └─────────────┘        └──────┬───────┘
          │                                        ▲
          │                                        │ mentorship
          │                                  ┌─────┴────────┐
          │                                  │ person  D    │
          │                                  │ (mentor)     │
          │                                  └──────────────┘
          │
          │ membership {admin | learner}
          ▼
   ┌─────────────┐                  ┌────────────────────┐
   │ organization│                  │ consent_grant      │ (append-only event log)
   │ (home org)  │                  │  - charge          │   keys: (charge × purpose × org)
   └──────┬──────┘                  │  - purpose         │   snapshots: age, jurisdiction
          │                         │  - lawful_basis    │   at-grant values
          │ membership              │  - assurance_token │
          ▼                         │  - prior_value     │
   ┌─────────────┐                  │  - audit_fact      │
   │ person  E   │                  └────────────────────┘
   │ (admin)     │
   └─────────────┘
```

### 3.2 The retain-tier split

```
   ACTIVE SIDE (drops on person-delete)         RETAIN SIDE (outlives the person)
   ─────────────────────────────────           ────────────────────────────────────
   person              ─────────drop────►       consent_receipt   (← from consent_grant)
   membership          ─────────drop────►       deletion_audit    (← write at delete-time)
   subscription        ───────survives────►     financial_record  (← per-person refs)
   guardianship        ───────survives────►     (the org's subscription row continues
   mentorship          ───────survives────►      to live on the organization)
   consent_grant       ─────migrate on drop─►   (only `consent_receipt` survives;
   all learning data    ─────────drop────►       the live `consent_grant` row is gone)
```

The key asymmetry: **the live consent record moves, the receipt stays.** `consent_grant` is the working row; `consent_receipt` is the durable artifact. The `ward_person_id ON DELETE RESTRICT` on `consent_grant` enforces "you can't hard-delete a person with active grants — re-home them first."

---

## §4 — Per-table rationale

For each table: the constraint it exists to satisfy (cite invariant, ADR, counsel ruling), what specifically changed vs. the legacy state, the validation boundary, and the index notes.

### 4.1 `person`

- **Constraint it satisfies:** `MMT-ADR-0007` (Person ≠ Login, the human is the learning-data scope key); `D6b` (`birth_date`); `D6c` (country ISO); `D7b` (denormalized `last_activity_at`).
- **vs. legacy:** `profiles` is renamed to `person`; `birth_year` (integer) is replaced by `birth_date` (date); `is_owner` is dropped (derived from admin-role + payer-self-reference); the existing `clerk_user_id` column becomes a 1:1 mirror of `login.clerk_user_id`; the existing `login_id` link is added (the nullable FK that realises the Person ≠ Login split).
- **Validation:** `birth_date NOT NULL`; `residence_jurisdiction NOT NULL`; `login_id` nullable; `login_id` and `clerk_user_id` agree (CHECK: `(login_id IS NULL) = (clerk_user_id IS NULL)`); `display_name NOT NULL`.
- **Indexes:** `(birth_date)`, `(residence_jurisdiction)`, `(last_activity_at)`, plus the existing `(account_id)`→`(login_id)`-derived FK index.

### 4.2 `login`

- **Constraint it satisfies:** `D2` (a thin binding, not a Clerk mirror); `MMT-ADR-0001` (Clerk owns auth, we own everything else).
- **vs. legacy:** no table before — `accounts` carried the Clerk binding as columns. Splitting makes the binding explicit and keeps a future "one Person, two logins" add cheap.
- **Validation:** `person_id NOT NULL`; `clerk_user_id UNIQUE NOT NULL`; `email UNIQUE NOT NULL`.
- **Indexes:** `(clerk_user_id)`, `(person_id)`.

### 4.3 `organization`

- **Constraint it satisfies:** `D3` (org owns billing + consent + quota, per `inv 18`); `MMT-ADR-0010` (v1 single home org).
- **vs. legacy:** `accounts` (the container role) is replaced by `organization`. The T1 inert `organizations` table is dropped by the reset. The deletion-timestamp columns carry forward.
- **Validation:** `name NOT NULL`; `timezone` nullable.
- **Indexes:** none new; FK targets.

### 4.4 `membership`

- **Constraint it satisfies:** `D4` (roles `{admin, learner}` array); `inv 22` (consent-authority ≠ billing-control ≠ data-visibility).
- **vs. legacy:** no analogue in the active schema; `T1`'s inert `memberships` table (with the `owner/mentor/student` enum) is dropped. The non-empty `cardinality(roles) >= 1` CHECK carries forward from the existing pattern in `profiles.ts`.
- **Validation:** `roles` non-empty; `UNIQUE (person_id, organization_id)`; first member of an org is `admin` (enforced in service code on insert, not as a CHECK — the "first member" rule has no clean CHECK form).
- **Indexes:** `(organization_id)`; the unique constraint is the index on `(person_id, organization_id)`.

### 4.5 `subscription`

- **Constraint it satisfies:** `D3` (subscription→org, not→account); `MMT-ADR-0002` (store-delegated billing; the cached read shape).
- **vs. legacy:** the `subscriptions.account_id` FK is replaced by `organization_id`; `payer_person_id` is added as the access-inert snapshot.
- **Validation:** `organization_id NOT NULL`; `plan_tier NOT NULL`; `status NOT NULL`; `payer_person_id` nullable (org-of-one with no Payer is not a v1 case but the null is permitted for clean re-homing during the family-join primitive).
- **Indexes:** `(organization_id)`.

### 4.6 `guardianship`

- **Constraint it satisfies:** `D5`, `MMT-ADR-0008`, `inv 14` / `inv 19` (never auto-conferred; opt-in); the **`F1-BT-a` — no-self-guardian guard, the attack surface the ratified model bans**.
- **vs. legacy:** `family_links` (parent→child) is renamed + re-purposed; the consent record lives on this edge; the operational powers do *not* live on this edge.
- **Validation:** `guardian <> charge`; `UNIQUE (guardian, charge) where revoked_at IS NULL` (partial unique — re-granting after revoke is a new row, preserving history).
- **Indexes:** `(charge_person_id)`, `(guardian_person_id)`.

### 4.7 `mentorship`

- **Constraint it satisfies:** `D5`, `inv 19` (opt-in, never auto-conferred).
- **vs. legacy:** the `mentor` role value dissolves into this edge.
- **Validation:** `mentor <> mentee`; `UNIQUE (mentor, mentee) where revoked_at IS NULL`.
- **Indexes:** `(mentee_person_id)`, `(mentor_person_id)`.

### 4.8 `consent_grant`

- **Constraint it satisfies:** `D6` (append-only event log; computed requirement, stored record); `I-PB-B2a` (per-purpose, separate consent for the LLM-disclosure purpose; tokenised pass/fail only); `I-A2` (recorded `lawful_basis`); `I-PB-B2b` (retain prior value + audit fact for direction-aware gate); `I-D1` v1-stance (org-scoped from birth).
- **vs. legacy:** `consent_states` (stamped status) is replaced by an event log; the `UNIQUE(profileId, consentType)` constraint that was the `I-D1` blocker is *gone* — the new key is `(charge × purpose × organization)` and history is preserved.
- **Validation:** `charge_person_id ON DELETE RESTRICT` *(load-bearing: active grants must be re-homed before a person-delete is permitted)*; `organization_id ON DELETE RESTRICT`; all other fields as described in `MMT-ADR-0011` §3.
- **Indexes:** `(charge_person_id, purpose, organization_id)` — the resolution hot path; `(granted_at)`; `(withdrawn_at) where withdrawn_at IS NOT NULL`.

### 4.9 The `person_retain` per-class set

- **Constraint it satisfies:** `I-C1` (the consent receipt must survive deletion; the live defect the reset is the moment to fix structurally); `I-PB-B2b` (the prior value + audit fact must be captured); the billing/tax retention duty (the `MMT-ADR-0002` Art 28 processor side).
- **vs. legacy:** currently no retain-tier exists; the columns that would have been it (`accounts.deletion_scheduled_at` etc.) are operational deletion-coordination, not the legal retain-tier.
- **Validation:** the three tables share the pattern `person_id NOT NULL`, a `retained_at` timestamp, a `retention_period` column (counsel fills the value), and read access is role-gated (not RLS-default).
- **Indexes:** `(person_id)` on each; `(organization_id)` on `consent_receipt` and `financial_record` (the org-scoped reads).

---

## §5 — Cross-cutting concerns

### 5.1 Scope (the future RLS surface, T3)

- **`person_id` is the scope key** for all learning data. Person-scoped reads remain a T3 obligation; the schema names the scope, the migration enforces it.
- **`organization_id` is the scope key** for `membership`, `subscription`, and the membership-derivable powers. The cross-org dimension is the future feature; the column is in place from day one.
- **`person_retain` is *not* RLS-default.** Read access is a named service role (the audit-trail must not be torn open to per-member reads). This is a deliberate exception, recorded so the future RLS rollout does not flatten it.

### 5.2 Migration sequencing against the legacy state (the `T1` revert)

Although the squash makes this theoretical, the planned order against the legacy state is:

1. Drop `family_links` rows (their data migrates conceptually into `guardianship`).
2. Drop the `0106` inert `organizations` + `memberships` tables.
3. Drop the `consent_states` table.
4. Drop the `accounts` table (replaced by `organization` + `login`).
5. Rename `profiles` → `person`; add the new columns; drop `is_owner`, `birth_year` (replaced by `birth_date`); add `login_id` FK.
6. Re-anchor `subscriptions.account_id` → `subscriptions.organization_id` (in v1 the values are 1:1 because the T1 reuse made `account.id = organization.id` for the existing rows).
7. Create `guardianship`, `mentorship`, `consent_grant`, the `person_retain` set, and the `login` table.
8. Add the new indexes.

In the squash, all of the above happens in one baseline migration. Listed here so a future reader who needs to re-derive it can.

### 5.3 Backwards compatibility

**None.** Clean cut. Caller-facing types (Zod schemas, repo-level types) update in the same change-set; the API surface is broken in the baseline commit and re-built in the follow-on. This is a launch-window luxury, but it is also why the schema can be stated as one clean artifact.

### 5.4 Idempotency

- **Sweep idempotency** (D7c): the per-person fan-out event's `idempotency_key = "personId+day"`; the framework dedupes; no run-log table.
- **Webhook idempotency** (existing, unchanged): the existing `webhook_idempotency` table is the source for store/billing webhooks.
- **Consent-grant uniqueness** is *not* enforced at the row level — re-granting after withdrawal is a new row in the event log. The "current state" is a read-time aggregate (`MAX(granted_at)` per `(charge × purpose × org)`); the schema permits re-grants to preserve history.

---

## §6 — Failure modes

Per the counsel walkthrough's audit-survival requirement and the project's UX-resilience rule, every load-bearing path gets a Failure-Modes row. The single most important section of this doc.

### 6.1 Deletion paths (the `I-C1` cross-cutting fix)

The legacy state has **three delete paths that destroy the consent receipt** (verified in counsel walkthrough: `onDelete:'cascade'` in `profiles.ts:319-321`; write-then-delete in `consent.ts:898-901`; no retain-tier). The new state replaces all three with one structural pattern: *the active row drops, the receipt moves to the retain-tier, the audit row is written.*

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| **Active person → user-initiated delete** | User requests account deletion via `more/privacy.tsx` export-delete flow. | Standard export + confirmation + grace window. | `consent_grant` rows re-home to `consent_receipt`; `person` + `membership` + learning data drop; `deletion_audit` row written; `financial_record` rows created for tax/chargeback. |
| **Active person → parent-initiated delete (under-age)** | Guardian exercises the C2 right. | Age-appropriate confirm + grace window. | Same path as above; the `deleted_by` on the `deletion_audit` is the guardian. The C2 forward-only receipt-preservation guard (CI guard #4 in counsel handoff) verifies the receipt survives. |
| **Active person → abandonment (dormancy window elapsed)** | Daily sweep detects `last_activity_at` older than counsel-set threshold; grace window elapsed with no return. | Pre-deletion notice + grace; final silent cleanup. | Same re-home pattern; the `reason` on the `deletion_audit` is `abandonment`. The C1 forward-only ratchet verifies. |
| **`consent_grant` row blocked from delete by RESTRICT** | A delete attempt on a `person` with active grants. | The delete *fails* — by design. | The re-home transaction is a single atomic step; a half-done delete is not a valid state. The RESTRICT is the schema's way of saying "you forgot to move the records first." |

The forward-only ratchet (the CI guard the counsel handoff mandates) installs against the new baseline: it cannot regress to a `consent_states`-shape column because that table does not exist.

### 6.2 Age-crossing protection-lowering (`I-PB-B2b`)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| **Protection-adding edit (DOB moved earlier, residence moved into stricter regime)** | User edits their own birth date / residence. | Gate stays in current state. | No verification required (B2b: down is trusted instantly). The `consent_grant` event log records the new compute. |
| **Protection-lowering edit (DOB moved later, residence moved into laxer regime, or age crosses 13 / 16 / 18)** | Same edit, with the new value relaxing protection. | The edit *succeeds in the input layer* but the protection is *not* lowered until the verification clears. The user sees: "We've received your change. To complete the relaxation, please verify [method]." | The `prior_value` + `audit_fact` are written to `consent_grant` immediately. The actual protection-lowering fires only after the assurance check; the more-protective state persists until cleared (B2b: never optimistic-grant-then-clawback). |
| **Age-crossing transition (sweep-driven, I-C4)** | Daily sweep detects `birth_date` + current date crossing a threshold. | Quiet — the consent re-evaluation is internal. | The sweep writes a new `consent_grant` row with the new `lawful_basis` (or the existing one if still applicable). The previous row is *not* withdrawn — it is superseded by the new grant. History is preserved. |
| **Adult clearing (`Art 16` — GDPR right to rectification)** | A genuine adult (verified) claims their prior minor-recorded value is wrong. | Single-step verification. | The new value is written; the `prior_value` + `audit_fact` are preserved; the user retains the complaint route (Art 16). |

### 6.3 Moved-country (`I-E3`)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| **Residence change** | User updates their `residence_jurisdiction`. | A grace window (length = counsel's `I-E3` parameter); the user is informed they need to re-affirm consents under the new jurisdiction. | The sweep tracks the residence-effective date and the grace window; on maturation, the user is moved to `suspend-to-browse-preview` (the `E2` product ruling) until they re-affirm. The new `consent_grant` row carries the new `snapshot_jurisdiction_at_grant`. |

### 6.4 The `migration-pending` interim state (per `MMT-ADR-0010`)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| **Child completing own Clerk sign-up for the family invite** | The invite-flow's child-side step. | "Setting up your account…" | The new `login` row is created; the `person.login_id` is updated from null to the new id; the `guardianship` row is unchanged. The `migration-pending` flag (a column on `person`, nullable, set during the join) is cleared on success. |
| **Teen joining a family (v1 family-join primitive)** | The parent-initiated invite; the teen accepts. | The double-charge disclosure + a follow-up nudge. | The `membership` for the home org is added; the teen's now-empty org-of-one is decommissioned; the `payer_person_id` is set per the join's billing option. The `migration-pending` flag is cleared on success. |
| **Mid-join failure (Clerk sign-up fails / the teen abandons)** | The transaction's halfway point. | The user sees the prior state; no half-state is exposed. | A single atomic step (or a compensating action) ensures either the full join or no change. The `migration-pending` flag's nullable nature is the rollback signal. |

### 6.5 Sweep / scheduler failures

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| **Inngest cron doesn't fire on a given day** | Platform / framework outage. | The framework retries on resume; the `personId+day` idempotency key ensures a person is processed at most once per day even after a replay. | No data loss; the next day's run continues normally. A monitor (the "sweep ran today?" check) alerts on missed days. |
| **Per-person fan-out fails (transient)** | Step error, e.g. a downstream call. | User is unaffected; the per-person step is retried by Inngest within its retry policy. | Idempotent re-run; the per-person step is bounded and uses the `personId+day` key. |
| **Consent-refresh re-evaluation produces an unexpected result** | A bug or a jurisdictional edge case. | The user is unchanged; the new `consent_grant` row is *not* written. | The new row is gated behind a "write only if state actually changed" check; the sweep logs the no-op. The prior grants continue to apply.

---

## §7 — Handoff to Phase F + open legal

### To Phase F (the build)

- The `drizzle-kit` baseline migration that creates the eight tables + the `person_retain` set in one statement. (`MMT-ADR-0012` is the cut; this ADR is the *what* of the migration.)
- The RLS rollout (T3 obligation): `person_id` scope for learning data; `organization_id` scope for membership/subscription; the `person_retain` role-gated read carve-out.
- The `isOwner`→`admin-role` rekey sweep across the app. Every `assertOwnerProfile` / `isOwner` gate becomes an `admin`-role check. Tracked as a build-time sweep, not a schema change.
- The `login` table's per-person binding — populate from the existing `profiles.clerk_user_id` during the baseline (one-to-one in v1; the unique constraint prevents drift).
- The T1 revert execution: in the squash, this is the migration's drop list. In a non-squash world, it would be a follow-on. Per the cut, it's the baseline.

### To counsel (REQ-2 register)

- **E3 — which Person is recorded as `payer_person_id` under Family Sharing / Ask-to-Buy** (the column is in place; the value is a counsel call).
- **Retention *values***: the `retention_period` column on `consent_receipt`, `deletion_audit`, and `financial_record` is a seam; counsel fills the actual periods (the `I-C1` receipt, the billing/tax window).
- **Dormancy period + pre-deletion notice length** (already on the counsel queue from `I-C3`).
- **Moved-country grace window length** (`I-E3`).
- **Boundary-crossing verification method** (`I-PB-B2b`; ties to `G7` vendor pick).
- **E4 one-of/all-of rule** (counsel).

### To the architect (open canon calls, not blocking)

- **The `inv 17` rephrase** (`I-PB-B3a` — store-delegation covers payment mechanics only; the consent gate stays ours). Canon-language, not a schema change.
- **The "11" age-floor final product call** (now a tracked roadmap thread, gated on the store-rating/directed-to-children posture).
- **G7 VPC vendor pick** (technical reviewer, after legal requirements are clear).

---

## §8 — Decisions ledger

Every Phase-E ruling, the rule it implements, the ADR it lands in, and the counsel or canon pointer that confirms it.

| # | Decision | Ruling | Realizes | ADR |
|---|---|---|---|---|
| **D1** | Cut posture | Clean baseline, one documented reset, append-only forever | (the reset itself) | `0012` |
| **D2** | Credential placement | Nullable column on `person` + thin `login` table | `MMT-ADR-0007` | `0011` |
| **D3** | Payer placement | `payer_person_id` snapshot on `subscription` (access-inert); subscription→org; quota derived | `inv 18` + `MMT-ADR-0002` | `0011` |
| **D4** | Role storage | Array-of-enum `{admin, learner}`; `is_owner` dissolves; mentor/guardian → edges | `MMT-ADR-0007` | `0011` |
| **D5** | Edge storage | Two purpose-built tables: `guardianship`, `mentorship` | `MMT-ADR-0008` + `inv 19` | `0011` |
| **D6** | Consent shape | `consent_grant` event log; `birth_date`; country ISO; assurance seam; `org_id` kept; `controller_role` deferred | (ratified) | `0011` |
| **D7** | Scheduler physicals | Unified daily sweep; `personId+day` idempotency; denormalized `last_activity_at`; indexes | `MMT-ADR-0009` | `0011` |
| **D8** | Retention seam | Structural `person_retain` set (consent_receipt, deletion_audit, financial_record) | `I-C1` + `I-PB-B2b` | `0011` |

Plus — the counsel findings the schema is designed *to satisfy* (not invented by Phase E, but baked in so the schema's job is verifiable):

| Finding | Where it's satisfied |
|---|---|
| `I-C1` (consent receipt survives deletion) | `person_retain.consent_receipt` + the re-home transaction at delete-time + the forward-only CI guard |
| `I-C2` (parent-initiated child erasure lawful) | The `deletion_audit` row's `deleted_by` field; the C2 forward-only guard |
| `I-C4` (consent refresh at age transitions) | The unified daily sweep now owns it (`consent_grant` is rewritten on age crossing) |
| `I-PB-B2a` (VPC tokenised pass/fail only) | `consent_grant.assurance_token` + `assurance_method`; the receipt drops the token at re-home time |
| `I-PB-B2b` (direction-aware birth gate, retain prior value) | `consent_grant.prior_value` + `audit_fact`; the sweep's age-crossing logic |
| `I-A2` (recorded `lawful_basis`) | `consent_grant.lawful_basis` column |
| `I-D1` v1-stance (org-scoped consent) | `consent_grant.organization_id` is `NOT NULL`; `controller_role` is the clean-add future |
| `I-E3` (moved-country grace) | `person.residence_jurisdiction` + the sweep's grace-window consumer |

Plus — open threads the schema designs around but does **not** resolve:

- **"11" age-floor — final product call** (coupled to content-rating/directed-to-children store posture; product-owned; tracked in ROADMAP).
- **Retention *values* — counsel**.
- **`inv 17` rephrase — architect** (`I-PB-B3a`).
- **G7 VPC vendor — procurement**.

---

## §9 — Cross-references

Every invariant, ADR, counsel ruling, and code citation this doc relies on. Designed so a future reader can verify the schema's job in one place.

### Invariants cited
- `inv 4` — under-age self-signup hits the consent gate
- `inv 11` — consent evaluated over a guardian *set*
- `inv 14` — never auto-Guardianship
- `inv 18` — home org owns billing + consent + quota
- `inv 19` — mentorship opt-in
- `inv 20` — history not destroyed to join
- `inv 21` — deletion never orphans history
- `inv 22` — three-layer authority separation
- `inv 23` — Guardianship as a global edge (D1-ruled Option A)
- `inv 24` — unified transition scheduler
- `inv 25` — `migration-pending` interim state
- `inv 28`, `inv 30` — minor-initiated guardianship banned
- `inv 29` — worst-case-default generalises to "take the stricter signal" (D4)

### ADRs cited
- `MMT-ADR-0001` — Clerk = auth only
- `MMT-ADR-0002` — Payer = store-delegated
- `MMT-ADR-0007` — core identity entity & role model
- `MMT-ADR-0008` — Guardianship = global edge, derived operation
- `MMT-ADR-0009` — unified daily transition scheduler
- `MMT-ADR-0010` — family-join / consolidation primitive
- `MMT-ADR-0011` — *(this phase)* Phase-E data-model realization
- `MMT-ADR-0012` — *(this phase)* one-time baseline reset

### Counsel rulings baked in
- `I-C1` — `consent_states` `onDelete:'cascade'` defect; `consent.ts:898-901` write-then-delete defect; no retain-tier
- `I-C2` — guardian-initiated child erasure lawful; confirms `inv 21`
- `I-C4` — consent never refreshed at any age transition (live defect)
- `I-PB-B1` — no legal usage floor; "11" is a product choice needing a documented rationale
- `I-PB-B2a` — self-declaration below the floor; VPC = disclosure-grade enumerated method; tokenised pass/fail only
- `I-PB-B2b` — direction-aware gate; retain prior value + audit fact for protection-lowering
- `I-PB-B3b` — platform age-signal routing-only; never substitute for VPC
- `I-A2` — parent's contract ≠ a lawful basis for a minor's processing
- `I-D1` — consent ontology cannot represent cross-org consent; the schema pre-wires the v1 stance
- `I-E3` — moved-country grace window (parameter, not value)

### Code citations
- `packages/database/src/schema/profiles.ts:38-50` — the `birthYearSchema` 11-floor (the "11" final call, tracked)
- `packages/database/src/schema/profiles.ts:79-180` — the existing `accounts` + `profiles` + inert `organizations` + inert `memberships` + `family_links` shapes
- `packages/database/src/schema/profiles.ts:319-321` — the C1 `onDelete:'cascade'` defect
- `apps/api/src/middleware/account.ts` — the JIT `findOrCreateAccount` (per `MMT-ADR-0010`, no `clerkClient.users.create`)
- `apps/api/src/inngest/functions/daily-snapshot.ts` — the daily-sweep pattern `MMT-ADR-0009` mirrors
- `apps/api/drizzle/0106_identity_t1_org_membership.sql` — the T1 inert migration (the cut target)
- `packages/database/src/migrations/identity-t1-backfill.sql` — the T1 backfill (the cut target)
- `apps/api/src/services/consent/consent.ts:898-901` — the C1 write-then-delete defect

### Audit trail
- This doc and its lockstep partners are committed + pushed via `/commit`. The Phase-D ADRs (`0007`–`0010`) sit at `docs/adr/`; this phase adds `0011` + `0012` to the same dir. The Phase-F baseline migration is the next artifact; it points back to this doc.
