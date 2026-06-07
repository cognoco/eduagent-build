# MMT-ADR-0013 — Policy-engine spine: two-primitive model, regime taxonomy, knowledge axes, router key

**Status:** Accepted · 2026-06-07 (shape ratified by architect; drafted 2026-06-06; inline enum *seeds* — regime list, determination-method set, illustrative launch set — await walkthrough R-0..R-5, then DB-mastered) · **Scope:** Identity Foundation — policy engine + data-model amendments + router wiring (pre-launch clean cut) · **Deciders:** Architect (jjoerg) + Claude · **Builds on:** MMT-ADR-0000 (decisions layer), MMT-ADR-0007 (Guardianship as edge), MMT-ADR-0008 (Guardianship global edge), MMT-ADR-0011 (data-model realization), MMT-ADR-0012 (one-time baseline reset) · **Inputs:** `_wip/identity-foundation/2026-06-XX-a-vs-b-decision-capture.md` (the 25 decisions ratified in the 2026-06-06 grilling session) + `_wip/identity-foundation/policy-engine-spine-walkthrough/` (the live walkthrough's R-0 through R-5 rulings, post-walkthrough) · **Resolves:** the policy-engine's *shape* (per the A-vs-B memo §3 + the walkthrough prep)

> **Placement.** L2 ADR; lockstep canon partners are the incubating `data-model.md` (the policy tables + the kind column + the knowledge-assertions table) + `architecture.md` (the policy-engine spine section, to be authored in Phase H). The post-walkthrough R-0 through R-5 rulings feed the implementation; this ADR is the *shape* between the decisions and the code.

## Context

The pre-launch clean cut ratified 2026-06-04 (MMT-ADR-0011/0012) describes a fresh create-from-empty baseline: 8 tables, structural `person_retain` set, append-only migrations forward. The A-vs-B conversation (2026-06-01 to 2026-06-05) layered on top: the policy engine's *shape* needs to be designed before the data-model migration lands, because the seam columns and the primitives are the load-bearing modeling decisions. The grilling session (2026-06-06) ratified 25 high-level decisions; this ADR captures the four shape decisions and their data-model implications:

- **Two-primitive model** (prohibition-floor + consent-edge) — what the engine's *output* is.
- **Regime taxonomy** (US-COPPA, EU-GDPR-13/14/15/16, UK-AADC, ROW) — what the engine keys on.
- **Knowledge axes** (known-age × known-residence, with determination method + confidence) — what the engine's *state input* is.
- **3-param runtime router key** (model · service_provider · serving_region) — what the router's runtime picker reads.

The walkthrough's R-0 through R-5 rulings ratify the inline enums (regime list, determination-method set, illustrative launch set, default-for-unknown rule); this ADR carries the *shape* + the data-model amendment scope.

## Decision

The policy engine is built around four load-bearing modeling decisions and a router split. **All four are ratified pre-baseline, in the pre-baseline window that MMT-ADR-0012 keeps open.**

### 1. Two-primitive model (A1: kind column)

The engine's *output* for any `(age × residence × knowledge)` cell is the union of two distinct primitives. The PoC at `_wip/identity-foundation/age-consent-landscape/` (8 jurisdictions × 8 activities × 2 knowledge states = 128 populated cells, per the 2026-06-05 enrichment pass) found that **7 of 8 activity categories** have cells where `consent_unlockable: false` is the binding constraint. A single primitive cannot model both.

- **Prohibition-floor** primitive — rules that bind regardless of consent. "You may not, period." Examples: AI Act Art 5(1)(b) age-vulnerability exploitation, AI Act Art 5(1)(f) emotion-inference in education, OpenAI CSAM-adjacent refusal, Anthropic "do not compromise children's safety" usage policy, Gemini §20(d) under-18 closure, COPPA actual-knowledge doctrine.
- **Consent-edge** primitive — rules unlockable by guardian/user consent. Examples: GDPR Art 8 with reasonable-efforts verification, UK Children's Code with parental gate, COPPA VPC.

**Data-model shape:** the `policy_rules` table carries a `kind` column = `prohibition_floor` | `consent_edge`. The kind column is the type-safety boundary. The boolean-flag alternative (A2) is too easy to mis-set; the two-tables alternative (A3) is DRY-violating overhead.

**Eval-logic split:** prohibition-floor = unconditional; consent-edge = conditional on the consent-state input. The engine has *two* evaluation paths; the `kind` column makes this explicit.

### 2. Regime taxonomy (regime-keyed engine; the live taxonomy is DB-mastered)

**The structural decision** (what this ADR ratifies): the engine keys on a small first-class **regime** concept, not on a 200-country list. A regime-keyed engine makes a legal/regulatory change a *data-update*, not a *schema-change*. The PoC's 10 jurisdictions map into regimes by *tag*, not by *enumeration*.

> **Source of truth (the master across all systems is the DB).** The live regime list, each regime's age threshold, its member-country mapping, and every per-cell policy value are **DB-mastered** (`policy_cells` / `policy_rules` + a `regimes` lookup table — see the amendment scope) and are populated + maintained by the **C2-B compliance-population workstream (WP-4)**, which carries the per-datapoint decision trail (full traceability). **This ADR records the *shape* and the *why* — not the live values.** Do not read the snapshot below as current truth; read the DB. Outside the DB we keep only the decision trail that led to each datapoint, never a second copy of the data.

**v1 starting taxonomy — point-in-time snapshot (seeded 2026-06; walkthrough R-2 ratifies the *seed*; the DB is master from then on):**

`US_COPPA` · `EU_GDPR_16` · `EU_GDPR_15` · `EU_GDPR_14` · `EU_GDPR_13` · `UK_AADC` · `ROW`

The thresholds, member-country mappings, and "counsel-to-verify" qualifiers that earlier drafts embedded here are **deliberately not reproduced** — they are volatile data, live in the DB (with the C2-B trail), and would rot this decision record if frozen in it. The structural commitment is: *these regime keys exist as the engine's first-class axis, and adding/retiring one is a data operation, not a migration.*

### 3. Two-axis knowledge model (B3: profile + history)

The engine's *state input* for any cell is the cross-product of (a) what we know about the user's age and (b) what we know about their residence. "Known/unknown" is **two independent axes**, not one (per the actual-knowledge trap: actual knowledge of *age* binds under COPPA; actual knowledge of *residence* binds regime-selection but not the same "actual knowledge" doctrine).

**Determination methods + confidence:**

- **Known-age** — `self_report` · `parent_reported` · `verified_credential` · `age_estimation_signal`. Confidence 0.0–1.0.
- **Known-residence** — `self_report` · `billing_address` · `geo_ip` · `verified_credential`. Confidence 0.0–1.0.

**Default for unknown = most-restrictive.** If we don't know the age, treat as sub-13 (apply the prohibition-floor rules). If we don't know the residence, treat as the strictest applicable regime. The worst case is over-restriction, not under-restriction.

**v1 determination-method set:** `self_report` + `parent_reported` (age); `geo_ip` + `billing_address` (residence). `verified_credential` and `age_estimation_signal` are v1.1 or later.

**Data-model shape (B3: profile + history):** the profile carries the *current* state (`age_knowing` jsonb, `residence_knowing` jsonb) for runtime reads; a separate `knowledge_assertions` table carries the *history* (one row per knowledge event: person_id, axis, method, confidence, timestamp). The engine reads the profile; the audit uses the assertions. B1 (profile-only) loses the audit trail; B2 (assertions-only) adds read latency per LLM call. The cost of B3 is bounded.

**Why the history is the *legal artifact*:** the COPPA "actual knowledge" doctrine is about *when* the knowledge was acquired, not just *whether*. The "knowingly under-13" delete-path (carried from the Phase-E handoff) needs the history. GDPR Art 8 "reasonable efforts" verification is the same shape — the audit trail is the evidence.

### 4. 3-param runtime router key (B1)

The router's runtime key is **3 parameters: `model · service_provider · serving_region`**. The model-provider is baked into the model (Claude is always Anthropic; GPT is always OpenAI). The vetting pipeline (offline, on-cadence) evaluates **4-axis: `model · provider_via_service · service · region`** × criteria (ToS, ZDR, log-retention, training-data, age-closure) and emits rows into the **allowed-models table** with metadata describing which criteria passed.

**The flow:** `vetting-pipeline → allowed-models-table → policy-engine-filter → router`. The router never sees vetting criteria directly. The router's job is *picking* within the filtered set; the vetting pipeline's job is *gating*.

**Why 3-param runtime, not 4+ (B1 over B2/B3):** the picker picks *within* the vetted set. The model-provider is *implicit* in the model row. Making it explicit at runtime (B2) is redundant. Adding more runtime axes (B3) is the half-migration pattern: the runtime key starts making compliance decisions that should be in the vetting pipeline.

**Fallback shape (D2: tiered list for v1; D3: scored graph deferred to v2):** per-cell pre-defined tiers (primary → secondary → tertiary) with each tier being a vetted `(model, service, region)` tuple. The router tries tier 1, falls to tier 2 on failure, etc. v1's router is *not* adaptive.

**Do-not-do lists (B1: explicit, tested):** the router does *not* evaluate ToS/ZDR/log/training/age-closure, does *not* reach outside the allowed-models table, does *not* decide whether a model is "appropriate" for an age (that's envelope-side per the gemini-minors ZDR research + the original under-13 synthesis Gap B). The vetting pipeline does *not* make per-request decisions, does *not* run at request time, does *not* decide routing for a specific user. **Each ADR (policy engine, router) carries its own do-not-do list; the lists are tested in the integration test suite.**

### 5. Engine placement + population workstream

- **C1-A: Engine inside identity-foundation.** The engine + schema + policy-tables data all live in identity-foundation. The compliance/policy domain is *consumed* by identity-foundation; the engine is *part of* identity-foundation. The policy-tables-as-data move (D-3.1) handles the cadence issue.
- **C2-B: Population as a separate workstream, orchestrated under the identity-foundation roadmap.** Same shape as the `age-consent-landscape/` PoC. The workstream lives in identity-foundation's roadmap as a *named sub-stream* — owner reports into identity-foundation PM for *sequencing*, but the *content* is the regulatory research function.

### 6. Hard split: vetting vs. routing (5-A, A1: hard split)

Vetting and routing are *different code paths*, *different schemas*, *different owners*. The router imports the table; the pipeline emits the table; they share a *contract* (the table schema) and nothing else. **A2 (soft split, same codebase) is the pattern that produced the PR 376 slip** — the new code ships, the old single-flag kill-switch stays, the two layers drift. A1 means the two workstreams cannot drift because they don't share code.

## Data-model amendment scope (companion to MMT-ADR-0011)

This ADR requires the following amendments to the MMT-ADR-0011 data-model baseline. **All amendments are pre-baseline (the pre-baseline window is the cheap moment); post-baseline is append-only.**

| Amendment | Shape | Why |
|---|---|---|
| `policy_rules` table with `kind` column | `kind` ENUM('prohibition_floor', 'consent_edge') | Two-primitive model. |
| `regimes` lookup table + `policy_cells` / `policy_rules` | regime definitions stored as **data rows** (not a Postgres `ENUM` type), so adding/retiring a regime is an `INSERT`/`UPDATE`, not a migration; the regime *values* + thresholds + country mappings are DB-mastered data | Regime-keyed engine; **data, not code** — keeps a regulatory change a data-update (consistent with §2 + §3.5). The determination-method set may stay a small `ENUM` (changes by our deliberate rollout decision, not external cadence). |
| `knowledge_assertions` table | person_id, axis ('age'|'residence'), method ENUM, confidence DECIMAL, timestamp, actor_id | The history. B3 profile + history. |
| Profile additions: `age_knowing` jsonb, `residence_knowing` jsonb | `{method, confidence, last_updated}` per axis | The current state. Engine reads this per LLM call. |
| `allowed_models` table | (model, provider_via_service, service, region, criteria_metadata jsonb) UNIQUE | Vetting pipeline output. The table schema is the *only* contract between vetting and routing. |
| `subscriptions.payer_person_id` (FK to persons, NOT NULL) + `subscription_payers` join table (sub_id, person_id, role ENUM('primary', 'secondary')) | Payer field is a sub field, not a persona. 1 primary + max 1 secondary per subscription. | Payer re-architecture per the A-vs-B memo §1.4. |
| `charges.has_own_account` BOOLEAN | G-6 explicit-takeover branching | The G-6 ruling per the A-vs-B memo §1.6. |
| `guardianships.qualification` ENUM | `biological_parent`, `adoptive_parent`, `stepparent`, `grandparent`, `court_appointed_guardian`, `foster_parent`, `kinship_caregiver`, `sibling_with_custody`, `other` | G-4 explicit qualification per the A-vs-B memo §1.6. |
| Subscription administrator as profile-mgmt authority | Bundled with Payer field + `{admin}` role | Profile mgmt = Sub admin per the A-vs-B memo §1.5. |
| `AgeBracket` schema addition: 'child' value | Currently `'adolescent' \| 'adult'`; add `'child'` | Gap G from the original under-13 synthesis; required for the 13+ launch-floor logic. |

The detailed migration SQL is out of scope for this ADR (that is the `data-model.md` lockstep). The *amendment scope* is the table above; each row maps to a data-model primitive that the MMT-ADR-0011 baseline needs.

## Supersession / amendment relationships

- **MMT-ADR-0011 (data model realization):** **AMEND.** The baseline is preserved; the amendments above are added.
- **MMT-ADR-0012 (one-time baseline reset):** **AMEND** (pre-baseline window is the cheap moment for these additions). The baseline-reset posture is unchanged.
- **MMT-ADR-0008 (Guardianship global edge):** **CONFIRM.** The edge is global; the consent-authority facet is the Guardian edge. The amendments in this ADR (G-3 3a, G-4 4b, G-6 6b) are *within* the ratified model.
- **MMT-ADR-0007 (Guardianship as edge):** **CONFIRM.** The edge shape is ratified; the data-model primitive is a `guardianships` table per MMT-ADR-0008 + this ADR's amendment scope.
- **Prior routing canon "Family standard = Gemini-only":** **SUPERSEDE.** Invalidated by the gemini-minors ZDR research (Vertex AI §20(d)-closed to minors). The supersession is in a separate router ADR (likely MMT-ADR-0014 or an extension to this one).
- **Prior GATE-1 minor-routing:** **SUPERSEDE.** Re-spec: the policy-engine output becomes the eligibility filter; the papered/ZDR endpoint is a vetted row in the allowed-models table, not a hard-coded routing rule.
- **PRD Part III (three-axis age model):** **CONFIRM.** The 13+ launch floor is the consent-capacity floor for the default knowledge state; the per-market consent-age axis (13–16) and the under-18 child-protection obligations are unchanged.

## Consequences

- **The pre-baseline window is used.** All amendments land in the baseline migration; post-baseline is append-only. The MMT-ADR-0012 ratifies the window; this ADR uses it.
- **The policy tables are data, not code.** Legal/regulatory changes (a new EDPB guideline, a new Member-State threshold, a platform ToS change) update the tables without a code deploy. The engine reads from the table.
- **The vetting-research workstream is a separate workstream (WP-4).** Inputs: the locked R-2 regime taxonomy + the locked R-5 illustrative launch set. Outputs: per-cell allowed-models table rows with vetting criteria metadata. Cadence: regulatory, not engineering. Orchestrated under the identity-foundation roadmap (per the A-vs-B memo §3.4 C2-B refinement).
- **The router never sees vetting criteria directly.** A1 hard split. The table schema is the *only* contract between vetting and routing. Schema changes require both workstreams to coordinate.
- **The knowledge-assertions table is the legal artifact.** COPPA actual-knowledge + GDPR Art 8 reasonable-efforts verification + ICO Children's Code best-interests audit all need the history. B3 is the right shape.
- **Default-for-unknown = most-restrictive.** The safety default. The worst case is over-restriction, not under-restriction.
- **The 3-param runtime key is simple.** The picker picks within the vetted set. Adding runtime axes is the half-migration pattern; rejected.
- **The fallback ladder is tiered for v1, scored for v2.** v1's router is not adaptive; tiers are pre-defined. v2 layers adaptive scoring on top when the demand emerges.

## Alternatives considered

1. **Single-primitive policy-engine model (consent-edge only).** Rejected — the PoC's 7-of-8-activity-categories finding shows the prohibition-floor is the majority, not a corner case. A single primitive either over-restricts (refuses routes that consent-edge would unlock) or under-restricts (routes users to ToS-breached providers). Two primitives are necessary.
2. **Boolean `consent_unlockable` flag instead of `kind` column.** Rejected — boolean is too easy to mis-set; the kind column is the type-safety boundary.
3. **Two separate tables for the two primitives.** Rejected — DRY-violating overhead. The kind column is sufficient.
4. **Country-keyed engine instead of regime-keyed.** Rejected — a 200-country enum is a maintenance problem and a correctness problem. A regime enum (5–8 entries) is a data-update, not a schema-change.
5. **Single 2-state knowledge model (unknown, known).** Rejected — the actual-knowledge trap is asymmetric across age and residence; collapsing them loses the structure.
6. **Profile-only knowledge state (B1).** Rejected — loses the audit trail. The history is the legal artifact, not just a debugging nicety.
7. **Assertions-only knowledge state (B2).** Rejected — adds read latency per LLM call. The engine reads the profile; the audit uses the assertions.
8. **4-param runtime router key (B2).** Rejected — model-provider is implicit in the model row. Redundant at runtime.
9. **5+ param runtime router key (B3).** Rejected — half-migration pattern. The runtime key starts making compliance decisions that should be in the vetting pipeline.
10. **Scored graph fallback ladder (D3) for v1.** Rejected for v1 — engineering cost is high for v1; v2 layers adaptive scoring on top.
11. **Soft split between vetting and routing (A2, same codebase).** Rejected — the PR 376 slip pattern. A1 hard split means the two workstreams cannot drift.
12. **Sibling workstream for the engine (C1-B).** Rejected — creates a contract surface between identity-foundation and policy; maintenance hazard for v1. The policy-tables-as-data move handles the cadence issue without the sibling split.
13. **Engineering populates the policy tables (C2-A).** Rejected — engineering ≠ regulatory research. The skills are different; the cadence is different. The PoC at `age-consent-landscape/` is already the right shape; ratifying it is the natural step.

## What this ADR does *not* decide

- The walkthrough's R-0 through R-5 inline enums (the locked regime list, the v1 determination-method set, the illustrative launch set, the default-for-unknown rule, the R-1 ruling on parent-operator COPPA). Those are the walkthrough's output, not this ADR's.
- The router ADR (likely MMT-ADR-0014 or an extension to this one). The router's *runtime* is described here (3-param key, A1 hard split, B1 do-not-do lists, D2 tiered list for v1); the *vetting pipeline's* implementation is a separate workstream (WP-4) and may warrant its own ADR.
- The VetOps details — what the ZDR verification looks like, what the audit log entries contain, what the integration test coverage is. Those are implementation details, not shape.
- The `MMT-ADR-0011` amendment scope's migration SQL. The amendment *scope* is in this ADR (the table above); the SQL is in the data-model.md lockstep.
