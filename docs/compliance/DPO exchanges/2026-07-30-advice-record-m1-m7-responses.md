# Management Responses — Interim DPIA Advice Record, §3 Management Confirmations (M1–M7)

**Date:** 2026-07-30
**Status:** Draft v0.1 — for management review before sending to Stephan Hartmann
**Purpose:** Source content for transposition into §3 ("Management confirmations required") of Stephan Hartmann's *Interim DPIA Advice Record*, MentoMate, 26 July 2026, v1.0 (`docs/compliance/DPO exchanges/received/2026-07-26_ZWIZZLY_Interim_DPIA_Advice_Record.docx`). Closes register action 1 ("Confirm/revise M1–M7") in `docs/compliance/DPO exchanges/2026-07-26-action-register-tracker.md`.
**Prepared for:** Zuzana Kopečná (accountable management decision-maker) to review, then transpose into the Word document and return to Stephan.

> **Acknowledgement/signature block (§9 of the Advice Record) stays UNSIGNED at this stage.** Per the action-register tracker (action 1 notes) and the Advice Record's own §7 Interim Operating Conditions ("the advice acknowledgement … must remain unsigned until the corresponding stage and evidence record are complete"), only the M1–M7 confirmation table (§3) is populated here. Do not sign or date §9 when transposing.

Each M-item below quotes Stephan's statement text verbatim from the docx (§3, "Statement by ZWIZZLY AS" column), followed by the management response and the grounding source(s) for that response.

---

## M1

> **Statement:** The intended controller is ZWIZZLY AS, organisation number 811 696 072, Fiskekroken 3B, 0139 Oslo, Norway.

**Response: Confirm.**

Matches the controller identity given to Stephan on 24 July 2026 and accepted by him in the main-establishment memo review of 30 July 2026.

**Sources:**
- `docs/compliance/DPO exchanges/2026-07-23-dpia-review-response-draft.md:20-24` — "The intended controller is: ZWIZZLY AS, Organisation number 811 696 072, Fiskekroken 3B, 0139 Oslo, Norway."
- `docs/compliance/evidence/2026-07-30-main-establishment-memo-final.md:3,10` — "ZWIZZLY AS, org.nr 811 696 072, registered in Oslo, Norway"; certificate of registration provided to the DPO 2026-07-24.

---

## M2

> **Statement:** The initial launch is direct to consumers, credentialled, 13+, and excludes school or institutional deployment.

**Response: Confirm.**

Unchanged since the 24 July response. This describes the launch *shape* (audience and channel), which is independent of the country-perimeter mechanism addressed in M3.

**Sources:**
- `docs/compliance/DPO exchanges/2026-07-23-dpia-review-response-draft.md:45-49` — "ZWIZZLY AS has decided that the initial launch will be: direct to consumers; limited to credentialled users aged 13 or older; unavailable for school or institutional deployment; …"
- `docs/compliance/dpia.md:5` — "MentoMate — an AI tutoring app for learners aged 13+; under-13 access is unavailable in every country at launch."

---

## M3

> **Statement:** Only countries whose launch-day verified Article 8 self-consent threshold is 13 will be enabled; uncertain and higher-threshold countries will remain unavailable.

**Response: Confirmed with revision — Stephan's own 2026-07-30 wording, adopted verbatim.**

The country-perimeter design evolved between the 24 July response (EEA threshold-13-only) and 26 July (the screen-based allowlist ruling, which adds a non-EEA Route 2 with the US as the first — currently provisional — candidate). Stephan reviewed that evolution and supplied replacement M3 wording on 2026-07-30, which management has adopted verbatim rather than redrafting. The text below **is Stephan's wording, not management's paraphrase**, and must be transposed into the M3 "Management response" cell exactly as written.

> Confirmed with revision: Management has adopted an allowlist-based launch perimeter consisting of (i) EEA countries whose launch-day verified Article 8 self-consent threshold is 13, subject to the maintained country register and the applicable common launch gates, and (ii) non-EEA jurisdictions individually assessed through a dated admission screen. Admission under route (ii) requires closure of all identified conditions, documented management risk acceptance and, where material local-law questions remain, confirmation from appropriately qualified local counsel. The DPO's confirmation is limited to GDPR and EEA/Norwegian data-protection aspects and does not constitute legal clearance under non-EEA law. The United States has been provisionally screened as the first Route 2 candidate but is not finally admitted until the outstanding conditions in the US screen, including WI-1116, the launch-day rechecks and signed management risk acceptance, have been closed. Uncertain, higher-threshold and unscreened countries remain unavailable, enforced through store-distribution configuration and in-app residence gating.

**Sources:**
- `docs/compliance/2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md` — "## M3 response text (for the DPO Advice Record — DPO's revised wording, adopted 2026-07-30)"; note at top of file: "DPO response 2026-07-30 … revised the M3 wording (his text is authoritative …)."
- `docs/compliance/2026-07-26-us-launch-screen-record.md` — US Route 2 screen, "PASS, conditional on …", status "Provisionally screened … NOT finally admitted".
- `docs/compliance/DPO exchanges/2026-07-26-action-register-tracker.md:15,21` — P4 row and action-1 row recording the DPO-revised M3 wording and instruction to adopt it verbatim.

---

## M4

> **Statement:** No public launch has occurred and no other person's data, including any child's data, has been processed.

**Response: Confirm.**

Still true as of 2026-07-30: the product remains pre-launch with zero users and no production learner data.

**Sources:**
- `docs/compliance/DPO exchanges/2026-07-23-dpia-review-response-draft.md:64-65` — "No public launch has occurred. No other person's data, including any child's data, has been processed."
- `docs/compliance/DPO exchanges/2026-07-26-action-register-tracker.md:39` — "No public processing of learner data on the basis of the interim record. *(Compliant: zero users, pre-launch.)*"

---

## M5

> **Statement:** MentoMate does not ask for or intend to use special-category data for tutoring personalisation, assessment, advertising or model training.

**Response: Confirm.**

Consistent with the DPIA's Article 9 posture: no solicitation or intended use of special-category data; incidental disclosure/inference is a separately tracked risk (DPIA §6.3, `art9-special-category-position.md`), not covered by this statement.

**Sources:**
- `docs/compliance/DPO exchanges/2026-07-23-dpia-review-response-draft.md:101-103` — "MentoMate does not ask learners to provide sensitive information and does not intend to use it for personalising tutoring, assessing learners, advertising, or training models."
- `docs/compliance/dpia.md:37-38` — "Special-category (Art 9) posture — the service does not solicit or intend to use special-category data, but incidental disclosure, inference …"

---

## M6

> **Statement:** Private learner conversations are not disclosed to guardians by default; guardian visibility is limited to justified recap and progress information.

**Response: Confirm.**

Matches both the 24 July response and the shipped product design (recap-only guardian model).

**Sources:**
- `docs/compliance/DPO exchanges/2026-07-23-dpia-review-response-draft.md:183-185` — "guardian/supporter access is limited to justified recap and progress information; private learner conversations are not disclosed to a guardian by default …"
- `docs/compliance/DPO exchanges/2026-07-26-action-register-tracker.md:32` — action 12 gap row: "Supporter-surface spec + ADR-0037 (merged); recap-only guardian model in nav contract."

---

## M7

> **Statement:** The final decision to proceed belongs to ZWIZZLY AS after considering the independent advice and recording its response to material recommendations.

**Response: Confirm.**

Restates the roles-and-controller framing already agreed with Stephan: he provides independent pre-appointment advice as DPO-designate; the controller's final decision to proceed remains with ZWIZZLY AS.

**Sources:**
- `docs/compliance/DPO exchanges/2026-07-23-dpia-review-response-draft.md:29-34` — "…we ask for your independent pre-appointment advice as DPO-designate. … The final decision to proceed remains with ZWIZZLY AS."
- `docs/compliance/DPO exchanges/received/2026-07-26_ZWIZZLY_Interim_DPIA_Advice_Record.docx` (extracted), §1 "Overall position" / §9 framing — acknowledgement "does not transfer controller responsibility."

---

## Open items

None. All seven statements (M1–M7) are directly grounded in existing, dated source documents; no [OPEN] markers were needed for this response set.

Note for completeness: this file addresses only register action 1 (M1–M7). Actions 2–15 (main-establishment memo, country register, legal-basis matrix, Art 9/safeguarding, retention schedule, provider packs, recipient matrix, rights workflows, guardian-visibility matrix, transparency package, consolidated DPIA, formal DPO opinion) are tracked separately in `docs/compliance/DPO exchanges/2026-07-26-action-register-tracker.md` and are not in scope here.
