# EU AI Act Education-AI Compliance Plan

**Work item:** WI-1659 (Produce EU AI Act high-risk education compliance plan)  
**Date:** 2026-07-06  
**Status:** Draft for DPO/counsel review. Not legal advice.  
**Scope:** MentoMate consumer AI tutoring product for families, with explicit tripwires for any later school, tutoring-center, vocational-training, LMS, SIS, assessment, or public-sector deployment.

## Bottom line

**Current consumer-family launch posture:** On the current product posture, MentoMate should not be treated as conclusively high-risk under EU AI Act Annex III education/vocational-training point 3. The product is sold to families, is not deployed by or within an educational or vocational-training institution, does not determine admission/access/assignment to an institution, does not assess a formal education level, and does not proctor tests.

**High-risk trigger:** The same learning-evaluation loop becomes a serious high-risk candidate if it is sold to, deployed by, integrated into, or relied on by a school, tutoring institution, vocational-training provider, public authority, LMS/SIS workflow, or formal assessment workflow where outputs evaluate learning outcomes, steer an institutional learning process, assess education level/access, or monitor prohibited behavior during tests.

**Product posture:** Treat high-risk readiness as a moat and a design discipline, but do not externally claim "EU AI Act high-risk compliant" until DPO/counsel signs the classification and the relevant control packet exists.

## Legal Sources Checked

- Regulation (EU) 2024/1689, official EUR-Lex text: <https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng>
- European Commission AI Act Service Desk high-risk guidelines explorer: <https://ai-act-service-desk.ec.europa.eu/en/guideline-explorer>

Key source points:

- Article 6(2) classifies AI systems listed in Annex III as high-risk, subject to the Article 6 conditions.
- Annex III point 3 covers education and vocational training systems used to determine access/admission/assignment, evaluate learning outcomes including steering the learning process in educational/vocational-training institutions, assess level/access within those institutions, or monitor/detect prohibited behavior during tests.
- Articles 8 to 15 set the core high-risk requirements: risk management, data governance, technical documentation, record-keeping/logging, transparency/instructions, human oversight, and accuracy/robustness/cybersecurity.
- Article 16 sets provider obligations for high-risk systems.
- Article 27 creates a fundamental-rights impact assessment obligation for some deployers of high-risk systems.
- Article 50 creates transparency obligations for systems that interact directly with natural persons.
- Article 113 sets the general application date at 2026-08-02, with Article 6(1) and corresponding obligations applying from 2027-08-02.

## Classification Memo

### Current Intended Purpose

MentoMate provides a consumer AI tutor to families. It can:

- Run Socratic tutoring sessions.
- Evaluate learner responses for tutoring continuity, challenge rounds, spaced review, and parent-visible learning proof.
- Store learning artifacts such as explanations, mastery state, review history, and parent-facing proof summaries.
- Personalize future prompts and review timing from learning history.

It does not currently:

- Decide admission, placement, assignment, retention, promotion, credentialing, or formal grades.
- Integrate with a school LMS/SIS as a source of truth.
- Produce official school reports, transcripts, certifications, or regulated educational records.
- Proctor tests or detect prohibited behavior during tests.
- Infer emotions or sensitive/protected biometric attributes.

### Working Classification

For the current B2C family launch, the working classification is:

**Not statutory high-risk under Annex III point 3, pending counsel confirmation.**

Reason: the Annex III education/vocational-training trigger is framed around institutional education/vocational-training contexts and formal learning-outcome/level/access uses. MentoMate has learning-outcome evaluation, but currently lacks the institutional deployment and formal decision context that turns that evaluation into Annex III point 3(b)/(c) exposure.

This classification is deliberately narrow. It does not bless future school, B2B, public-sector, formal assessment, or proctoring use.

### Reclassification Tripwires

Counsel/DPO review is required before any of these ship or are marketed:

1. School, district, tutoring-center, exam-prep provider, vocational-training provider, LMS/SIS, public-authority, or institutional deployment.
2. Teacher/admin dashboards where MentoMate output is used to grade, place, stream, certify, admit, retain, promote, discipline, or formally evaluate a learner.
3. Exports into official reports, transcripts, school records, credentials, LMS gradebooks, SIS fields, or regulated education files.
4. Product gates that block access to formal curriculum, institutional assignments, examinations, certifications, or next-level education based on AI-assessed mastery.
5. Proctoring, test-integrity, cheating, or prohibited-behavior detection.
6. Biometric categorisation, emotion recognition, affect detection, or voice analysis beyond transcription.
7. Any public claim that the product is high-risk compliant, school-ready, institution-ready, regulator-ready, or approved for formal assessment.

## Obligation Matrix

| Area | EU AI Act hook | Current evidence / work items | Gap / required action | Launch stance |
|---|---|---|---|---|
| Classification record | Article 6(2), Annex III point 3 | This memo; WI-1659 | DPO/counsel must sign current B2C classification and school-deployment tripwires. | Counsel gate |
| Risk management | Articles 8-9 | DPIA drafts; `docs/compliance/2026-07-04-launch-compliance-closure-check-early-pass.md`; WI-1106 (complete minors compliance launch pack); WI-1507 (launch compliance closure check) | WI-1663 (Create AI Act technical file and QMS skeleton for MentoMate AI system) covers the AI-system risk register / technical-file skeleton. | Launch blocker only for formal high-risk claim or institutional deployment |
| Data governance | Article 10 | `docs/compliance/ropa.md`; `docs/compliance/edpb_dpia_filled_2026_v1.md`; `docs/audit/2026-06-07-data-retention-and-erasure-audit.md`; WI-1192 (consent withdrawal); WI-1193 (retention); WI-1194 (export/delete); WI-1507 | Close counsel-set retention values, provider DPAs/TIAs, policy-engine jurisdiction population, and stale docs identified in WI-1507. | Existing launch blocker via DPIA/DPO gate |
| Technical documentation | Article 11, Annex IV | Architecture docs, DPIA, ROPA, LLM model register, router ADR | WI-1663 creates the single AI-system technical file mapping intended purpose, system design, model routing, data, prompts, controls, logs, evals, oversight, changes, and monitoring. | Required before high-risk claim or institutional deployment |
| Logging / record-keeping | Article 12 | Session events, learning state, Sentry, Inngest job history, router/eval evidence, deletion/consent audit trails | Define high-risk traceability log set: model/prompt version, input/output references, routing decision, evaluator evidence, parent/guardian review events, incident links, retention rules. | Required before high-risk claim or institutional deployment |
| Transparency / AI disclosure | Article 13 and Article 50 | WI-1195 (AI disclosure notice); privacy policy; parent proof surfaces planned | Ensure learner and parent surfaces clearly disclose AI interaction and limits. If deployed to institutions, add deployer instructions and natural-person notice templates. | Article 50 is a product launch requirement from 2026-08-02 |
| Human oversight | Article 14 | Parent-visible proof concept; no-lock doctrine in compliance docs; safety escalation workstream; WI-1662 (parent proof digest and cancel-flow evidence) | For high-risk/institutional use, define who can review, override, correct, pause, export, and dispute AI outputs; add instructions for deployers. | Required before high-risk claim or institutional deployment |
| Accuracy, robustness, cybersecurity | Article 15 | LLM eval harness; `docs/registers/llm-models/master.md`; `docs/adr/MMT-ADR-0014-router-runtime-vetting-split.md`; WI-1438 (eval/runtime monitoring); WI-1500 (launch compliance health monitor) | Convert existing eval/runtime evidence into measurable AI-system thresholds, drift monitoring, incident triggers, and release gates. | Existing quality gate; formalized before high-risk claim |
| Provider obligations / QMS / conformity | Article 16 and related high-risk regime | No complete QMS/conformity packet yet | WI-1663 creates the QMS/technical-file skeleton. If a high-risk trigger occurs, extend it into the conformity route, declaration/registration checklist, substantial-change process, and post-market file. | Blocks high-risk deployment |
| Deployer duties / FRIA | Article 26 and Article 27 | Not applicable to current direct-to-family posture unless a covered deployer uses the system | WI-1664 (Add school and institutional deployment AI Act tripwire) blocks school/public-sector/high-risk deployer use until reclassification and deployer packet/FRIA support materials exist. | Blocks institutional deployment |
| EU database / registration | Articles 49, 71, 73 as applicable | Not applicable if B2C non-high-risk classification holds | If high-risk classification applies, confirm registration obligation and owner. | Blocks high-risk deployment if applicable |
| Post-market monitoring | Article 72 | WI-1500; Sentry; support path work; safety/compliance registers; Inngest operational evidence | Define AI-specific post-market monitoring plan: incidents, complaints, correction loop, model-change review, periodic control review, and serious-incident route. | Required before high-risk claim or institutional deployment |
| Prohibited / sensitive AI practices | Article 5; Annex III biometrics | `docs/compliance/identity-compliance-register.md` C-2; voice is transcription-only; WI-1507 verifies no emotion inference | Keep voice/transcription boundary. Any emotion recognition, biometric categorisation, affect inference, or proctoring is a reclassification/legal stop. | Hard product constraint |
| Store / public disclosures | Article 50; consumer-protection and store forms | `docs/screenshots_and_store_info/app-privacy-data-safety-worksheet.md`; WI-1335 (store data-safety refresh); WI-1507 | Store worksheet is stale: age floor, legacy schema, homework images, raw audio questions. WI-1664 also prevents school-readiness or high-risk-compliance claims without explicit approval. | Store submission blocker |

## Existing Work Items Cross-Linked

- WI-1105 (Complete EDPB/Datatilsynet minors DPIA fill-in) - DPO/DPIA sign-off gate.
- WI-1106 (Complete minors compliance launch pack) - compliance launch umbrella.
- WI-1192 (Add consent withdrawal flow) - consent lifecycle.
- WI-1193 (Add age-based retention and purge policy) - retention and data minimization.
- WI-1194 (Add account export/delete access requests) - data subject controls.
- WI-1195 (Add in-app AI disclosure notice) - Article 50 transparency.
- WI-1335 (Refresh store data-safety worksheet for current product state) - public/store disclosure correction.
- WI-1438 (Add LLM eval/runtime monitoring gate) - accuracy, robustness, drift, and release evidence.
- WI-1500 (Create launch compliance health monitor) - post-launch monitoring.
- WI-1507 (Complete launch compliance closure check against actual data flows) - launch gap reconciliation.
- WI-1662 (Parent proof digest and cancel-flow evidence) - parent-visible proof and retention surface.
- WI-1663 (Create AI Act technical file and QMS skeleton for MentoMate AI system) - missing technical-file/QMS packet.
- WI-1664 (Add school and institutional deployment AI Act tripwire) - legal/product stop for school, LMS/SIS, formal assessment, proctoring, and institutional use.

## New Follow-Up Items Required

1. **WI-1663 (Create AI Act technical file and QMS skeleton for MentoMate AI system).** Create a single controlled technical documentation packet that can serve both high-risk readiness and counsel review. It should map intended purpose, system design, data inputs/outputs, model routing, prompts/evals, controls, logs, human oversight, release/change management, and post-market monitoring.
2. **WI-1664 (Add school and institutional deployment AI Act tripwire).** Add an explicit product/legal gate: no school, LMS/SIS, formal assessment, proctoring, public-sector, or institutional sales/use without DPO/counsel reclassification and the high-risk packet.

## Go / No-Go Note

| Decision area | Status |
|---|---|
| Current B2C family launch | **No-go today for first real consent-gated child** because the existing DPIA/DPO/provider/legal launch gates remain open per WI-1507. This memo does not add a separate statutory high-risk blocker for current B2C posture. |
| Public claim of EU AI Act high-risk compliance | **No-go** until counsel signs classification, the technical/QMS packet exists, and applicable controls are evidenced. |
| School / institutional / formal assessment deployment | **No-go** until counsel reclassifies the use case and the high-risk readiness packet, deployer materials, logging, human oversight, and monitoring plan are in place. |
| Article 50 AI interaction disclosure | **Launch requirement from 2026-08-02.** Keep WI-1195 on the launch-critical path. |

## Counsel / DPO Questions

1. Do you agree that the current direct-to-family tutor is outside Annex III point 3 high-risk classification while it remains non-institutional and non-formal-assessment?
2. Which exact product, sales, and copy changes would you treat as reclassification triggers?
3. Should we maintain the AI technical file/QMS skeleton now as a high-risk-readiness moat even if not yet legally required?
4. Does the existing DPIA need an EU AI Act addendum before launch, or is this memo sufficient as the classification annex?
5. What public wording is allowed before sign-off: "AI tutor with parent proof," "high-risk-ready controls," or neither?
