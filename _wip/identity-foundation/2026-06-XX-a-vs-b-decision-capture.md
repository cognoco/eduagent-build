# A-vs-B Decision-Capture Memo

**Status:** PATCHED per grilling session 2026-06-06; pending PM sign-off.
**Date:** 2026-06-06 (grilled)
**Author:** Claude (drafted + patched); PM (ratifies)
**Audience:** PM (primary) + architect (informed) + the policy-engine spine walkthrough (downstream consumer)
**Relationship to the PRD-Answer doc (2026-06-01):** **adds to** — does not re-derive it. Where a decision in this memo extends, confirms, or contradicts the PRD-Answer doc, it is tagged in §6. The PRD-Answer doc is treated as *one* input, not as a closed door; refinements surfaced in the A-vs-B conversation are *named* in §6 rather than silently absorbed.
**Relationship to the A-vs-B walkthrough:** the walkthrough (in `policy-engine-spine-walkthrough/`) ratifies the *shape* of the policy engine; this memo ratifies the *decisions* the engine implements. **Memo first, walkthrough second** — the walkthrough folds this memo's output as input.

**Lifecycle:** per §8 (Option III), this memo is a *grilling record* — preserved as a tagged commit, not updated. Future readers find the ADRs (current truth) + the handoff (distilled) + the memo (audit trail).

---

## Purpose

The A-vs-B conversation (2026-06-01 to 2026-06-05) produced 25 high-level decisions in dialogue form. The Phase-F roadmap required them captured as a ratified, signed, citable artifact before Phase F can close. This memo is that artifact. The walkthrough prep (in `policy-engine-spine-walkthrough/`) is the downstream consumer.

This is a **decision-capture memo, not a plan**. Each decision is stated in its strongest defensible form, tagged against prior canon, and tied to a downstream work-package. The grilling session's job is to ratify the language, surface any decisions the conversation missed, and sign.

---

## §1 — ICP and persona scope

### 1.1 — ICP, stated

**The ICP is "parents looking for help in supporting children with homework" — but ICP is GTM framing, not v1 audience cap.**

The ICP is the *sales-story* layer; the persona set is the *product* layer. The two are different vocabularies. PRD Part II captured this distinction ("The 'homework-helper' wedge is GTM framing, not an audience cap"); this memo ratifies the distinction explicitly.

### 1.2 — v1 persona set, in full (six personas)

**v1 ships the following six personas, in full, with no scope shrink.** Personas and roles/edges are different things — a persona is the *lived context* (the human's relationship to the product, day-to-day); a role/edge is the *capability* invoked at a moment. A single human wears multiple hats (Payer + `{admin}` + Guardian edge + Mentor edge + `{student}`) across personas, but at any one moment invokes one capability.

| # | Persona | Description |
|---|---|---|
| 1 | **Adult self-directed learner** | A legally competent adult (≥ 18, no guardianship or conservatorship) who uses the product for their own learning. Org-of-one. Self-pay unless an external party holds the Payer field. |
| 2 | **Self-consenting minor** | A minor at or above the per-market digital-consent age (13–16, jurisdiction-dependent) who uses the product for their own learning with their own login. May have an external adult holding the Payer field. |
| 3 | **Non-consenting minor (managed profile)** | A minor below the per-market digital-consent age who uses the product through a managed profile (no controller-layer login of their own; the parent or legal guardian operates the product on the minor's behalf). |
| 4 | **Subscription administrator** | A legally competent adult (≥ 18) who holds the Payer field on a subscription, holds `{admin}` on the org, holds Guardian edges to charges, may hold Mentor edges to self-consenting minors, and may be `{student}` for their own learning. The "first-mover parent" composite is *this* persona wearing multiple hats. |
| 5 | **Household mentor** | A person (typically a parent, in-home caregiver, or other adult in the charge's household) who actively helps a specific charge in a co-present setting. Holds a Mentor edge to the specific charge (and a Guardian edge if the charge is below consent age and the household mentor is acting-for). |
| 6 | **Non-familial mentor** | A person *not* in the charge's household or legal family who holds Mentor edges to one or more specific mentees. Includes tutors, peers, older non-household friends, online study partners. |

**Tag:** **REFINES** the PRD-Answer doc's 5-persona set. The PRD-Answer doc enumerates 5 personas; this memo refines to 6 by:
- Splitting "Family operator" into "Subscription administrator" (the *supervisor/admin/payer* hat) and "Household mentor" (the *in-home helping* hat). The two are different lived contexts even if the same human wears both.
- Renaming "Mentor/tutor" to "Non-familial mentor" (the *external* helping relationship; the *internal* helping relationship is Household mentor).
- Renaming "Parent-managed child" to "Non-consenting minor (managed profile)" (precise about the legal status, not the typical human).
- The capability matrix (PRD Part IV) is unchanged; the persona *enumeration* is refined from 5 to 6.

**The user-story litmus test (per the grilling):** user-stories are written in a persona's voice ("As a family operator [Subscription administrator persona]…") and invoke one hat at a time (Payer field, `{admin}` role, Guardian edge, Mentor edge, `{student}` role). The Payer field is a *capability*, not a persona. Capability requirements live in the capability matrix; user-stories live in the persona layer.

### 1.3 — Decisions the conversation surfaced but did not yet ratify

These are **open items** the grilling session ruled on (recommendations ratified; PM confirms or amends in the §9 sign-off).

- **D-1.1 (RATIFIED)** Managed-child-profile onboarding is **parent-mediated** — the Subscription administrator creates the profile, sets the parameters, and the product is operated by the parent on the child's behalf. The child does not type into the system, does not see the chat, and does not hold a credential. *Scoped to the Non-consenting minor (managed profile) persona only; does not apply to the Subscription administrator persona's own UX.*
- **D-1.2 (RATIFIED)** The v1 mental model for the Non-consenting minor persona is **"the parent is the user; the child is the subject"**. The UX surfaces this — no child-side login screen, no child-side chat, no age-disclosure surface for the child. *Scoped to the Non-consenting minor persona only.*

### 1.4 — Payer field (new in this memo)

**The Payer field is a *sub field*, not a persona.** A subscription has exactly one Payer-holder at a time. The Payer field grants *billing access only* — no learning-data access of any kind.

**v1 Payer-holder cases (3a/3b/3c from the grilling):**

- **3a. Subscription administrator persona on the family subscription.** The typical parent case.
- **3b. Adult self-directed learner persona on their own subscription.** Self-pay, the org-of-one case.
- **3c. Self-consenting minor persona who is 18+.** Functionally an Adult self-directed learner in this case.

**Out of scope for v1 (3d/3e):** a Payer-holder who is not a member of the org (grandparent, scholarship provider, employer); a Payer-holder who is the Subscription administrator of a *different* org. The data model supports these cases; the v1 UX does not surface them.

**Payer count: 1 primary + max 1 secondary, no supersede (4b from the grilling):**

- **Primary Payer** = full billing ops (read subscription state, update payment method, view invoices, cancel, upgrade, change plan).
- **Secondary Payer** = view + update payment method only. No cancel, no upgrade, no plan change. The Subscription administrator gets a notification (in-app + email) on every secondary payment-method change.
- v1 supports at most 1 secondary per subscription. N≥2 deferred to v2.

**Payer-field-holder is the live open question (D-Payer in the open-legal items list):** the cases that may surface in v1.1 or later include a Payer who is not a member of the org, and a Payer who is the Subscription administrator of a different org. The data model is permissive (Payer field on subscription, no requirement that Payer be org member); the v1 UX is restrictive (only 3a/3b/3c in v1).

### 1.5 — Profile management, consent, and data access (the three-capability split)

Three distinct capabilities, three distinct scopes. **A "full parent" = all three capabilities stacked on the same human (the typical v1 case).**

| Capability | What it grants | Where it lives | v1 holder |
|---|---|---|---|
| **Profile management** | Modify the charge's profile (name, settings, delete profile). Does not imply data access. | Bundled with **Subscription administrator** (org-membership role + Payer field) | Subscription administrator persona (Persona 4) |
| **Consent** | Grant/withdraw consent for a specific charge's data processing. Audit-trail of *when* and *by whom*. Does not imply data access. | **Guardian edge** (person-to-person relationship) | Any adult with qualifying legal status; 1 per charge (G-3 3a) |
| **Data access** | See/help a specific mentee's learning data. Does not imply consent authority. | **Mentor edge** (person-to-person relationship) | Household mentor (Persona 5) or Non-familial mentor (Persona 6); N per charge |

**The "full parent" case:** the Subscription administrator is the Payer + `{admin}` + holds the Guardian edge to the charge + holds a Mentor edge to the charge (the household mentor hat). Same human, four capabilities stacked.

**The split cases (off-ICP for v1, designed-for-later):** a grandparent who is the Payer but not the Guardian (the Payer initiates profile mgmt; the Guardian consents); a court-appointed guardian who is the Guardian but not the Payer (the Guardian consents; a different adult pays).

### 1.6 — Guardian edge (refined)

**Guardian = consent only.** The Guardian edge is held by the "holder of parental responsibility" (legal status, not just age). 1:1 per charge (G-3 3a). The edge grants consent authority for the specific charge; does not grant data access (that's the Mentor edge).

**Guardian-edge qualification (G-4 4b):** explicit ENUM recorded at consent-grant time. The charge picks (or the system defaults to biological_parent) from: `biological_parent`, `adoptive_parent`, `stepparent`, `grandparent`, `court_appointed_guardian`, `foster_parent`, `kinship_caregiver`, `sibling_with_custody`, `other`. Editable post-creation. v1 surface: 1 dropdown in profile-mgmt UX.

**Birthday-crossing autonomy upgrade (G-6 6b):** explicit takeover flow, branching on `charges.has_own_account`. When a charge crosses the per-market digital-consent age:
- **Case A: no own account** (typical sub-13). Flow = "create their account" (email, password, age-confirm). On completion: Guardian edge → historical (read-only audit record); new `{student}` membership; profile self-managed.
- **Case B: has own account.** Flow = "claim ownership of this account" (confirm, age-verify, link). On completion: Guardian edge → historical; account linked to charge; profile self-managed.

Both cases end with the Guardian edge in *historical* state (audit-only), the charge self-managed. Audit log captures which path was taken. Triggered by cron daily + session-start check.

**Terminology:** the *charge* is the human on whose behalf the Guardian edge is held. The term *ward* is deprecated — see §8 (post-memo worklist, charge-terminology sweep).

### 1.7 — Mentor edge (refined)

**Mentor = data access only.** The Mentor edge grants visibility into a specific mentee's learning data. N per charge (no upper bound in v1; v1.1 may add caps if a UX reason emerges). The edge is held by the Household mentor (Persona 5) for in-home helping, or by the Non-familial mentor (Persona 6) for external helping.

The Mentor edge does not grant consent authority. A Household mentor who is *not* the Guardian (e.g., a non-legal-guardian caregiver — nanny, older sibling) can see the charge's data but cannot grant consent.

---

## §2 — The age-floor decision (Path X)

### 2.1 — Decision, stated

**The launch version's age floor is 13+. Below 13, the system is built but not exposed in the front end. US is the exception: sub-13 is not built for the US market at all in v1, to avoid COPPA. Below-13 in the US is a phase-2 workstream (demand-triggered).**

This is consistent with the Phase-E handoff (2026-06-04) and the 13+ ruling. **Tag: REFINES the Phase-E handoff's wording; does not change the floor.** The Phase-E handoff captured the *floor* and the *deferral*; this memo adds the *build-but-gate* posture explicitly.

### 2.2 — What the 13+ floor actually means (three-axis restatement)

The 13+ floor is **not one gate — it is three independent axes**:

| Axis | Question | Threshold |
|---|---|---|
| **Consent capacity** | Can this person consent to their own data processing? | **13–16, per-market** (COPPA 13; UK GDPR 13; EU GDPR 13–16 per Member State; NO 13) |
| **Contract/payment capacity** | Can this person be the paying contract-holder? | **18, flat** |
| **Content level** | What tone/complexity/content? | **continuous gradient — never a gate** |

**Content level — what it is, with examples.** Content level is the axis where the product *adapts fluidly* to the user. Three things shift along the gradient:
- **Tone** — a 7-year-old gets short sentences, simple words, encouraging phrasing; a 14-year-old gets the same encouragement in a more matter-of-fact register; a 30-year-old gets direct, peer-style phrasing. The product *adapts*, doesn't *gate*.
- **Complexity of explanation** — a 7-year-old learning fractions gets "a half is when you cut something into two equal pieces"; a 14-year-old gets "a half is one of two equal parts of a whole, written 1/2"; a 30-year-old gets "the half is the multiplicative inverse of 2, so 1/2 × 2 = 1." Same concept, different depth. The product *scales*, doesn't *refuse*.
- **Subject matter depth** — 7-year-old gets "people used to ride horses to travel"; 14-year-old gets "the development of rail networks in the 19th century transformed commerce and migration patterns"; 30-year-old gets the same with citations to primary sources. The product *deepens*, doesn't *block*.

**What "continuous gradient, never a gate" specifically rules out:** a 7-year-old is *not* refused the concept of fractions because they're 7. A 30-year-old is *not* forced to use the 7-year-old explanation. A 14-year-old is *not* blocked from any subject matter on the basis of age. The product adapts; it does not gate on content level.

**The 13+ launch floor is the *consent capacity* floor for the default knowledge state.** It does **not** move:
- The 13–17 guardian-consent flow (a 13-year-old in DE is over the launch floor but still under the per-market consent age, requiring GDPR Art 8 "reasonable efforts" consent).
- The under-18 child-protection obligations (UK Children's Code, AI Act Art 5/50, DPIA).
- The "knowingly under-13" delete-path (carried from the Phase-E handoff).

**Tag: CONFIRMS ratified PRD Part III (the three-axis age model) and the Phase-E handoff's 13+ floor.**

### 2.3 — The "build-but-gate" posture, made concrete

The 13+ floor is enforced *at the front end* but the system is built to support sub-13. Three engineering requirements:

1. **Backend enforces independently.** A sub-13 attempt to create an own-account is refused at the API, not at the UI. Frontend flags are cosmetic; the gate is server-owned.
2. **The kill-switch is a real, tested gate.** The "switched off in the frontend" posture has a defined, tested backend behavior — not just a hidden UI element.
3. **The "knowingly under-13" delete-path stays warm.** A 12-year-old who lies past the age-gate still triggers COPPA actual-knowledge in the US (and equivalent under-13-knowledge rules in the EU/UK) the moment the controller has *any* signal.

**Tag: NEW (extends the Phase-E handoff's "13+ floor" with the build-but-gate engineering requirements).**

### 2.4 — Path X (v1 vs v1.1 split)

**Path X is the ratified split:** v1 closes the 13+ load-bearing gaps and future-proofs the data model pre-baseline. v1.1 closes the sub-13-specific gaps and ungates sub-13 EU.

**v1 closes (13+ load-bearing):**
- **Gap A** — router age gate (prevents 13+ minors from routing to Gemini-under-18; required for v1).
- **Gap C** — crisis / human-in-the-loop escalation (required for *all* under-18 users under UK Children's Code; required for v1).
- **Gap F** — api-side Sentry PII scrubbing for under-18 (required for *any* minor user; required for v1).
- **Gap G** — `AgeBracket` gains "child" value (required for the 13+ launch-floor logic; required for v1).
- Policy-engine prohibition-floor primitive (required because the Gemini-under-18 collision is a prohibition-floor rule, not a consent-edge rule).
- Data-model sub-13 cells (pre-baseline window; cheap now, append-only later).
- Launch-floor flag (the kill-switch mechanism; required for the v1 13+ gate to be testable).
- "Knowingly under-13" delete-path (required because 13+ users can lie past the gate, and the actual-knowledge doctrine binds).

**v1.1 defers (sub-13-specific):**
- **Gap B** — post-envelope output classifier (sub-13-specific; the 13+ surface relies on model-vendor refusal + prompt-layer, which is the v1 posture).
- **Gap D** — sub-13-specific `person_retain` retention TTLs (sub-13-specific; the 13+ surface uses the 18+ default retention, which is the v1 posture).
- **Gap E** — AI-disclosure UX (EU AI Act Art 50; the 13+ surface relies on the "obvious from context" carve-out, which is the v1 posture).
- Sub-13 EU onboarding + consent flows (the EU "reasonable efforts" verification, the per-Member-State consent-age-axis handling; the 13+ surface uses a simpler consent flow).
- G7 VPC vendor procurement for the EU "reasonable efforts" bar (the under-13 VPC tier; the 13+ surface uses a lighter verification).

**The reasoning for Path X:** Gaps A, C, F, G are *load-bearing for the 13+ surface*, not just for sub-13. Closing them in v1 is the *correct* v1 work — they are not "sub-13 future-proofing," they are "v1 launch-quality work for the 13+ surface." Gaps B, D, E *are* sub-13-specific and can be deferred to v1.1. The data-model pre-baseline window is the cheap moment for the sub-13 cells; the launch-floor flag and the "knowingly under-13" delete-path are required for the v1 surface anyway.

**v1.1 = demand-triggered, three preconditions (D-2.1):**
- **Demand signal** — X% of signups are sub-13 attempts that get refused, or a market-research threshold.
- **G7 VPC vendor procurement** — landed or committed to land on a defined cadence (the EU "reasonable efforts" bar).
- **Policy-engine sub-13 cell verification** — the engine emits verified cells for the EU regimes; the verification is end-to-end.

All three conditions; no calendar date. v1.1 fires when the demand signal is strong *and* the preconditions are met.

**Sub-13 US v1 = no service even via parent-operator (D-2.2, conservative):** the parent-operator path (Subscription administrator + Household mentor + Non-consenting minor managed profile) is *built* (it's the v1 implementation shape for the Non-consenting minor persona) but *gated off in the US specifically*. **R-1 can flip this default.** If the walkthrough's R-1 ruling is `COPPA_DOES_NOT_APPLY` or `UNCLEAR_WITH_DEFENSIBLE_POSTURE`, the parent-operator US sub-13 path opens. If R-1 is `COPPA_APPLIES`, the path stays closed.

**Tag: REFINES the Phase-E handoff's "sub-13 deferred to phase-2" framing with the explicit v1 vs v1.1 split (Path X).**

---

## §3 — The business-rules engine (decision #4 from the conversation)

### 3.1 — Decision, stated

**The product ships a *business rules engine* — a (age × residence × known/unknown) → policy dimensions mapping. The engine lives *inside* identity-foundation (C1-A: not as a sibling workstream). The engine's *output* is the union of two primitives (the walkthrough's R-0 ruling).**

This is the load-bearing modeling decision of the post-Phase-E workstream. The engine is *not* a generic rules engine — it is purpose-built for the (age × residence × knowledge) → policy surface, with a clear seam for evolution as legal/regulatory cadence changes.

**Tag: NEW (this is the first explicit ratification of the business-rules-engine decision; the architecture lane was implied by the A-vs-B conversation but not yet captured).**

### 3.2 — The two-primitive model (R-0 input, A1: kind column)

The engine's output is the union of two distinct primitives. The PoC at `_wip/identity-foundation/age-consent-landscape/` (8 jurisdictions × 8 activities × 2 knowledge states = 128 populated cells) found that 7 of 8 activity categories have cells where `consent_unlockable: false` is the binding constraint — the prohibition-floor is not a corner case, it is the majority.

- **Prohibition-floor** primitive — rules that bind regardless of consent. AI Act Art 5(1)(b)/(f), platform ToS (Gemini §20(d) under-18 closure), Anthropic's "do not compromise children's safety" usage policy.
- **Consent-edge** primitive — rules unlockable by guardian/user consent. GDPR Art 8 with reasonable-efforts verification, UK Children's Code with parental gate, COPPA VPC.

**Data-model shape (A1: kind column, two primitives):** the `policy_rules` table carries a `kind` column = `prohibition_floor` | `consent_edge`. Two distinct rule types with different evaluation logic. The kind column is the type-safety boundary; the boolean flag alternative (A2) is too easy to mis-set; the two-tables alternative (A3) is DRY-violating overhead.

**Tag: REFUTES the implicit assumption in ratified `MMT-ADR-0011` that one primitive is sufficient. Implies `MMT-ADR-0013` (prohibition-floor primitive + age × residence × knowledge × consent-state seam columns).**

### 3.3 — The two-axis knowledge model (R-3 input, B3: profile + history)

"Known/unknown" is **two independent axes**: known-age and known-residence. Each has a **determination method** (`self_report` · `parent_reported` · `verified_credential` · `age_estimation_signal` for age; `self_report` · `billing_address` · `geo_ip` · `verified_credential` for residence) and a **confidence** (0.0–1.0) feeding the knowledge-state.

**Default for unknown = most-restrictive.** If we don't know the age, treat as sub-13 (apply the prohibition-floor rules). If we don't know the residence, treat as the strictest applicable regime. The worst case is over-restriction, not under-restriction.

**v1 determination-method set:** `self_report` + `parent_reported` (age); `geo_ip` + `billing_address` (residence). `verified_credential` and `age_estimation_signal` are v1.1 or later.

**Data-model shape (B3: profile + history):** the profile carries the *current* state (`age_knowing` jsonb, `residence_knowing` jsonb) for runtime reads; a separate `knowledge_assertions` table carries the *history* (one row per knowledge event: person, axis, method, confidence, timestamp). The engine reads the profile; the audit uses the assertions.

**Why B3 (not B1: profile-only, or B2: assertions-only):** the audit trail is the *legal artifact* for the COPPA "actual knowledge" doctrine (the legal question is *when* the knowledge was acquired, not just *whether*) and for GDPR Art 8 "reasonable efforts" verification. B1 loses the history; B2 adds read latency per LLM call. B3 puts the current state on the profile (cached) and the history in the assertions table (audit-only). The cost is bounded.

**Tag: SUPERSEDES the prior 2-knowledge-state model (unknown, known under threshold) with the two-axis model.**

### 3.4 — Engine placement and population workstream

**C1-A: Engine inside identity-foundation.** The engine + schema + policy-tables data all live in identity-foundation. The compliance/policy domain is *consumed* by identity-foundation; the engine is *part of* identity-foundation. The policy-tables-as-data move (3.5) handles the cadence issue: legal changes update the *data* (table contents), not the *code* (engine). The engine reads from the table; table updates don't force a code deploy.

**C2-B: Population as a separate workstream, orchestrated under the identity-foundation roadmap.** Same shape as the `age-consent-landscape/` PoC: a research/cadence function, separate owner, separate cadence. Identity-foundation engineering reads from the populated tables; the population is not engineering's job. The workstream lives in identity-foundation's roadmap as a *named sub-stream* (not a peer stream) — owner reports into identity-foundation PM for *sequencing*, but the *content* (what the cells say) is the regulatory research function.

**Tag: NEW (the engine-inside-identity-foundation + population-as-separate-workstream split is first explicitly ratified here).**

### 3.5 — Policy tables as data (D-3.1)

**The engine's policy tables (the (age × residence × knowledge) → policy dimensions rows) are *data*, not *code*.** They live in the database, not the source tree, and they evolve on legal/regulatory cadence (a new EDPB guideline, a new Member-State threshold, a platform ToS change). The codebase contains the engine + the schema; the data lives in a `policy_*` table set that the architect or a compliance engineer can update without a code deploy.

**Tag: NEW (the policy-tables-as-data decision is first explicitly ratified here; it's the implementation shape that makes the engine maintainable on its actual cadence).**

---

## §4 — The router decision (decision #5 from the conversation)

### 4.1 — Decision, stated

**The product ships a *router* that is provider-and-model-agnostic at the architecture level. The launch provider set is small and concrete (illustrative — see 4.3). The agnosticism is a *seam*, not a *fleet*. The router is downstream of the policy engine: it reads from a vetted `allowed-models` table, filtered by the engine's eligibility output.**

This is the second load-bearing architectural decision. Gemini is contractually closed to minors (per the gemini-minors ZDR research) — the architecture cannot be "use whatever model is best" because the model *and* the service *and* the region are each a compliance axis.

**Tag: SUPERSEDES two pieces of prior canon:**
- Prior routing canon "Family standard = Gemini-only" — *invalidated by the gemini-minors ZDR research (Vertex AI is §20(d)-closed to minors).*
- Prior **GATE-1 minor-routing** ("pin 13–17 minors to a papered/ZDR LLM endpoint") — *re-spec: the policy-engine output becomes the eligibility filter, and the papered/ZDR endpoint is a vetted row in the allowed-models table, not a hard-coded routing rule.*

Both are supersession items, not amendments. The architecture needs an ADR (likely `MMT-ADR-0014` or a router-ADR) that re-bases the routing layer on the policy-engine output.

### 4.2 — The 3-param runtime / 4-param vetting split (B1)

**The router's runtime key is 3 parameters: `model · service_provider · serving_region`** (the model-provider is baked into the model — Claude is always Anthropic, etc.). The **vetting pipeline** (offline, on-cadence) evaluates 4-axis (`model · provider_via_service · service · region`) × criteria (ToS, ZDR, log-retention, training-data, age-closure) and emits rows into the **allowed-models table** with metadata describing which criteria passed.

The router never sees vetting criteria directly. The router sees a vetted row, filtered by the policy engine's eligibility output. The router's job is to pick *within* the filtered set by complexity, cost, load.

**Why 3-param runtime (B1, not B2/B3):** the picker picks *within* the vetted set. The model-provider is *implicit* in the model row. Making it explicit at runtime (B2) is redundant — the vetting pipeline already evaluated "Anthropic-Claude-via-Azure" and "Anthropic-Claude-via-OpenRouter" as different rows. Adding more runtime axes (B3) is the half-migration pattern: the runtime key starts making compliance decisions that should be in the vetting pipeline.

**Tag: NEW (the 3-param runtime / 4-param vetting split is first explicitly ratified here).**

### 4.3 — The illustrative launch set (4-A reframed)

**The launch set is *illustrative*, not ratified in this memo.** The four providers are an *example set* representing how the chips may fall. The actual launch set is the *output* of the vetting-research workstream, not a decision we make in the memo.

The illustrative set (per the A-vs-B conversation):

| Provider | Role | Vetting status |
|---|---|---|
| **Anthropic (Claude)** | Primary US-domiciled route; minor-safe per usage policy | Open — vetting PoC pending |
| **OpenAI** | Primary US-domiciled route; under-18 ToS nuances (Root-system model spec) | Open — vetting PoC pending |
| **Mistral** | EU-domiciled route (model + serving region) | Open — vetting PoC pending |
| **DeepSeek via papered service** | Cost-effective non-US route; *only* the model weights — vetting is for the service layer | Open — vetting PoC pending |

**The ratified launch set is the vetting-research workstream's output.** The memo commits the *shape* (US-primary + EU-primary + cost-effective alt) and the *process*; the workstream commits the *set*.

### 4.4 — Age-appropriate is *not* a router concern (C2: envelope-side)

The "age-appropriate" question is a *post-generation* check on the *output*, not a *pre-generation* check on the *model*. The router picks `(model, service, region)`; the model-side concern is whether the *output* is age-appropriate. The check attaches to the **envelope** at `apps/api/src/services/llm/envelope.ts:235-252`, not to the router.

**C2: envelope-side.** Router = picker. Envelope = safety. C1 (router does it) and C3 (both) conflate concerns. **v1 ships without a strong post-envelope content classifier** (Gap B is v1.1 per Path X); the model-vendor's refusal + the prompt-layer safety preamble (Gap G is closed in v1) is the v1 safety posture.

### 4.5 — Fallback ladder: tiered list for v1 (D2), scored graph deferred to v2

Within one cell of the policy matrix, the engine emits an *eligibility set* — the set of `(model, service, region)` tuples that are both vetted and policy-eligible. The router picks *within* that set. On failure, the router falls back to another tuple.

**D2: tiered list for v1.** Per-cell pre-defined tiers (primary → secondary → tertiary) with each tier being a vetted `(model, service, region)` tuple. The router tries tier 1, falls to tier 2 on failure, etc. Compliance is encoded in the tier definition (tier 1 = best compliance + best cost; tier 2 = best cost within compliance; tier 3 = last resort). v1's router is *not* adaptive; tiers are pre-defined.

**D3 (scored graph) deferred to v2.** The "graph not list" framing in the original memo is right in the long-term read but wrong for v1. v2 can layer adaptive scoring on top.

### 4.6 — Workspace-for-Education: out-of-scope *current read* (4-E reframed)

The gemini-minors ZDR research (2026-06-05) found that Workspace-for-Education Gemini is the only viable Google surface for a mixed-age AI-tutor product, but the integration shape is unresolved (3/5 confidence). **The memo's current read: Workspace-for-Education is out of scope as a route, kept as a policy-table data point.**

**This is a *current read*, not a locked decision.** The walkthrough's R-1 (parent-operator COPPA), R-2 (regime taxonomy), and R-3 (knowledge axes) may surface reasons to revisit — e.g., if the regime taxonomy carves out a US-district-tenant regime, the engine has to know about it; if the knowledge axes surface a 'tenant-type' dimension, the policy-table data point becomes a route-candidate. **The memo does not pre-empt the walkthrough; it captures the current state.**

### 4.7 — Decisions the conversation surfaced but did not yet ratify

- **D-4.1 (RATIFIED as 4.4)** Age-appropriate checking is *not* a router concern; it's envelope-side.
- **D-4.2 (RATIFIED as 4.5)** Fallback ladder is tiered list for v1 (D2), scored graph deferred to v2 (D3).
- **D-4.3 (RATIFIED as 4.3)** Launch set is illustrative; the actual set is the vetting-research workstream's output.

---

## §5 — Vetting vs. routing (the separation of concerns)

### 5.1 — The split, stated (A1: hard split)

**Two concerns, two cadences, two workstreams. Hard split.** Vetting and routing are *different code paths*, *different schemas*, *different owners*. The router imports the table; the pipeline emits the table; they share a *contract* (the table schema) and nothing else.

| Concern | What it decides | Cadence | Output | Owner |
|---|---|---|---|---|
| **Vetting pipeline** | "Is this (model · service · region) tuple *ever* acceptable?" | Offline, on legal/contractual change | Rows in the `allowed-models` table with vetting-criteria metadata | Vetting-research workstream (separate owner, *orchestrated under* the identity-foundation roadmap per C2-B) |
| **Routing** | "Which vetted row serves *this* request?" | Online, per-LLM-call | The selected row's invocation | Router (inside identity-foundation, layered on the policy-engine output) |

**Why A1 (hard split), not A2 (soft split in same codebase) or A3 (no split):** A2 is the *exact* pattern that produced the PR 376 slip — the new code ships, the old single-flag kill-switch stays, the two layers drift. A1 means the contract is the *table schema*; the two workstreams cannot drift because they don't share code. The cost is bounded: the table schema is a small, stable surface.

**The flow:** `vetting-pipeline → allowed-models-table → policy-engine-filter → router`. The router reads from the table; the policy engine filters the table by `(age × residence × knowledge)` cell; the vetting pipeline emits the table.

### 5.2 — Do-not-do lists (B1: explicit, tested)

**The router does *not*:**

- Evaluate ToS, ZDR, log-retention, training-data, or age-closure criteria. Those are the vetting pipeline's job. The router reads the *output* of the evaluation (the row), not the criteria themselves.
- Reach outside the allowed-models table. The router's input is the table, not "all models in the world."
- Decide whether a model is "appropriate" for an age. That's envelope-side (per 4.4), not routing.
- Make compliance decisions at request time. The router's compliance decisions are *implicit* in the table; the router doesn't *re-evaluate* at runtime.

**The vetting pipeline does *not*:**

- Make per-request decisions. The pipeline emits a static table; the engine filters; the router picks.
- Run at request time. The pipeline is offline, on cadence.
- Decide routing for a specific user. The engine filters by `(age × residence × knowledge)` cell; the router picks within the filtered set.

**B1: explicit do-not-do lists, tested.** Each ADR (policy engine, router) carries its own do-not-do list. The lists are *tested* in the integration test suite (e.g., a test that verifies the router does not call a ToS-evaluation function). The lists serve as a *code-review checklist* and a *forward-only ratchet* — once shipped, the list grows when new prohibited behaviors are identified, never shrinks.

**Tag: NEW (the A1 hard split + B1 explicit do-not-do lists are first explicitly ratified here).**

---

## §6 — Reopened canon (the honest list)

The A-vs-B conversation reopens, refines, amends, supersedes, or confirms the following canon. The walkthrough prep (in `policy-engine-spine-walkthrough/`) inherits this list as the input to its R-0 through R-5 rulings.

**REFINES (5 items):**

| Canon item | Status | Reason | Downstream action |
|---|---|---|---|
| Prior 5-persona set (Solo adult learner, Independent teen, Parent-managed child, Family operator, Mentor/tutor) | **REFINES** | New 6-persona set: Family operator split into Subscription administrator + Household mentor; Mentor/tutor renamed to Non-familial mentor; Household mentor is a new in-home role. Capability surface is unchanged; enumeration changes (5→6). | §1.2 of memo is the canonical reference. PRD Part X is amended in enumeration. |
| "Ward" terminology in CLAUDE.md / AGENTS.md / memory / ontology / CONTEXT.md | **REFINES** | New term is "charge." | Sweep across all five file sets. Post-memo worklist (end-of-session roadmap discussion). |
| Prior "13+ is the age floor" framing | **REFINES** | New framing: 13+ = consent-capacity floor for the default knowledge state. Three-axis model is the load-bearing read. | §2.2 of memo is the canonical reference. |
| Prior "sub-13 in v1" or "sub-13 deferred to v2" framing | **REFINES** | New framing: Path X — v1 closes 13+ load-bearing gaps + future-proofs data model pre-baseline; v1.1 closes sub-13-specific gaps and ungates. | §2.4 of memo is the canonical reference. |
| PRD Part IX open legal items (VPC method, per-market consent-age table, US App-Store-Accountability, store-payer ↔ `payer_person_id` mapping, birthday-crossing autonomy upgrade, unified multi-role surface) | **REFINES** | G-6 (birthday-crossing autonomy) is now resolved (6b explicit takeover, branching on `charges.has_own_account`). The unified multi-role surface is still open (now sharper because the personas are split). The other 4 items remain open. | §1.6 of memo (G-6 ruling). PRD Part IX is amended on G-6 only. |

**AMENDS (3 items):**

| Canon item | Status | Reason | Downstream action |
|---|---|---|---|
| Ratified `MMT-ADR-0011/0012` (data model realization + baseline reset, ratified 2026-06-04) | **AMEND** | Needs the prohibition-floor primitive (kind column, 3-A) + the two-axis knowledge model (B3: profile + history, 3-B) + the Payer sub-field with primary/secondary role + the Sub-admin-as-profile-mgmt capability + the Guardian = consent-only edge (G-3 3a, G-4 4b, G-6 6b branching). | New `MMT-ADR-0013` (policy-engine spine ADR); lockstep with `data-model.md` per `MMT-ADR-0000`. Pre-baseline window. |
| Prior "Payer is a persona" or "exactly 1 Payer" framing | **AMEND** | New: Payer is a *sub field*, not a persona. v1 supports 3a/3b/3c holders. 1 primary + max 1 secondary; secondary = view+update PM only. | §1.4 of memo (Payer ruling). Capability matrix in PRD Part IV is amended. |
| Prior "Guardian = data access" or "Guardian = profile mgmt" framing | **AMEND** | New: Guardian = consent only. Mentor = data access. Profile mgmt = bundled with Sub admin (C). | §1.5 of memo (G/P/M split). Capability matrix in PRD Part IV is amended. |

**SUPERSEDES (4 items):**

| Canon item | Status | Reason | Downstream action |
|---|---|---|---|
| Prior routing canon: "Family standard = Gemini-only" | **SUPERSEDE** | Gemini is contractually closed to minors (gemini-minors ZDR research). | Supersession entry in routing ADR lineage. |
| Prior GATE-1 minor-routing ("pin 13–17 minors to a papered/ZDR LLM endpoint") | **SUPERSEDE** | Re-spec: the policy-engine output becomes the eligibility filter; the papered/ZDR endpoint is a vetted row in the allowed-models table, not a hard-coded routing rule. | Bundled into the router ADR. |
| Prior single-primitive policy-engine model (consent-edge only) | **SUPERSEDE** | Two-primitive model (prohibition-floor + consent-edge, kind column, 3-A). | `MMT-ADR-0013` carries the new primitive shape. |
| Prior 2-knowledge-state model (unknown, known under threshold) | **SUPERSEDE** | Two-axis model (known-age × known-residence, B3: profile + history, default-for-unknown = most-restrictive, 3-B). | `MMT-ADR-0013` carries the new knowledge model. |

**CONFIRMS (3 items):**

| Canon item | Status | Reason | Downstream action |
|---|---|---|---|
| Ratified PRD Part III (the three-axis age model: consent / contract / content) | **CONFIRM** | The 13+ floor restatement is a *recap* of the three-axis model, not a change to it. | No canon change. |
| Ratified PRD Part VIII (the invariants — definition of "done") | **CONFIRM** | Not affected by the A-vs-B decisions. | No canon change. |
| The capability matrix structure (Part IV: membership-roles + edges + Payer-field) | **CONFIRM** | The matrix structure is unchanged; the *contents* are amended (Payer = sub field; Guardian = consent only; Mentor = data access; profile mgmt = Sub admin). | No structural change. |

**Net effect:** 5 REFINES, 3 AMENDS, 4 SUPERSEDES, 3 CONFIRMS = **15 rows**. **No canon is silently changed.**

**Note on prior ratification:** the PRD-Answer doc is one input, not a closed door. Refinements surfaced in the A-vs-B conversation are *named* in this table rather than silently absorbed. The PRD-Answer doc's "ratified" stamp applies to what it *covers*; the A-vs-B conversation covers what it doesn't (the engine's shape, the router's split, the persona refinement, the Payer/Guardian/Mentor/Sub-admin split, the charge terminology).

---

## §7 — Downstream work-package list

This memo's decisions become the following work-packages. The walkthrough prep (in `policy-engine-spine-walkthrough/`) inherits WP-1 through WP-4 as the post-walkthrough closure items; WP-5 through WP-10 are the pre-walkthrough (Claude drafts) and post-walkthrough (PM signs) closure items.

**Pre-walkthrough (Claude drafts before the live session):**

| WP | Work-package | Inputs | Owner | Status |
|---|---|---|---|---|
| **WP-1** | `MMT-ADR-0013` (policy-engine spine ADR) draft — two-primitive model (3-A, kind column) + regime taxonomy (R-2 input) + knowledge axes (3-B, B3: profile + history) + 3-param router key (4-B) + flow lock (5-A, A1: hard split) | §3, §4 of memo; R-0/R-2/R-3/R-4 of walkthrough | Claude (drafts) + architect (ratifies) | **Open** |
| **WP-2** | `MMT-ADR-0011` amendment scope — prohibition-floor primitive + age × residence × knowledge × consent-state seam columns + two-axis knowledge assertions table + Payer sub-field with primary/secondary + Sub-admin-as-profile-mgmt + Guardian = consent-only edge (G-3 3a, G-4 4b, G-6 6b branching) | §1, §3 of memo; `MMT-ADR-0013` (WP-1) | Claude (drafts) + architect (ratifies) | **Open** — pre-baseline (cheap) |
| **WP-3** | Router ADR (likely `MMT-ADR-0014` or extension to `MMT-ADR-0013`) — 3-param runtime key, 4-param vetting axis, A1 hard split with table schema as the contract, B1 explicit do-not-do lists tested, D2 tiered-list fallback for v1 (D3 scored graph deferred to v2), supersession of "Family = Gemini-only", re-spec of GATE-1 | §4, §5 of memo; R-4 of walkthrough; gemini-minors ZDR research | Claude (drafts) + architect (ratifies) | **Open** |
| **WP-4** | Vetting-research workstream kickoff brief — same shape as `age-consent-landscape/`, separate owner, *orchestrated under* the identity-foundation roadmap (C2-B refinement). Inputs: the illustrative launch set (4-A) and the regime taxonomy (R-2). Outputs: per-cell allowed-models table rows with vetting criteria metadata. | §3, §4 of memo; the locked R-2 regime taxonomy and the vetting workstream's findings on the launch set | Separate owner (TBD, reports into identity-foundation PM) | **Open** — parallel to walkthrough |
| **WP-5** | `ROADMAP.md` update — Phase F.1 closure, Phase F → Phase G transition, post-walkthrough deliverables list, end-of-session roadmap adjustments (charge-terminology sweep, Phase J expansion, WP-4 placement, walkthrough's role) | This memo (after ratification); the walkthrough's rulings; end-of-session discussion | Claude | **Open** — pre-walkthrough |

**Pre-walkthrough (supporting artifacts):**

| WP | Work-package | Inputs | Owner | Status |
|---|---|---|---|---|
| **WP-6** | Memory note in `.claude/memory/` — durable record of the 25 decisions: 6-persona set, Payer/Guardian/Sub-admin/Mentor split, Path X, 3-param/4-param router, two-primitive, engine placement, routing canon supersessions | This memo (after ratification); the walkthrough's handoff | Claude | **Open** — pre-walkthrough |
| **WP-7** | Handoff doc — `_handoffs/2026-06-XX-a-vs-b-decision-capture.md` (this memo's distilled form) + the post-walkthrough `_handoffs/2026-06-XX-policy-engine-spine-ruling.md` | This memo (after ratification); the walkthrough's capture ledger | Claude | **Open** — pre-walkthrough |

**Post-walkthrough (after the live session runs):**

| WP | Work-package | Inputs | Owner | Status |
|---|---|---|---|---|
| **WP-8** | Phase J expansion — `CLAUDE.md` / `AGENTS.md` / `.claude/memory/` cleanup, applying the A-vs-B decisions as the source of truth. Includes the charge-terminology sweep, the 6-persona update, the Payer/Guardian/Sub-admin/Mentor split, the Path X framing, the 3-param/4-param router split, the two-primitive model, the engine-inside-identity-foundation decision, the routing canon supersessions. MoSCoW: MUST = memory-only or ≥2-source drifting; SHOULD = single canon spot needing extraction; SKIP/tombstone = superseded. | This memo (after ratification); the walkthrough's rulings | Claude (drafts) + PM (ratifies) | **Open** — post-memo, pre- or post-walkthrough (PM's call) |

**Contingent (post-walkthrough, fires only if R-1 is `COPPA_DOES_NOT_APPLY` or `UNCLEAR_WITH_DEFENSIBLE_POSTURE`):**

| WP | Work-package | Inputs | Owner | Status |
|---|---|---|---|---|
| **WP-9** | Counsel follow-up — codify the defensible posture (or the COPPA_DOES_NOT_APPLY ruling) into a written opinion; capture the US sub-13 carve-out cell in the regime-taxonomy; potentially flip D-2.2 (sub-13 US v1 = no service) to "open via parent-operator" | R-1 ruling; V-1 verification | counsel | **Open (contingent)** |
| **WP-10** | Sub-13 v1.1 ungating workstream — closes Gaps B, D, E (sub-13-specific, deferred from v1 per Path X), the sub-13 EU onboarding + consent flows, the G7 VPC vendor procurement for the EU "reasonable efforts" bar, the per-Member-State consent-age-axis handling. Triggered by demand signal + G7 procurement + policy-engine sub-13 cell verification (the three preconditions). | WP-1, WP-4 outputs; demand signal; G7 procurement | Separate workstream | **Open (contingent)** — demand-triggered |

**Contingent (post-walkthrough, fires only if R-1 is `COPPA_APPLIES`):**

| WP | Work-package | Inputs | Owner | Status |
|---|---|---|---|---|
| **WP-9-alt** | Sub-13 v2 path posture memo — codify the COPPA_APPLIES ruling into a written record; the sub-13 v1.1 path remains launch-blocked (requires full VPC); no new US sub-13 route is opened via parent-operator | R-1 ruling | Claude + counsel | **Open (contingent)** |

**Net:** 8 unconditional WPs (WP-1 through WP-8) + 2 contingent WPs (WP-9 and WP-10, or WP-9-alt). The contingent WPs fold in based on the walkthrough's R-1 verdict.

**Tag: NEW (this is the first explicit ratification of the post-Phase-E work-package list; it folds Phase F closure + Phase G entry as a single sequenced workstream, with the contingent WPs as a forward-only ratchet for the R-1 outcome).**

---

## §8 — What this memo does *not* do

- **It does not re-derive the PRD-Answer doc's ratified sections.** The memo *adds to* the PRD-Answer doc; it does not re-litigate it. Where the A-vs-B conversation refines ratified intent, the refinement is *named* in §6.
- **It does not ratify the policy-engine *implementation* details.** The walkthrough's R-0 through R-5 rulings are the implementation-shape ratifications. The memo is the *decisions* layer; the walkthrough is the *shape* layer; the ADRs (WP-1, WP-2, WP-3) are the *implementation* layer. Three layers, three artifacts.
- **It does not close the open legal items in PRD Part IX (other than G-6).** VPC method, per-market consent-age table, US App-Store-Accountability, store-payer ↔ `payer_person_id` mapping, unified multi-role surface — all still open. G-6 (birthday-crossing autonomy upgrade) is now resolved (6b explicit takeover, branching on `charges.has_own_account`).
- **It does not commit a sub-13 phase-2 timeline.** D-2.1 = demand-triggered; the trigger is demand signal + G7 VPC vendor + policy-engine sub-13 cell verification. No calendar date. Phase-2 fires v1.1, demand-triggered, three preconditions.
- **It does not pre-empt the walkthrough.** The 4-E (Workspace-for-Education) statement is a *current read* (out of scope as a route, kept as a policy-table data point), not a locked decision. The walkthrough's R-1, R-2, and R-3 may surface reasons to revisit. The memo captures the current state; the walkthrough may amend it. Same shape as 4-A's reframing (illustrative launch set, not ratified).

**Lifecycle (per Option III):** the memo is a *grilling record* — preserved as a tagged commit, not updated. Future readers find the ADRs (current truth) + the handoff (distilled) + the memo (audit trail). The memo is read once, then the ADRs and handoff are read going forward.

---

## §9 — Grilling-session sign-off (post-grilling, 2026-06-06)

**The 25 decisions ratified in the grilling session:**

| # | Decision | Locked as |
|---|---|---|
| 1 | 6-persona set (split Family operator → Subscription admin + Household mentor) | §1.2 |
| 2 | Charge terminology (not "ward") | §1 + post-memo worklist |
| 3 | D-1.1, D-1.2 scoped to Non-consenting minor persona only | §1.3 |
| 4 | Payer = sub field, not persona | §1.4 |
| 5 | Payer v1 holders: 3a/3b/3c | §1.4 |
| 6 | Payer 1 primary + max 1 secondary, secondary = view+update PM only | §1.4 |
| 7 | Profile mgmt bundled with Sub admin (C) | §1.5 |
| 8 | Guardian = consent only | §1.5 |
| 9 | Mentor = data access only | §1.5 |
| 10 | G-3: 3a (exactly 1 Guardian per charge) | §1.6 |
| 11 | G-4: 4b explicit qualification ENUM | §1.6 |
| 12 | G-6: 6b explicit takeover, branching on `charges.has_own_account` | §1.6 |
| 13 | 13+ = consent-capacity floor (3-axis restatement) | §2.2 |
| 14 | Build-but-gate for sub-13 EU/ROW | §2.3 |
| 15 | Sub-13 US v1 = no service (R-1 can flip) | §2.4 |
| 16 | D-2.1 demand-triggered, three preconditions | §2.4 |
| 17 | Path X: v1 closes 13+ load-bearing + future-proofs; v1.1 closes sub-13-specific | §2.4 |
| 18 | Engine: A1 (kind column, two primitives) | §3.2 |
| 19 | Knowledge: B3 (profile + history, default = most-restrictive) | §3.3 |
| 20 | Engine placement: C1-A (inside identity-foundation) | §3.4 |
| 21 | Population: C2-B (separate workstream, orchestrated under identity-foundation roadmap) | §3.4 |
| 22 | Router: 4-A reframed (illustrative launch set), 4-B B1 (3-param runtime), 4-C C2 (envelope-side), 4-D D2 (tiered list v1), 4-E reframed (Workspace-for-Education is current read, walkthrough may amend) | §4 |
| 23 | Vetting vs routing: A1 hard split + B1 explicit do-not-do lists | §5 |
| 24 | 15 rows in reopened-canon list (5/3/4/3) | §6 |
| 25 | 8 unconditional + 2 contingent WPs; Option III (snapshot → handoff → ADRs) | §7, §8 |

**Sign-off block:**

- **PM signs:** §1.2, §1.4, §1.5, §1.6, §2, §3, §6, §7 — the *decisions* layer.
- **Architect signs:** §4, §5 — the routing + vetting decisions.
- **Counsel signs:** R-1 ruling when the walkthrough runs (not in this memo).
- The signed memo is the *grilling record* and the *input to the walkthrough*.

**Anything missed?** The 25 decisions cover the A-vs-B conversation's 5 high-level decisions + the grilling's 20 sub-decisions. If the PM recalls a 26th, it goes here.

**Sign-off:** the PM signs the §6, §7 lists at the end of the session; the signed memo is the §7 work-package WP-7's input.

---

*End of memo. The decisions are captured; the walkthrough prep inherits the §6, §7 lists; the Phase F.1 sub-thread on the ROADMAP.md can close on this artifact.*
