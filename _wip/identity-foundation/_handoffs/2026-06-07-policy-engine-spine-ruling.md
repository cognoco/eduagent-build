# Handover — Policy-Engine Spine ruling (2026-06-07)

**Status:** ✅ Six rulings captured (R-0 through R-5) in a **facilitator-run** walkthrough. R-0/R-2/R-3/R-4
locked; R-1 captured as a **business posture with counsel sign-off OUTSTANDING**; R-5 ruled **REFINEMENT**
(superseded by already-ratified routing canon). System of record = `CAPTURE-LEDGER.md` in the walkthrough
folder.

**What this was:** the spine-authoring workshop for the policy engine — the gatekeeper that decides which LLM
providers a user may be routed to, by age × residence. The session ratified the *shape* (primitives, regime
buckets, knowledge axes, router split, launch-set principle), not the build. Run as facilitator + principal
(PM); **no live licensed counsel was present**, so the one legal ruling (R-1) is a captured posture, not a
clearance.

> ⚠️ **Read this first.** R-1 is a *business posture on a legal question*, captured on the facilitator's reading
> of `SYNTHESIS.md` Layer 5. It is **not legal advice and not a clearance.** A written counsel opinion (HW-2)
> is **mandatory before any sub-13 (v2) build.** Nothing here opens an under-13 route for launch — launch
> stays 13+.

---

## Where everything lives

| Artifact | Path | What |
|---|---|---|
| **Capture ledger (system of record)** | `_wip/identity-foundation/policy-engine-spine-walkthrough/CAPTURE-LEDGER.md` | All six rulings verbatim + rationale + caveats + sign-off + work packages. |
| Participant read | `…/policy-engine-spine-walkthrough/BRIEFING-PACKET.md` | The plain-English input the session leaned on. |
| Legal backbone | `…/policy-engine-spine-walkthrough/SYNTHESIS.md` | The age × regime × activity research; Layer 5 underpins R-1. |
| **Ratified routing canon** | `docs/adr/MMT-ADR-0016-llm-provider-model-selection-and-routing.md` + `docs/specs/2026-06-06-llm-routing-and-judge-architecture.md` + `…-gpt-oss-cerebras-build.md` | The concrete provider/model picks. **Supersedes R-5's abstract sketch.** |
| Policy-engine spine ADR (draft) | `docs/adr/MMT-ADR-0013-policy-engine-spine.md` | Already exists (status *Proposed*, 2026-06-06). R-0/R-2/R-3/R-4 confirm its shape. |

---

## The six rulings (one line each)

| # | Ruling | Outcome |
|---|---|---|
| **R-0** Two-primitive model | **LOCKED** | Engine output = union of **prohibition-floor** (binds regardless of consent) + **consent-edge** (unlockable by guardian/user consent). Single primitive can't model both (PoC: 7/8 activity categories have hard-ban cells). Drafts under MMT-ADR-0013; data-model gets a `kind` column. |
| **R-1** Sub-13 via parent-operator (COPPA) | **UNCLEAR_WITH_DEFENSIBLE_POSTURE** | Keep the door open; **v2 opens non-US sub-13 managed accounts**, not US. US COPPA stays conservative. Counsel sign-off **OUTSTANDING** (HW-2). |
| **R-2** Regime taxonomy | **LOCKED** | 7 buckets keyed by *which law*, not age number: `US_COPPA`, `EU_GDPR_16/15/14/13`, `UK_AADC`, `ROW`. Country→bucket mapping is verifiable data; buckets grow as a low-cost enum add, paced by legal research. |
| **R-3** Knowledge axes | **LOCKED** | Two axes (known-age × known-residence), each method + confidence. v1 methods: age = self-report + parent-reported; residence = geo-IP + billing. Verified-ID/age-estimation = phase 2. Unknown → most-restrictive. Self-report is legally sufficient for **13+**; verification needed only when under-13 (v2) opens. |
| **R-4** Router key | **LOCKED** | Separate **slow vetting** (provider ever-acceptable) from **fast routing** (pick best allowed per message): vetting → allowed-models table → policy-engine filter → router. 3-param runtime key, 4-param vetting axis. Re-specs the old hard-coded GATE-1 minor-routing rule. |
| **R-5** Launch set | **REFINEMENT** | **Principle confirmed, sketch superseded.** Provider picks are already owner-ratified in MMT-ADR-0016 (2026-06-07), structured as **EU-vs-RoW residency branching** on a universal gpt-oss/Cerebras default — not the walkthrough's US/EU/non-US three-slot sketch. "Future vetting workstream owns the picks" framing is stale. |

---

## 🚩 For the architect / next session

1. **R-5 doc-drift (HW-3).** The walkthrough folder still presents provider selection as an open future
   workstream; it is ratified canon (MMT-ADR-0016). Reconcile BRIEFING-PACKET §8, FACILITATOR-BRIEF R-5, and
   the ledger R-5 template to point at the routing specs. Cleanup, not a re-decision.
2. **MMT-ADR-0013 is already drafted** (Proposed, 2026-06-06) and its §1–§3 match R-0/R-2/R-3 as ruled. Next
   step is architect ratification + the lockstep `data-model.md` amendment (the `kind` column + the
   age/residence/knowledge/consent-state seam columns), used in the **pre-baseline window** MMT-ADR-0012 keeps
   open.
3. **Adult-only Gemini eligibility (HW-4)** remains a genuinely open legal ruling (routing-spec §10.1).
   Gemini/Vertex stays unconditionally banned for under-18; adult-only-in-a-mixed-audience-app is owed before
   any Gemini row is added. Not launch-blocking.

## 🚩 For counsel (homework, due ~2026-06-21)

- **HW-1** — verify ICO Children's Code Annex B exact wording (most consequential unverified primary).
- **HW-2 (mandatory before v2 build)** — written opinion on the parent-operator COPPA reading + the
  Netflix-profile-analogue regulator-blessing check; **must also cover the non-US verification bar** (EU GDPR
  Art 8 reasonable-efforts per EDPB 05/2020 §3; ROW strict-jurisdiction screening), since v2 = non-US sub-13.

---

## Downstream work packages (from the ledger)

WP-1 MMT-ADR-0013 ratification · WP-2 data-model amendment (kind column + seam columns) · WP-3 router ADR ·
WP-4 *(superseded — picks ratified in MMT-ADR-0016; the eval-harness admission gate plays the vetting role)* ·
WP-5 ROADMAP Phase F→G · WP-6 memory note · WP-7 this handoff · WP-8 doc sweep · **WP-9 (active)** counsel
opinion + non-US posture (R-1 was UNCLEAR, not COPPA_APPLIES) · WP-9-alt **N/A**.

---

*Generated from `CAPTURE-LEDGER.md`. Facilitator-run, no live counsel — R-1 is a captured posture pending the
mandatory counsel sign-off.*
