# Data model — identity foundation (identity domain canon)

**Layer:** L1 canon (identity domain). **Traces to:** `MMT-ADR-0011` (Phase-E data-model realization),
`MMT-ADR-0012` (one-time baseline reset), `MMT-ADR-0013`/`0014`/`0015` (policy-engine spine, router
runtime/vetting split, pre-baseline amendments), the Phase-D ADR set (`0007`–`0010`), and the sibling
identity canon (`ontology.md` invariants, `domain-model.md`, `prd.md`).

> **What this doc is.** The physical realization of the ratified domain model: the tables, columns,
> constraints, indexes, FKs, and the structural `person_retain` seam. It does not re-derive the *what*
> (the entities, edges, invariants) — that lives in the ontology. It states the *how* the schema makes
> the invariants true.
>
> **What this doc is NOT.** Not the design of the cleanup (the cut strategy lives in `MMT-ADR-0012`);
> not the Drizzle migration code or the migration sequencing (Phase F — see `_wip/identity-foundation/data-model-phase-f-notes.md`);
> not the values for the retain-tier retention columns (counsel).

---

## §1 — The cut

The target schema is stated as a **fresh create-from-empty baseline**. There is no diff language, no
"migrate column X to Y" — the tables below are *born* in the shape they have. This is the documented
reset (see `MMT-ADR-0012`); the pre-launch, zero-data window makes the reset free, and the archaeology
of a forward-only revert would be permanent.

From the baseline forward, append-only migrations are absolute. The reset is the only exception, ever.

---

## §2 — Entity table inventory

Eight tables in the active graph, plus a per-class retain-tier set. Each row: columns + types +
constraints + the "what previously existed that this supersedes" pointer.

| Table | Purpose | Replaces (legacy) | Replaces (inert pre-baseline table) | Notes |
|---|---|---|---|---|
| `person` | The human. Learning-data scope key. | `profiles` (fused with `accounts`) | — | Renamed + `birth_date` + nullable `login_id` |
| `login` | The Clerk-binding to a Person. | `accounts.clerk_user_id` (column) | — | New table; thin binding |
| `organization` | The thin container (billing + consent + quota anchor). | `accounts` (the container role) | `organizations` (inert) | `account.id → organization.id` reuse was the hidden fact |
| `membership` | Person↔Org link with role set. | (none — `family_links` is parent→child) | `memberships` (inert) | roles array; `UNIQUE (person, org)`; non-empty CHECK |
| `subscription` | Billing row, anchored to the org. | `subscriptions.account_id` FK | — | Re-anchored to `organization`; quota derived |
| `guardianship` | Global edge: consent authority + consent record. | `family_links` (parent→child) | — | Per `MMT-ADR-0008` |
| `supportership` | Opt-in supporter grant. | (the legacy `mentor` role value) | — | Per `inv 19`; never auto-conferred |
| `consent_grant` | Append-only per-purpose consent event log. | `consent_states` (stamped status) | — | Computed requirement, stored record |
| `person_retain` set | Per-class retain-tier: `consent_receipt`, `deletion_audit`, `financial_record`. | (none — currently no retain-tier) | — | The structural receipt-survival fix |

**Pre-baseline amendment tables (`MMT-ADR-0013`/`0014`/`0015`; schema in §2A):**

| Table | Purpose | Source ADR | Source-of-truth |
|---|---|---|---|
| `regimes` | Policy-engine regime lookup — **data rows, not a Postgres `ENUM`** (a regime change is an `INSERT`, not a migration). | `0013` | rows are **DB-mastered data**; §2A carries only the v1 *seed snapshot* |
| `policy_cells` | Addressing grid: age-band × `regime_id` × knowledge cell. | `0013` | structure here; cell content DB-mastered |
| `policy_rules` | Per-cell rules; `kind` = `prohibition_floor` \| `consent_edge`. | `0013` | structure here; rule content DB-mastered |
| `knowledge_assertions` | Append-only known-age × known-residence history (the legal audit artifact). | `0013` | — |
| `allowed_models` | Vetting-pipeline output; the router reads it (only contract between vetting + routing). | `0014` | structure here; vetted rows DB-mastered |
| `subscription_payers` | Primary + ≤1 secondary Payer join (Payer = sub-field, not persona). | `0015` | — |

**Modified baseline tables (pre-baseline):** `subscription` keeps `payer_person_id` (now NOT NULL, the
*primary* Payer) + the `subscription_payers` join; `guardianship` gains a `qualification` ENUM;
`person` gains `has_own_account` BOOLEAN (the birthday-crossing takeover branch); `AgeBracket` schema
gains a `'child'` value and `birthYearSchema` flips 11→13 (the v1 launch floor, ships with documented
rationale). Profile additions: `age_knowing` / `residence_knowing` jsonb (cached current knowledge
state). Full schema in §2A.

---

## §2A — Pre-baseline amendments (policy engine + router + capability split)

Realizes `MMT-ADR-0013` (engine), `MMT-ADR-0014` (router), `MMT-ADR-0015` (data-model amendments). All
land **in the baseline migration** (pre-baseline window); post-baseline is append-only. **The *why*
lives in the ADRs — this section is the schema realization only.**

> **Shape vs data (single source of truth).** This section fixes table/column *shape*. The
> policy-matrix *content* — regime rows, per-cell `policy_rules`, thresholds, country mappings, vetted
> `allowed_models` rows — is **DB-mastered data**, populated + maintained by the **PM-owned
> compliance-population workstream**, which carries the per-datapoint decision trail. Canon never holds
> a second copy of that data; only the decision trail that led to it. The seed values below are a
> **point-in-time snapshot**, ratified then DB-mastered.

> **Key conventions.** Every surrogate primary key is `uuid` (v7, app-generated via the Drizzle
> `$defaultFn` pattern per `MMT-ADR-0011`), and every foreign key into `person` / `subscription` is
> `uuid` to match those tables. The eight baseline tables and these amendment tables share one id
> convention — there is no `BIGSERIAL`/`BIGINT` surrogate key anywhere in the graph.

### 2A.1 Policy engine — `regimes`, `policy_cells`, `policy_rules`

```sql
-- Regime = DATA (rows), not a Postgres ENUM. Add/retire a regime = INSERT/UPDATE, not a migration.
CREATE TABLE regimes (
  id          UUID PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,    -- 'US_COPPA', 'EU_GDPR_16', 'UK_AADC', 'ROW', …
  description TEXT,                     -- live threshold/characteristic; DB-mastered, not frozen in canon
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- v1 SEED SNAPSHOT (seed ratified; DB is master thereafter):
--   US_COPPA · EU_GDPR_16 · EU_GDPR_15 · EU_GDPR_14 · EU_GDPR_13 · UK_AADC · ROW

CREATE TYPE policy_kind AS ENUM ('prohibition_floor', 'consent_edge');

CREATE TABLE policy_cells (
  id              UUID PRIMARY KEY,
  age_band_min    SMALLINT NOT NULL,   -- 0 = "any sub-13"
  age_band_max    SMALLINT NOT NULL,
  regime_id       UUID NOT NULL REFERENCES regimes(id),   -- FK to lookup, not an ENUM column
  knowledge_axis  TEXT NOT NULL CHECK (knowledge_axis IN ('age','residence')),
  knowledge_value JSONB NOT NULL,      -- {method, confidence}
  UNIQUE (age_band_min, age_band_max, regime_id, knowledge_axis, knowledge_value)
);

CREATE TABLE policy_rules (
  id               UUID PRIMARY KEY,
  cell_id          UUID NOT NULL REFERENCES policy_cells(id),
  kind             policy_kind NOT NULL,   -- prohibition_floor = unconditional; consent_edge = consent-gated
  rule_text        TEXT NOT NULL,
  citation_url     TEXT,
  source_instrument TEXT,                  -- 'AI Act Art 5(1)(b)', 'Gemini §20(d)', …
  effective_at     TIMESTAMPTZ NOT NULL,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cell_id, kind, source_instrument, effective_at)
);
CREATE INDEX idx_policy_rules_cell_kind ON policy_rules (cell_id, kind);
```

The two-primitive `kind` is the type-safety boundary; the eval-logic split (prohibition-floor
unconditional; consent-edge conditional on consent-state) is enforced at the engine. `rule_text` / cell
rows are **DB-mastered content**, not seeded in canon.

### 2A.2 Knowledge axes — `knowledge_assertions` + profile cache

```sql
CREATE TABLE knowledge_assertions (        -- the history (legal audit artifact: COPPA actual-knowledge, Art 8)
  id          UUID PRIMARY KEY,
  person_id   UUID NOT NULL REFERENCES person(id),
  axis        TEXT NOT NULL CHECK (axis IN ('age','residence')),
  method      TEXT NOT NULL,               -- 'self_report','parent_reported','geo_ip','billing_address',…
  confidence  DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source      TEXT NOT NULL,               -- 'signup','profile_form','session_start_check'
  asserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    UUID REFERENCES person(id),
  revoked_at  TIMESTAMPTZ                  -- non-null = superseded by a later assertion
);
CREATE INDEX idx_knowledge_assertions_person_axis ON knowledge_assertions (person_id, axis, asserted_at DESC);

ALTER TABLE person                          -- the current state (cached for per-LLM-call runtime reads)
  ADD COLUMN age_knowing       JSONB,        -- {method, confidence, last_updated}
  ADD COLUMN residence_knowing JSONB;
```

Determination methods stay small `ENUM`-style value sets (`age_method`: `self_report` ·
`parent_reported` · `verified_credential` · `age_estimation_signal`; `residence_method`: `self_report`
· `billing_address` · `geo_ip` · `verified_credential`) — **v1 set** = `self_report` +
`parent_reported` (age), `geo_ip` + `billing_address` (residence); the rest v1.1. They change by *our*
rollout decision, not regulatory cadence, so an ENUM is fine. **Default-for-unknown = most-restrictive**
is engine *behavior* when `*_knowing` is null, not a schema column.

### 2A.3 Router — `allowed_models`

```sql
CREATE TYPE model_tier AS ENUM ('primary', 'secondary', 'tertiary');

CREATE TABLE allowed_models (              -- vetting-pipeline output; the ONLY contract vetting↔routing
  id                   UUID PRIMARY KEY,
  model                TEXT NOT NULL,
  provider_via_service TEXT NOT NULL,       -- 'anthropic-via-azure' (4th vetting axis)
  service              TEXT NOT NULL,
  region               TEXT NOT NULL,
  criteria_metadata    JSONB NOT NULL,      -- ToS/ZDR/log/training/age-closure; router reads row, not metadata
  tier                 model_tier NOT NULL DEFAULT 'primary',
  effective_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at           TIMESTAMPTZ,
  UNIQUE (model, provider_via_service, service, region, effective_at)
);
CREATE INDEX idx_allowed_models_runtime_key ON allowed_models (model, service, region) WHERE expires_at IS NULL OR expires_at > now();
```

Runtime router key is **3-param** (`model · service · region`, filtered by the engine's eligibility
output); the 4th axis (`provider_via_service`) is vetting-only. Rows are **DB-mastered** (the PM-owned
compliance-population workstream); the launch provider *set* is the workstream's output, not canon.

### 2A.4 Capability split — Payer sub-field, Guardian/Supporter edges, charge terminology

```sql
-- Payer is a sub-field, not a persona: 1 primary (NOT NULL) + ≤1 secondary.
ALTER TABLE subscription ALTER COLUMN payer_person_id SET NOT NULL;  -- the PRIMARY payer (was nullable snapshot)
CREATE TABLE subscription_payers (
  subscription_id UUID NOT NULL REFERENCES subscription(id),
  person_id       UUID NOT NULL REFERENCES person(id),
  role            TEXT NOT NULL CHECK (role IN ('primary','secondary')),
  UNIQUE (subscription_id, person_id)
);
-- v1: ≤1 secondary per subscription (enforced in service code); secondary = read state + view invoices
--     + update payment method ONLY (no cancel/upgrade/plan-change); primary notified on every change.

-- Guardian = consent only (already a global edge per MMT-ADR-0008); add explicit qualification:
ALTER TABLE guardianship ADD COLUMN qualification TEXT NOT NULL DEFAULT 'biological_parent'
  CHECK (qualification IN ('biological_parent','adoptive_parent','stepparent','grandparent',
    'court_appointed_guardian','foster_parent','kinship_caregiver','sibling_with_custody','other'));

-- birthday-crossing takeover branch:
ALTER TABLE person ADD COLUMN has_own_account BOOLEAN NOT NULL DEFAULT false;
```

**Charge terminology.** Far-end terms are `charge` / `guardianship` (the `charge × purpose × org`
consent event key). Profile-management authority bundles with the **Subscription-administrator**
(`{admin}` role + Payer field) — no new column; the Guardian edge is consent-only, the Supporter edge
is data-access-only.

### 2A.5 Age bracket — `'child'` value + launch floor

`AgeBracket` schema: `'adolescent' | 'adult'` → **`'child' | 'adolescent' | 'adult'`** (additive;
required for the 13+ launch-floor logic and the v1.1 sub-13 ungating). `birthYearSchema` flips
`≤ currentYear-11` → `≤ currentYear-13` (the v1 launch floor), shipping **with a documented rationale in
the same change**. The kill-switch is backend-enforced; the "knowingly under-13" delete-path stays warm.

---

## §2B — Cutover-completion amendments (application cutover — WP-CUT-A)

> **Traces to:** `MMT-ADR-0020` (cutover-completion amendments). **Lockstep:** this
> section and the ADR move in one change-set. These are **additive** homes the
> WI-586 cutover inventory found missing in the ratified model; CUT-A adds them,
> CUT-B wires the readers, WI-586 drops legacy. No legacy object is touched.

### 2B.1 `consent_request` — the consent-REQUEST workflow table

`consent_grant` (§4.8) is the append-only consent **event log**. Legacy
`consent_states` conflated that log with a pre-grant **workflow**; that workflow
is re-homed here. **Requests are operational state; grants remain the sole audit
record. The two never merge.**

- **Key:** `(charge_person_id × purpose × organization_id × requested_basis)`
  UNIQUE. The `requested_basis` dimension preserves the legacy GDPR/COPPA
  dual-row coexistence (legacy uniqueness is `(profile_id, consent_type)`), and
  single-row recycling per basis preserves the WI-374 monotonic abuse caps
  (`resend_count`, `recipient_change_count`) 1:1.
- **States:** `pending | requested | approved | denied | expired` (1:1 image of
  the legacy `PENDING / PARENTAL_CONSENT_REQUESTED / CONSENTED / WITHDRAWN`).
- **Approval** writes a `consent_grant` row and back-links it (`consent_grant_id`).
  Approval **never** creates a guardianship edge (inv 14). Withdrawal/restore are
  grant-layer events (`consent_grant.withdrawn_at` stamp / new appended rows),
  never request states.
- **`guardian_person_id`** is nullable — in child-self-signup the responding
  parent exists only as an email; in-family it binds to the guardianship edge's
  guardian end.
- **Audit fields** (`policy_version`, `request_ip`, `user_agent` — Bug #872) and
  the token lifecycle carry over 1:1. Purpose vocabulary is finalized as
  `'platform_use'`; `requested_basis ∈ {coppa_parental_consent,
  gdpr_parental_consent}`.
- **Scope:** `consent_request` is charge-scoped — RLS policy
  `consent_request_charge_isolation` on `charge_person_id` (mirrors
  `consent_states_profile_isolation`; `person.id = profiles.id`, so the
  `app.current_profile_id` GUC carries over). Service-role consumers (public
  token-lookup, reminder-sweep) reach `consent_request` via the owner-role
  (`neondb_owner`) connection, which bypasses RLS — matching today's
  `consent_states` posture (no named service-role policy). A service-role policy
  exception is required only if/when the `app_user` role-switch cut-over
  (migration 0027 Phase 2-4) lands, at which point `consent_request` is swept
  with every other RLS table.

### 2B.2 `subscription` store-correlation / idempotency columns (additive)

`subscription` (§4.5) gains the payment-store correlation and idempotency
identifiers that dropping legacy `subscriptions` would otherwise lose:
`stripe_customer_id`, `stripe_subscription_id`, `last_stripe_event_id` (+ts),
`revenuecat_original_app_user_id`, `last_revenuecat_event_id` (+ts_ms),
`trial_ends_at`, `cancelled_at`. The BUG-116 / CR-2026-05-19-M11 webhook-race
fences re-key to `(organization_id, last_*_event_id)` partial-unique
(`organization.id = accounts.id` by reseed). Quota satellites are kept, not
replaced. The legacy `tier`/`status` pgEnums map onto the new TEXT
`plan_tier` (`free|plus|family|pro`) / `status`
(`trial|active|past_due|cancelled|expired`) with CHECKs.

### 2B.3 `person` re-homes

`person` (§4.1) gains the presentation/preference/lifecycle columns that had no
other home: `conversation_language` (NOT NULL default `'en'`, 10-language CHECK
— the conversation-language superset), `pronouns` (≤32 CHECK), `avatar_url`,
`default_app_context` (study|family CHECK), `archived_at` (operational lifecycle
marker; the consent *why* stays in the grant layer — inv 2 governs consent
decisions, which this column is **not**). Derived / re-provenanced, **not**
re-homed as columns: `birth_year_set_by` → `knowledge_assertions` provenance
(§2A.2; one `'age'` assertion per person, `method ∈ {self_report,
parent_reported}` per the §2A.2 v1 `age_method` set, provisional confidence per
OQ-9, DB-mastered thereafter; `actor_id` = the parent person when it exists in
the graph, else NULL — `parent_reported` provenance is preserved regardless);
`is_owner` → `membership.roles @> '{admin}'`; `has_premium_llm` → derived per
MMT-ADR-0014 (no application writer exists; behavior-neutral).

**`age_knowing` cache supersession (CUT-A).** The CUT-A reseed supersedes the
provisional `person.age_knowing` stub the 0109 identity reseed wrote
(`{method: 'self_attested_birth_year', source, last_updated}` — no confidence
invented). Running after 0109 at the convergence freeze, CUT-A masters the field
with the canonical §2A.2 shape `{method, confidence, last_updated}` (the
assertion-mirrored `method` + OQ-9 `confidence`); the 0109 `source` key is dropped
(provenance lives in the `knowledge_assertions.source` column). Intentional and
recorded per `MMT-ADR-0020`, not a silent overwrite.

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
   │ (charge)    │◄───┼ guardianship┼────┘   │ (supportee)  │
   └──────┬──────┘    └─────────────┘        └──────┬───────┘
          │                                        ▲
          │                                        │ supportership
          │                                  ┌─────┴────────┐
          │                                  │ person  D    │
          │                                  │ (supporter)  │
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
   subscription        ───────survives────►     financial_record  (← per-person refs;
                                                  the org's subscription row lives on)
   guardianship        ──────torn down─────►     (severed before the person drops,
   supportership       ──────torn down─────►      both directions — WI-1985)
   consent_grant       ─────migrate on drop─►   (only `consent_receipt` survives;
   all learning data    ─────────drop────►       the live `consent_grant` row is gone)
```

The key asymmetry: **the live consent record moves, the receipt stays.** `consent_grant` is the working
row; `consent_receipt` is the durable artifact. The `charge_person_id ON DELETE RESTRICT` on
`consent_grant` enforces "you can't hard-delete a person with active grants — re-home them first."

**The retain/drop split above is the *person-granularity* delete** — dropping one `person` while their
org and the *counterpart* humans on their edges live on. The person-scoped delete paths (`deletePersonV2`
and the consent-gated erasure sweeps) **tear down every `guardianship` and `supportership` edge incident
to that person** (both directions) in the same transaction, before the person row drops (WI-1985): the
edge to an erased person cannot survive, though the counterpart human does. (`subscription` still survives
a person-scoped delete — it is org-anchored.) The same teardown scales up at the second granularity: a
**whole-org / whole-account erasure** (the GDPR Art-17 path, `executeDeletionV2`), which removes the
`organization` **and every person in it**, **tears down every `guardianship` and `supportership` edge
incident to the org's persons** (both directions) in the same transaction, before the persons drop. A **cross-org** edge (a guardian/supporter who lives in another org) has only its **edge
row** removed; the out-of-org counterpart person and their org are untouched. `subscription` DB rows are **torn down** in the same erasure transaction (Step G1, WI-849 Gap 1), so a
*subscribed* org's erasure now succeeds. The Stripe/RC store-cancellation is deferred to WI-885. See
**MMT-ADR-0026** (and §6.1).

---

## §4 — Per-table rationale

For each table: the constraint it exists to satisfy (cite invariant / ADR), the validation boundary,
and the index notes. *(Migration "vs-legacy" diffs live in `_wip/identity-foundation/data-model-phase-f-notes.md`.)*

### 4.1 `person`
- **Constraint it satisfies:** `MMT-ADR-0007` (Person ≠ Login, the human is the learning-data scope
  key); `birth_date`, residence country ISO, and the denormalized `last_activity_at` (`MMT-ADR-0011`).
- **Validation:** `birth_date NOT NULL`; `residence_jurisdiction NOT NULL`; `login_id` nullable;
  `login_id` and `clerk_user_id` agree (CHECK: `(login_id IS NULL) = (clerk_user_id IS NULL)`);
  `display_name NOT NULL`.
- **Indexes:** `(birth_date)`, `(residence_jurisdiction)`, `(last_activity_at)`, plus the `login_id`-derived FK index.

### 4.2 `login`
- **Constraint it satisfies:** a thin binding, not a Clerk mirror; `MMT-ADR-0001` (Clerk owns auth, we
  own everything else).
- **Validation:** `person_id NOT NULL`; `clerk_user_id UNIQUE NOT NULL`; `email UNIQUE NOT NULL`.
- **Indexes:** `(clerk_user_id)`, `(person_id)`.

### 4.3 `organization`
- **Constraint it satisfies:** org owns billing + consent + quota (`inv 18`); `MMT-ADR-0010` (v1 single home org).
- **Validation:** `name NOT NULL`; `timezone` nullable.
- **Indexes:** none new; FK targets.

### 4.4 `membership`
- **Constraint it satisfies:** roles `{admin, learner}` array (`MMT-ADR-0007`); `inv 22` (consent-authority ≠ billing-control ≠ data-visibility).
- **Validation:** `roles` non-empty; `UNIQUE (person_id, organization_id)`; first member of an org is
  `admin` (enforced in service code on insert, not as a CHECK — the "first member" rule has no clean
  CHECK form).
- **Indexes:** `(organization_id)`; the unique constraint is the index on `(person_id, organization_id)`.

### 4.5 `subscription`
- **Constraint it satisfies:** subscription→org, not→account; `MMT-ADR-0002` (store-delegated billing; the cached read shape).
- **Validation:** `organization_id NOT NULL`; `plan_tier NOT NULL`; `status NOT NULL`; `payer_person_id`
  nullable at the column level (org-of-one with no Payer is not a v1 case, but the null is permitted for
  clean re-homing during the family-join primitive — the NOT NULL primary-Payer rule is applied in §2A.4).
- **Indexes:** `(organization_id)`.

### 4.6 `guardianship`
- **Constraint it satisfies:** `MMT-ADR-0008`, `inv 14` / `inv 19` (never auto-conferred; opt-in); the
  **no-self-guardian guard** (a required break-test — the attack surface the ratified model bans).
- **Validation:** `guardian <> charge`; `UNIQUE (guardian, charge) where revoked_at IS NULL` (partial
  unique — re-granting after revoke is a new row, preserving history). **One active Guardian per charge
  is enforced in service code on grant, not as a DB constraint**, so the edge stays structurally N:M for
  a future co-parent / shared-custody model without a baseline migration (schema-flexible,
  behavior-gated).
- **Indexes:** `(charge_person_id)`, `(guardian_person_id)`.

### 4.7 `supportership`
- **Constraint it satisfies:** `inv 19` (opt-in, never auto-conferred).
- **Validation:** `supporter <> supportee`; `UNIQUE (supporter, supportee) where revoked_at IS NULL`.
- **Indexes:** `(supportee_person_id)`, `(supporter_person_id)`.

### 4.8 `consent_grant`
- **Constraint it satisfies:** `inv 12`/`inv 27` (append-only event log; computed requirement, stored
  record; per-purpose, separate consent for the LLM-disclosure purpose; tokenised pass/fail only); a
  recorded `lawful_basis`; the direction-aware gate (retain prior value + audit fact); org-scoped from
  birth (the v1 cross-org-consent stance).
- **Validation:** `charge_person_id ON DELETE RESTRICT` *(load-bearing: active grants must be re-homed
  before a person-delete is permitted)*; `organization_id ON DELETE RESTRICT`; all other fields as
  described in `MMT-ADR-0011` §3.
- **Indexes:** `(charge_person_id, purpose, organization_id)` — the resolution hot path; `(granted_at)`;
  `(withdrawn_at) where withdrawn_at IS NOT NULL`.

### 4.9 The `person_retain` per-class set
- **Constraint it satisfies:** the consent receipt must survive deletion (the live defect the reset is
  the moment to fix structurally); the prior value + audit fact must be captured; the billing/tax
  retention duty (the `MMT-ADR-0002` Art 28 processor side).
- **Validation:** the three tables share the pattern `person_id NOT NULL`, a `retained_at` timestamp, a
  `retention_period` column (counsel fills the value), and read access is role-gated (not RLS-default).
- **Indexes:** `(person_id)` on each; `(organization_id)` on `consent_receipt` and `financial_record`.

---

## §5 — Cross-cutting concerns

### 5.1 Scope (the future RLS surface)

- **`person_id` is the scope key** for all learning data. Person-scoped reads remain an RLS-rollout
  obligation; the schema names the scope, the migration enforces it.
- **`organization_id` is the scope key** for `membership`, `subscription`, and the membership-derivable
  powers. The cross-org dimension is the future feature; the column is in place from day one.
- **`person_retain` is *not* RLS-default.** Read access is a named service role (the audit-trail must
  not be torn open to per-member reads). This is a deliberate exception, recorded so the future RLS
  rollout does not flatten it.

### 5.2 Backwards compatibility

**None.** Clean cut. Caller-facing types (Zod schemas, repo-level types) update in the same change-set;
the API surface is broken in the baseline commit and re-built in the follow-on. This is why the schema
can be stated as one clean artifact.

### 5.3 Idempotency

- **Sweep idempotency:** the per-person fan-out event's `idempotency_key = "personId+day"`; the
  framework dedupes; no run-log table.
- **Webhook idempotency** (existing, unchanged): the existing `webhook_idempotency` table is the source
  for store/billing webhooks.
- **Consent-grant uniqueness** is *not* enforced at the row level — re-granting after withdrawal is a
  new row in the event log. The "current state" is a read-time aggregate (`MAX(granted_at)` per
  `(charge × purpose × org)`); the schema permits re-grants to preserve history.

*(The migration sequencing against the legacy state lives in `_wip/identity-foundation/data-model-phase-f-notes.md`.)*

---

## §6 — Failure modes

Per the audit-survival requirement and the project's UX-resilience rule, every load-bearing path gets a
Failure-Modes row. The single most important section of this doc.

### 6.1 Deletion paths (the consent-receipt-survival fix)

The legacy state has **three delete paths that destroy the consent receipt** (a cascade delete; a
write-then-delete; no retain-tier). The new state replaces all three with one structural pattern: *the
active row drops, the receipt moves to the retain-tier, the audit row is written.*

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| **Active person → user-initiated delete** | User requests account deletion via the export-delete flow. | Standard export + confirmation + grace window. | `consent_grant` rows re-home to `consent_receipt`; `person` + `membership` + learning data drop; `deletion_audit` row written; `financial_record` rows created for tax/chargeback. |
| **Active person → parent-initiated delete (under-age)** | Guardian exercises the child-erasure right. | Age-appropriate confirm + grace window. | Same path; the `deleted_by` on the `deletion_audit` is the guardian. A forward-only receipt-preservation guard verifies the receipt survives. |
| **Active person → abandonment (dormancy window elapsed)** | Daily sweep detects `last_activity_at` older than the counsel-set threshold; grace window elapsed with no return. | Pre-deletion notice + grace; final silent cleanup. | Same re-home pattern; the `reason` on the `deletion_audit` is `abandonment`. A forward-only ratchet verifies. |
| **`consent_grant` row blocked from delete by RESTRICT** | A delete attempt on a `person` with active grants. | The delete *fails* — by design. | The re-home transaction is a single atomic step; a half-done delete is not a valid state. The RESTRICT is the schema's way of saying "you forgot to move the records first." |
| **Whole-org / whole-account erasure** (GDPR Art-17; `executeDeletionV2`) | User/guardian deletes the whole account, or the abandonment sweep erases it. | Account and all its persons erased after the grace window. | Removes the `organization` + every `person`. Before the person drops, **tears down every `guardianship` + `supportership` edge incident to the org's persons** (both directions) and **deletes the org's `subscription` row(s)** (Step G1, WI-849 Gap 1) so all RESTRICT FKs are satisfied; a **cross-org** edge drops only its edge row, never the out-of-org counterpart person. Consent grants re-home as in the per-person path. `subscription_payers` cascade off the deleted subscription automatically. Stripe/RC store-cancellation deferred to WI-885. See **MMT-ADR-0026**. |

The forward-only ratchet installs against the new baseline: it cannot regress to a
`consent_states`-shape column because that table does not exist.

> **Two deletion granularities (MMT-ADR-0026).** The "consent_grant blocked by RESTRICT" row above is the
> *person-granularity* contract — the RESTRICT FKs on `guardianship`/`supportership`/`subscription` are
> load-bearing: they force the caller to sever/re-home first. A single-person delete now **tears down the
> erased person's incident `guardianship`/`supportership` edges** in-transaction before the person drops
> (WI-1985; the counterpart human is untouched); only `subscription` survives a person-scoped delete
> (org-anchored). The *whole-org erasure* row is the second granularity: it removes the org and all its
> persons, so the incident relationship edges are torn down rather than preserved. The legacy `accounts`-row erasure that an earlier audit posited (WI-849
> Gap 2) does **not** apply on the v2-live environments — the legacy `accounts`/`profiles` tables were
> dropped by the MMT-ADR-0012 baseline reset, so there is no legacy row to leave behind on the v2 path.

### 6.2 Age-crossing protection-lowering (direction-aware gate)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| **Protection-adding edit (DOB moved earlier, residence moved into stricter regime)** | User edits their own birth date / residence. | Gate stays in current state. | No verification required (down is trusted instantly). The `consent_grant` event log records the new compute. |
| **Protection-lowering edit (DOB moved later, residence moved into laxer regime, or age crosses 13 / 16 / 18)** | Same edit, with the new value relaxing protection. | The edit *succeeds in the input layer* but the protection is *not* lowered until the verification clears: "We've received your change. To complete the relaxation, please verify [method]." | The `prior_value` + `audit_fact` are written to `consent_grant` immediately. The actual protection-lowering fires only after the assurance check; the more-protective state persists until cleared (never optimistic-grant-then-clawback). |
| **Age-crossing transition (sweep-driven)** | Daily sweep detects `birth_date` + current date crossing a threshold. | Quiet — the consent re-evaluation is internal. | The sweep writes a new `consent_grant` row with the new `lawful_basis` (or the existing one if still applicable). The previous row is *not* withdrawn — it is superseded. History is preserved. |
| **Adult clearing (GDPR Art 16 — right to rectification)** | A genuine adult (verified) claims their prior minor-recorded value is wrong. | Single-step verification. | The new value is written; the `prior_value` + `audit_fact` are preserved; the user retains the complaint route (Art 16). |

### 6.3 Moved-country (residence change)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| **Residence change** | User updates their `residence_jurisdiction`. | A grace window (length = counsel's parameter); the user is informed they need to re-affirm consents under the new jurisdiction. | The sweep tracks the residence-effective date and the grace window; on maturation, the user is moved to `suspend-to-browse-preview` (the product ruling) until they re-affirm. The new `consent_grant` row carries the new `snapshot_jurisdiction_at_grant`. |

### 6.4 The `migration-pending` interim state (per `MMT-ADR-0010`)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| **Child completing own Clerk sign-up for the family invite** | The invite-flow's child-side step. | "Setting up your account…" | The new `login` row is created; `person.login_id` is updated from null to the new id; the `guardianship` row is unchanged. The `migration-pending` flag (a nullable column on `person`, set during the join) is cleared on success. |
| **Teen joining a family (v1 family-join primitive)** | The parent-initiated invite; the teen accepts. | The double-charge disclosure + a follow-up nudge. | The `membership` for the home org is added; the teen's now-empty org-of-one is decommissioned; the `payer_person_id` is set per the join's billing option. The `migration-pending` flag is cleared on success. |
| **Mid-join failure (Clerk sign-up fails / the teen abandons)** | The transaction's halfway point. | The user sees the prior state; no half-state is exposed. | A single atomic step (or a compensating action) ensures either the full join or no change. The `migration-pending` flag's nullable nature is the rollback signal. |

### 6.5 Sweep / scheduler failures

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| **Inngest cron doesn't fire on a given day** | Platform / framework outage. | The framework retries on resume; the `personId+day` idempotency key ensures a person is processed at most once per day even after a replay. | No data loss; the next day's run continues normally. A monitor (the "sweep ran today?" check) alerts on missed days. |
| **Per-person fan-out fails (transient)** | Step error, e.g. a downstream call. | User is unaffected; the per-person step is retried by Inngest within its retry policy. | Idempotent re-run; the per-person step is bounded and uses the `personId+day` key. |
| **Consent-refresh re-evaluation produces an unexpected result** | A bug or a jurisdictional edge case. | The user is unchanged; the new `consent_grant` row is *not* written. | The new row is gated behind a "write only if state actually changed" check; the sweep logs the no-op. The prior grants continue to apply. |

---

## §7 — Requirements coverage (the schema's job, verifiable in one place)

The schema is designed *to satisfy* these requirements (the invariants from the ontology + the counsel
findings baked in); this table is the cross-check that each has a structural home. *(The full Phase-E
decisions ledger and the counsel-finding trail live in `_wip/identity-foundation/_history/data-model-provenance.md`.)*

| Requirement | Satisfied by |
|---|---|
| Consent receipt survives deletion | `person_retain.consent_receipt` + the re-home transaction at delete-time + the forward-only CI guard |
| Parent-initiated child erasure lawful (`inv 21`) | `deletion_audit.deleted_by` + the forward-only guard |
| Consent refreshed at age transitions (`inv 24`) | the unified daily sweep rewrites `consent_grant` on an age crossing |
| VPC tokenised pass/fail only | `consent_grant.assurance_token` + `assurance_method`; the receipt drops the token at re-home time |
| Direction-aware birth gate (retain prior value) | `consent_grant.prior_value` + `audit_fact`; the sweep's age-crossing logic |
| Recorded `lawful_basis` | `consent_grant.lawful_basis` column |
| Org-scoped consent (v1) | `consent_grant.organization_id` is `NOT NULL`; `controller_role` is the clean-add future |
| Moved-country grace | `person.residence_jurisdiction` + the sweep's grace-window consumer |
| Three-layer authority separation (`inv 22`) | consent on `guardianship`; billing on `subscription.payer_person_id`; visibility on `supportership` |

---

## §8 — `person_id` mistake recovery (forward-repair doctrine)

> **Amended 2026-07-18** per the operator canon-pass ruling on `WI-2055`
> (one-way-door risk drain, T2). Read against `MMT-ADR-0007`, `0008`, `0011`,
> `0015`, and `0020` — none of the five states or implies a rollback-based
> recovery path, so this section amends canon directly rather than opening a
> new ADR.
>
> **Scope.** This section governs recovery from a **`person_id` mistake** —
> data attached to the wrong `person`, a bad merge, a mis-keyed write.
> **It does not govern deletion recovery** (undoing a legitimate,
> consent-driven or lifecycle-driven person/account deletion) — that is
> `WI-2390`, tracked separately, out of scope here.

### 8.1 Legacy rollback is retired, absolutely

Rolling back to the legacy (pre-`MMT-ADR-0012` baseline-reset) schema is
**not a recovery path for `person_id` mistakes** — not conditionally, not as
a break-glass option. The legacy tables no longer exist post-reset (§1); a
"rollback" would mean resurrecting a dropped schema, which is not a smaller
or safer action than fixing forward. This retirement is absolute.

### 8.2 Recovery today: Neon PITR — staged, not final

Recovery from a `person_id` mistake is, today, **Neon point-in-time restore
(PITR) / snapshot recovery** — see
`docs/runbooks/neon-pitr-identity-recovery.md` (`WI-2056`) for the mechanics,
the restore procedure, what it does and does not recover, and the mandatory
deletion-replay step (§8.4).

This is a **staged** position, not a permanent one. Purpose-built
forward-repair primitives — merge, reparent, and alias operations scoped to
`person_id` — are tracked as `WI-2057` (Backlog). This canon **names and
links** `WI-2057`; it does not define merge/reparent/alias behavior, because
those primitives do not exist yet. Behavior for those primitives belongs in
`WI-2057`'s own design, not here.

### 8.3 Ad hoc manual `person_id` data-surgery is prohibited

Directly editing `person_id` values, or other identity-graph rows, by hand
(one-off SQL against production, a console query, a manual patch script) is
**prohibited** as a way to fix a `person_id` mistake. The sanctioned paths
are: the Neon PITR runbook (§8.2, today) and, once shipped, the `WI-2057`
primitives. Any deviation from these sanctioned paths requires an explicit
**operator escalation** before it happens — it is never a call an agent or
on-call engineer makes unilaterally.

### 8.4 Deletion-supremacy invariant

**Deletion always wins.** Any operation that recovers `person_id` mistakes —
a PITR restore today, or a `WI-2057` primitive once it ships — **must
re-apply every deletion recorded since the recovery's restore point** before
the recovery is considered complete. A recovery step is never allowed to
resurrect a person who was validly deleted after that point.

This canon states the invariant only; the mechanics that satisfy it —
the deletion-record source of truth and the replay procedure — live in the
Neon PITR runbook (`WI-2056`, §5 of
`docs/runbooks/neon-pitr-identity-recovery.md`), the `WI-2057` primitives
(when they ship), and the deletion mechanics documented for `WI-2058`
(`docs/runbooks/deletion-irreversible-boundary.md`). Canon does not carry a
second copy of that mechanism.
