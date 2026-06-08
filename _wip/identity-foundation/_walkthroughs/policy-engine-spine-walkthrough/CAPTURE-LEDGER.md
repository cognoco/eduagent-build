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
ruling: LOCKED
primitive_pair:
  prohibition_floor: "A rule that binds regardless of consent (consent_unlockable = false); neither user nor guardian can unlock it. E.g. Gemini §20(d) under-18 closure; AI Act Art 5(1)(b) age-vulnerability exploitation; CSAM-adjacent provider refusals."
  consent_edge: "A rule that binds only while the relevant consent is absent; valid guardian/user consent unlocks the activity. E.g. GDPR Art 8 sub-digital-consent-age processing; COPPA VPC; UK Children's Code best-interests gate."
ruling_text_verbatim: "yes, build both"
rationale: >
  The engine's output must be the union of two first-class primitives because a single primitive cannot model
  both flavors. The age-consent PoC found 7 of 8 activity categories contain cells where consent_unlockable:false
  is the binding constraint; modelling everything as consent-edge would either let a sub-13 user through a hard
  ban or wrongly refuse a 17-year-old a legal route. Cheap to add in the pre-baseline window (MMT-ADR-0012),
  append-only after.
dissent_or_caveats: >
  None from the PM. Facilitator note: the prohibition-floor primitive must be expressible independently of any
  age/regime value (some floors, e.g. CSAM refusal, are age-invariant), so the data-model amendment (WP-2) must
  not collapse the floor into an age-keyed column only. MMT-ADR-0013 (already drafted, status Proposed) is the
  vehicle; this ruling confirms its §1 "kind column" decision.
captured_by: "Claude (facilitator)"
captured_at: "2026-06-07"
pm_signoff: "principal (user) — ruled 'yes, build both', 2026-06-07"
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
ruling: UNCLEAR_WITH_DEFENSIBLE_POSTURE
ruling_text_verbatim: >
  "We will keep it open. In v2 we will open up managed accounts for kids under 13 OUTSIDE of the USA —
  but this is not relevant for launch." (principal/PM ruling, 2026-06-07)
rationale: >
  Keep the sub-13 door open as a future (v2) option rather than slamming it shut, but scope the v2 target
  to NON-US managed-child accounts. This sidesteps the unresolved US-COPPA actual-knowledge question entirely
  for v2: COPPA is US-only, so a non-US-first sub-13 path makes the regime taxonomy (R-2), not COPPA, the
  binding constraint. The US sub-13 path therefore stays CONSERVATIVE (no parent-operator open in the US;
  full VPC or no-service if ever attempted), while the door that actually opens in v2 is the non-US one.
defensible_posture_if_unclear: >
  Engine default posture (bake in now, exercise in v2): no child-side login/credential/free-text chat; do NOT
  collect the child's DOB/grade/school at the controller layer; treat parent-supplied profile data as
  parent-data, not child-data. US sub-13 remains gated/closed under this posture. The v2 opening is NON-US
  managed-child accounts, governed by the R-2 regime cells (EU_GDPR_* and ROW), NOT by a COPPA carve-out.
dissent_or_caveats: >
  IMPORTANT FLAG for v2 planning (not launch): "outside the USA" dodges COPPA but is NOT automatically
  lighter-weight. The EU is actually STRICTER on this exact parent-operator pattern — GDPR Art 8 + EDPB
  05/2020 §3 put the verification burden on the controller (Layer 5 EU row = "3b: No"), plus per-Member-State
  consent-age thresholds (13–16) and the EU AI Act high-risk-in-education obligations. So a lighter-weight v2
  sub-13 launch realistically means permissive ROW jurisdictions FIRST, with the EU treated as its own
  heavier cell — not "non-US = easy". This is captured for v2 scoping, not a launch blocker.
  Legal status: this is a facilitator-captured business posture; COUNSEL SIGN-OFF on the COPPA reading and
  the non-US per-regime verification bar is OUTSTANDING and MANDATORY before any v2 build (HW-2, V-1, V-5).
captured_by: "Claude (facilitator)"
captured_at: "2026-06-07"
pm_signoff: "principal (user) — ruled keep-open, v2 = non-US sub-13 managed accounts, 2026-06-07"
counsel_signoff: "OUTSTANDING — facilitator-captured business posture only; requires licensed-counsel sign-off before v2 build (HW-2)"
```

**Implications of the ruling:**

- **COPPA_APPLIES** → the `US_COPPA` regime-cell in the R-2 regime-taxonomy is "build the full VPC path or do not serve." Sub-13 v2 path is preserved as launch-blocked. The parent-operator path is closed.
- **COPPA_DOES_NOT_APPLY** → the parent-operator path is a US-COPPA-safe route. The `US_COPPA` regime-cell in R-2 needs a sub-cell encoding the parent-operator path. Sub-13 v2 path is open. The regime-taxonomy enum gets a wider US sub-13 cell.
- **UNCLEAR_WITH_DEFENSIBLE_POSTURE** → the policy engine encodes the defensible posture as the default (e.g., "do not collect child's age at the controller layer; treat parent-supplied profile data as parent-data, not child-data"). Sub-13 v2 path is open with the posture as the gate. The regime-taxonomy enum encodes the posture; the policy-engine output is gated by it.

---

### Ruling: R-2 — Regime taxonomy

> What is the locked first-class regime enum the policy engine keys on?

```yaml
ruling: LOCKED
regime_enum:
  - "US_COPPA"      # United States — under-13 protected (COPPA actual-knowledge doctrine); state codes (CA AADC) folded
  - "EU_GDPR_16"    # EU consent-age 16 — DE, NL, IE, SK, most MSes (most restrictive EU)
  - "EU_GDPR_15"    # EU consent-age 15 — FR
  - "EU_GDPR_14"    # EU consent-age 14 — ES, CY, BG (PT reported 13, verify; AT/IT/SI 14-or-13 fold here w/ verify-flag)
  - "EU_GDPR_13"    # EU consent-age 13 — SE, DK, FI; + NO/IS/LI via EEA
  - "UK_AADC"       # United Kingdom — UK GDPR (consent 13) + Children's Code design overlay
  - "ROW"           # rest of world (incl. all of Asia, CH, etc.) — strictest default; carries optional sub_regime "strict" metadata
ruling_text_verbatim: "ok [lock the 7 buckets as the v1 set, knowing it grows as new markets are entered]"
rationale: >
  The engine keys on a small first-class regime enum, NOT a 200-country list. A bucket is defined by WHICH LAW
  applies, not by the age number (so US-at-13 and EU_GDPR_13 are distinct buckets — different doctrines:
  COPPA actual-knowledge vs GDPR reasonable-efforts). 7 buckets cover near-term launch geography (US/EU/UK)
  plus a strictest-default catch-all. PM confirmed the set is a v1 STARTING set, not a ceiling.
us_sub13_carveout_cell: >
  Per R-1: the US_COPPA sub-13 cell stays CONSERVATIVE — no parent-operator route opened in the US; full VPC
  or no-service if ever attempted. The v2 sub-13 opening (R-1) lives in EU_GDPR_* (heavier) and ROW (lighter)
  cells, NOT in a US carve-out. So R-2 needs no new US sub-cell; it needs the ROW + EU cells to carry the
  managed-child sub-13 posture for v2.
dissent_or_caveats: >
  (a) The country→regime MAPPING is verifiable data (a lookup table checked against EDPB/legal trackers), NOT
  part of the locked enum — it can change without a schema change. (b) Adding a NEW bucket later is a supported
  low-cost enum addition, but each new bucket's rules must be legal-research-filled before use → growth is paced
  by counsel, not code. (c) Open verifies that may refine cells, not the enum: PT 13-vs-14 (V-4), CA-AADC
  post-NetChoice-v-Bonta residuals folded into US_COPPA (V-3), ICO Annex B design bands for UK_AADC (HW-1/V-2).
captured_by: "Claude (facilitator)"
captured_at: "2026-06-07"
pm_signoff: "principal (user) — ruled 'ok', lock the 7 as v1 starting set, 2026-06-07"
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
ruling: LOCKED
axes_model:
  known_age:
    determination_methods: ['self_report', 'parent_reported', 'verified_credential', 'age_estimation_signal']
    confidence: 0.0_to_1.0
  known_residence:
    determination_methods: ['self_report', 'billing_address', 'geo_ip', 'verified_credential']
    confidence: 0.0_to_1.0
v1_determination_method_set:
  age:
    - "self_report"      # neutral age gate — industry-standard + legally sufficient for a 13+ service
    - "parent_reported"  # managed-child case (Decision 2 / R-1)
  residence:
    - "geo_ip"
    - "billing_address"
default_for_unknown: MOST_RESTRICTIVE  # unknown age → most-protected; unknown residence → strictest regime
phase_2_methods: ['verified_credential', 'age_estimation_signal']  # deferred; needed only when under-13 (v2) opens
ruling_text_verbatim: "yes that sounds good if it is sufficient to trust what they tell us and not verify"
rationale: >
  Two independent axes (known-age × known-residence), each with determination_method + confidence, crossed
  with the regime buckets (R-2) — NOT a per-age-band bucket. The PM's condition ("sufficient to trust, not
  verify") HOLDS for the 13+ launch: a self-reported age gate is the industry-standard, legally accepted
  mechanism for a 13+ service; hard verification is NOT required. Verification (verified_credential) is
  phase-2 precisely because it is needed only for the under-13 population, which is itself deferred to v2 —
  the two move together, so launch defers nothing it actually needs.
dissent_or_caveats: >
  Flip-side handling rule (build into the engine, not a verify-everyone mandate): self-report cuts both ways
  — if a 13+ user volunteers an under-13 age, that is ACTUAL KNOWLEDGE and the engine must act on it
  (block/redirect/escalate), not ignore it. Also: "trust, don't verify" is sufficient for 13+ ONLY; the day
  under-13 (v2) opens, US VPC + EU reasonable-efforts verification become mandatory and verified_credential
  must ship then (gated on counsel, per R-1). "Default to most-restrictive when unknown" means a user who
  refuses an age/region is treated as most-protected, not least.
captured_by: "Claude (facilitator)"
captured_at: "2026-06-07"
pm_signoff: "principal (user) — ruled lock, conditioned on trust-sufficient-for-launch (condition holds for 13+), 2026-06-07"
```

**Implications of the ruling:**

- **LOCKED** → the v1 determination-method set is the schema scope; the default-for-unknown rule is the safety default. The post-walkthrough `MMT-ADR-0013` drafting has the knowledge-axis input.
- **REFINEMENT** → capture the refinement (likely an addition to the determination-method set or a change to the default-for-unknown rule). Re-run R-4 with the refined knowledge axes.
- **REJECTED / SPLIT / DEFER** → analogous to R-0's fallbacks.

---

### Ruling: R-4 — Router key

> Is the 3-param runtime key (`model · service_provider · serving_region`) and the 4-param vetting axis (`model · provider_via_service · service · region`) the right split?

```yaml
ruling: LOCKED
runtime_key: ['model', 'service_provider', 'serving_region']  # fast per-request picker reads this
vetting_axis: ['model', 'provider_via_service', 'service', 'region']  # slow legal/contractual vetting; the extra axis = same model via different services vetted separately
flow: VETTING_PIPELINE -> ALLOWED_MODELS_TABLE -> POLICY_ENGINE_FILTER -> ROUTER
ruling_text_verbatim: "lock it"
rationale: >
  Two jobs that must stay separate: slow on-cadence VETTING (does a provider/model/region ever pass — ToS,
  ZDR, log-retention, training-data, age-closure) emitting rows into an approved (allowed-models) table; and
  fast per-request ROUTING (pick the best ALLOWED option by complexity/cost/load). The router never re-checks
  compliance — it reads vetted rows already filtered by the policy engine for this user's bucket+age. Mashing
  them together makes the router re-implement compliance per-request: slow, brittle, bug-prone.
dissent_or_caveats: >
  This re-specs the prior hard-coded GATE-1 minor-routing rule: the papered/ZDR endpoint becomes a vetted ROW
  in the allowed-models table + a policy-engine filter, not a hard-coded if-branch. Note the supersession of
  the old "Family standard = Gemini-only" routing — Gemini is §20(d)-closed to minors, so it cannot be a
  minor route; it survives only as a policy-table data point, not an allowed row for under-18 cells.
captured_by: "Claude (facilitator)"
captured_at: "2026-06-07"
pm_signoff: "principal (user) — ruled 'lock it', 2026-06-07"
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
ruling: REFINEMENT  # principle confirmed; the concrete shape DEFERS to the already-ratified MMT-ADR-0016
supersession_note: >
  The walkthrough's abstract three-slot sketch (US-primary / EU-primary / cost-effective-non-US) and its
  "a future vetting-research workstream will pick the providers" framing are SUPERSEDED by the ratified
  routing decision MMT-ADR-0016 + docs/specs/2026-06-06-llm-routing-and-judge-architecture.md §1.5 +
  docs/specs/2026-06-06-llm-routing-gpt-oss-cerebras-build.md (owner-ratified 2026-06-07). The provider
  picks are NOT deferred — they exist. R-5 therefore confirms the PRINCIPLE and points at the spec for the
  concrete shape; it does NOT lock the stale sketch.
actual_ratified_structure:  # per MMT-ADR-0016 / routing-spec §1.5 — this is the real "slot structure"
  universal_default: "gpt-oss-120b @ Cerebras (US), reasoningEffort high — all tiers incl. free, rungs 1–3, all ages"
  residency_branch: "EU-vs-RoW (one merged branch: EU-residency required OR Cerebras unavailable) → tier secondary"
  secondary_free: "Mistral Small 4 (EU) — also free-tier vision"
  secondary_paid: "GPT-5 mini @ low (OpenAI, EU-residency deployment; ZDR-for-minors) — also paid-tier vision"
  deep_reasoning_paid: "gpt-5.4 @ medium — Plus / Pro / AI-Upgrade entitlement only"
  deep_reasoning_family: "gpt-oss-120b @ Cerebras high — Family tier EXCLUDED from gpt-5.4 (owner ruling 2026-06-07)"
  rung45_fallback: "Sonnet 4.6 (Anthropic, US)"
  judge: "Haiku 4.5 non-reasoning (Anthropic)"
  dormant_adult_only: "DeepSeek V4 Pro @ DeepInfra — passed, not pinned, adults only"
out_of_scope_routes:
  - "gemini / vertex — UNCONDITIONALLY banned for under-18 (GCP SST §20(d) + Gemini API terms); fail-closed in getFallbackConfig (FALLBACK_FORBIDDEN). Adult-only (verified-18+) eligibility is an OPEN legal ruling (routing-spec §10.1) — banned until ruled. Workspace-for-Education tenant exception kept only as a policy-table data point, not a route."
vetting_research_workstream:
  named: superseded  # the "future workstream owns the picks" framing is stale — picks already ratified
  realized_as: "the eval-harness ADMISSION GATE (routing-spec §1.4: pnpm eval:llm --live in exact prod config) + the non-code compliance prerequisites (G-P1 Cerebras triplet, G-P2 OpenAI ZDR-for-minors, G-P3 teaching A/B) — these play the ongoing 'vetting' role; no separate PoC workstream needed"
  outputs: "the §1.5 routing matrix rows = the ratified provider set (declarative rule table; provider swap = config edit, not logic)"
ruling_text_verbatim: >
  "I believe this is already documented in more detail, but yes — EU versus the rest of the world is how I
  did it for now and then per plan." (principal, 2026-06-07, citing the two routing specs)
rationale: >
  The R-5 PRINCIPLE holds and is already realized: provider selection is name-agnostic at the architecture
  level (declarative rule table + per-vendor adapters; swaps are config edits), Gemini-for-Education is out
  as a route, and an admission/compliance gate governs which models may enter a row. But the concrete slot
  structure and provider set are owner-ratified in MMT-ADR-0016, organized as EU-vs-RoW residency branching
  on a universal gpt-oss/Cerebras default — NOT the walkthrough's US/EU/non-US three-slot sketch. R-5 defers
  to that spec rather than re-deciding it.
dissent_or_caveats: >
  DOC-DRIFT FINDING: the walkthrough prep (BRIEFING-PACKET §8, this ledger's R-5 template, FACILITATOR-BRIEF)
  predates/ignores MMT-ADR-0016 and still presents the provider picks as an open future workstream. The
  walkthrough-folder R-5 material should be reconciled to point at the routing specs (cleanup item, see
  Homework). Open legal ruling that genuinely remains: adult-only (18+) Gemini eligibility inside a
  mixed-audience app (routing-spec §10.1) — owed before any Gemini row is added.
captured_by: "Claude (facilitator)"
captured_at: "2026-06-07"
pm_signoff: "principal (user) — confirmed principle; deferred concrete shape to ratified routing specs (EU-vs-RoW), 2026-06-07"
```

**Implications of the ruling:**

- **LOCKED** → the slot structure (US-primary + EU-primary + cost-effective non-US alt) and the vetting-pipeline-owns-the-picks principle are the engineering intent. The four named providers are illustrative inputs, not a ratified list. The vetting-research workstream is named as a parallel PoC and as the producer of the ratified provider set. The post-walkthrough `MMT-ADR-0013` drafting has the slot-structure scope; the workstream has the provider-set + vetting-verdict scope.
- **REFINEMENT** → likely a change to the slot structure (e.g., adding a fourth slot) or a refinement to the out-of-scope list. Capture the refinement. (Adding/removing a *named provider* is not an R-5 refinement — that is the vetting workstream's call.)
- **REJECTED / SPLIT / DEFER** → analogous to R-0's fallbacks.

---

## Verifications completed in the room

Counsel re-verifications of Bucket-B questions from the original under-13 synthesis (`SYNTHESIS.md` §6 Bucket B) and the R-1 underpinning. One row per verification.

> **Session note:** this was a FACILITATOR-RUN session with no live licensed counsel present. None of V-1..V-5
> were verified in the room — all are OUTSTANDING homework for counsel. The R-1 business posture was captured
> on the facilitator's reading of SYNTHESIS.md Layer 5; it is NOT a legal clearance.

```yaml
- question_id: V-1
  topic: "R-1 underpinning — COPPA 'directed to children' and 'actual knowledge' doctrine applicability to the parent-operator pattern"
  ruling_in_room: "NOT VERIFIED IN ROOM — no counsel present. Facilitator captured the UNCLEAR_WITH_DEFENSIBLE_POSTURE reading (R-1); a written counsel opinion is owed (HW-2)."
  effect_on_r1: "R-1 stands as a business posture (keep door open, v2 = non-US sub-13) gated on this verification before any build."
  captured_by: "Claude (facilitator)"
  captured_at: "2026-06-07"

- question_id: V-2
  topic: "ICO Annex B exact wording (carry-over from under-13 synthesis Q1)"
  ruling_in_room: "NOT VERIFIED — outstanding (HW-1). Most consequential unverified primary citation."
  effect_on_r2: "May refine the UK_AADC design-band detail; does NOT change the 7-bucket enum."
  captured_by: "Claude (facilitator)"
  captured_at: "2026-06-07"

- question_id: V-3
  topic: "California AADC (AB-2273) post-NetChoice v. Bonta (carry-over from under-13 synthesis Q4)"
  ruling_in_room: "NOT VERIFIED — outstanding. CA-AADC residuals folded into US_COPPA pending this."
  effect_on_r2: "May refine the US_COPPA cell detail; does NOT change the enum."
  captured_by: "Claude (facilitator)"
  captured_at: "2026-06-07"

- question_id: V-4
  topic: "EDPB Guidelines 05/2020 §3 paragraph-level reading (carry-over from under-13 synthesis Q6)"
  ruling_in_room: "NOT VERIFIED — outstanding. Underpins the EU 'controller bears verification burden' finding that makes EU sub-13 heavier than ROW (R-1 caveat)."
  effect_on_r2: "Confirms the EU_GDPR_* cells are reasonable-efforts/VPC-gated for sub-13; relevant to v2 scoping."
  captured_by: "Claude (facilitator)"
  captured_at: "2026-06-07"

- question_id: V-5
  topic: "NetChoice-style Netflix-profile analogue — any regulator blessing? (carry-over from under-13 synthesis Q11)"
  ruling_in_room: "NOT VERIFIED — prior research found NONE. Directly underpins R-1; bundle with HW-2."
  effect_on_r1: "Absence of any regulator blessing is WHY R-1 is 'unclear, defensible posture' not 'does not apply'."
  captured_by: "Claude (facilitator)"
  captured_at: "2026-06-07"
```

---

## Homework follow-ups (counsel to take away)

To be completed by counsel within 1–2 weeks of the walkthrough. One row per homework item.

```yaml
- homework_id: HW-1
  question: "Verify ICO Children's Code Annex B exact wording against the live ICO document (V-2). Most consequential unverified primary; may refine UK_AADC design-band detail."
  owner: "counsel"
  due: "2026-06-21"
  status: open
- homework_id: HW-2
  question: "Written counsel opinion on the parent-operator COPPA reading (V-1) + the Netflix-profile-analogue regulator-blessing check (V-5). MANDATORY before any v2 sub-13 build. Must also cover the NON-US verification bar (EU GDPR Art 8 reasonable-efforts per EDPB 05/2020 §3, and ROW strict-jurisdiction screening) since v2 scope = non-US sub-13 managed accounts."
  owner: "counsel"
  due: "2026-06-21"
  status: open
- homework_id: HW-3
  question: "Reconcile the walkthrough-folder R-5 material (BRIEFING-PACKET §8, FACILITATOR-BRIEF R-5, this ledger's R-5 template) to the ratified routing decision MMT-ADR-0016 + the two 2026-06-06 routing specs. The walkthrough still presents provider picks as an open future workstream; they are ratified. Doc-drift cleanup, not a decision."
  owner: "Claude / architect"
  due: "2026-06-14"
  status: open
- homework_id: HW-4
  question: "Resolve the open legal ruling on adult-only (verified-18+) Gemini/Vertex eligibility inside a mixed-audience app (routing-spec §10.1). Owed before any Gemini row is added; Gemini stays unconditionally banned until ruled."
  owner: "counsel"
  due: "TBD (not launch-blocking; Gemini stays banned meanwhile)"
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

> **R-1 was ruled UNCLEAR_WITH_DEFENSIBLE_POSTURE (keep-open, v2 = non-US) — so WP-9 ABOVE is the active
> contingent. WP-9-alt below is N/A** (it was the COPPA_APPLIES branch).

**If R-1 was COPPA_APPLIES, instead (contingent) — N/A, R-1 was NOT COPPA_APPLIES:**

```yaml
- wp_id: WP-9-alt
  work_package: "N/A — R-1 ruled UNCLEAR_WITH_DEFENSIBLE_POSTURE, not COPPA_APPLIES. (Original: sub-13 v2 path posture memo codifying a COPPA_APPLIES ruling.) Re-activate only if counsel (HW-2) flips R-1 to COPPA_APPLIES."
  inputs: ["R-1 ruling"]
  owner: "Claude + counsel"
  reviewer: "PM"
  due: ""
  blocked_by: []
  status: not_applicable
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
pm_signoff: "principal (user) — ruled R-0 through R-5 in a facilitator-run session"
pm_signoff_at: "2026-06-07"
counsel_signoff: "OUTSTANDING — no licensed counsel present; R-1 captured as business posture only. MANDATORY counsel sign-off owed via HW-2 before any v2 sub-13 build."
counsel_signoff_at: "pending"
facilitator_signoff: "Claude (architect/facilitator)"
facilitator_signoff_at: "2026-06-07"
```

---

*End of capture ledger. Populated during the live walkthrough; the post-walkthrough handoff (`_handoffs/2026-06-XX-policy-engine-spine-ruling.md`) is generated from this ledger within 24 hours.*
