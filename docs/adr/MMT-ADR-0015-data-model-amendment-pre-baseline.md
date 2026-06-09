# MMT-ADR-0015 — Pre-baseline data-model amendments: Payer sub field, Sub-admin-as-profile-mgmt, charge terminology + G-3/G-4/G-6, AgeBracket 'child' value, knowledge assertions, allowed_models

**Status:** Accepted · 2026-06-07 (shape ratified by architect, incl. the regime `ENUM`→lookup-table correction; drafted 2026-06-06; policy-matrix content is DB-mastered) · **Scope:** Identity Foundation — pre-baseline data-model amendments to MMT-ADR-0011 (the 2026-06-04 baseline) · **Deciders:** Architect (jjoerg) + Claude · **Builds on:** MMT-ADR-0007 (Guardianship as edge), MMT-ADR-0008 (Guardianship global edge), MMT-ADR-0011 (data-model realization, 2026-06-04 baseline), MMT-ADR-0012 (one-time baseline reset) · **Inputs:** `_wip/identity-foundation/2026-06-XX-a-vs-b-decision-capture.md` §1 (the 6-persona set, Payer ruling, G/P/M split, G-3 3a, G-4 4b, G-6 6b, charge terminology) + MMT-ADR-0013 (policy-engine spine, the policy tables + knowledge assertions) + MMT-ADR-0014 (router, the allowed_models table) · **Resolves:** the pre-baseline amendment scope that the MMT-ADR-0012 window keeps open

> **Placement.** L2 ADR; amends MMT-ADR-0011 with the pre-baseline additions. Lockstep canon partner is `docs/canon/identity/data-model.md` (the Phase-E deliverable, to be updated lockstep when this ADR is ratified). This ADR is the *amendment scope*; the migration SQL is in the data-model.md lockstep.
>
> **Shape vs data.** This ADR fixes table/column/enum *shape*. The policy-matrix *content* — regime rows, per-cell `policy_rules`, thresholds, country mappings, vetted `allowed_models` rows — is **DB-mastered data** populated by the C2-B/WP-4 workstream (per-datapoint decision trail), never frozen in canon. Same principle as MMT-ADR-0013 §2 / MMT-ADR-0014 §6.

## Context

MMT-ADR-0012 (one-time baseline reset, ratified 2026-06-04) describes a fresh create-from-empty baseline: 8 tables, structural `person_retain` set, append-only migrations forward. The A-vs-B conversation (2026-06-01 to 2026-06-05) and the 2026-06-06 grilling session surfaced 25 decisions, several of which require data-model additions:

- **§1.4 Payer ruling** — Payer is a *sub field*, not a persona. v1 supports 3a/3b/3c holders. 1 primary + max 1 secondary per subscription.
- **§1.5 Profile-mgmt ruling** — bundled with Sub admin (C). Sub admin = profile mgmt + billing.
- **§1.6 Guardian rulings** — G-3 3a (exactly 1 per charge), G-4 4b (explicit qualification ENUM), G-6 6b (explicit takeover, branching on `person.has_own_account`).
- **§1.2 6-persona set** — Non-consenting minor (managed profile) is its own persona; the data model needs to express it.
- **§3.2 + §3.3 Engine decisions** — the policy engine needs `policy_rules` (with `kind` column), a `regimes` lookup table + `policy_cells`, the two-axis knowledge model (B3: profile + history).
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

### Amendment 2: charge terminology (`ward`→`charge`) + G-3 3a (one Guardian per charge)

**Files:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**Charge terminology sweep (2026-06-06):** the term *ward* is replaced by *charge* across all five file sets (CLAUDE.md, AGENTS.md, CONTEXT.md, .claude/memory/, ontology). The sweep report is at `_wip/identity-foundation/charge-terminology-sweep-report.md` (109 edits across 13 files; verification PASS; legal-corpus skip set is `policy-engine-spine-walkthrough/{SYNTHESIS.md, CAPTURE-LEDGER.md, BRIEFING-PACKET.md}` only). **Schema columns and table names that referenced "ward" are renamed in this amendment:**

- Legacy `family_links` is realized as the `guardianship` edge (MMT-ADR-0008). There is **no** `wards`/`charges` entity table — *charge* is the child-side **role** on that edge (the `charge_person_id` column), not a table of its own.
- `ward_person_id` column → `charge_person_id` column (per the sweep).
- `ward × purpose × org` event-log key → `charge × purpose × org` (per the sweep).

**G-3 3a — one active Guardian per charge (v1):** enforced in **service code** on grant, *not* as a DB constraint. The `guardianship` edge keeps its natural `UNIQUE (guardian_person_id, charge_person_id) WHERE revoked_at IS NULL` (blocks duplicate edges, preserves re-grant history) and stays structurally N:M — so a future co-parent / shared-custody model needs only a relaxation of the service rule, no baseline migration. This is the schema-flexible / behavior-gated posture also used for sub-13 (Path X). MMT-ADR-0008's "guardianship is a global edge" is preserved.

**Supporter N-per-charge:** the `supportership` table has no UNIQUE constraint on `supportee_person_id` (a charge can have multiple supporters). The N-per-charge is the default; v1.1 may add caps if a UX reason emerges.

**Downstream impact:** all code that reads/writes `ward_person_id` (and the legacy `family_links` rows) updates to `charge_person_id` on the `guardianship` edge. The sweep report is the audit trail.

### Amendment 3: `guardianship.qualification` ENUM (G-4 4b)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**New column:** `guardianship.qualification` ENUM NOT NULL with values:

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

**Downstream impact:** the consent-grant flow (the `consent_receipt` insert + the `guardianship` row insert) captures the qualification at insert time. The G-4 ruling is in the A-vs-B memo §1.6.

### Amendment 4: `person.has_own_account` BOOLEAN (G-6 6b)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**New column:** `person.has_own_account` BOOLEAN NOT NULL DEFAULT false.

**Rationale:** G-6 6b — explicit takeover flow branches on this column:

- **Case A: `has_own_account = false`** (typical sub-13, managed profile). Flow = "create their account" (email, password, age-confirm). On completion: `has_own_account` flips to `true`; new `{student}` membership; profile self-managed.
- **Case B: `has_own_account = true`.** Flow = "claim ownership of this account" (confirm, age-verify, link). On completion: account linked to charge; profile self-managed.

Both cases end with the Guardian edge transitioning to *historical* (read-only audit record).

**Trigger:** cron daily + session-start check on the charge's age. When the charge crosses the per-market digital-consent age, the in-product flow is triggered.

**Downstream impact:** the G-6 ruling is in the A-vs-B memo §1.6; the in-product flow is a Phase F / v1 implementation; the audit log captures every transition (create, transfer, expire, takeover).

### Amendment 5: `subscription.payer_person_id` + `subscription_payers` table (Payer re-architecture, §1.4)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**Current shape:** the Payer is a property of the family org's `payer_person_id` (per MMT-ADR-0011 + MMT-ADR-0002's "store-delegated" model).

**New shape:** the Payer is a *sub field* on the subscription, with a primary/secondary role structure:

- `subscription.payer_person_id` — FK to person, NOT NULL, UNIQUE per sub. The *primary* Payer. v1: the Subscription administrator persona (3a) or the Solo adult learner persona (3b) or an Independent teen 18+ (3c). Out of v1 scope: 3d (non-member adult) and 3e (Payer of a different org) — the data model supports them; the v1 UX doesn't surface them.
- `subscription_payers` join table — `(subscription_id, person_id, role TEXT CHECK (role IN ('primary', 'secondary')))` UNIQUE(subscription_id, person_id). v1: at most 1 secondary per subscription. The secondary's capabilities: read subscription state, view invoices, update payment method. **No cancel, no upgrade, no plan change.** Primary Payer gets a notification (in-app + email) on every secondary payment-method change.

**Capability tier (4b tight):**

- **Primary Payer:** full billing ops (read subscription state, update payment method, view invoices, cancel, upgrade, change plan).
- **Secondary Payer:** read subscription state, view invoices, update payment method. **No cancel, no upgrade, no plan change.**

**Payer-holder cases supported in v1 (3a/3b/3c):**

- **3a. Subscription administrator on the family subscription.** The typical parent case.
- **3b. Adult self-directed learner on their own subscription.** Self-pay, the org-of-one case.
- **3c. Self-consenting minor 18+.** Functionally an Adult self-directed learner.

**Out of v1 scope (3d/3e, designed-for-later):** non-member adult Payer; Payer from a different org. The data model is permissive (Payer field on subscription, no requirement that Payer be org member); the v1 UX is restrictive.

**Store-IAP identity (PRD Part IX open item):** the IAP identity (Apple/Google account owner) may differ from the Payer field. The store-payer ↔ `payer_person_id` mapping is an open legal item; this ADR does not close it.

**Downstream impact:** the Subscription administrator persona's UX (the unified multi-role surface per PRD Part IX) is the place where Payer + `{admin}` + profile-mgmt + Guardian edge + Supporter edge + `{student}` stack. The data-model changes here are the *capability* surface; the UX surface is post-walkthrough.

### Amendment 6: Subscription administrator as profile-mgmt authority (Sub admin C, §1.5)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**The capability matrix change:**

- **Profile management** moves from the Guardian edge (per MMT-ADR-0008) to the **Subscription administrator's** membership role + Payer field. The `subscription_admins` membership role (or the implicit `{admin}` role on the family org) carries the profile-mgmt authority.
- The **Guardian edge** is now *consent only* — does not imply profile mgmt. The edge is a person-to-person relationship; profile mgmt is an org-level concern.
- The **Supporter edge** is *data access only* — does not imply consent or profile mgmt. The edge is a person-to-person relationship for visibility into the charge's learning data.

**The "full parent" case** (typical v1): the Subscription administrator is the Payer + `{admin}` + holds the Guardian edge + holds a Supporter edge. Same human, four capabilities stacked. The UX surfaces the current hat (the family operator's "manage my family" surface vs. the household supporter/helper's "help my kid with homework" surface).

**The split cases (off-ICP for v1, designed-for-later):** a grandparent who is the Payer but not the Guardian; a court-appointed guardian who is the Guardian but not the Payer. The data model supports the splits; the v1 UX doesn't surface them.

**Downstream impact:** the capability matrix in `domain-model.md` updates accordingly. The `subscription.profile_mgmt_authority` is implicit in the Subscription administrator's `{admin}` role + Payer field; no new column is needed. The audit log captures who *initiated* a profile change (the Subscription administrator) and who *consented* (the Guardian, if a charge is affected).

### Amendment 7: `policy_rules` table (MMT-ADR-0013 §1 — two-primitive model)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**New table:** `policy_rules`:

```sql
CREATE TYPE policy_kind AS ENUM ('prohibition_floor', 'consent_edge');

CREATE TABLE policy_rules (
  id UUID PRIMARY KEY,
  cell_id UUID NOT NULL REFERENCES policy_cells(id),
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

### Amendment 8: `regimes` lookup table + `policy_cells` (MMT-ADR-0013 §2 — regime taxonomy)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**Source-of-truth note (corrected 2026-06-07 per the DB-is-master principle; architect ratifies):** the **regime is a data lookup table, not a Postgres `ENUM` type**. An `ENUM` would make adding/retiring a regime an `ALTER TYPE` migration — contradicting MMT-ADR-0013 §2's "regime change = data-update, not schema-change." Regimes, their thresholds, and country mappings are **DB-mastered rows** populated by the C2-B/WP-4 workstream. The determination-method sets *stay* `ENUM`s (they change by our deliberate rollout decision, not external regulatory cadence).

**New types + tables:**

```sql
-- Regime = DATA (rows), not a Postgres ENUM type. Add/retire a regime = INSERT/UPDATE, not a migration.
CREATE TABLE regimes (
  id          UUID PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,   -- e.g. 'US_COPPA', 'EU_GDPR_16', 'UK_AADC', 'ROW'
  description TEXT,                    -- the live threshold / characteristic; DB-mastered, not frozen in canon
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- v1 seed rows (snapshot; walkthrough R-2 ratifies the seed, DB is master thereafter):
--   US_COPPA · EU_GDPR_16 · EU_GDPR_15 · EU_GDPR_14 · EU_GDPR_13 · UK_AADC · ROW

-- Determination methods stay ENUMs (our-decision cadence, small + stable):
CREATE TYPE age_method AS ENUM (
  'self_report', 'parent_reported', 'verified_credential', 'age_estimation_signal'
);
CREATE TYPE residence_method AS ENUM (
  'self_report', 'billing_address', 'geo_ip', 'verified_credential'
);

CREATE TABLE policy_cells (
  id UUID PRIMARY KEY,
  age_band_min SMALLINT NOT NULL,  -- 0 for "any sub-13", 13 for "13–15", etc.
  age_band_max SMALLINT NOT NULL,
  regime_id UUID NOT NULL REFERENCES regimes(id),  -- FK to the lookup table, not an ENUM column
  knowledge_axis TEXT NOT NULL CHECK (knowledge_axis IN ('age', 'residence')),
  knowledge_value JSONB NOT NULL,  -- {method, confidence}
  UNIQUE (age_band_min, age_band_max, regime_id, knowledge_axis, knowledge_value)
);
```

**Rationale:** the regime taxonomy (MMT-ADR-0013 §2). The regime *seed* is the A-vs-B memo §3.2 candidate ratified by walkthrough R-2; the live list is DB-mastered data thereafter. The age-band + regime + knowledge-cell is the *addressing* scheme; `policy_rules` joins on `cell_id` to apply.

**v1 determination-method set:** `age_method` is `self_report` or `parent_reported`; `residence_method` is `self_report` (or `geo_ip` or `billing_address`). `verified_credential` and `age_estimation_signal` are v1.1 or later.

### Amendment 9: `knowledge_assertions` table (MMT-ADR-0013 §3 — two-axis knowledge)

**File:** `data-model.md` (the spec); physical schema per Drizzle conventions.

**New table:** `knowledge_assertions`:

```sql
CREATE TABLE knowledge_assertions (
  id UUID PRIMARY KEY,
  person_id UUID NOT NULL REFERENCES person(id),
  axis TEXT NOT NULL CHECK (axis IN ('age', 'residence')),
  method TEXT NOT NULL,  -- ENUM name (e.g., 'self_report', 'geo_ip')
  confidence DECIMAL(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL,  -- e.g., 'profile_form', 'session_start_check', 'signup'
  asserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID REFERENCES person(id),  -- who triggered the assertion
  revoked_at TIMESTAMPTZ  -- non-null = superseded by a later assertion
);

CREATE INDEX idx_knowledge_assertions_person_axis ON knowledge_assertions (person_id, axis, asserted_at DESC);
```

**Profile additions (current state, cached for runtime reads):**

```sql
ALTER TABLE person
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
  id UUID PRIMARY KEY,
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
| 2 | `ward`→`charge` terminology + G-3 3a (service-enforced) | `guardianship` | ✅ | Low (rename + service rule) |
| 3 | `guardianship.qualification` ENUM | `guardianship` | ✅ | Low (column addition) |
| 4 | `person.has_own_account` BOOLEAN | `person` | ✅ | Low (column addition) |
| 5 | Payer sub field + `subscription_payers` | `subscriptions`, `subscription_payers` | ✅ | Medium (new table + ENUM) |
| 6 | Sub admin = profile mgmt (capability matrix) | (no schema change; UX only) | ✅ | Low (capability matrix) |
| 7 | `policy_rules` table | `policy_rules` (new) | ✅ | Medium (new table + ENUM) |
| 8 | `policy_cells` table + regime/method enums | `policy_cells` (new) + 3 enums | ✅ | Medium (new table + 3 enums) |
| 9 | `knowledge_assertions` table + profile jsonb columns | `knowledge_assertions` (new) + `person` jsonb additions | ✅ | Medium (new table + 2 jsonb columns) |
| 10 | `allowed_models` table | `allowed_models` (new) | ✅ | Medium (new table + ENUM) |

**Net:** 6 schema amendments + 4 new tables + 1 capability matrix update. All pre-baseline. All low-to-medium cost. **None require data migration** (the pre-baseline baseline is create-from-empty; the amendments are additive to the migration).

## Migration ordering

The migrations land in the pre-baseline window per the dependency chain:

1. **Enum + lookup-table additions first** (no dependencies): the `policy_kind`, `age_method`, `residence_method`, `model_tier` enums and the `regimes` lookup table. (`knowledge_axis` / `axis` are `TEXT` + `CHECK`, not enums.)
2. **Schema renames + column additions to existing tables** (depend on the pre-baseline tables from MMT-ADR-0011): Amendments 1, 2, 3, 4, 5, 9 (the jsonb columns on `person`).
3. **New tables** (depend on the enums + the existing tables): Amendments 7, 8, 9 (the `knowledge_assertions` table), 10.
4. **Capability matrix update** (UX, not schema): Amendment 6.

The pre-baseline migration lands as a single atomic migration per the MMT-ADR-0012 baseline-reset posture. Post-baseline is append-only.

## Consequences

- **The pre-baseline window is used.** All amendments land in the baseline migration; post-baseline is append-only. The MMT-ADR-0012 ratifies the window; this ADR uses it.
- **The capability matrix is updated.** Guardian = consent only. Supporter = data access only. Profile mgmt = Subscription administrator. Payer = sub field. The matrix in `domain-model.md` and the `CONTEXT.md` glossary entry update lockstep.
- **Charge terminology is canonical.** The sweep report is the audit trail; the new schema columns and table names use "charge" / "guardianship" / "charge_person_id" exclusively.
- **The Payer architecture is permissive at the data layer, restrictive at the UX layer.** The data model supports 3d/3e Payer-holders; the v1 UX surfaces only 3a/3b/3c. v1.1 (or a phase-2 11+ flip) re-evaluates.
- **The `allowed_models` table is the contract between vetting and routing.** Per MMT-ADR-0014's A1 hard split, the two workstreams share the table schema and nothing else.
- **The `knowledge_assertions` table is the legal artifact.** The audit trail for COPPA actual-knowledge + GDPR Art 8 reasonable-efforts verification + ICO Children's Code best-interests audit. The history is the *legal* artifact, not just a debugging nicety.
- **The 6-persona set is expressible in the data model.** Adult self-directed learner (Persona 1) + Self-consenting minor (Persona 2) + Non-consenting minor / managed profile (Persona 3) + Subscription administrator (Persona 4) + Household supporter (Persona 5) + Non-familial supporter (Persona 6) all map to first-class data-model primitives.

## Supersession / amendment relationships

- **MMT-ADR-0011 (Phase-E data-model realization):** **AMEND.** The 8-table baseline is preserved; the 10 amendments are added.
- **MMT-ADR-0012 (one-time baseline reset):** **AMEND** (pre-baseline window is the cheap moment). The reset posture is unchanged.
- **MMT-ADR-0007 (Guardianship as edge):** **CONFIRM.** The edge shape is ratified; the data-model primitive is a `guardianship` table per MMT-ADR-0008 + this ADR's Amendment 2.
- **MMT-ADR-0008 (Guardianship global edge):** **AMEND.** The edge is global and stays structurally N:M; v1 enforces one active Guardian per charge (G-3 3a) in service code, not a DB constraint; the operational capabilities are derived at query time per MMT-ADR-0008 + this ADR's Amendment 6 (profile mgmt moves from the edge to the Subscription administrator).
- **MMT-ADR-0002 (Payer capacity is store-delegated):** **CONFIRM.** The store is the merchant of record; the Payer field is a sub field per this ADR's Amendment 5. The store-IAP identity (PRD Part IX open item) is unchanged.
- **MMT-ADR-0013 (policy-engine spine):** **CONFIRM.** The policy engine's data-model primitives (`policy_rules`, `policy_cells`, `knowledge_assertions`, `allowed_models`) are Amendments 7, 8, 9, 10 of this ADR.
- **MMT-ADR-0014 (router runtime / vetting split):** **CONFIRM.** The `allowed_models` table is Amendment 10 of this ADR; the hard-split shape is per MMT-ADR-0014.

## Alternatives considered

1. **Defer all amendments to v1.1.** Rejected — the pre-baseline window is the cheap moment. Post-baseline is append-only; the same amendments would require more migration work later.
2. **Defer Payer architecture to a separate ADR.** Rejected — the Payer re-architecture is *part of* the A-vs-B decisions; bundling keeps the canonical-doc surface small.
3. **A separate `charges` entity table (distinct from `person`).** Rejected — "charge" is a *role* a person plays on the `guardianship` edge, not a distinct entity. A person can be a charge in one relationship and not in another, and `has_own_account` / the G-6 takeover branch are properties of the **person**, not of a charge-specific table. Modeling charge as the `charge_person_id` role keeps the graph at the eight ratified entity tables (MMT-ADR-0011).
4. **Make `person.has_own_account` a view, not a column.** Rejected — the column is the canonical state; the G-6 flow reads + writes it. A view is a derived artifact; the source of truth is the column.
5. **Use a JSONB `qualification` field instead of an ENUM.** Rejected — the ENUM is the type-safety boundary; the JSONB would lose it. Future jurisdictions / qualifications can be added as ENUM values without a schema migration.
6. **Skip the `knowledge_assertions` table and use only the profile's `age_knowing` / `residence_knowing` jsonb.** Rejected — the audit trail is the *legal* artifact for COPPA actual-knowledge + GDPR Art 8 reasonable-efforts verification. B1 (profile-only) loses the history.
7. **Bundle all 10 amendments into one big migration.** Rejected — the migration order respects dependencies (enums first, then renames, then new tables), but a single atomic migration per the MMT-ADR-0012 reset posture is the right shape. **One migration, 10 amendments, dependency-ordered.**

## What this ADR does *not* decide

- The implementation details of the in-product G-6 takeover flow (the UI, the email triggers, the cron schedule). Those are post-walkthrough.
- The `data-model.md` lockstep update (the migration SQL). This ADR is the *amendment scope*; the SQL lands in the data-model.md update.
- The PRD Part IX open items that are not closed by this ADR (VPC method, per-market consent-age table, US App-Store-Accountability, store-payer ↔ `payer_person_id` mapping, unified multi-role surface).
- The post-walkthrough Phase J expansion (the `CLAUDE.md` / `AGENTS.md` / `.claude/memory/` cleanup) — that's a separate workstream (WP-8).
