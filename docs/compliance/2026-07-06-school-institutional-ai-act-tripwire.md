# School And Institutional Deployment AI Act Tripwire

**Work item:** WI-1664 (Add school and institutional deployment AI Act tripwire)
**Date:** 2026-07-06
**Status:** Product/legal gate for DPO/counsel review. Not legal advice.
**Related docs:** [`2026-07-06-eu-ai-act-high-risk-education-plan.md`](2026-07-06-eu-ai-act-high-risk-education-plan.md), [`2026-07-06-eu-ai-act-technical-file-qms-skeleton.md`](2026-07-06-eu-ai-act-technical-file-qms-skeleton.md), [`../architecture.md`](../architecture.md)

## Rule

MentoMate must not ship, sell, market, pilot, or integrate any school, district, tutoring-center, vocational-training, LMS/SIS, public-sector, proctoring, classroom, or formal-assessment use case until DPO/counsel reclassifies the intended purpose and approves the high-risk-readiness packet.

This is a hard product/legal gate. It applies even if the underlying tutoring functionality already exists in the consumer app.

## Triggers

Any one of these moves requires DPO/counsel review before launch or public copy:

1. School, district, tutoring-center, exam-prep provider, vocational-training provider, LMS/SIS, public-authority, or institutional deployment.
2. Teacher, tutor, coach, school admin, or institution dashboard for a learner roster.
3. Use of MentoMate outputs to grade, place, stream, certify, admit, retain, promote, discipline, or formally evaluate a learner.
4. Export of learning state, mastery, proof artifacts, recommendations, or assessments into official school reports, transcripts, credentials, LMS gradebooks, SIS fields, or regulated education records.
5. Product gates that block institutional curriculum, formal assignments, examinations, certifications, or next-level education based on AI-assessed mastery.
6. Proctoring, test-integrity, cheating, prohibited-behavior detection, or classroom monitoring.
7. Biometric categorisation, emotion recognition, affect detection, or voice analysis beyond transcription.
8. Public copy that says or implies school readiness, classroom readiness, institutional readiness, high-risk compliance, regulator approval, formal assessment suitability, or proctoring/test-integrity support.

## Required Packet Before A Trigger Can Ship

| Required artifact/control | Minimum content |
|---|---|
| Reclassification memo | Counsel/DPO decision on whether the exact intended purpose is high-risk under EU AI Act Annex III point 3 and which provider/deployer obligations apply. |
| Technical file/QMS packet | Filled version of [`2026-07-06-eu-ai-act-technical-file-qms-skeleton.md`](2026-07-06-eu-ai-act-technical-file-qms-skeleton.md), with evidence rather than placeholders. |
| Logging definition | Traceability log set covering model/prompt version, input/output references, routing decision, evaluator evidence, oversight events, incidents, retention, and access controls. |
| Human oversight instructions | Named reviewer roles, review/override/correction/dispute/pause controls, and instructions for deployers. |
| Deployer materials | Instructions for use, limitation statements, FRIA/DPIA support materials where applicable, and natural-person AI notices. |
| Data governance package | DPA/TIA status, retention rules, data export/delete behavior, learner/guardian rights, and institutional data-flow map. |
| Post-market monitoring plan | Complaints, incidents, corrections, serious-incident route, model-change review, and periodic control review cadence. |
| External-copy approval | Store, website, sales, support, and onboarding copy reviewed so it does not overclaim school readiness or high-risk compliance. |

## Where The Gate Lives

| Surface | Gate |
|---|---|
| Architecture | `docs/architecture.md` Consumer Family Compliance Boundary. |
| Compliance | This file and the EU AI Act classification memo. |
| Store submission | `docs/screenshots_and_store_info/app-privacy-data-safety-worksheet.md` submission blocker and copy notes. |
| Product planning | Any school/tutor/institutional SKU must open a dedicated WI/PRD and link this tripwire before implementation starts. |
| Future code enforcement | If a future school mode, institutional integration, LMS/SIS sync, roster import, or teacher/admin dashboard flag exists, it must be blocked behind an explicit compliance approval flag or build-time/product-scope gate. |

## Copy Rule

Allowed current posture:

- Consumer family AI tutor.
- Parent-visible learning proof.
- Homework help, test practice, spaced review, and explain-back learning.

Blocked without DPO/counsel approval:

- "For schools", "for classrooms", "district-ready", "LMS-ready", "SIS-ready", "teacher dashboard", "formal assessment", "proctoring", "test-integrity", "high-risk compliant", "EU AI Act approved", or similar claims.

## Current Go / No-Go

| Motion | Status |
|---|---|
| Current consumer-family app store copy | Allowed if it stays consumer/family and does not imply institutional readiness. |
| School/institutional sales or pilots | No-go. |
| Teacher/admin roster features | No-go. |
| LMS/SIS integration | No-go. |
| Formal assessment/proctoring/test-integrity features | No-go. |
| Public high-risk-compliance claim | No-go. |
