# MentoMate compliance workspace

**Status:** Working controller records for the EEA consumer launch. Draft legal
positions require independent DPO/privacy advice before final approval.

**Launch scope:** Direct-to-consumer, credentialled users aged 13+, limited at
initial launch to specifically enabled EEA countries whose launch-day verified
GDPR Article 8 threshold is 13. The UK and all other uncleared jurisdictions
remain unavailable.

## Start here

| Record | Purpose |
|---|---|
| [`dpia.md`](dpia.md) | Master Data Protection Impact Assessment. |
| [`edpb_dpia_filled_2026_v1.md`](edpb_dpia_filled_2026_v1.md) | EDPB-format technical DPIA companion. |
| [`ropa.md`](ropa.md) | GDPR Article 30 Record of Processing Activities. |
| [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md) | Launch-country and Article 8 policy ruling. |
| [`art9-special-category-position.md`](art9-special-category-position.md) | Current proposed treatment of incidental special-category data. |
| [`breach-response-plan.md`](breach-response-plan.md) | Personal-data breach procedure. |
| [`DPO exchanges/`](DPO%20exchanges/) | Stephan’s findings, ZWIZZLY AS’s response, decision annex, and separate AI Act request. |

## Supporting records

| Record | Purpose |
|---|---|
| [`identity-compliance-register.md`](identity-compliance-register.md) | Identity and consent compliance requirements. |
| [`audience-matrix.md`](audience-matrix.md) | Reconstructed audience and access-control inventory; verify against current code before relying on line-level claims. |
| [`2026-07-17-consent-withdrawal-bearer-token-threat-posture.md`](2026-07-17-consent-withdrawal-bearer-token-threat-posture.md) | Consent-withdrawal token security posture. |
| [`rls-risk-acceptance-memo.md`](rls-risk-acceptance-memo.md) | Row-level-security risk decision. |
| [`privacy-policy.html`](privacy-policy.html) | Adult-facing privacy notice draft. |
| [`child-readable-privacy-summary-draft.md`](child-readable-privacy-summary-draft.md) | Child-readable transparency draft. |
| [`2026-07-04-launch-compliance-closure-check-early-pass.md`](2026-07-04-launch-compliance-closure-check-early-pass.md) | Historical engineering evidence still cited by the DPIA; re-verify at the final launch gate. |

## Directory structure

| Directory | Contents | Authority |
|---|---|---|
| [`DPO exchanges/`](DPO%20exchanges/) | Dated correspondence and review requests. | External-review working material, not controller approval. |
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
