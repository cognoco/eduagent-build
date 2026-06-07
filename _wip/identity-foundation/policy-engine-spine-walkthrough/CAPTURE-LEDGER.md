# Capture Ledger — Policy-Engine Spine Walkthrough

> **Live-walkthrough capture document.** Populated in real time during the walkthrough session. The structure is pre-populated; the rulings are filled in by the facilitator (architect) as the room decides.
>
> **Capture convention:** verbatim PM/counsel language where possible; 1–3 sentence rationale; dissent / caveats noted explicitly; PM and counsel sign off at end of session.
>
> **What changed from the prior under-13-floor ledger:** the rulings Q18 / Q19a / Q19b are superseded by R-0 / R-1 / R-2 / R-3 / R-4 / R-5. The `Verifications completed in the room` section now tracks the R-1 parent-operator verification and the carry-over Q1 (ICO Annex B) homework from the original under-13 synthesis. The `Defer-to-follow-up items` section still carries the original 10 Bucket-C items from the under-13 synthesis (these are now D-1–D-10 in this ledger's namespace).

---

## Walkthrough metadata

```yaml
walkthrough: policy-engine-spine
date: [YYYY-MM-DD]
facilitator: [architect name]
pm: [PM name]
counsel: [counsel name, firm, jurisdiction if multi-jurisdictional]
duration: [90–120 min]
briefing_packet: BRIEFING-PACKET.md
legal_research_backbone: SYNTHESIS.md
sources: SOURCES.md
related_handoff: _handoffs/2026-06-XX-policy-engine-spine-ruling.md (to be authored post-session)
```

---

## Rulings

### Ruling: R-0 — Two-primitive model

> Is the prohibition-floor + consent-edge framing the right spine, and is `MMT-ADR-0013` the right ADR to draft it under? This ruling gates R-2, R-4, and R-5.

```yaml
ruling: LOCKED | REFINEMENT | REJECTED | SPLIT | DEFER
primitive_pair:
  prohibition_floor: ""  # one-sentence definition, locked or refined
  consent_edge: ""  # one-sentence definition, locked or refined
ruling_text_verbatim: ""
rationale: ""
dissent_or_caveats: ""
captured_by: ""
captured_at: ""
pm_signoff: ""
```

**Implications of the ruling:**

- **LOCKED** → `MMT-ADR-0013` scope includes the prohibition-floor primitive; `MMT-ADR-0011` amendment scope is the data-model change to add the primitive. The pre-baseline window is used.
- **REFINEMENT** → capture the refinement; re-run R-2/R-4/R-5 with the refined primitive pair. Likely defer R-4/R-5 to a follow-up.
- **REJECTED** → the whole spine reshapes. Defer the walkthrough; re-convene with a different primitive proposal.
- **SPLIT** → per-primitive ruling; record the split explicitly. R-2/R-4/R-5 may need to wait until the split is resolved.
- **DEFER** → mark as "to be confirmed in writing within 48 hours"; proceed to R-2/R-3 with the open status flagged. R-4/R-5 should not be ruled until R-0 is settled.

---

### Ruling: R-1 — Sub-13-via-parent-operator COPPA ruling (counsel's ruling)

> Does serving sub-13 children via a parent-owned account, with no child login at all, trip COPPA "directed to children" or "actual knowledge"?

```yaml
ruling: COPPA_APPLIES | COPPA_DOES_NOT_APPLY | UNCLEAR_WITH_DEFENSIBLE_POSTURE
ruling_text_verbatim: ""  # verbatim counsel language
rationale: ""  # 1-3 sentences
dissent_or_caveats: ""
defensible_posture_if_unclear: ""  # if UNCLEAR_WITH_DEFENSIBLE_POSTURE, what is the posture
captured_by: ""
captured_at: ""
pm_signoff: ""
counsel_signoff: ""  # counsel signoff mandatory
```

**Implications of the ruling:**

- **COPPA_APPLIES** → the `US_COPPA` regime-cell in the R-2 regime-taxonomy is "build the full VPC path or do not serve." Sub-13 v2 path is preserved as launch-blocked. The parent-operator path is closed.
- **COPPA_DOES_NOT_APPLY** → the parent-operator path is a US-COPPA-safe route. The `US_COPPA` regime-cell in R-2 needs a sub-cell encoding the parent-operator path. Sub-13 v2 path is open. The regime-taxonomy enum gets a wider US sub-13 cell.
- **UNCLEAR_WITH_DEFENSIBLE_POSTURE** → the policy engine encodes the defensible posture as the default (e.g., "do not collect child's age at the controller layer; treat parent-supplied profile data as parent-data, not child-data"). Sub-13 v2 path is open with the posture as the gate. The regime-taxonomy enum encodes the posture; the policy-engine output is gated by it.

---

### Ruling: R-2 — Regime taxonomy

> What is the locked first-class regime enum the policy engine keys on?

```yaml
ruling: LOCKED | REFINEMENT | REJECTED | SPLIT | DEFER
regime_enum:
  - ""  # one entry per locked regime
  - ""
  - ""
  - ""
  - ""
  - ""
  - ""
  - ""
ruling_text_verbatim: ""
rationale: ""
us_sub13_carveout_cell: ""  # if R-1 was COPPA_DOES_NOT_APPLY or UNCLEAR_WITH_DEFENSIBLE_POSTURE, what is the US sub-13 carve-out cell
dissent_or_caveats: ""
captured_by: ""
captured_at: ""
pm_signoff: ""
```

**The candidate enum (proposed; walkthrough ratifies or refines):**

- `US_COPPA` — under-13 VPC required; actual-knowledge doctrine
- `EU_GDPR_16` — digital-consent age 16 (DE, NL, IE, SK, most MSes)
- `EU_GDPR_15` — digital-consent age 15 (FR)
- `EU_GDPR_14` — digital-consent age 14 (ES, CY, BG; PT widely reported as 13, counsel to verify)
- `EU_GDPR_13` — digital-consent age 13 (SE, DK, FI; plus NO via EEA, UK via retained UK GDPR)
- `UK_AADC` — UK Children's Code + UK GDPR
- `ROW` — rest of world (with optional sub-regime metadata for known strict jurisdictions)

The walkthrough can drop, add, or rename regimes. Per-Member-State detail is research-input, not a regime.

---

### Ruling: R-3 — Knowledge axes

> Are the two axes (known-age × known-residence) the right state input, and is the v1 determination-method set correct?

```yaml
ruling: LOCKED | REFINEMENT | REJECTED | SPLIT | DEFER
axes_model:
  known_age:
    determination_methods: []  # e.g., ['self_report', 'parent_reported']
    confidence: 0.0_to_1.0
  known_residence:
    determination_methods: []  # e.g., ['self_report', 'billing_address', 'geo_ip']
    confidence: 0.0_to_1.0
v1_determination_method_set:
  age:
    - ""  # one entry per v1 method
    - ""
  residence:
    - ""
    - ""
default_for_unknown: MOST_RESTRICTIVE  # the safety/legal default
ruling_text_verbatim: ""
rationale: ""
dissent_or_caveats: ""
captured_by: ""
captured_at: ""
pm_signoff: ""
```

**Implications of the ruling:**

- **LOCKED** → the v1 determination-method set is the schema scope; the default-for-unknown rule is the safety default. The post-walkthrough `MMT-ADR-0013` drafting has the knowledge-axis input.
- **REFINEMENT** → capture the refinement (likely an addition to the determination-method set or a change to the default-for-unknown rule). Re-run R-4 with the refined knowledge axes.
- **REJECTED / SPLIT / DEFER** → analogous to R-0's fallbacks.

---

### Ruling: R-4 — Router key

> Is the 3-param runtime key (`model · service_provider · serving_region`) and the 4-param vetting axis (`model · provider_via_service · service · region`) the right split?

```yaml
ruling: LOCKED | REFINEMENT | REJECTED | SPLIT | DEFER
runtime_key: []  # 3-param: ['model', 'service_provider', 'serving_region']
vetting_axis: []  # 4-param: ['model', 'provider_via_service', 'service', 'region']
flow: VETTING_PIPELINE -> ALLOWED_MODELS_TABLE -> POLICY_ENGINE_FILTER -> ROUTER
ruling_text_verbatim: ""
rationale: ""
dissent_or_caveats: ""
captured_by: ""
captured_at: ""
pm_signoff: ""
```

**Implications of the ruling:**

- **LOCKED** → the router ADR drafting has the runtime-key input. The allowed-models-table is the data surface; the vetting pipeline is the offline workstream. Cleanly separable, separately testable, separately auditable.
- **REFINEMENT** → likely a re-define of the runtime key (e.g., adding a tenant axis for some special case). Capture the refinement.
- **REJECTED / SPLIT / DEFER** → analogous to R-0's fallbacks.

---

### Ruling: R-5 — Launch set (shape + process, not names)

> What slot *structure* is locked, is the vetting-research workstream named as the producer of the ratified provider set, and is Workspace-for-Education confirmed out of scope as a route?
>
> **Note (memo §4.3):** the launch provider set is **illustrative, not ratified** in the room — the ratified output is the vetting-research workstream's table. R-5 locks the *shape* (the slots) and the *process* (the workstream), not the four named providers.

```yaml
ruling: LOCKED | REFINEMENT | REJECTED | SPLIT | DEFER
slot_structure:  # the LOCKED architecture shape (the real ruling)
  - "US_primary_route"
  - "EU_primary_route"
  - "cost_effective_non_us_alternative"
launch_provider_set:  # ILLUSTRATIVE example only — NOT ratified here.
  status: illustrative_not_ratified  # ratified set is the vetting workstream's output table
  ratified_output_owner: "vetting-research workstream (WP-4)"
  example_providers:  # how the slots may fill; the workstream decides the actual picks
    - "anthropic_claude"      # illustrates US_primary_route
    - "openai"                # illustrates US_primary_route (candidate)
    - "mistral"               # illustrates EU_primary_route
    - "deepseek_via_papered_service"  # illustrates cost_effective_non_us_alternative
out_of_scope_routes:
  - ""  # e.g., 'workspace_for_education_gemini' (kept as a policy-table data point, not a route)
vetting_research_workstream:
  named: true | false
  owner: ""  # PM/architect/separate
  poc_shape: "same as age-consent-landscape PoC (data.json + index.html)"
  inputs: []  # e.g., ['locked slot structure (R-5)', 'illustrative provider set (R-5)', 'locked regime taxonomy (R-2)']
  outputs: "per-cell allowed-models table rows with vetting criteria metadata — this table IS the ratified provider set"
ruling_text_verbatim: ""
rationale: ""
dissent_or_caveats: ""
captured_by: ""
captured_at: ""
pm_signoff: ""
```

**Implications of the ruling:**

- **LOCKED** → the slot structure (US-primary + EU-primary + cost-effective non-US alt) and the vetting-pipeline-owns-the-picks principle are the engineering intent. The four named providers are illustrative inputs, not a ratified list. The vetting-research workstream is named as a parallel PoC and as the producer of the ratified provider set. The post-walkthrough `MMT-ADR-0013` drafting has the slot-structure scope; the workstream has the provider-set + vetting-verdict scope.
- **REFINEMENT** → likely a change to the slot structure (e.g., adding a fourth slot) or a refinement to the out-of-scope list. Capture the refinement. (Adding/removing a *named provider* is not an R-5 refinement — that is the vetting workstream's call.)
- **REJECTED / SPLIT / DEFER** → analogous to R-0's fallbacks.

---

## Verifications completed in the room

Counsel re-verifications of Bucket-B questions from the original under-13 synthesis (`SYNTHESIS.md` §6 Bucket B) and the R-1 underpinning. One row per verification.

```yaml
- question_id: V-1
  topic: "R-1 underpinning — COPPA 'directed to children' and 'actual knowledge' doctrine applicability to the parent-operator pattern"
  ruling_in_room: ""  # captured in R-1 above
  effect_on_r1: ""
  captured_by: ""
  captured_at: ""

- question_id: V-2
  topic: "ICO Annex B exact wording (carry-over from under-13 synthesis Q1)"
  ruling_in_room: ""
  effect_on_r2: ""  # may affect the UK_AADC regime-cell
  captured_by: ""
  captured_at: ""

- question_id: V-3
  topic: "California AADC (AB-2273) post-NetChoice v. Bonta (carry-over from under-13 synthesis Q4)"
  ruling_in_room: ""
  effect_on_r2: ""  # may affect the US_COPPA regime-cell
  captured_by: ""
  captured_at: ""

- question_id: V-4
  topic: "EDPB Guidelines 05/2020 §3 paragraph-level reading (carry-over from under-13 synthesis Q6)"
  ruling_in_room: ""
  effect_on_r2: ""  # may affect the EU_GDPR_X regime-cells
  captured_by: ""
  captured_at: ""

- question_id: V-5
  topic: "NetChoice-style Netflix-profile analogue — any regulator blessing? (carry-over from under-13 synthesis Q11)"
  ruling_in_room: ""
  effect_on_r1: ""  # directly relevant to the parent-operator R-1 ruling
  captured_by: ""
  captured_at: ""
```

---

## Homework follow-ups (counsel to take away)

To be completed by counsel within 1–2 weeks of the walkthrough. One row per homework item.

```yaml
- homework_id: HW-1
  question: ""  # typically a carry-over from V-1 through V-5
  owner: ""
  due: ""
  status: open
- homework_id: HW-2
  question: ""
  owner: ""
  due: ""
  status: open
```

---

## Defer-to-follow-up items (Bucket C, not load-bearing for v1)

Captured for the record; not for this walkthrough's resolution. Carry-over from the original under-13 synthesis (`SYNTHESIS.md` §6 Bucket C), preserved for traceability.

```yaml
- defer_id: D-1
  question: "EU AI Act Art 5(1)(b) 'exploitation of vulnerabilities due to age' as applied to an LLM tutor"
  expected_resolution_window: "2026–2027 enforcement cases"
  status: open
- defer_id: D-2
  question: "AI Act Art 5(1)(f) scope — is a consumer-facing AI tutor within 'educational institutions'?"
  expected_resolution_window: "Commission guidance"
  status: open
- defer_id: D-3
  question: "Datatilsynet position on AI tutors for minors"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-4
  question: "Apple's 2024–2025 policy on LLM products aimed at minors"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-5
  question: "Google's enforcement of 2024 Generative AI policy in the under-13 context"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-6
  question: "IARC self-classification vs. COPPA 'directed to children' status — turning case?"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-7
  question: "DSA Art 28 enforcement against app stores"
  expected_resolution_window: "Commission investigation"
  status: open
- defer_id: D-8
  question: "Most recent regulator statement on platform-based age signals"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-9
  question: "Verbatim OpenAI Usage Policies for developers"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-10
  question: "Verbatim Anthropic 'products serving minors' Help Center article"
  expected_resolution_window: "TBD"
  status: open
```

---

## Downstream work-package list (Phase F closure + Phase G entry)

> **WP namespace is canonical per the A-vs-B decision-capture memo §7.** The WP-1..WP-10 numbering below matches the memo exactly; do not re-number locally.

To be filled in post-walkthrough, once the rulings are firm.

```yaml
- wp_id: WP-1
  work_package: "MMT-ADR-0013 (policy-engine spine ADR) draft"
  inputs: ["R-0 ruling (two-primitive model)", "R-2 ruling (regime enum)", "R-3 ruling (knowledge axes)"]
  owner: "Claude"
  reviewer: "architect"
  due: ""
  blocked_by: []
  status: open
- wp_id: WP-2
  work_package: "MMT-ADR-0011 amendment scope — data-model change to add the prohibition-floor primitive + age × residence × knowledge × consent-state seam columns"
  inputs: ["WP-1 output"]
  owner: "Claude"
  reviewer: "architect"
  due: ""
  blocked_by: ["WP-1"]
  status: open
- wp_id: WP-3
  work_package: "Router ADR draft — 3-param runtime key, 4-param vetting axis, flow lock"
  inputs: ["R-4 ruling", "WP-1 output (eligibility set shape)"]
  owner: "Claude"
  reviewer: "architect"
  due: ""
  blocked_by: ["WP-1"]
  status: open
- wp_id: WP-4
  work_package: "Vetting-research workstream PoC — same shape as age-consent-landscape/"
  inputs: ["R-2 ruling (regime enum)", "R-5 ruling (launch provider set)"]
  owner: "separate (TBD)"
  reviewer: "architect"
  due: ""
  blocked_by: []
  status: open
- wp_id: WP-5
  work_package: "ROADMAP.md update — Phase F.1 closure, Phase F → Phase G transition, the inline enums (regime list, determination-method set, launch set) and the post-walkthrough deliverables list"
  inputs: ["R-0 through R-5 rulings"]
  owner: "Claude"
  reviewer: "PM"
  due: ""
  blocked_by: []
  status: open
- wp_id: WP-6
  work_package: "Memory note in .claude/memory/ — durable record of the rulings, the inline enums, and a link to the handoff"
  inputs: ["R-0 through R-5 rulings"]
  owner: "Claude"
  reviewer: "PM"
  due: ""
  blocked_by: []
  status: open
- wp_id: WP-7
  work_package: "Handoff doc — _handoffs/2026-06-XX-policy-engine-spine-ruling.md"
  inputs: ["CAPTURE-LEDGER.md (this file)"]
  owner: "Claude"
  reviewer: "PM"
  due: ""
  blocked_by: []
  status: open
- wp_id: WP-8
  work_package: "Phase J cleanup — CLAUDE.md / AGENTS.md / .claude/memory/ sweep, applying the A-vs-B decisions as the source of truth. Includes the charge-terminology sweep, the 6-persona update, the Payer/Guardian/Sub-admin/Mentor split, the Path X framing, the 3-param/4-param router split, the two-primitive model, the engine-inside-identity-foundation decision, and the routing-canon supersessions. MoSCoW: MUST = memory-only or ≥2-source drifting; SHOULD = single canon spot needing extraction; SKIP/tombstone = superseded."
  inputs: ["A-vs-B decision-capture memo (after ratification)", "R-0 through R-5 rulings"]
  owner: "Claude"
  reviewer: "PM"
  due: ""
  blocked_by: []
  status: open
```

**If R-1 was COPPA_DOES_NOT_APPLY or UNCLEAR_WITH_DEFENSIBLE_POSTURE, also (contingent):**

```yaml
- wp_id: WP-9
  work_package: "Counsel follow-up — codify the defensible posture (or the COPPA_DOES_NOT_APPLY ruling) into a written opinion for the architecture / engineering record; capture the US sub-13 carve-out cell in the regime-taxonomy; potentially flip D-2.2 (sub-13 US v1 = no service) to 'open via parent-operator'"
  inputs: ["R-1 ruling", "V-1 verification"]
  owner: "counsel"
  reviewer: "PM"
  due: ""
  blocked_by: []
  status: open
```

**If R-1 was COPPA_APPLIES, instead (contingent):**

```yaml
- wp_id: WP-9-alt
  work_package: "Sub-13 v2 path posture memo — codify the COPPA_APPLIES ruling into a written record; the sub-13 v1.1 path remains launch-blocked, requiring full VPC; no new US sub-13 route is opened via parent-operator"
  inputs: ["R-1 ruling"]
  owner: "Claude + counsel"
  reviewer: "PM"
  due: ""
  blocked_by: []
  status: open
```

**Sub-13 v1.1 ungating workstream (contingent, demand-triggered):**

```yaml
- wp_id: WP-10
  work_package: "Sub-13 v1.1 ungating workstream — closes Gaps B, D, E (sub-13-specific, deferred from v1 per Path X), the sub-13 EU onboarding + consent flows, the G7 VPC vendor procurement for the EU 'reasonable efforts' bar, and the per-Member-State consent-age-axis handling. Triggered by demand signal + G7 procurement + policy-engine sub-13 cell verification (the three preconditions)."
  inputs: ["WP-1 output", "WP-4 output", "demand signal", "G7 procurement"]
  owner: "separate workstream"
  reviewer: "PM"
  due: ""
  blocked_by: ["WP-1", "WP-4"]
  status: open
```

---

## Walkthrough sign-off

```yaml
pm_signoff: ""
pm_signoff_at: ""
counsel_signoff: ""  # mandatory for R-1
counsel_signoff_at: ""
facilitator_signoff: ""
facilitator_signoff_at: ""
```

---

*End of capture ledger. Populated during the live walkthrough; the post-walkthrough handoff (`_handoffs/2026-06-XX-policy-engine-spine-ruling.md`) is generated from this ledger within 24 hours.*
