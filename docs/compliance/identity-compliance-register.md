# Identity Foundation — Compliance Register

**Layer:** L1 canon (compliance). **Graduates to:** `docs/compliance/`. **Traces to:** the counsel
walkthrough (2026-06-03) + the Phase-E filler walkthrough (2026-06-04), preserved in
`_wip/identity-foundation/_history/identity-foundation-prd-provenance.md` + git history; the identity invariants
(`docs/canon/identity/ontology.md` §4); `MMT-ADR-0002`/`0011`/`0013`/`0014`.

> **What this is.** The binding compliance obligations of the identity foundation, lifted out of the PRD
> decision queue (where they were trapped as counsel-register entries) so they stand as canon rather than
> dying with the runway. Each rule states the obligation + its legal basis. **Fidelity note:** this is
> **distilled** from the counsel register at requirement altitude; the full per-rule `basis:` deliberation
> and citation links live in the PRD provenance + git history. **Counsel/PM should verify this register
> against the original counsel walkthrough before it is treated as legal authority.** Values marked
> *(counsel)* are parameters counsel must fix.

> **Scope frame — the three buckets** (counsel's cross-cutting model, "not every user is a child"): every
> rule below is scoped to **adult** / **consent-capable minor** / **consent-gated charge** — most fire only
> for minors. A rule that says "minor" does not apply to verified adults.

---

## C-1 — AI / LLM exposure

- **All minors are pinned to one papered LLM endpoint.** A consent-gated or consent-capable minor's LLM
  calls route only to a vetted, contractually-papered model endpoint (the `allowed_models` vetting output).
  **Guard test required** (a forward-only CI guard that fails if a minor path can reach an unpapered model).
  *Basis:* COPPA third-party-disclosure + GDPR Art 8; the LLM call is a third-party disclosure of a child's
  data. *Realized by:* `docs/canon/identity/data-model.md` §2A.3 (`allowed_models`) + `MMT-ADR-0014`.
- **`lawful_basis` + `termsAccepted` are recorded fields.** Every consent-gated processing record carries the
  lawful basis it rests on and the terms-acceptance fact. *Basis:* GDPR Art 6/8 accountability. *Realized by:*
  `consent_grant.lawful_basis` (`docs/canon/identity/data-model.md` §4.8).
- **The AI-training consent toggle must not render for minor profiles.** A minor must never be shown a UI
  control that would opt their data into model training. *Basis:* COPPA-2025 per-purpose consent; minors
  cannot self-authorize `aiTraining`. *Realized by:* purpose-scope gating (`docs/canon/identity/ontology.md` inv 27).
- **Disclose profiling as present and lawful (GDPR Art 13(2)(f)); never claim ADM is engineered-out.**
  Privacy copy must disclose that adaptive profiling occurs and is lawful — it must not assert that
  automated decision-making has been removed. *Basis:* GDPR Art 13(2)(f) / Art 22.

## C-2 — Internal-state / biometric inference (EU AI Act)

- **No emotion or intention is inferred from biometrics; voice is transcription only.** The product does not
  perform emotion-recognition or intention-inference from voice/biometric signals; voice input is used for
  transcription only. *Basis:* EU AI Act Art 5 prohibited practices + the high-risk classification of
  emotion recognition.
- **Internal-state vocabulary is functional-only; a CI static-analysis guard enforces it.** Code and copy
  describing learner state use functional terms (e.g. "needs deepening"), never affective/emotional inference
  language. A static-analysis CI guard fails on prohibited vocabulary. *Basis:* EU AI Act emotion-recognition
  prohibition.

## C-3 — Online Safety Act (OSA) — dormant launch regime

The United Kingdom is disabled by the
[`13+ EEA launch-country ruling`](2026-07-23-13-plus-eea-launch-country-ruling.md).
The existing OSA-derived guards remain useful global minimization controls, but
OSA and UK-representative work are not part of the ruled v1 launch perimeter.
Any future UK enablement reopens the full UK legal review.

- **Two forward-only OSA guards.** (a) **No verbatim learner quote in the guardian-visible schema** — a
  guardian/supporter view never surfaces a child's verbatim message text. (b) the dated OSA note (the second
  forward-only guard) per the counsel register. *Basis:* UK OSA child-safety duties + data-minimization.

## C-4 — Deletion, retention & survivors

- **The S1–S8 survivor table + `legal_hold` flag blocks every delete path.** A defined set of survivor
  classes (S1–S8) and a `legal_hold` flag gate every deletion path — no delete proceeds where a hold or a
  mandated-retention class applies. *Basis:* GDPR Art 5(1)(e) storage-limitation + legally-mandated retention
  (billing/tax). *Realized by:* the `person_retain` set + `ON DELETE RESTRICT` (`docs/canon/identity/data-model.md` §4.8/§4.9/§6.1).
- **Retain-tier write is captured at event-time, not delete-time.** The retain-tier facts (consent receipt,
  prior-value audit) are written when the event occurs, not reconstructed at deletion. *Realized by:*
  `consent_grant` append-only log (`docs/canon/identity/data-model.md` §4.8).
- **Eight conditions for a lawful guardian-initiated child delete.** A guardian-initiated deletion of a
  genuine under-consent-age charge's data is lawful only when all eight counsel conditions hold (export
  offered first; audited; authority-held; etc. — full list *(counsel)*). *Basis:* the child's erasure right +
  the guardian's authority to exercise it. *Realized by:* `deletion_audit` + the receipt-survival guard
  (`docs/canon/identity/data-model.md` §6.1); see `docs/canon/identity/ontology.md` inv 21.
- **The transition scheduler runs at profile granularity for child profiles.** Age/consent re-evaluation and
  dormancy-expiry operate per child profile; a parent's subscription shield is **not** a blanket cover over a
  child's independent obligations. *Realized by:* the unified daily sweep (`MMT-ADR-0009`).
- **Re-point control in place, never fork.** A transition that needs to move a Person re-points the existing
  `person_id`; it never creates a parallel duplicate Person. *Basis:* never-orphan + history-preservation
  (`docs/canon/identity/ontology.md` inv 20/21).

## C-5 — DPIA / governance launch gate

- **DPIA complete before the first real minor; DPO appointment mandatory.** A Data Protection Impact
  Assessment must be complete before the first real consent-gated child is onboarded, and a Data Protection
  Officer must be appointed. **This gates launch.** *Basis:* GDPR Arts 35 and 37. UK-specific duties are
  dormant while the UK is disabled.

---

## Locked product parameters *(counsel-set; values may move — confirm before launch)*

| Parameter | v1 value | Owner |
|---|---|---|
| Product age brackets | **0–12 unavailable; 13–17 minor; 18+ adult.** These product bands do not replace national Article 8 consent thresholds. | product + counsel |
| Signup age floor | **13+ in every enabled country.** No guardian workaround admits an under-13 user at v1. | product + counsel |
| EEA country perimeter | **All 30 EEA countries**, subject to common launch gates, national review, localization, and implementation of the applicable consent band. An allowlist entry is not a legal-safety guarantee. | product + DPO/counsel |
| Residence-based consent gate | Apply the national Article 8 threshold by habitual residence: 13 → self-consent from 13; 14 → guardian at 13; 15 → guardian at 13–14; 16 → guardian at 13–15. France requires joint child + parental consent below 15. | product + DPO/counsel |
| Live-law rechecks | **NO and PT** require launch-day review of active legislation. Update the threshold policy or fail closed if the law has changed. | product + DPO/counsel |
| Country exclusions | **GB denylisted**; all other non-EEA countries disabled until separately ruled. | product + DPO/counsel |
| Dormancy → cleanup | **~24 months** inactivity, **30-day** pre-deletion notice + export window | counsel |
| Moved-country grace window | parameter, value *(counsel)* | counsel |
| Retention periods (consent receipt / deletion audit / financial record) | *(counsel fills `retention_period`)* | counsel |
| Boundary-crossing verification method | the light verification for a consent-boundary-crossing edit; vendor *(procurement)* | technical reviewer |
| Co-guardian precedence | one-of/all-of rule *(counsel; a default may be set)* | counsel |

---

## Open compliance threads (tracked in ROADMAP, not resolved here)

- The six-item consent legal-review register (contract basis for a minor's core processing; cross-org
  consent; graduation consent survival; COPPA AI-training applicability; EU AI-Act high-risk trigger; Ofcom
  child-AI-chatbot regs) — counsel-owned.
- VPC vendor selection (KWS vs k-ID) + platform Age-Signals timing — procurement, after legal requirements
  are clear.
- The EEA residence/threshold policy engine, verified guardian flow, Portugal
  and Norway live-law checks, and any non-EEA market — the EEA controls follow
  the launch-country ruling; every non-EEA market requires a separate ruling.
