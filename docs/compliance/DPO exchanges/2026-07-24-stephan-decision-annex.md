# DPIA management decisions and DPO advice annex

**Date:** 24 July 2026<br>
**Applies to:** [Response to Stephan’s 23 July DPIA review](2026-07-23-dpia-review-response-draft.md)<br>
**Status:** Draft decision record; not a DPIA approval

## Purpose

This annex prevents three different acts from being collapsed into one
“sign-off”:

1. **Management attestation** — the controller confirms operational facts and
   chooses the product/risk posture.
2. **DPO advice** — Stephan records independent legal/compliance advice,
   concerns, and recommendations.
3. **Controller decision** — accountable management accepts, remediates, or
   refuses residual risk and makes the final proceed/no-proceed decision.

Stephan’s signature must not be described as the controller’s approval.

## A. Management facts and decisions to attest

These are controller decisions or facts, not requests for the DPO to own them.

| Ref | Management statement | Evidence required before signature | Management outcome |
|---|---|---|---|
| M1 | The intended controller is ZWIZZLY AS, organisation number 811 696 072, Fiskekroken 3B, 0139 Oslo, Norway. | Registry extract; external-contract, publication, support, and app-store reconciliation | ☐ Confirmed ☐ Revised |
| M2 | The controller’s main establishment and accountable decision-maker are as stated in the attached memorandum. | Signed factual memorandum naming decision locations, authority, implementability, executive, and reasoned authority conclusion | ☐ Confirmed ☐ Revised |
| M3 | Initial launch is consumer-only, credentialled, and 13+. No under-13 or school/institutional use is enabled. | Product/store configuration; production profile query; marketing/sales attestation | ☐ Confirmed ☐ Revised |
| M4 | Initial launch enables only jurisdictions whose current Article 8 self-consent threshold is legally verified as 13. Unknown, stale, unsupported, and higher-threshold jurisdictions are blocked. | Launch-day legal matrix; Apple/Google country allowlist exports; server-side or interim store enforcement; negative tests | ☐ Confirmed ☐ Revised |
| M5 | Further countries will be added only after the jurisdiction-aware country matrix and guardian-authorisation flow are implemented, legally verified, tested, and enabled. | Expansion gate and change-control record | ☐ Confirmed ☐ Revised |
| M6 | MentoMate will not intentionally solicit, infer for product purposes, persist, profile on, advertise with, or train on Article 9 data. Incidental processing remains a managed risk. | Product requirements, prompt/control evidence, field tests, retention/safeguarding rules | ☐ Confirmed ☐ Revised |
| M7 | Raw guardian access to a child’s private conversations is off by default; guardian/supporter visibility is limited to justified recap/progress information. | Role/access matrix and end-to-end tests | ☐ Confirmed ☐ Revised |
| M8 | The safeguarding posture uses in-product de-escalation and external help resources; it does not automatically notify a guardian. | Safeguarding/best-interests assessment, hotline-country coverage, incident procedure | ☐ Confirmed ☐ Revised |
| M9 | No production processing involving children will begin before the material DPIA blockers are closed and evidenced. | Launch checklist and release gate | ☐ Confirmed ☐ Revised |

## B. Advice requested from Stephan

Each row asks for the DPO’s independent view. “Accept” means the advice is
recorded on the evidence supplied; it does not transfer management
accountability to the DPO.

| Ref | Question for DPO advice | Minimum input pack | DPO advice |
|---|---|---|---|
| D1 | Is the controller/main-establishment and competent/lead-authority analysis supportable? | M1–M2 evidence and consistency reconciliation | ☐ Support ☐ Revise ☐ Insufficient evidence |
| D2 | Is the purpose/data/role legal-basis matrix supportable, including child AI use and persistent learning memory? | Final purpose matrix, necessity/minimisation analysis, notices, withdrawal effects | ☐ Support ☐ Revise ☐ Insufficient evidence |
| D3 | Does the launch-country Article 8 method adequately implement the threshold-13 launch rule, and what evidence must be retained? | Effective-dated country matrix, authority sources, residence assurance, allowlist and tests | ☐ Support ☐ Revise ☐ Insufficient evidence |
| D4 | Is the Article 9 characterisation and mitigation package adequate for foreseeable incidental disclosure/inference? | Field inventory, multilingual tests, suppression, retention, provider and safeguarding evidence | ☐ Support ☐ Revise ☐ Insufficient evidence |
| D5 | Is the retention schedule proportionate and sufficiently complete across raw, derived, legal, security, financial, provider, cache, vector, and backup records? | Approved schedule, production job evidence, samples, alerts, erasure test | ☐ Support ☐ Revise ☐ Insufficient evidence |
| D6 | Is the guardian visibility and safeguarding/crisis posture consistent with necessity, proportionality, and the child’s best interests? | Access matrix, UX, safeguarding assessment, consultation results | ☐ Support ☐ Revise ☐ Insufficient evidence |
| D7 | Are the processor/controller roles, executed terms, transfer mechanisms, and TIAs adequate vendor by vendor? | Complete provider register and evidence packs, including Apple/Google per activity | ☐ Support ☐ Revise ☐ Insufficient evidence |
| D8 | Is the rights workflow complete and usable for child, adult, guardian, former guardian, and authorised representative scenarios? | Rights matrix and end-to-end results | ☐ Support ☐ Revise ☐ Insufficient evidence |
| D9 | Is the transparency package genuinely child-readable and is the proposed Article 35(9) consultation approach adequate? | Final notices, just-in-time UI, store declarations, comprehension/usability evidence | ☐ Support ☐ Revise ☐ Insufficient evidence |
| D10 | After remediation and residual-risk reassessment, is Article 36 prior consultation required? | Final DPIA, residual-risk register, failed/limited controls, management risk posture | ☐ Required ☐ Not required ☐ Insufficient evidence |

## C. Items that are not ready for DPO sign-off

At the 24 July evidence cut, the following remain open:

- main-establishment and accountable-executive memorandum;
- live-production deployment of current approved code and representative route
  traces;
- removal or formal rollback control for credentialled/registered Gemini;
- same-primary vision fallback defect;
- final launch allowlist and launch-day Article 8 legal verification;
- habitual-residence/country enforcement and affirmative consent correction;
- complete Article 9 and safeguarding conclusion;
- provider DPAs, account configuration, locations, retention, transfers, and
  TIAs;
- complete category-level retention schedule and production deletion proof;
- complete rights/export/external-erasure test;
- final adult/child/store transparency and Article 35(9) evidence;
- final residual-risk and Article 36 assessment.

The appropriate DPO status at this point is therefore **review continuing /
insufficient evidence for final opinion**, not approval.

## D. Recommended staged signatures

### D1 — Management factual attestation

> I confirm that the management facts and product decisions in section A are
> accurate as of the date signed, or are amended in the attached schedule. I
> understand that the controller remains responsible for the DPIA and final
> decision.

**Name:** ____________________<br>
**Role:** ____________________<br>
**Date:** ____________________<br>
**Signature:** ____________________

### D2 — DPO interim advice

> I have reviewed the evidence identified in this annex and record the advice,
> limitations, and recommendations shown in section B and any attached schedule.
> This is independent DPO advice. It is not the controller’s approval to
> proceed.

**Name:** Stephan ____________________<br>
**Date:** ____________________<br>
**Signature:** ____________________

### D3 — Final accountable-management decision

Complete only after the final DPIA, DPO opinion, and Article 36 decision exist.

> Having considered the final DPIA, the DPO’s independent advice, and the
> residual risks, I make the controller’s documented decision below.

**Decision:** ☐ Proceed within stated scope ☐ Do not proceed ☐ Remediate and resubmit<br>
**Conditions / accepted residual risks:** ________________________________<br>
**Accountable executive:** ____________________<br>
**Role:** ____________________<br>
**Date:** ____________________<br>
**Signature:** ____________________
