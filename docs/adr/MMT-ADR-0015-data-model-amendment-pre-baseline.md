# MMT-ADR-0015 — Pre-baseline data-model amendments: Payer sub field, Sub-admin-as-profile-mgmt, charge terminology + G-3/G-4/G-6, AgeBracket 'child' value, knowledge assertions, allowed_models

**Status:** Proposed (pending architect ratification) · 2026-06-06 · **Scope:** Identity Foundation — pre-baseline data-model amendments to MMT-ADR-0011 (the 2026-06-04 baseline) · **Deciders:** Architect (jjoerg) + Claude · **Builds on:** MMT-ADR-0007 (Guardianship as edge), MMT-ADR-0008 (Guardianship global edge), MMT-ADR-0011 (data-model realization, 2026-06-04 baseline), MMT-ADR-0012 (one-time baseline reset) · **Inputs:** `_wip/identity-foundation/2026-06-XX-a-vs-b-decision-capture.md` §1 (the 6-persona set, Payer ruling, G/P/M split, G-3 3a, G-4 4b, G-6 6b, charge terminology) + MMT-ADR-0013 (policy-engine spine, the policy tables + knowledge assertions) + MMT-ADR-0014 (router, the allowed_models table) · **Resolves:** the pre-baseline amendment scope that the MMT-ADR-0012 window keeps open

> **Placement.** L2 ADR; amends MMT-ADR-0011 with the pre-baseline additions. Lockstep canon partner is `_wip/identity-foundation/data-model.md` (the Phase-E deliverable, to be updated lockstep when this ADR is ratified). This ADR is the *amendment scope*; the migration SQL is in the data-model.md lockstep.

## Context

MMT-ADR-0012 (one-time baseline reset, ratified 2026-06-04) describes a fresh create-from-empty baseline: 8 tables, structural `person_retain` set, append-only migrations forward. The A-vs-B conversation (2026-06-01 to 2026-06-05) and the 2026-06-06 grilling session surfaced 25 decisions, several of which require data-model additions:

- **§1.4 Payer ruling** — Payer is a *sub field*, not a persona. v1 supports 3a/3b/3c holders. 1 primary + max 1 secondary per subscription.
- **§1.5 Profile-mgmt ruling** — bundled with Sub admin (C). Sub admin = profile mgmt + billing.
- **§1.6 Guardian rulings** — G-3 3a (exactly 1 per charge), G-4 4b (explicit qualification ENUM), G-6 6b (explicit takeover, branching on `charges.has_own_account`).
- **§1.2 6-persona set** — Non-consenting minor (managed profile) is its own persona; the data model needs to express it.
- **§3.2 + §3.3 Engine decisions** — the policy engine needs `policy_rules` (with `kind` column), `policy_axes`, the two-axis knowledge model (B3: profile + history).
- **§4.2 + §5 Router decisions** — the `allowed_models` table (vetting pipeline output).
- **§3.3 + original under-13 synthesis Gap G** — `AgeBracket` schema needs a 'child' value.

**The pre-baseline window is the cheap moment for these additions.** Post-baseline is append-only. This ADR is the *amendment scope*; the migration SQL lands lockstep with `data-model.md` per MMT-ADR-0000.

## Decision

The MMT-ADR-0011 baseline is **amended** with the following additions, all pre-baseline. The amendments are grouped by *affected table*; the migration order respects the dependency chain (parent tables before child tables; enum additions before column additions that use the enum).

### Amendment 1: `AgeBracket` schema gains a 'child' value

**File:** `packages/schemas/src/age.ts`

**Current shape:** `'adolescent' | 'adult'` (a two-way union).

**New shape:** `'child' | 'adolescent' | 'adult'` (a three-way union).

**Rationale:** Gap G from the original under-13 synthesis. The two-way union cannot model a sub-13 floor change at all. The "child" value is required for the 13+ launch-floor logic; v1.1 will exercise it for the sub-13 EU ungating.

**Downstream impact:** `birthYearSchema` at `packages/schemas/src/profiles.ts:38-54` flips from `≤ currentYear-11` (the pre-baseline 11+ rule, per the Phase-E fillers I-P1 capture) to `≤ currentYear-13` (the v1 launch floor). The flip + the documented rationale ship in the same change per the Phase-E fillers §I-P1 implication list. v1.1 (or a phase-2 11+ flip) re-evaluates.

**Compatibility:** the 'child' value is a *new* value, not a rename. Existing 'adolescent' and 'adult' values are preserved. Existing user profiles map to 'adolescent' (13–17) or 'adult' (18+) as before. The new value activates when a user's age falls below 13; v1's launch-floor logic maps sub-13 to 'child' (and the v1 launch config blocks sub-13 signups at the API).

### Amendment 2: `persons.charge_terminology` rename + `charges` table (charge terminology + G-3 3a)

**Files:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**Charge terminology sweep (2026-06-06):** the term *ward* is replaced by *charge* across all five file sets (CLAUDE.md, AGENTS.md, CONTEXT.md, .claude/memory/, ontology). The sweep report is at `_wip/identity-foundation/charge-terminology-sweep-report.md` (109 edits across 13 files; verification PASS; legal-corpus skip set is `policy-engine-spine-walkthrough/{SYNTHESIS.md, CAPTURE-LEDGER.md, BRIEFING-PACKET.md}` only). **Schema columns and table names that referenced "ward" are renamed in this amendment:**

- `wards` table → `charges` table (per the charge-terminology sweep).
- `wardships` table → `guardianships` table (per the sweep + MMT-ADR-0008's terminology).
- `ward_person_id` column → `charge_person_id` column (per the sweep).
- `ward × purpose × org` event-log key → `charge × purpose × org` (per the sweep).

**G-3 3a — exactly 1 Guardian per charge:** the `guardianships` table has a UNIQUE constraint on `charge_person_id` (one row per charge). The 1:1 is *enforced* at the schema layer, not just at the engine. MMT-ADR-0008's "guardianship is a global edge" is preserved; the 1:1 is on the *active* guardian edge per charge.

**Mentor N-per-charge:** the `mentorships` table has no UNIQUE constraint on `charge_person_id` (a charge can have multiple mentors). The N-per-charge is the default; v1.1 may add caps if a UX reason emerges.

**Downstream impact:** all code that reads/writes `wards` / `wardships` / `ward_person_id` updates to `charges` / `guardianships` / `charge_person_id`. The sweep report is the audit trail.

### Amendment 3: `guardianships.qualification` ENUM (G-4 4b)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**New column:** `guardianships.qualification` ENUM NOT NULL with values:

- `biological_parent`
- `adoptive_parent`
- `stepparent`
- `grandparent`
- `court_appointed_guardian`
- `foster_parent`
- `kinship_caregiver`
- `sibling_with_custody`
- `other`

**Rationale:** G-4 4b — the qualification is recorded explicitly, not implicit in the persona + edge combination. Legal-status matters for compliance (stepparent jurisdiction variability, court-appointed vs biological in custody disputes, etc.) and for the audit trail.

**Editable post-creation:** qualification can change (e.g., stepparent adopts → update to `adoptive_parent`). The update is auditable.

**v1 surface:** 1 dropdown in the profile-mgmt UX. Defaults to `biological_parent` (typical case); the Subscription administrator picks from the dropdown when granting consent for a charge.

**Downstream impact:** the consent-grant flow (the `consent_receipt` insert + the `guardianships` row insert) captures the qualification at insert time. The G-4 ruling is in the A-vs-B memo §1.6.

### Amendment 4: `charges.has_own_account` BOOLEAN (G-6 6b)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**New column:** `charges.has_own_account` BOOLEAN NOT NULL DEFAULT false.

**Rationale:** G-6 6b — explicit takeover flow branches on this column:

- **Case A: `has_own_account = false`** (typical sub-13, managed profile). Flow = "create their account" (email, password, age-confirm). On completion: `has_own_account` flips to `true`; new `{student}` membership; profile self-managed.
- **Case B: `has_own_account = true`.** Flow = "claim ownership of this account" (confirm, age-verify, link). On completion: account linked to charge; profile self-managed.

Both cases end with the Guardian edge transitioning to *historical* (read-only audit record).

**Trigger:** cron daily + session-start check on the charge's age. When the charge crosses the per-market digital-consent age, the in-product flow is triggered.

**Downstream impact:** the G-6 ruling is in the A-vs-B memo §1.6; the in-product flow is a Phase F / v1 implementation; the audit log captures every transition (create, transfer, expire, takeover).

### Amendment 5: `subscriptions.payer_person_id` + `subscription_payers` table (Payer re-architecture, §1.4)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**Current shape:** the Payer is a property of the family org's `payer_person_id` (per MMT-ADR-0011 + MMT-ADR-0002's "store-delegated" model).

**New shape:** the Payer is a *sub field* on the subscription, with a primary/secondary role structure:

- `subscriptions.payer_person_id` — FK to persons, NOT NULL, UNIQUE per sub. The *primary* Payer. v1: the Subscription administrator persona (3a) or the Solo adult learner persona (3b) or an Independent teen 18+ (3c). Out of v1 scope: 3d (non-member adult) and 3e (Payer of a different org) — the data model supports them; the v1 UX doesn't surface them.
- `subscription_payers` join table — `(subscription_id, person_id, role ENUM('primary', 'secondary'))` UNIQUE(subscription_id, person_id). v1: at most 1 secondary per subscription. The secondary's capabilities: read subscription state, view invoices, update payment method. **No cancel, no upgrade, no plan change.** Primary Payer gets a notification (in-app + email) on every secondary payment-method change.

**Capability tier (4b tight):**

- **Primary Payer:** full billing ops (read subscription state, update payment method, view invoices, cancel, upgrade, change plan).
- **Secondary Payer:** read subscription state, view invoices, update payment method. **No cancel, no upgrade, no plan change.**

**Payer-holder cases supported in v1 (3a/3b/3c):**

- **3a. Subscription administrator on the family subscription.** The typical parent case.
- **3b. Adult self-directed learner on their own subscription.** Self-pay, the org-of-one case.
- **3c. Self-consenting minor 18+.** Functionally an Adult self-directed learner.

**Out of v1 scope (3d/3e, designed-for-later):** non-member adult Payer; Payer from a different org. The data model is permissive (Payer field on subscription, no requirement that Payer be org member); the v1 UX is restrictive.

**Store-IAP identity (PRD Part IX open item):** the IAP identity (Apple/Google account owner) may differ from the Payer field. The store-payer ↔ `payer_person_id` mapping is an open legal item; this ADR does not close it.

**Downstream impact:** the Subscription administrator persona's UX (the unified multi-role surface per PRD Part IX) is the place where Payer + `{admin}` + profile-mgmt + Guardian edge + Mentor edge + `{student}` stack. The data-model changes here are the *capability* surface; the UX surface is post-walkthrough.

### Amendment 6: Subscription administrator as profile-mgmt authority (Sub admin C, §1.5)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**The capability matrix change:**

- **Profile management** moves from the Guardian edge (per MMT-ADR-0008) to the **Subscription administrator's** membership role + Payer field. The `subscription_admins` membership role (or the implicit `{admin}` role on the family org) carries the profile-mgmt authority.
- The **Guardian edge** is now *consent only* — does not imply profile mgmt. The edge is a person-to-person relationship; profile mgmt is an org-level concern.
- The **Mentor edge** is *data access only* — does not imply consent or profile mgmt. The edge is a person-to-person relationship for visibility into the charge's learning data.

**The "full parent" case** (typical v1): the Subscription administrator is the Payer + `{admin}` + holds the Guardian edge + holds a Mentor edge. Same human, four capabilities stacked. The UX surfaces the current hat (the family operator's "manage my family" surface vs. the household mentor's "help my kid with homework" surface).

**The split cases (off-ICP for v1, designed-for-later):** a grandparent who is the Payer but not the Guardian; a court-appointed guardian who is the Guardian but not the Payer. The data model supports the splits; the v1 UX doesn't surface them.

**Downstream impact:** the capability matrix in `domain-model.md` updates accordingly. The `subscriptions.profile_mgmt_authority` is implicit in the Subscription administrator's `{admin}` role + Payer field; no new column is needed. The audit log captures who *initiated* a profile change (the Subscription administrator) and who *consented* (the Guardian, if a charge is affected).

### Amendment 7: `policy_rules` table (MMT-ADR-0013 §1 — two-primitive model)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**New table:** `policy_rules`:

```sql
CREATE TYPE policy_kind AS ENUM ('prohibition_floor', 'consent_edge');

CREATE TABLE policy_rules (
  id BIGSERIAL PRIMARY KEY,
  cell_id BIGINT NOT NULL REFERENCES policy_cells(id),
  kind policy_kind NOT NULL,
  rule_text TEXT NOT NULL,
  citation_url TEXT,
  source_instrument TEXT,  -- e.g., 'AI Act Art 5(1)(b)', 'OpenAI Model Spec §8', 'Gemini §20(d)'
  effective_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,  -- null = no expiry
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cell_id, kind, source_instrument, effective_at)
);

CREATE INDEX idx_policy_rules_cell_kind ON policy_rules (cell_id, kind);
```

**Rationale:** the two-primitive model (MMT-ADR-0013 §1). The `kind` column is the type-safety boundary; the eval-logic split (prohibition-floor = unconditional; consent-edge = conditional on consent-state) is enforced at the engine.

### Amendment 8: `policy_cells` table + `policy_axes` (MMT-ADR-0013 §2 — regime taxonomy)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**New types + table:**

```sql
CREATE TYPE regime AS ENUM (
  'US_COPPA', 'EU_GDPR_13', 'EU_GDPR_14', 'EU_GDPR_15', 'EU_GDPR_16', 'UK_AADC', 'ROW'
);

CREATE TYPE age_method AS ENUM (
  'self_report', 'parent_reported', 'verified_credential', 'age_estimation_signal'
);

CREATE TYPE residence_method AS ENUM (
  'self_report', 'billing_address', 'geo_ip', 'verified_credential'
);

CREATE TABLE policy_cells (
  id BIGSERIAL PRIMARY KEY,
  age_band_min SMALLINT NOT NULL,  -- 0 for "any sub-13", 13 for "13–15", etc.
  age_band_max SMALLINT NOT NULL,
  regime regime NOT NULL,
  knowledge_axis ENUM('age', 'residence') NOT NULL,
  knowledge_value JSONB NOT NULL,  -- {method, confidence}
  UNIQUE (age_band_min, age_band_max, regime, knowledge_axis, knowledge_value)
);
```

**Rationale:** the regime taxonomy (MMT-ADR-0013 §2). The regime enum is locked inline (per the A-vs-B memo §3.2 candidate + the walkthrough R-2 ratification). The age-band + regime + knowledge-cell is the *addressing* scheme; `policy_rules` joins on `cell_id` to apply.

**v1 determination-method set:** `age_method` is `self_report` or `parent_reported`; `residence_method` is `self_report` (or `geo_ip` or `billing_address`). `verified_credential` and `age_estimation_signal` are v1.1 or later.

### Amendment 9: `knowledge_assertions` table (MMT-ADR-0013 §3 — two-axis knowledge)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**New table:** `knowledge_assertions`:

```sql
CREATE TABLE knowledge_assertions (
  id BIGSERIAL PRIMARY KEY,
  person_id BIGINT NOT NULL REFERENCES persons(id),
  axis ENUM('age', 'residence') NOT NULL,
  method TEXT NOT NULL,  -- ENUM name (e.g., 'self_report', 'geo_ip')
  confidence DECIMAL(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL,  -- e.g., 'profile_form', 'session_start_check', 'signup'
  asserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id BIGINT REFERENCES persons(id),  -- who triggered the assertion
  revoked_at TIMESTAMPTZ  -- non-null = superseded by a later assertion
);

CREATE INDEX idx_knowledge_assertions_person_axis ON knowledge_assertions (person_id, axis, asserted_at DESC);
```

**Profile additions (current state, cached for runtime reads):**

```sql
ALTER TABLE persons
  ADD COLUMN age_knowing JSONB,        -- {method, confidence, last_updated}
  ADD COLUMN residence_knowing JSONB;  -- {method, confidence, last_updated}
```

**Rationale:** the B3 (profile + history) shape. The profile carries the *current* state for runtime reads (the engine reads this per LLM call); the assertions table carries the *history* for audit. The COPPA "actual knowledge" doctrine and GDPR Art 8 "reasonable efforts" verification need the history; the engine's runtime needs the cached state.

**Default-for-unknown = most-restrictive:** if `age_knowing` is null, the engine treats the user as sub-13 (the prohibition-floor rules apply). If `residence_knowing` is null, the engine treats the user as the strictest applicable regime. The defaults are *behavior* of the engine, not schema columns.

### Amendment 10: `allowed_models` table (MMT-ADR-0014 — vetting pipeline output)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**New table:** `allowed_models`:

```sql
CREATE TYPE model_tier AS ENUM ('primary', 'secondary', 'tertiary');

CREATE TABLE allowed_models (
  id BIGSERIAL PRIMARY KEY,
  model TEXT NOT NULL,
  provider_via_service TEXT NOT NULL,  -- e.g., 'anthropic-via-azure'
  service TEXT NOT NULL,                -- e.g., 'azure-openai'
  region TEXT NOT NULL,                 -- e.g., 'us-east-1'
  criteria_metadata JSONB NOT NULL,     -- vetting-pipeline output: ToS, ZDR, log, training, age-closure
  tier model_tier NOT NULL DEFAULT 'primary',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (model, provider_via_service, service, region, effective_at)
);

CREATE INDEX idx_allowed_models_runtime_key ON allowed_models (model, service, region) WHERE expires_at IS NULL OR expires_at > now();
```

**Rationale:** MMT-ADR-0014 §1-§2. The table schema is the *only* contract between vetting and routing. The 4-axis vetting key (`model, provider_via_service, service, region`) is the table schema; the 3-param runtime key (`model, service, region`) is a *subset* the router reads. The `tier` column is the v1 fallback shape (D2: tiered list). The `criteria_metadata` jsonb stores the vetting-pipeline output for each cell.

**Population:** the vetting-research workstream (WP-4) populates the table. Engineering reads; vetting writes. **Hard split (A1) — no shared code paths.**

### Amendment summary

| # | Amendment | Affected table(s) | Pre-baseline | Cost |
|---|---|---|---|---|
| 1 | `AgeBracket` gains 'child' value | `packages/schemas/src/age.ts` | ✅ | Low (enum addition) |
| 2 | `wards` → `charges` rename + G-3 3a UNIQUE | `charges`, `guardianships` | ✅ | Low (rename + constraint) |
| 3 | `guardianships.qualification` ENUM | `guardianships` | ✅ | Low (column addition) |
| 4 | `charges.has_own_account` BOOLEAN | `charges` | ✅ | Low (column addition) |
| 5 | Payer sub field + `subscription_payers` | `subscriptions`, `subscription_payers` | ✅ | Medium (new table + ENUM) |
| 6 | Sub admin = profile mgmt (capability matrix) | (no schema change; UX only) | ✅ | Low (capability matrix) |
| 7 | `policy_rules` table | `policy_rules` (new) | ✅ | Medium (new table + ENUM) |
| 8 | `policy_cells` table + regime/method enums | `policy_cells` (new) + 3 enums | ✅ | Medium (new table + 3 enums) |
| 9 | `knowledge_assertions` table + profile jsonb columns | `knowledge_assertions` (new) + `persons` jsonb additions | ✅ | Medium (new table + 2 jsonb columns) |
| 10 | `allowed_models` table | `allowed_models` (new) | ✅ | Medium (new table + ENUM) |

**Net:** 6 schema amendments + 4 new tables + 1 capability matrix update. All pre-baseline. All low-to-medium cost. **None require data migration** (the pre-baseline baseline is create-from-empty; the amendments are additive to the migration).

## Migration ordering

The migrations land in the pre-baseline window per the dependency chain:

1. **Enum additions first** (no dependencies): `policy_kind`, `regime`, `age_method`, `residence_method`, `model_tier`. (4 of the 5 enums; the 5th, `knowledge_axis`, is in step 3.)
2. **Schema renames + column additions to existing tables** (depend on the pre-baseline tables from MMT-ADR-0011): Amendments 1, 2, 3, 4, 5, 9 (the jsonb columns on `persons`).
3. **New tables** (depend on the enums + the existing tables): Amendments 7, 8, 9 (the `knowledge_assertions` table), 10.
4. **Capability matrix update** (UX, not schema): Amendment 6.

The pre-baseline migration lands as a single atomic migration per the MMT-ADR-0012 baseline-reset posture. Post-baseline is append-only.

## Consequences

- **The pre-baseline window is used.** All amendments land in the baseline migration; post-baseline is append-only. The MMT-ADR-0012 ratifies the window; this ADR uses it.
- **The capability matrix is updated.** Guardian = consent only. Mentor = data access only. Profile mgmt = Subscription administrator. Payer = sub field. The matrix in `domain-model.md` and the `CONTEXT.md` glossary entry update lockstep.
- **Charge terminology is canonical.** The sweep report is the audit trail; the new schema columns and table names use "charge" / "guardianship" / "charge_person_id" exclusively.
- **The Payer architecture is permissive at the data layer, restrictive at the UX layer.** The data model supports 3d/3e Payer-holders; the v1 UX surfaces only 3a/3b/3c. v1.1 (or a phase-2 11+ flip) re-evaluates.
- **The `allowed_models` table is the contract between vetting and routing.** Per MMT-ADR-0014's A1 hard split, the two workstreams share the table schema and nothing else.
- **The `knowledge_assertions` table is the legal artifact.** The audit trail for COPPA actual-knowledge + GDPR Art 8 reasonable-efforts verification + ICO Children's Code best-interests audit. The history is the *legal* artifact, not just a debugging nicety.
- **The 6-persona set is expressible in the data model.** Adult self-directed learner (Persona 1) + Self-consenting minor (Persona 2) + Non-consenting minor / managed profile (Persona 3) + Subscription administrator (Persona 4) + Household mentor (Persona 5) + Non-familial mentor (Persona 6) all map to first-class data-model primitives.

## Supersession / amendment relationships

- **MMT-ADR-0011 (Phase-E data-model realization):** **AMEND.** The 8-table baseline is preserved; the 10 amendments are added.
- **MMT-ADR-0012 (one-time baseline reset):** **AMEND** (pre-baseline window is the cheap moment). The reset posture is unchanged.
- **MMT-ADR-0007 (Guardianship as edge):** **CONFIRM.** The edge shape is ratified; the data-model primitive is a `guardianships` table per MMT-ADR-0008 + this ADR's Amendment 2.
- **MMT-ADR-0008 (Guardianship global edge):** **AMEND.** The edge is global and 1:1 per charge (G-3 3a); the operational capabilities are derived at query time per MMT-ADR-0008 + this ADR's Amendment 6 (profile mgmt moves from the edge to the Subscription administrator).
- **MMT-ADR-0002 (Payer capacity is store-delegated):** **CONFIRM.** The store is the merchant of record; the Payer field is a sub field per this ADR's Amendment 5. The store-IAP identity (PRD Part IX open item) is unchanged.
- **MMT-ADR-0013 (policy-engine spine):** **CONFIRM.** The policy engine's data-model primitives (`policy_rules`, `policy_cells`, `knowledge_assertions`, `allowed_models`) are Amendments 7, 8, 9, 10 of this ADR.
- **MMT-ADR-0014 (router runtime / vetting split):** **CONFIRM.** The `allowed_models` table is Amendment 10 of this ADR; the hard-split shape is per MMT-ADR-0014.

## Alternatives considered

1. **Defer all amendments to v1.1.** Rejected — the pre-baseline window is the cheap moment. Post-baseline is append-only; the same amendments would require more migration work later.
2. **Defer Payer architecture to a separate ADR.** Rejected — the Payer re-architecture is *part of* the A-vs-B decisions; bundling keeps the canonical-doc surface small.
3. **Use a single `person` table for charges + non-charges (no separate `charges` table).** Rejected — charges have specific properties (Guardian edge, `has_own_account`, G-6 takeover branching) that don't apply to non-charges. The separate table is the cleanest model.
4. **Make `charges.has_own_account` a view, not a column.** Rejected — the column is the canonical state; the G-6 flow reads + writes it. A view is a derived artifact; the source of truth is the column.
5. **Use a JSONB `qualification` field instead of an ENUM.** Rejected — the ENUM is the type-safety boundary; the JSONB would lose it. Future jurisdictions / qualifications can be added as ENUM values without a schema migration.
6. **Skip the `knowledge_assertions` table and use only the profile's `age_knowing` / `residence_knowing` jsonb.** Rejected — the audit trail is the *legal* artifact for COPPA actual-knowledge + GDPR Art 8 reasonable-efforts verification. B1 (profile-only) loses the history.
7. **Bundle all 10 amendments into one big migration.** Rejected — the migration order respects dependencies (enums first, then renames, then new tables), but a single atomic migration per the MMT-ADR-0012 reset posture is the right shape. **One migration, 10 amendments, dependency-ordered.**

## What this ADR does *not* decide

- The implementation details of the in-product G-6 takeover flow (the UI, the email triggers, the cron schedule). Those are post-walkthrough.
- The `data-model.md` lockstep update (the migration SQL). This ADR is the *amendment scope*; the SQL lands in the data-model.md update.
- The PRD Part IX open items that are not closed by this ADR (VPC method, per-market consent-age table, US App-Store-Accountability, store-payer ↔ `payer_person_id` mapping, unified multi-role surface).
- The post-walkthrough Phase J expansion (the `CLAUDE.md` / `AGENTS.md` / `.claude/memory/` cleanup) — that's a separate workstream (WP-8).
