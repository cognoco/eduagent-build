# MentoMate compliance workspace

**Status:** Working controller records for the EEA consumer launch. Draft legal
positions require independent DPO/privacy advice before final approval.

**Launch scope:** Direct-to-consumer, credentialled users aged 13+. Perimeter =
screen-based allowlist (ruled 2026-07-26): EEA countries whose launch-day
verified GDPR Article 8 threshold is 13 (Route 1, per the 07-23 register), plus
non-EEA jurisdictions individually cleared by a documented admission screen
(Route 2 — US is the first pass, conditional). UK, Poland/higher-threshold EEA,
Switzerland, and all unscreened jurisdictions remain unavailable at launch. See
[`2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md`](2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md).

## Start here

| Record | Purpose |
|---|---|
| [`dpia.md`](dpia.md) | Master Data Protection Impact Assessment. |
| [`edpb_dpia_filled_2026_v1.md`](edpb_dpia_filled_2026_v1.md) | EDPB-format technical DPIA companion. |
| [`ropa.md`](ropa.md) | GDPR Article 30 Record of Processing Activities. |
| [`2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md`](2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md) | **Active launch-perimeter ruling** — screen-based allowlist (EEA-13 + screened non-EEA). |
| [`2026-07-26-us-launch-screen-record.md`](2026-07-26-us-launch-screen-record.md) | First Route-2 admission screen: United States (conditional pass). |
| [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md) | EEA country register + Article 8 analysis (incorporated as Route 1 of the 07-26 ruling). |
| [`art9-special-category-position.md`](art9-special-category-position.md) | Current proposed treatment of incidental special-category data. |
| [`breach-response-plan.md`](breach-response-plan.md) | Personal-data breach procedure. |
| [`DPO exchanges/`](DPO%20exchanges/) | Stephan’s findings, ZWIZZLY AS’s response, decision annex, and separate AI Act request. |
| [`assessments/providers/2026-07-25-processor-transfer-evidence-ledger.md`](assessments/providers/2026-07-25-processor-transfer-evidence-ledger.md) | Current-main processor and international-transfer evidence ledger for counsel/DPO handoff. |

## Supporting records

| Record | Purpose |
|---|---|
| [`identity-compliance-register.md`](identity-compliance-register.md) | Identity and consent compliance requirements. |
| [`voice-floor-exception-ledger.md`](voice-floor-exception-ledger.md) | Ruled voice-input exceptions to the V2 transcription floor (WI-2553); guard-enforced. |
| [`breach-register.md`](breach-register.md) | GDPR Art 33(5) breach register — empty template, one row per incident. |
| [`audience-matrix.md`](audience-matrix.md) | Reconstructed audience and access-control inventory; verify against current code before relying on line-level claims. |
| [`2026-07-17-consent-withdrawal-bearer-token-threat-posture.md`](2026-07-17-consent-withdrawal-bearer-token-threat-posture.md) | Consent-withdrawal token security posture. |
| [`rls-risk-acceptance-memo.md`](rls-risk-acceptance-memo.md) | Row-level-security risk decision. |
| [`privacy-policy.html`](privacy-policy.html) | Adult-facing privacy notice draft. |
| [`child-readable-privacy-summary-draft.md`](child-readable-privacy-summary-draft.md) | Child-readable transparency draft. |
| [`privacy-publication-manifest.md`](privacy-publication-manifest.md) | Privacy-notice publication package: claim-to-evidence map, publication checklist, OPQ-106/OPQ-107 handoff. |
| [`2026-07-04-launch-compliance-closure-check-early-pass.md`](2026-07-04-launch-compliance-closure-check-early-pass.md) | Historical engineering evidence still cited by the DPIA; re-verify at the final launch gate. |
| [`2026-07-06-school-institutional-ai-act-tripwire.md`](2026-07-06-school-institutional-ai-act-tripwire.md) | Product/legal gate for school, LMS/SIS, formal-assessment, proctoring, and institutional use, plus the blocked-copy list. Decides no classification. |
| [`2026-07-06-eu-ai-act-technical-file-qms-skeleton.md`](2026-07-06-eu-ai-act-technical-file-qms-skeleton.md) | High-risk-readiness technical-file and QMS index. A gap map, not evidence of compliance. |

## Directory structure

| Directory | Contents | Authority |
|---|---|---|
| [`DPO exchanges/`](DPO%20exchanges/) | Dated correspondence and review requests. | External-review working material, not controller approval. |
| [`assessments/providers/`](assessments/providers/) | Controller processor due-diligence and international-transfer assessments. | Management evidence; final legal/DPO conclusions remain independently reviewed. |
| [`evidence/providers/`](evidence/providers/) | Provider DPAs and configuration evidence with SHA-256 integrity hashes. | Evidence only; legal adequacy remains for review. |
| [`research/providers/`](research/providers/) | Vendor-owned source research supporting procurement and transfer review. | Research, not legal advice or executed approval. |
| [`templates/`](templates/) | Blank source templates. | No product or legal authority. |
| [`history/`](history/) | Superseded decisions, obsolete snapshots, and completed audits retained for provenance. | Never use as current launch authority. |

## Evidence rules

- Build launch evidence from the exact release and configuration proposed for
  launch.
- Keep signed or incorporated provider terms with their source date and
  integrity hash.
- Do not treat feature flags, Work Item status, a historical deployment, or a
  design document as proof that a launch control operates.
- Keep obsolete material under `history/` with a clear supersession notice;
  delete only verified duplicates or records with no continuing evidential
  value.
- The final DPIA requires Stephan’s independent advice followed by Zuzana
  Kopečná’s recorded decision for ZWIZZLY AS.
