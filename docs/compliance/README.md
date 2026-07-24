# Compliance Artifacts — Launch (13+)

**Status:** DRAFTS for DPO / privacy-counsel sign-off. **Not legal advice.**
**Scope:** EEA-only consumer launch (controller established in Norway), used by minors 13+ and adults. The UK, USA, Switzerland, and every other non-EEA market are disabled until separately cleared.
**Launch decision (2026-07-23):** use a **13+ product floor across enabled EEA countries**; block under-13 everywhere; use habitual residence and the national Article 8 threshold to require guardian authorization for ages 13–15 where applicable. All 30 EEA countries are within the intended policy perimeter, while the UK is excluded. Portugal and Norway require launch-day checks of active threshold proposals. See the binding [`13+ EEA launch-country ruling`](2026-07-23-13-plus-eea-launch-country-ruling.md).
**Implementation warning:** the 13+ floor exists, but specific-country habitual-residence capture, the threshold lookup, and server/store allowlist do not. No EEA country is production-enabled by the document alone.
**Launch gates:** [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md) → “Common gates before any country is enabled,” plus the open actions in [`dpia.md`](dpia.md). Superseded research and decision-support files are retained under [`history/`](history/).
**Historical data-map evidence:** [`history/2026-06-07-data-retention-and-erasure-audit.md`](history/2026-06-07-data-retention-and-erasure-audit.md) — re-verify against current code before relying on it.

> **How to read these.** They are written so a non-lawyer can see what each one says and why. Every legal claim carries a `Law:` tag so your DPO/lawyer can verify fast. The DPIA (A1) and the Art 9 decision (A23) are the two that a qualified privacy professional must sign before launch — budget a few hours of their time to review the drafts here, not to write them from scratch.

## What's here

| File | Checklist item | What it is | Sign-off owner | Blocks launch? |
|---|---|---|---|---|
| [`dpia.md`](dpia.md) | A1 | Data Protection Impact Assessment — the master risk assessment. | DPO + counsel | **Yes** |
| [`ropa.md`](ropa.md) | A3 | Record of Processing Activities (GDPR Art 30 register). | DPO | Yes |
| [`breach-response-plan.md`](breach-response-plan.md) | A4 | 72-hour data-breach procedure (Datatilsynet). | DPO | Yes |
| [`art9-special-category-decision.md`](art9-special-category-decision.md) | A23 | Decision: we do **not** process health/disability (Art 9) data. | DPO + counsel | Yes (gates DPIA weight) |
| [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md) | Country gate | Product age brackets, the 30-country EEA perimeter, national Article 8 consent thresholds, implementation waves, and UK exclusion. | Product + DPO/counsel | **Yes** |
| [`DPO exchanges/2026-07-23-dpia-review-response-draft.md`](DPO%20exchanges/2026-07-23-dpia-review-response-draft.md) | DPIA evidence response | Current ten-question working response, reconciled with code, production evidence, and the launch-country ruling; identifies evidence and sign-off still required. | Management + DPO/counsel + eng | **Yes** |
| [`2026-07-23-dpia-review-response-draft.md`](2026-07-23-dpia-review-response-draft.md) | Superseded DPIA response snapshot | Retains the earlier incomplete six-question draft for provenance; explicitly marked do not send. | Management + DPO/counsel | Evidence only |
| [`DPO exchanges/`](DPO%20exchanges/) | External-review working set | Dated materials prepared for DPO or specialist-counsel review; not signed approvals or binding canon. | Management + DPO/counsel | Evidence only |
| [`privacy-policy.html`](privacy-policy.html) | A5 | Public-facing privacy notice draft, now colocated with its source compliance records. | DPO + counsel | **Yes** |
| [`audience-matrix.md`](audience-matrix.md) | Supporting inventory | Historical/reconstructed product-audience gating evidence; not the country matrix and not current line-map authority. | Product + eng | No |

## Not yet drafted here (tracked, owners elsewhere)

| Item | What | Owner | Where it lives |
|---|---|---|---|
| A2 | Appoint outsourced DPO | You (procure) | retainer + privacy policy contact |
| A6 | UK GDPR representative | Dormant — UK is explicitly outside the launch perimeter | Reopens only if a later ruling enables the UK |
| A10 | "You're talking to an AI" notice (EU AI Act Art 50, deadline 2 Aug 2026) | Eng | chat/tutor screen |
| A11/A12 | Provider DPAs (business tier) + US-transfer checks | DPO + you | per-provider contract files |
| A14 | Voice = transcription only (AI Act Art 5(1)(f)) | Eng | product rule + voice-lib check |

## Launch substrate — identity foundation built and live

**Decision (user, 2026-06-08): everything launches on the new architecture**, not the legacy `accounts`/`profiles` schema. Consequences baked into the data-layer docs:

- The **DPIA** and **ROPA** are written against the built, live identity-v2 schema, with [`docs/canon/identity/data-model.md`](../canon/identity/data-model.md) retained as design provenance. The 2026-07-10 DPIA refresh records the implementation evidence; external sign-off remains outstanding.
- The target model **closes several risks by construction**: consent-receipt survives deletion (`person_retain`, the `I-C1` fix), consent is an append-only event log with recorded `lawful_basis` (`consent_grant`), and vendor routing enforces the Gemini-under-18 exclusion (`allowed_models` / `MMT-ADR-0014`). It also provides policy-engine and residence fields for jurisdiction gating, but EEA-country content and enforcement remain open launch work.
- **Current state:** the identity foundation is no longer the launch blocker. The open gates are the country ruling's common controls, the DPIA action list, and external DPO/counsel sign-off.

### Remaining controls from the original design review

- Historical evidence records external **Clerk identity** erasure as implemented; re-verify it at the final gate. The out-of-model **`byok_waitlist`** email (R3a) is not handled by the identity cascade, so its deletion requirement remains explicit.
- `person_retain.*.retention_period` values must be counsel-set, not placeholder (Phase-F launch-readiness guard).
- The legacy `organizations`-row PII gap (R3b) is **moot** — the target schema drops that table.
