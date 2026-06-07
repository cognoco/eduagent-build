# Walkthrough — Policy-Engine Spine

> **The live agenda for the 90–120 minute walkthrough session.** Read by the PM, the live legal counsel, and the architect (facilitator) in advance of the session. The session captures its rulings into `CAPTURE-LEDGER.md`.
>
> **For the facilitator's operational brief** (time-box discipline, fallbacks, post-session deliverables), see `FACILITATOR-BRIEF.md`. This document is the participant-facing version.
>
> **For the curated participant read** (the input the walkthrough leans on), see `BRIEFING-PACKET.md`. The legal-research backbone is in `SYNTHESIS.md`. Citations are in `SOURCES.md`.

---

## What we're here to decide

**The question:** What is the *spine* of the policy engine that will key the router, the consent model, the launch floor, and the sub-13 carve-out?

**The six rulings we will make today** (in dependency order):

1. **R-0** — Two-primitive model. Is the prohibition-floor + consent-edge framing the right spine, and is `MMT-ADR-0013` the right ADR to draft it under?
2. **R-1** — Sub-13-via-parent-operator COPPA ruling. (Counsel's only ruling.) Does the parent-owned-account / no-child-login path trip COPPA "directed to children" or "actual knowledge"?
3. **R-2** — Regime taxonomy. What's the locked first-class regime enum (5–8 entries) the policy engine keys on?
4. **R-3** — Knowledge axes. Two axes (age × residence) with determination method + confidence; v1 determination-method set; default-for-unknown = most-restrictive.
5. **R-4** — Router key. 3-param runtime (`model · service_provider · serving_region`) / 4-param vetting (`model · provider_via_service · service · region`); the vetting-pipeline → allowed-models-table → policy-engine-filter → router flow.
6. **R-5** — Launch set. The locked launch provider set (Anthropic · OpenAI · Mistral · DeepSeek-via-papered-service), with vetting deferred to a parallel research workstream. Workspace-for-Education Gemini is **out of scope as a route**.

The walkthrough is a *spine workshop*, not a *plan*. The output is the *shape* of the engine and the locked enums (regime list, determination-method set, launch set), which become the inputs to the post-walkthrough ADR drafting.

---

## Agenda (90–120 minutes)

| Block | Duration | What happens | Reference |
|---|---|---|---|
| **0. Opening + verification status** | 10 min | Verify who is in the room. Surface the "what we decided verbally, what we haven't ratified" framing. Hand counsel the `SOURCES.md` verification worklist. Set the time-box. | Briefing packet §1, §2; `SOURCES.md` |
| **1. R-0 — Two-primitive model** | 15 min | Walk the prohibition-floor vs. consent-edge framing. Surface the PoC's `consent_unlockable: false` finding as the load-bearing example. Rule: locked / refinement / rejected. | Briefing packet §3; `age-consent-landscape/README.md` |
| **2. R-1 — Sub-13-via-parent-operator COPPA ruling** | 15 min | Counsel rules on whether the parent-owned-account / no-child-login path is a US-COPPA-safe route. R-1 result feeds the regime-taxonomy's "US sub-13 carve-out" cell. | Briefing packet §4; `SYNTHESIS.md` Layer 1, Layer 5 |
| **3. R-2 — Regime taxonomy** | 15 min | Walk the candidate 5–8 regimes. Rule: locked / refinement / rejected. Decide the first-class regime list. | Briefing packet §5; `age-consent-landscape/data.json` |
| **4. R-3 — Knowledge axes** | 15 min | Walk the two-axis model (age × residence) with determination method + confidence. Rule the default-for-unknown = most-restrictive. Decide the v1 determination-method set. | Briefing packet §6 |
| **5. R-4 — Router key** | 10 min | Walk the 3-param runtime / 4-param vetting split. Rule the 3-param key. Confirm the vetting-pipeline → allowed-models-table → router flow. | Briefing packet §7 |
| **6. R-5 — Launch set** | 10 min | Walk the candidate launch set. Rule: locked / refinement / rejected. Confirm Workspace-for-Education is out of scope as a route. | Briefing packet §8 |
| **7. Closing + capture** | 5–10 min | Read back the six rulings. Capture into `CAPTURE-LEDGER.md`. Identify homework follow-ups. Name the post-walkthrough deliverables. | `CAPTURE-LEDGER.md` |

**Time-box discipline:** R-1 is the legal ruling and the one most likely to need iteration — let it run over if it must. If R-2 (regime taxonomy) drags, the cleanest cut is the 4th-tier sub-cells (per-Member-State threshold detail) — the 5–8-regime skeleton is the spine, the per-Member-State detail is research-input. If R-0 cannot be ruled in 15 minutes, capture the discussion, mark R-0 as "needs follow-up," and proceed to R-2/R-3 with R-0 marked as "to be confirmed in writing within 48 hours." Do not let R-0's open status block the rest of the spine.

---

## Block 0 — Opening + verification status (10 min)

**What the facilitator says (in plain English):**

> "Thanks for making the time. The question we're here to ratify is: what's the *spine* of the policy engine that will key the router, the consent model, the launch floor, and the sub-13 carve-out?
>
> A note on what this walkthrough is and isn't. It's not a re-litigation of the 13+ launch floor — that was already ruled in the Phase-E handoff on June 4. It's not a legal walkthrough for the whole under-13 question — that's been done, the synthesis is in `SYNTHESIS.md`, and counsel can take the `SOURCES.md` verification worklist away as homework. The rulings we make today are six: R-0 (the two-primitive model), R-1 (one specific legal question on the parent-operator path), R-2 (regime taxonomy), R-3 (knowledge axes), R-4 (the router key), and R-5 (the launch set).
>
> R-0 rules first because the router and the launch set both read the primitives it defines. R-1 can happen anywhere in the agenda but is load-bearing for the sub-13 v2 path, so I want it captured explicitly.
>
> A note on verification: the legal synthesis we built earlier leaned on regulator primary pages (FTC, ICO, EDPB, Datatilsynet) and a handful returned 403s when our research agents fetched them. The URLs are real and authoritative, but the exact text of a handful of citations is pending counsel verification. **Counsel, I'd ask you to take `SOURCES.md` as the verification worklist** — re-verify the unverified primaries in the room or as homework, and we can adjust the briefing in real time if anything turns up.
>
> Finally, a framing note. The walkthrough outputs a *spine*, not a *plan*. The spine becomes the input to the policy-engine ADR (likely `MMT-ADR-0013`), which then becomes the input to the data-model amendment and the router ADR. The spine doesn't say *how* the engine is built; it says *what shape* the engine has. That's the lens to bring to each ruling.
>
> Time-box: 90 to 120 minutes. Let's go."

**Outputs from this block:** counsel has the `SOURCES.md` worklist; PM and architect have the time-box; room agrees on dependency order.

---

## Block 1 — R-0: Two-primitive model (15 min)

**What the facilitator walks the room through:**

1. The PoC's headline finding (1 min) — `_wip/identity-foundation/age-consent-landscape/README.md` "What the experiment tells us" §1: "the 'consent-unlockable' column is the most differentiated dimension across cells. Many cells in the matrix show `consent_unlockable: false` — meaning the rule binds regardless of whether the user (or their guardian) has consented." This is the load-bearing example.
2. The two-primitive model (3 min) — prohibition-floor (consent-unlockable; binds regardless) + consent-edge (unlockable by guardian/user consent). Walk one example cell of each. AI Act Art 5(1)(b) = prohibition-floor. GDPR Art 8 with reasonable-efforts verification = consent-edge.
3. Why one primitive can't model both (3 min) — the under-13 PoC's 7-of-8-activity-categories finding. The data model needs both primitives as first-class. Without it, either you under-model the prohibition-floor (and route a 9-year-old to Gemini, which §20(d) forbids) or you over-model the consent-edge (and refuse a 17-year-old's access to a perfectly-legal route).
4. The pre-baseline window (3 min) — `MMT-ADR-0011/0012` describes a fresh create-from-empty baseline ratified 2026-06-04. Amending the schema pre-baseline is cheap; amending post-baseline is append-only. **This is the window for `MMT-ADR-0013`.**
5. Discussion + ruling (5 min) — capture the ruling, the inline primitive list (prohibition-floor + consent-edge), and any caveats.

**Ruling format:** LOCKED · REFINEMENT · REJECTED · SPLIT · DEFER.

**Outputs from this block:** R-0 ruling text + the locked primitive pair (or a refinement if REFINEMENT, or a rejection if REJECTED). The post-walkthrough ADR drafting has the primitive scope.

---

## Block 2 — R-1: Sub-13-via-parent-operator COPPA ruling (15 min)

**What the facilitator walks the room through:**

1. The hypothesis, in one sentence (1 min) — a parent has an account, creates a *managed-child profile* (no child-side login), the parent uses our product to help with a sub-13 child's homework. Question: does COPPA apply?
2. The two test cases (5 min) —
   - **"Directed to children"** (16 CFR Part 312.2): multi-factor test (subject matter, visual content, language, advertising, audience composition). The parent-operator pattern is arguably not "directed to children" if the marketing, the subject matter, and the audience composition are all parent-primary.
   - **"Actual knowledge"** (16 CFR Part 312.2): operator "asks for — and receives — information that allows it to determine the user is under 13." A managed-child profile whose only creation signal is "this is my sub-13 child, here's a profile for them" is a tricky middle case — parent-supplied profile data may or may not be "actual knowledge" of the child's age, depending on counsel's reading.
3. Counsel's ruling (5 min) — counsel reads the room the test cases and rules. Three verdict options:
   - **COPPA_APPLIES** — the regime-taxonomy R-2 cell for US-sub-13 is "build the full VPC path or do not serve"; v2 path is preserved as launch-blocked.
   - **COPPA_DOES_NOT_APPLY** — the parent-operator path is a US-COPPA-safe route; the regime-taxonomy R-2 cell encodes it; sub-13 v2 path opens.
   - **UNCLEAR_WITH_DEFENSIBLE_POSTURE** — the policy engine encodes the defensible posture as the default (e.g., "do not collect child's age at the controller layer; treat parent-supplied profile data as parent-data, not child-data"); the sub-13 v2 path is open with the posture as the gate.
4. Capture the ruling, the verbatim counsel language, the rationale, the dissents (4 min).

**Ruling format:** `COPPA_APPLIES` · `COPPA_DOES_NOT_APPLY` · `UNCLEAR_WITH_DEFENSIBLE_POSTURE`. Counsel sign-off is mandatory.

**Outputs from this block:** R-1 ruling text + the policy-table cell for US-sub-13. The post-walkthrough `MMT-ADR-0013` drafting has the US-sub-13 regime-taxonomy input.

---

## Block 3 — R-2: Regime taxonomy (15 min)

**What the facilitator walks the room through:**

1. Why regimes, not countries (3 min) — a 200-country enum is a maintenance problem and a correctness problem. A regime enum (5–8 entries) is a data-update, not a schema change. The PoC's 10 jurisdictions are a research sample; the engine is regime-keyed.
2. The candidate list (5 min) — walk the briefing packet §5 candidate enum (`US_COPPA`, `EU_GDPR_16`, `EU_GDPR_15`, `EU_GDPR_14`, `EU_GDPR_13`, `UK_AADC`, `ROW`). Discuss any additions/deletions. Note: per-Member-State detail is research-input, not a regime — refuse scope creep.
3. The "sub-13-via-parent-operator" cell (3 min) — if R-1 ruled `COPPA_DOES_NOT_APPLY` or `UNCLEAR_WITH_DEFENSIBLE_POSTURE`, the `US_COPPA` regime needs a sub-cell encoding the parent-operator path. If R-1 ruled `COPPA_APPLIES`, the sub-13 cell collapses to "VPC required or no service."
4. Discussion + ruling (4 min) — capture the locked regime enum, with any per-cell sub-13 carve-out.

**Ruling format:** LOCKED · REFINEMENT · REJECTED · SPLIT · DEFER. The ruling text **must** include the locked regime enum as an inline list.

**Outputs from this block:** R-2 ruling text + the locked regime enum. The post-walkthrough `MMT-ADR-0013` drafting has the first-class regime list.

---

## Block 4 — R-3: Knowledge axes (15 min)

**What the facilitator walks the room through:**

1. Why two axes, not one (3 min) — the under-13 synthesis's "actual-knowledge" trap is asymmetric: actual knowledge of *age* binds under COPPA; actual knowledge of *residence* binds regime-selection (`EU_GDPR_X`) but not the "actual knowledge" doctrine. Conflating them loses the trap's structure.
2. The two axes (3 min) —
   - **Known-age** — `self_report` · `parent_reported` · `verified_credential` · `age_estimation_signal`. Confidence 0.0–1.0.
   - **Known-residence** — `self_report` · `billing_address` · `geo_ip` · `verified_credential`. Confidence 0.0–1.0.
3. Default for unknown = most-restrictive (3 min) — the safety/legal default. Worst case is over-restriction, not under-restriction.
4. v1 determination-method set (3 min) — `self_report` + `parent_reported` (age) + `geo_ip` + `billing_address` (residence). `verified_credential` and `age_estimation_signal` are phase-2.
5. Discussion + ruling (3 min) — capture the locked determination-method set, the default-for-unknown rule, the v1 vs phase-2 split.

**Ruling format:** LOCKED · REFINEMENT · REJECTED · SPLIT · DEFER. The ruling text **must** include the v1 determination-method set as an inline enum.

**Outputs from this block:** R-3 ruling text + the v1 determination-method set. The post-walkthrough `MMT-ADR-0013` drafting has the knowledge-axis input.

---

## Block 5 — R-4: Router key (10 min)

**What the facilitator walks the room through:**

1. The two concerns (2 min) — **vetting pipeline** (offline, on-cadence; evaluates 4-axis × criteria; emits allowed-models-table rows with vetting metadata) vs. **router** (online, per-request; reads from allowed-models-table; picks by complexity/cost/load).
2. The split is the spine (3 min) — **3-param runtime key** (`model · service_provider · serving_region`); **4-param vetting axis** (`model · provider_via_service · service · region`); the flow is `vetting-pipeline → allowed-models-table → policy-engine-filter → router`.
3. Why this matters (2 min) — the router never sees vetting criteria directly. Conflating vetting with routing means the router re-implements compliance at runtime — brittle, slow, unmaintainable. Separating them means vetting is the slow-cadence legal/contractual change surface, routing is the fast-cadence per-request picker.
4. Discussion + ruling (3 min) — capture the 3-param runtime key, the 4-param vetting axis, the flow.

**Ruling format:** LOCKED · REFINEMENT · REJECTED · SPLIT · DEFER. The ruling text **must** confirm the 3-param runtime key and the 4-param vetting axis, and confirm the flow.

**Outputs from this block:** R-4 ruling text + the flow description. The post-walkthrough router ADR drafting has the runtime-key input.

---

## Block 6 — R-5: Launch set (10 min)

**What the facilitator walks the room through:**

1. The candidate set (2 min) — Anthropic · OpenAI · Mistral · DeepSeek-via-papered-service. Workspace-for-Education Gemini is **out of scope as a route** (informs the policy engine, not a route).
2. Why vetting is deferred (3 min) — the vetting pipeline is its own workstream with its own PoC shape (the same `age-consent-landscape/`-style data.json + index.html). The walkthrough ratifies the *engineering intent*; the *vetting verdict* is the workstream's output.
3. What "locked launch set" means at the time of the walkthrough (2 min) — the set of providers we're *targeting* in the architecture. It does not mean "all of these pass vetting for all cells" — that's the vetting-research workstream's finding. If a provider fails vetting for a cell, the policy engine filters it out at runtime; the architecture doesn't need to change.
4. Discussion + ruling (3 min) — capture the locked launch set, the out-of-scope confirmations (Workspace-for-Education), the vetting-research workstream name.

**Ruling format:** LOCKED · REFINEMENT · REJECTED · SPLIT · DEFER. The ruling text **must** include the locked provider set as an inline enum and confirm Workspace-for-Education is out of scope as a route.

**Outputs from this block:** R-5 ruling text + the locked launch set + the vetting-research workstream named.

---

## Block 7 — Closing + capture (5–10 min)

**What the facilitator says:**

> "To close, let me read back the six rulings: [read back]. If any ruling is split, contingent, or rejected, identify the contingency now and assign an owner to resolve it within 1–2 weeks.
>
> The downstream effects of whatever we just ruled:
>
> 1. **R-0 + R-2 + R-3** → `MMT-ADR-0013` (policy-engine spine ADR) draft. The two primitives, the regime taxonomy, and the knowledge axes are the spine. Lockstep with `data-model.md` per `MMT-ADR-0000`.
> 2. **R-1** → either opens the parent-operator US sub-13 path (then the regime-taxonomy R-2 cell needs to encode it), or doesn't (then the sub-13 v2 path remains a launch-blocks-not-blocked-but-ungated decision).
> 3. **R-4** → router ADR draft, layered on top of the policy-engine ADR's eligibility output.
> 4. **R-5** → vetting-research workstream PoC (same shape as `age-consent-landscape/`), separate owner, parallel workstream. No ADR yet; it's research.
> 5. **Phase F (the roadmap) closes** once `MMT-ADR-0013` and the router ADR are drafted and the vetting-research workstream is named. Phase G (canonical-set lock for the identity-foundation carve-out) follows.
>
> Homework for the Bucket-B questions: counsel, please prioritise Q1 (ICO Annex B) and the parent-operator-question verification. The Annex B check is still the load-bearing unverified citation from the original under-13 prep. The parent-operator check is the R-1 ruling's underpinning.
>
> Thanks all. I'll capture the rulings into the ledger within 24 hours and circulate."

**Outputs from this block:** signed capture ledger; post-walkthrough deliverables named; homework follow-ups identified.

---

*End of walkthrough agenda. The spine is ratified.*
