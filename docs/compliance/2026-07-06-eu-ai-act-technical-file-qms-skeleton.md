# EU AI Act Technical File And QMS Skeleton

**Work item:** WI-1663 (Create AI Act technical file and QMS skeleton for MentoMate AI system)
**Date:** 2026-07-06 (authored); cross-references refreshed 2026-07-25
**Status:** High-risk-readiness skeleton for DPO/counsel review. Not legal advice. Not a public compliance claim.
**Classification authority:** [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md)

## Control Statement

This file is the controlled index for MentoMate's AI-system technical documentation and quality-management evidence. It is intentionally a skeleton: each section records current evidence, known gaps, and the follow-up owner/work item where one exists. Empty or partial sections must not be read as implied compliance.

The EU AI Act classification and territorial analysis is **open**. Counsel must still document whether MentoMate is outside Annex III point 3, is listed but qualifies for the Article 6(3) no-significant-risk exception, or is high-risk — and, if high-risk while ZWIZZLY AS remains a third-country provider for EU AI Act purposes, whether an EU authorised representative is required. Application dates are also moving: see the launch-country ruling for the current position on Article 113, the Council's 29 June 2026 amending regulation, and EEA-incorporation status. This skeleton exists so the product can maintain high-risk-ready controls while that question is open, without making a public "EU AI Act high-risk compliant" claim.

## System Identification

| Field | Current answer |
|---|---|
| System name | MentoMate AI tutor |
| Provider / owner | ZWIZZLY AS, organisation number 811 696 072, Fiskekroken 3B, 0139 Oslo, Norway |
| Intended users | Consumer family accounts: learners, parents/guardians, and adult solo learners |
| Current intended purpose | Socratic tutoring, homework help, challenge rounds, explain-back verification, spaced review, learning-progress history, and parent-visible proof artifacts |
| Current excluded purpose | School, district, tutoring-center, vocational-training, LMS/SIS, public-sector, formal-assessment, proctoring, placement, credentialing, admission, retention, discipline, or institutional monitoring use |
| Classification record | Open with counsel/DPO — [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md) and the classification review request under [`DPO exchanges/`](DPO%20exchanges/) |
| Institutional deployment gate | [`2026-07-06-school-institutional-ai-act-tripwire.md`](2026-07-06-school-institutional-ai-act-tripwire.md) |

## Source Map

| Evidence | Role in the file |
|---|---|
| [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md) | Launch perimeter, Article 8 policy, and the open AI Act classification/territorial item. |
| [`dpia.md`](dpia.md) | Privacy and child-risk assessment baseline. |
| [`edpb_dpia_filled_2026_v1.md`](edpb_dpia_filled_2026_v1.md) | Code-grounded DPIA fill-in and action plan. |
| [`ropa.md`](ropa.md) | Processing-activity register. |
| [`identity-compliance-register.md`](identity-compliance-register.md) | Canonical compliance controls, including no emotion/biometric inference. |
| [`2026-07-04-launch-compliance-closure-check-early-pass.md`](2026-07-04-launch-compliance-closure-check-early-pass.md) | Historical code-vs-doc launch gap reconciliation; re-verify at the final launch gate. |
| [`history/2026-06-07-data-retention-and-erasure-audit.md`](history/2026-06-07-data-retention-and-erasure-audit.md) | Retention and erasure audit retained for provenance. |
| [`../architecture.md`](../architecture.md) | System architecture, compliance boundary, and operational constraints. |
| [`../adr/MMT-ADR-0014-router-runtime-vetting-split.md`](../adr/MMT-ADR-0014-router-runtime-vetting-split.md) | Router/vetting split and fail-closed model-routing architecture. |
| [`../registers/llm-models/master.md`](../registers/llm-models/master.md) | Model set, provider exclusions, routing gates, and open cutover gates. |
| [`../screenshots_and_store_info/app-privacy-data-safety-worksheet.md`](../screenshots_and_store_info/app-privacy-data-safety-worksheet.md) | Store/privacy disclosure worksheet and launch submission blockers. |

## Technical File Skeleton

| Section | Current evidence | Gap / next evidence |
|---|---|---|
| Intended purpose and prohibited use | Architecture Consumer Family Compliance Boundary; institutional tripwire doc | DPO/counsel sign-off on classification and explicit prohibited-use wording. |
| System description | Architecture docs; API/mobile route inventories; DPIA/ROPA | Add a one-page architecture diagram or sequence map if counsel wants Annex IV-style packaging. |
| AI components and model routing | LLM model register; router ADR; eval harness | Keep the model register and per-environment routing state current; state the flag/rollout status as of the date of any claim rather than assuming it. |
| Data inputs | ROPA; DPIA; store worksheet | Store worksheet remains stale for age floor and identity-v2 naming; refresh before store submission. |
| Data outputs | Learning sessions, summaries, mastery/review state, parent proof artifacts, exports | Parent proof digest and cancel-flow evidence tracked separately. |
| Prompt and response controls | LLM router/envelope architecture; prompt eval harness; safety probes | Prompt changes require the LLM eval harness per repo rule; output moderation remains an open safety gate in the LLM register. |
| Learning evaluation and mastery decisions | Challenge Round mastery policy in AGENTS.md; server-owned conservative mastery rule | Keep proof surfaces tied to verified learner explanations and solid-answer quotes only. |
| Human oversight | Parent-visible proof concept; privacy/export/delete controls; institutional tripwire | For institutional use, add deployer instructions that name reviewer, override, dispute, correction, and pause controls before launch. |
| Logging / traceability | Session events; Sentry; Inngest; consent/deletion audit trails; router logging architecture | Define the high-risk traceability log set before any high-risk claim: model/prompt version, routing decision, evaluator evidence, oversight events, incidents, and retention. |
| Risk management | DPIA action plan; launch-country ruling; this skeleton | Convert this skeleton into a live AI risk register if counsel rules the current or future use is high-risk. |
| Data governance | ROPA; DPIA; identity compliance register; retention audit; processor transfer evidence ledger | Close counsel-set retention values, provider DPAs/TIAs, and policy-engine jurisdiction population before launch. |
| Accuracy and robustness | Eval harness; LLM register; router ADR | Define measurable acceptance thresholds, drift triggers, and release gates for AI-system changes. |
| Cybersecurity | Architecture docs; Sentry; deployment docs; auth/identity controls | Link security review evidence here when available; do not infer a formal AI Act cybersecurity file from general app security. |
| Change management | Commit/PR lifecycle; eval snapshot rules; model vetting register | Add a change-control checklist for model, prompt, routing, proof-surface, logging, and oversight changes. |
| Post-market monitoring | Sentry; support path work; safety/compliance registers | Define AI-specific post-market monitoring: complaints, incidents, corrections, model changes, serious-incident escalation, and periodic review cadence. |
| Provider/deployer materials | Not applicable to current direct-to-family posture | Required before school/institutional deployment. See tripwire doc. |

## QMS Skeleton

| QMS area | Minimum control | Current state |
|---|---|---|
| Document control | Compliance artifacts live under `docs/compliance/`; changes land through reviewable commits and Cosmo WIs. | Active. This skeleton is the index for AI Act readiness evidence. |
| Responsibility | DPO/counsel own legal classification and sign-off; engineering owns evidence and control implementation; product owns positioning and prohibited-use boundaries. | Partial; DPO appointment is conditional on DPIA completion. |
| Requirements intake | The launch-country ruling's open AI Act item drives the current obligation set. | Active; counsel sign-off still open. |
| Risk review | DPIA and this skeleton identify risks and gaps. | Partial; formal AI risk register not yet created. |
| Data governance review | ROPA, DPIA, retention audit, processor transfer ledger, and store worksheet map data flows. | Partial; store worksheet and retention values still need refresh/sign-off. |
| Model/vendor vetting | LLM register and ADRs describe the model set, excluded providers, and open cutover gates. | Partial; vendor contracts/DPAs remain gates. |
| Evaluation and release gates | LLM eval harness and snapshot rules gate prompt/model changes. | Active for prompt/model changes; thresholds need AI-system-level packaging. |
| Incident and complaint handling | Sentry/support/safety events provide raw signals. | Partial; AI-specific incident taxonomy and post-market route need definition. |
| Change control | Repo commit/review flow plus eval requirements protect technical changes. | Active; compliance-change checklist should be added before high-risk claim. |
| Periodic review | Launch final gate tracked separately. | Cadence not final. |

## Counsel / DPO Review Note

Before this file is used externally or treated as formal high-risk technical documentation, counsel/DPO must confirm:

1. Whether the current B2C product is outside Annex III point 3 for the stated intended purpose, or qualifies under Article 6(3).
2. Whether this skeleton is sufficient as an internal readiness packet, or whether a fuller Annex IV technical file is required before launch.
3. Which QMS controls are required now versus only on a future high-risk/institutional trigger.
4. Whether the product may describe itself as "high-risk-ready" internally only, externally, or not at all.

## Current Go / No-Go

| Claim or launch motion | Status |
|---|---|
| Current B2C launch | Governed by the existing DPO/DPIA/provider/legal launch gates; this file does not add a separate high-risk blocker and does not clear one. |
| Public high-risk compliance claim | No-go until counsel signs classification and the technical/QMS packet is filled with evidence. |
| School/institutional deployment | No-go until the tripwire doc's preconditions are satisfied. |
