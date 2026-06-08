# Data Protection Impact Assessment (DPIA)

**Checklist item:** A1 · **Law:** GDPR Article 35 · **Status:** DRAFT for DPO + privacy-counsel sign-off. **This must be signed before the first child uses the app — it is the master launch gate.**
**Controller:** `[legal entity name — TODO]`, established in Norway. **DPO:** `[name / dpo@… — TODO]`.
**Product:** MentoMate — an AI tutoring app for learners aged 13+ (built to extend to 10+ outside COPPA later).
**Date / version:** Draft 2026-06-08, v0.1. **Review:** on any material change to data, purposes, or AI providers.
**Companion documents:** [`ropa.md`](ropa.md) (data register), [`art9-special-category-decision.md`](art9-special-category-decision.md), [`breach-response-plan.md`](breach-response-plan.md), [`docs/meetings/minors-compliance-requirements.md`](../meetings/minors-compliance-requirements.md) (LIST A).
**Schema source of truth:** [`_wip/identity-foundation/data-model.md`](../../_wip/identity-foundation/data-model.md) (ratified target). Legacy data-flow evidence: [`docs/audit/2026-06-07-data-retention-and-erasure-audit.md`](../audit/2026-06-07-data-retention-and-erasure-audit.md).

> **Launch substrate = the new identity-foundation architecture.** This DPIA assesses processing **as it will be at launch**, on the ratified target schema (`person`/`login`/`organization`/`membership`/`guardianship`/`mentorship`/`consent_grant` + a `person_retain` tier + a policy engine), **not** the legacy `accounts`/`profiles` schema. The target is **ratified but not yet built** — its execution is post-Phase-P (gated on `WI-530`), so **launch is downstream of building it**. Several risks below are *closed by construction* in the target model (the consent-receipt-survival fix, the consent event log, regime-banded gating, vendor routing) and become real launch conditions only as "build it correctly," not "design it."

> **Plain-language note.** A DPIA is a written "what could go wrong for the people whose data we handle, and what we do about it" assessment. The law **requires** it here because we (a) profile individuals using AI and (b) those individuals are **children** — that combination is explicitly high-risk. This draft does the heavy lifting; the DPO/lawyer reviews, adjusts, and signs.

---

## 1. Why a DPIA is mandatory here

GDPR Art 35(3) and the Datatilsynet/EDPB criteria treat processing as high-risk — triggering a mandatory DPIA — when several of these are present. We hit them:

- **Profiling / evaluation** — we evaluate a learner's knowledge and tailor tuition to them.
- **Systematic monitoring** — continuous tracking of learning over time ("the mentor remembers").
- **Vulnerable data subjects — children** — the decisive factor; the power imbalance between a child and the service is exactly what the DPIA regime protects.
- **Innovative technology** — large-language-model AI.
- **Data processed on a large scale** at consumer launch.

Three or more of these each independently flag high risk; children + profiling + AI together make the DPIA non-optional.

## 2. Description of the processing

### 2.1 What we do
An AI tutor holds a teaching conversation with a learner, tracks what they have covered, and adapts. A persistent **learning memory** (mastery state, misconceptions, summaries, extracted facts) lets the tutor remember across sessions. A guardian can oversee a child's progress. The service is sold as a consumer subscription paid by an adult.

### 2.2 Data and data subjects
See [`ropa.md`](ropa.md) for the full register (target schema). In summary:
- **Subjects:** a **`person`** (the human, the learning-data scope key) wearing capability hats — Subscription-administrator (`admin` role; an adult), learner, Guardian (consent authority), Mentor (data access), Payer (billing). Owner/`is_owner` dissolves into the `admin` role.
- **Data:** `login` identity (email, Clerk binding); `person` (birth_date, residence, display name, pronouns, language, interests); `knowledge_assertions` (age/residence determination history — the COPPA actual-knowledge / Art 8 audit trail); `consent_grant` event log; the tutoring conversation and everything derived from it (mastery, notes, facts, quotes, summaries, quizzes, vocabulary, progress; scoped `person_id`); billing; error/telemetry.
- **No special-category (Art 9) data** — no health or disability data is collected or inferred (§6.3; [`art9-special-category-decision.md`](art9-special-category-decision.md)).

### 2.3 Data flow (target architecture)
1. Sign-up → age + residence gate via the **policy engine** (`regimes`×`policy_cells`×`policy_rules`; unknown axis defaults to most-restrictive) → `consent_grant` recorded with `lawful_basis` (A9) → `person` created; the determination is logged to `knowledge_assertions`.
2. Learner converses → turns routed through the **model router** to a **vetted** LLM provider (`allowed_models`, `MMT-ADR-0014`; identifiers minimised, A13; Gemini excluded for this app) → reply rendered.
3. After a session, the conversation is distilled into the **learning memory** (scoped `person_id`); the raw transcript is **purged at 30 days** (`RETENTION_PURGE_ENABLED=true`, verified 2026-06-08).
4. Embeddings (Voyage) power memory recall. Billing via RevenueCat + the app stores, anchored to `organization`. Email via Resend. Errors via Sentry. Durable jobs via Inngest (the unified daily sweep, `MMT-ADR-0009`). DB on Neon; compute on Cloudflare.
5. **Erasure = re-home-then-delete** (`data-model.md` §6.1): `consent_grant` → `consent_receipt`; write `deletion_audit`; create `financial_record`; then drop `person` + all learning data; erase the external Clerk identity; erase the out-of-model `byok_waitlist` email. `consent_grant ON DELETE RESTRICT` forces the re-home first — the structural fix for the legacy consent-receipt-destruction defect (`I-C1`).

### 2.4 Recipients / processors
Clerk, LLM provider(s), Voyage, RevenueCat + Apple/Google, Resend, Sentry, Inngest, Neon, Cloudflare. Each requires a signed DPA on a business/enterprise route (A11) and a US-transfer assessment (A12).

## 3. Consultation
- **DPO:** `[to be recorded — the DPO owns and signs this DPIA]`.
- **Engineering:** the target data flow is per the ratified `data-model.md`; the legacy flow it replaces is code-verified (audit doc). A re-confirmation pass against the built schema is required before final sign-off (§9 substrate condition).
- **Data subjects' views:** a children's-product proxy — apply the UK Children's Code (A15) and child-readable privacy summary (A5) as the representation of children's interests.
- **Counsel:** `[to be recorded — confirms Art 9 scope, international transfers, AI-provider terms]`.

## 4. Necessity and proportionality

- **Lawful basis:** consent for the minor's learning/profiling (Art 6(1)(a)); contract for account/billing; legitimate interests for security/monitoring; legal obligation for minimal retained records. Consent is a **real, separate choice**, never bundled into T&Cs (A9).
- **Purpose limitation:** the learning memory may be used **only** for tutoring continuity. Re-use for model training, analytics, or marketing is a new purpose needing its own basis — and is contractually fenced off at the provider (no-training terms, A11/A12). (Checklist A24 purpose-fence.)
- **Data minimisation:** names/identifiers stripped from LLM requests (A13); voice (if enabled) sent as **transcript only**, never raw audio for emotion analysis (A14).
- **Proportionality of the persistent memory (child-specific, read strictly):** an indefinitely-held profile of a *child's* learning performance is justified **only** to the extent it serves teaching continuity — the same justification a school has for a pupil record. A shorter retention would defeat the core promise ("the mentor remembers"). Mitigations: minimised content, no third-party disclosure, learner/guardian can view and correct, deleted on erasure or dormancy expiry. **This paragraph must survive into the signed DPIA — it is the A24 proportionality requirement.**
- **Storage limitation:** raw transcript 30 days; learning memory bound to the **account lifecycle** (deleted on account deletion or after the defined dormancy period), not "forever, detached." (A24; note the open age-out item A24-b below.)

## 5. Accuracy, rights, and transparency
- **Transparency:** plain-language privacy policy + child-readable summary (A5); clear "you're talking to an AI" indicator (A10, AI Act Art 50, due 2 Aug 2026).
- **Rights:** access, rectification, erasure, withdrawal of consent — both deletion and consent-withdrawal run the re-home-then-delete pattern (§2.3 step 5), which **preserves the consent receipt and the deletion audit while erasing the person and learning data** (the `person_retain` tier; `data-model.md` §3.2/§6.1). Guardian can view/correct a charge's data.
- **Accuracy:** learner/guardian can correct the record; mastery state is revisable.

## 6. Risks to individuals, and mitigations

| # | Risk to the individual (esp. a child) | Likelihood | Severity | Mitigation | Residual |
|---|---|---|---|---|---|
| 6.1 | **Misleading retention notice** — user told "chats deleted in 30 days" but verbatim answers survive in notes/summaries/quotes | Med | Med | **(a) Done** — privacy policy now discloses retained learning summary incl. short quotes + purpose-fence (A24-a, 2026-06-08). **(b) Fast-follow** — age-out/abstract verbatim fields on the 30-day clock (A24-b) | Low after (a); Very low after (b) |
| 6.2 | **Incomplete erasure** — data surviving a person deletion | Low | High | Target erasure is **re-home-then-delete** (§2.3 step 5) — structurally closes the legacy consent-receipt-destruction defect (`I-C1`). The legacy `organizations`-row PII gap (R3b) is **moot** — the target schema drops that table. **Two requirements must be built into the new delete flow:** (a) erase the external **Clerk identity** (R1 logic carries forward); (b) erase the out-of-model **`byok_waitlist`** email (legacy fix break-tested; `byok_waitlist` is outside the identity carve-out so it gets no cascade). | Low, conditional on the new delete flow implementing (a)+(b) |
| 6.3 | **Inadvertent health/disability inference** (Art 9) | Low | High | Hard product rule: no clinical/disability label or inference, anywhere (A23). **Action:** extend the no-clinical-copy guard to cover LLM-written `memory_facts`/`topic_notes`/`misconception` fields, not just static copy | Low |
| 6.4 | **Child's data sent to an AI provider on the wrong terms / used to train models** | Med | High | Business/enterprise route only, no-training + retention controls, DPA signed (A11); US-transfer check per provider (A12); **Gemini blocked** for this app (under-18 terms); names minimised (A13) | Low once DPAs signed |
| 6.5 | **Manipulative/pressuring design aimed at a child** (streaks, urgency, upsell) | Med | Med | No guilt/streak pressure; easy guilt-free exit; upsell neutral and adult-facing (A16/A22); UK Children's Code defaults (A15) | Low |
| 6.6 | **Child entered into a paid contract** | Low | Med | Billing sits with the adult owner; a child cannot start a paid plan (A20); clear cancellation (A21) | Low |
| 6.7 | **Data breach at us or a processor** | Low | High | Breach plan + 72h Datatilsynet process (A4); processor DPAs oblige vendor notification; secrets via Doppler; Sentry PII scrubbing; (defense-in-depth: app-level scoping + planned RLS) | Low–Med |
| 6.8 | **Weak age assurance** — under-13 slips in at a 13+ launch | Med | Med | DOB (not yes/no) at sign-up; **`knowledge_assertions`** records method + confidence per axis; the **policy engine** defaults unknown age/residence to most-restrictive and bands consent by regime; protection-lowering edits gated (`data-model.md` §6.2); under-13 rejection + bounce instrumented | Low–Med |
| 6.9 | **Wrong-regime / wrong-jurisdiction consent** | Low | High | The **policy engine** (`regimes`×`policy_cells`×`policy_rules`) bands consent by jurisdiction (US sub-13 excluded; EU per-country self-consent ages); `knowledge_assertions` is the audit trail | Low once engine content (DB-mastered) is populated |
| 6.10 | **Over-broad profiling / function creep** | Low | Med | Purpose-fence (§4); profiling limited to teaching personalisation | Low |

**On Article 22 (automated decisions):** the profiling **personalises teaching only** and carries **no legal or similarly significant effect** on the learner. Therefore the Art 22 prohibition on solely-automated significant decisions is **not engaged**. The DPIA records this explicitly so the question is closed.

## 7. International transfers
Most processors are US-based. For each: check DPF certification at launch; where not certified, rely on Standard Contractual Clauses + a transfer risk assessment (TIA). Handled per A12; documented per-provider. (GDPR Chapter V.)

## 8. AI Act intersection (record, don't re-assess here)
- **Art 50 transparency** — AI-disclosure indicator, due 2 Aug 2026 (A10).
- **Art 5(1)(f)** — no emotion inference from voice/face; voice is transcription-only (A14).
- Full AI Act gate analysis lives in the launch-gate memo (`E5`) — this DPIA cross-references it rather than duplicating it.

## 9. Outcome

| | |
|---|---|
| **Residual risk after mitigations** | `[DPO to set: Low / Medium]` — on current evidence, **Low–Medium**, conditional on the launch-blocking items below. |
| **Art 36 prior consultation with Datatilsynet required?** | `[DPO call]` — expected **No** if residual risk is reduced to acceptable by the measures above; required only if a high residual risk cannot be mitigated. |
| **Approved to launch?** | ☐ Yes ☐ No — DPO: ____________ Date: ________ |

### Launch-blocking conditions carried out of this DPIA
1. **DPO appointed** and this DPIA signed (A1/A2).
2. **Provider DPAs signed** on business tier + transfer checks done; **no Gemini for this app**, enforced via `allowed_models` (A11/A12, 6.4).
3. **New delete flow implements both** (a) external Clerk-identity erasure and (b) `byok_waitlist` erasure (6.2). *(R3b organizations-PII is moot — dropped by the target schema.)*
4. **Privacy policy pre-publish TODO** resolved — DPO name, registered address, Art 27 rep (A5).
5. **Consent flow** verified against the `consent_grant` event log: per-purpose consent, recorded `lawful_basis`, Guardian authorization where self-consent doesn't apply (A9 / `data-model.md` §4.8).
6. **No-clinical-copy guard** extended to LLM-written memory fields (6.3).
7. **`person_retain.*.retention_period` values set** (not placeholder defaults) — counsel fills; enforced by the Phase-F launch-readiness guard (the value-seam test).
8. **Policy-engine content (DB-mastered) populated** for the launch jurisdictions before go-live (6.9) — the PM-owned compliance-population workstream.

> **Substrate condition (overarching):** because launch runs on the new architecture, **all of the above presuppose the identity-foundation baseline is built and migrated.** That build is post-Phase-P and gated on `WI-530`. This DPIA assesses the *design*; a pre-launch re-confirmation pass against the *built* schema (with live `file:line` citations replacing the `data-model.md` references) is required before final sign-off.

### Tracked, not launch-blocking
- A24-b verbatim age-out (post-launch tightening, 6.1b).
- AI-disclosure indicator before 2 Aug 2026 (A10) — build now, legal deadline later.

---

**Sign-off:** DPO + counsel. This draft is engineering- and policy-complete to the limits of internal knowledge; the items in `[brackets]` need the DPO/lawyer's professional judgement and the company's registration details.
