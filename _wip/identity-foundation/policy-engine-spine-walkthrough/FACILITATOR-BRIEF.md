# Facilitator Brief — Policy-Engine Spine Walkthrough

> **For the facilitator (the architect) only.** Operational guide for running the 90–120 minute live walkthrough. **Not** the participant read — participants read `BRIEFING-PACKET.md`. This file gives you the agenda, the time-boxes, the dependency ordering, the ruling format, and the opening/closing scripts.
>
> **What changed from the prior under-13-floor prep:** the launch floor was already ruled to 13+ (Phase-E handoff, 2026-06-04) and the A-vs-B conversation has produced five high-level decisions that the walkthrough must now ratify as a **policy-engine spine**. The old rulings (Q18, Q19a, Q19b) are superseded by the new rulings below. `SYNTHESIS.md` is preserved as the **legal-research backbone** (the age × regime × activity matrix and its verification worklist) — the workshop leans on it but does not re-litigate it.

---

## Audience and roles

- **Primary audience: PM (product owner).** Plain English. The walkthrough is a **spine-authoring workshop**, not a legal session — acronyms expanded on first use; assume the PM has not been steeped in regime-taxonomy or router-key vocabulary.
- **Informed reader: live legal counsel.** Re-verify the verification worklist (`SOURCES.md`) and rule on **R-1 (the sub-13-via-parent-operator COPPA question)**. Counsel is *not* the primary explainer for the rest of the room; the spine is engineering, not law.
- **Architect (the facilitator):** you. Keep the room on the dependency-ordered ruling sequence (R-0 → R-1 → R-2 → R-3 → R-4 → R-5). Capture rulings verbatim into `CAPTURE-LEDGER.md`. Surface the dependency between R-0 (two-primitive model) and everything downstream.

---

## What the walkthrough decides

The five high-level decisions from the A-vs-B conversation, made concrete:

| ID | Decision being ratified | What "ratified" means |
|---|---|---|
| **R-0** | **Two-primitive model** — the policy engine's *output* is the union of a **prohibition-floor** primitive (consent-unlockable rules that bind regardless of consent) and a **consent-edge** primitive (rules unlockable by guardian/user consent). | The two-primitive framing is locked. `data-model.md` / `MMT-ADR-0011/0012` amendments are scoped to add the prohibition-floor primitive (likely `MMT-ADR-0013`). |
| **R-1** | **Sub-13-via-parent-operator COPPA question** — does serving sub-13 children *via a parent-owned account, with no child login at all*, trip COPPA "directed to children" or "actual knowledge"? This is the one legal ruling the walkthrough produces. | Counsel rules: COPPA applies / does not apply / is unclear. If does-not-apply-or-unclear, the parent-operator path is open as a US route for the sub-13 segment (gated by the regime-taxonomy policy + jurisdiction-aware UX). |
| **R-2** | **Regime taxonomy** — collapse the ~200 countries into ~5–8 first-class regimes (US-COPPA, EU-GDPR-13-floor, EU-GDPR-14-floor, EU-GDPR-15-floor, EU-GDPR-16-default, UK-AADC, ROW, …). The policy engine keys on regimes, not jurisdictions. | The taxonomy is locked. The PoC's 10 jurisdictions are a research sample; the *engine* is regime-keyed. |
| **R-3** | **Knowledge axes** — "known/unknown" is two independent axes (known-age × known-residence), each with a **determination method** (self-report / geo-IP / billing-address / verified) and a **confidence** feeding the knowledge-state. Default for unknown = most-restrictive. | The axes are locked. The "determination method + confidence" structure is in scope for the policy-engine schema (the v1 implementation can start with self-report + geo-IP, expand later). |
| **R-4** | **3-param runtime router key** — the router's runtime key is **model · service-provider · serving-region**. The vetting pipeline (offline, on-cadence) evaluates 4-axis (model · provider-via-service · service · region) × criteria (ToS, ZDR, log-retention, training-data, age-closure) and emits rows into an **allowed-models table**; the router reads from that table, the policy engine filters. | The 3-vs-4 split is locked. The router never sees vetting criteria directly; it sees vetted rows. |
| **R-5** | **Launch set, with vetting deferred to a parallel research workstream** — the launch-time provider set is **Anthropic · OpenAI · Mistral · (DeepSeek via papered service)**. **Workspace-for-Education Gemini is OUT of scope as a route** but stays as a *policy-table data point* (the §20(d) under-18 closure-with-education-tenant exception is real and informs the engine, just not a route). | The launch set is locked. The vetting-research workstream is named as a parallel PoC (same shape as the age-consent-landscape PoC, separate owner). |

**Dependency order:** R-0 → (R-2 + R-3) → R-4 → R-5. R-1 is independent of the others (it's a legal ruling, not an engineering spine) and can be taken at any point, but is **load-bearing for the sub-13 v2 path** — flag that scope. R-0 must rule first because R-4 reads the prohibition-floor primitive and R-5 reads the consent-edge primitive.

---

## Suggested agenda (90–120 minutes)

| Block | Duration | What | Material |
|---|---|---|---|
| **0. Opening + verification status** | 10 min | Verify who is in the room. Surface the "what we decided verbally, what we haven't ratified" framing. Hand counsel the `SOURCES.md` verification worklist (from the original under-13 prep). Set the time-box. | Briefing packet §1, §2; `SOURCES.md` |
| **1. R-0 — Two-primitive model** | 15 min | Walk the prohibition-floor vs. consent-edge framing. Surface the PoC's `consent_unlockable: false` finding as the load-bearing example. Rule: locked / refinement / rejected. | Briefing packet §3; `age-consent-landscape/` |
| **2. R-1 — Sub-13-via-parent-operator COPPA ruling** | 15 min | Counsel rules on whether the parent-owned-account / no-child-login path is a US-COPPA-safe route. R-1 result feeds the regime-taxonomy's "US sub-13 carve-out" cell. | Briefing packet §4; `SYNTHESIS.md` Layer 1, Layer 5 |
| **3. R-2 — Regime taxonomy** | 15 min | Walk the candidate 5–8 regimes. Rule: locked / refinement / rejected. Decide the first-class regime list. | Briefing packet §5; `age-consent-landscape/data.json` |
| **4. R-3 — Knowledge axes** | 15 min | Walk the two-axis model (age × residence) with determination method + confidence. Rule the default-for-unknown = most-restrictive. Decide the v1 determination-method set. | Briefing packet §6 |
| **5. R-4 — Router key** | 10 min | Walk the 3-param runtime / 4-param vetting split. Rule the 3-param key. Confirm the vetting-pipeline → allowed-models-table → router flow. | Briefing packet §7 |
| **6. R-5 — Launch set** | 10 min | Walk the candidate launch set (Anthropic, OpenAI, Mistral, DeepSeek-via-papered-service). Rule: locked / refinement / rejected. Confirm Workspace-for-Education is out of scope as a route. | Briefing packet §8 |
| **7. Closing + capture** | 5–10 min | Read back the six rulings. Capture into `CAPTURE-LEDGER.md`. Identify homework follow-ups (mostly: vetting-research workstream, ADR-0013 draft, `MMT-ADR-0011` amendment scope). Name the post-walkthrough deliverables. | `CAPTURE-LEDGER.md` |

**Time-box discipline:** R-1 is the legal ruling and the one most likely to need iteration — let it run over if it must. If R-2 (regime taxonomy) drags, the cleanest cut is the 4th-tier sub-cells (per-Member-State threshold detail) — the 5–8-regime skeleton is the spine, the per-Member-State detail is research-input.

---

## Opening script (10 min, read verbatim or paraphrase)

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

---

## Closing script (5–10 min, after R-5 ruling)

> "To close, let me read back the six rulings:
>
> - R-0 (two-primitive model): [ruling]
> - R-1 (sub-13-via-parent-operator): [counsel's ruling]
> - R-2 (regime taxonomy): [ruling, with the locked regime list]
> - R-3 (knowledge axes): [ruling, with the v1 determination-method set]
> - R-4 (router key): [ruling, 3-param runtime / 4-param vetting]
> - R-5 (launch set): [ruling, with the locked launch set]
>
> If any ruling is split, contingent, or rejected, identify the contingency now and assign an owner to resolve it within 1–2 weeks.
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

---

## Ruling format for the capture ledger

Each ruling should be captured with the following structure:

```markdown
### Ruling: R-N — <name>

- **Ruling:** LOCKED | REFINEMENT | REJECTED | SPLIT | DEFER
- **Ruling text (verbatim from PM/counsel):** "[exact words]"
- **Rationale (1–3 sentences):** [why]
- **Dissent / caveats:** [if any]
- **Captured by:** [facilitator name]
- **Captured at:** [timestamp]
- **PM signoff:** [name, timestamp]
- **Counsel signoff (R-1 only):** [name, firm, timestamp]
```

For R-2 (regime taxonomy), the ruling text should include the **locked regime list** as an inline enum. For R-3 (knowledge axes), the ruling text should include the **v1 determination-method set** as an inline enum. For R-5 (launch set), the ruling text should include the **locked provider set** as an inline enum. These inline enums are the artifacts that the post-walkthrough ADR drafting needs.

---

## Fallbacks if the time-box is blown

- **If R-0 cannot be ruled in 15 min:** capture the discussion, mark R-0 as "needs follow-up," and proceed to R-2/R-3 with R-0 marked as "to be confirmed in writing within 48 hours." **Do not** let R-0's open status block R-2 — R-2 is regime-keyed, not primitive-keyed, and can be ruled without R-0's specifics.
- **If R-1 splits across jurisdictions (e.g., US-allowed, EU-uncertain, UK-allowed):** the regime-taxonomy R-2 cell needs a per-jurisdiction carve-out. Flag this as a major downstream work item — the regime-taxonomy enum becomes wider, and the "default for unknown" rule in R-3 must apply per-cell, not globally.
- **If R-5 is UNDECIDED because the vetting-research workstream hasn't reported:** rule the *engineering intent* (the providers we're targeting) and defer the *vetting verdict* (which of those providers actually pass for which cells) to the vetting-research PoC. Do not pretend the launch set is ratified when the vetting is unknown.

---

## What the facilitator should *not* do

- **Do not let the room re-litigate the 13+ launch floor.** That's ratified. The walkthrough is a spine workshop, not a re-run of the under-13 walkthrough.
- **Do not let counsel absorb R-0, R-2, R-3, R-4, or R-5.** Only R-1 is a legal ruling. The rest are engineering spine rulings; counsel is in the room as a verifier, not a decider.
- **Do not skip R-0.** The router and the launch set both read the primitives it defines. If R-0 is rejected, the whole spine reshapes — better to find that out in the first 15 minutes than after an hour of R-2/R-3 work.
- **Do not pad R-5 with vetting speculation.** The vetting comes from a parallel research workstream, not from the facilitator. If the vetting-research PoC hasn't reported, rule the *intent* (the provider set we're targeting) and defer the *verdict* (which pass).

---

## Post-walkthrough deliverables (Phase F closure + Phase G entry)

Within 24 hours of the walkthrough:

1. **`_handoffs/2026-06-XX-policy-engine-spine-ruling.md`** — populated with the six rulings, verbatim PM/counsel language, and the downstream work-package list.
2. **`CAPTURE-LEDGER.md`** in the walkthrough folder — same content as the handoff, formatted for the per-walkthrough audit trail.
3. **`ROADMAP.md` edit** — update the Phase F.1 sub-thread with the captured rulings, the `MMT-ADR-0013` drafting scope, the router-ADR scope, the vetting-research workstream naming, and the Phase F → Phase G transition.
4. **Memory note in `.claude/memory/`** — the captured rulings, the rationale, the inline enums (regime list, determination-method set, launch set), and a link to the handoff. This is the durable record that survives the session.

If R-0 is locked (the expected outcome):

5. **`MMT-ADR-0013` draft** — the policy-engine spine ADR. Two-primitive model + regime taxonomy + knowledge axes + 3-param router key. Lockstep with `data-model.md` per `MMT-ADR-0000`.
6. **`MMT-ADR-0011` amendment scope** — identify which data-model primitives need to change to support the policy engine (the prohibition-floor primitive, the age × residence × knowledge × consent-state seam columns). Cheap pre-baseline, append-only after.
7. **Vetting-research workstream PoC kickoff** — same shape as `age-consent-landscape/`. Separate owner. Inputs: the locked launch set (R-5) and the locked regime taxonomy (R-2). Outputs: per-cell `allowed-models` table rows with vetting criteria metadata.

---

## What this brief does not cover

- The legal-research backbone (`SYNTHESIS.md`) — the workshop leans on it for R-1 and the regime-taxonomy cell, but it is the **historical input**, not the live ruling set. Read it as a reference, not as today's job.
- The four sub-area research returns (`RESEARCH-CONTRACTS.md` and the captured sub-area returns) — these are the *research stream's* artifacts, not the *spine workshop's* inputs. Cite them if a participant asks "where did this come from?"
- The roadmap (`ROADMAP.md`) — the walkthrough is one decision in a larger plan. Keep them separate in your head.

---

*End of facilitator brief. The walkthrough ratifies the spine.*
