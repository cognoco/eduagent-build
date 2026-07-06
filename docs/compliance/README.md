# Compliance Artifacts — Launch (13+)

**Status:** DRAFTS for DPO / privacy-counsel sign-off. **Not legal advice.**
**Scope:** EU/EEA (company seat: Norway) + UK + USA. AI tutoring app, sold to consumers, used by minors 13+.
**Launch decision (2026-06-08):** launch at **13+**; build for **10+ but outside COPPA** (block US-resident under-13; serve any future non-US 10–12 cohort under the lighter GDPR parental-authorization route, never COPPA-grade VPC).
**Master checklist:** [`docs/meetings/minors-compliance-requirements.md`](../meetings/minors-compliance-requirements.md) — LIST A (live) / LIST B (dormant at 13+).
**Verified data map:** [`docs/audit/2026-06-07-data-retention-and-erasure-audit.md`](../audit/2026-06-07-data-retention-and-erasure-audit.md).

> **How to read these.** They are written so a non-lawyer can see what each one says and why. Every legal claim carries a `Law:` tag so your DPO/lawyer can verify fast. The DPIA (A1) and the Art 9 decision (A23) are the two that a qualified privacy professional must sign before launch — budget a few hours of their time to review the drafts here, not to write them from scratch.

## What's here

| File | Checklist item | What it is | Sign-off owner | Blocks launch? |
|---|---|---|---|---|
| [`dpia.md`](dpia.md) | A1 | Data Protection Impact Assessment — the master risk assessment. | DPO + counsel | **Yes** |
| [`2026-07-06-eu-ai-act-high-risk-education-plan.md`](2026-07-06-eu-ai-act-high-risk-education-plan.md) | WI-1659 | EU AI Act education-AI classification memo and high-risk-readiness plan. | DPO + counsel | Yes for institutional/high-risk claim; no separate blocker for current B2C posture |
| [`ropa.md`](ropa.md) | A3 | Record of Processing Activities (GDPR Art 30 register). | DPO | Yes |
| [`breach-response-plan.md`](breach-response-plan.md) | A4 | 72-hour data-breach procedure (Datatilsynet). | DPO | Yes |
| [`art9-special-category-decision.md`](art9-special-category-decision.md) | A23 | Decision: we do **not** process health/disability (Art 9) data. | DPO + counsel | Yes (gates DPIA weight) |

## Not yet drafted here (tracked, owners elsewhere)

| Item | What | Owner | Where it lives |
|---|---|---|---|
| A2 | Appoint outsourced DPO | You (procure) | retainer + privacy policy contact |
| A5 | Privacy policy | Done (rewritten 2026-06-08) | [`docs/privacy-policy.html`](../privacy-policy.html) — pre-publish TODO open (DPO name, address, Art 27 rep) |
| A6 | UK GDPR representative | You (procure, if serving UK) | privacy policy |
| A10 | "You're talking to an AI" notice (EU AI Act Art 50, deadline 2 Aug 2026) | Eng | chat/tutor screen |
| A11/A12 | Provider DPAs (business tier) + US-transfer checks | DPO + you | per-provider contract files |
| A14 | Voice = transcription only (AI Act Art 5(1)(f)) | Eng | product rule + voice-lib check |

## Launch substrate — the new identity-foundation architecture

**Decision (user, 2026-06-08): everything launches on the new architecture**, not the legacy `accounts`/`profiles` schema. Consequences baked into the data-layer docs:

- The **DPIA** and **ROPA** are written against the ratified target ([`_wip/identity-foundation/data-model.md`](../../_wip/identity-foundation/data-model.md)), citing it as the schema source. They assess the *design*; a re-confirmation pass against the *built* schema (live `file:line` citations) is owed before final DPIA sign-off.
- The target model **closes several risks by construction**: consent-receipt survives deletion (`person_retain`, the `I-C1` fix), consent is an append-only event log with recorded `lawful_basis` (`consent_grant`), age/jurisdiction gating is regime-banded (the policy engine), and vendor routing enforces the Gemini-under-18 exclusion (`allowed_models` / `MMT-ADR-0014`).
- **Timeline reality:** the target is **ratified but not yet built** — execution is post-Phase-P and gated on external `WI-530`. So **launch is downstream of building the identity foundation.** The compliance drafting here does not unblock that; the build does.

### Carried into the new build (not legacy fixes)
- New delete flow must erase the external **Clerk identity** (R1) and the out-of-model **`byok_waitlist`** email (R3a) — neither is handled by the identity cascade. The legacy `executeDeletion` byok fix is break-tested and interim; its *requirement* carries forward.
- `person_retain.*.retention_period` values must be counsel-set, not placeholder (Phase-F launch-readiness guard).
- The legacy `organizations`-row PII gap (R3b) is **moot** — the target schema drops that table.
