# MentoMate — EU AI Act Classification Record

**Date:** 2026-07-30
**Status:** Draft v0.1 — for DPO review
**Author:** agent-drafted for management review
**Company:** ZWIZZLY AS, organisation number 811 696 072, Fiskekroken 3B, 0139 Oslo, Norway
**Approval owner:** Zuzana Kopecna, Chair, ZWIZZLY AS (see §9)
**Classification:** **Not high-risk** under Annex III, point 3, for the intended purpose described in §3 — DPO-confirmed 2026-07-30

> **This is the classification record.** It supersedes the working classification memo of 2026-07-24
> ([`DPO exchanges/2026-07-24-eu-ai-act-classification-review-request.docx`](DPO%20exchanges/2026-07-24-eu-ai-act-classification-review-request.docx))
> as the controlled record, and incorporates the DPO's consolidated response of 2026-07-30
> ([`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx), section
> "EU AI Act classification memo"), which is authoritative wherever this document and any earlier
> internal summary differ.
>
> **Not legal advice.** The DPO's confirmation is compliance advice provided outside the statutory DPO
> function (see §11). It is not a public compliance claim and must not be quoted externally.

---

## 1. Purpose and scope of this record

This record answers one question: **does MentoMate, as currently intended and built, fall inside the
high-risk education use cases of Annex III, point 3 of the EU AI Act?** It records the answer (no), the
reasoning, the factual basis the answer depends on, the standing constraints that keep the answer true,
and the obligations that apply despite the non-high-risk classification.

It deliberately does **not** assess personal-data risk. That is the DPIA's job, and the two records stay
separate — see §11.

### 1.1 Coverage of the DPO's seven required additions

The DPO stated that the 2026-07-24 memo is "a good basis for the family-only MVP", but required seven
additions before it could be treated as the final classification record. Each is mapped here so the
reviewer can check coverage directly.

| # | DPO's required addition (his wording, 30.07.Answer.docx) | Where it lives in this record |
|---|---|---|
| 1 | "the relevant product and model version" | §2.1, §2.2 |
| 2 | "the underlying model providers and ZWIZZLY's provider/deployer role" | §2.2, §2.3 |
| 3 | "the exact intended purpose, prohibited uses and geographic launch scope" | §3, §4, §5 |
| 4 | "an approval owner and review date" | §9 |
| 5 | "the reassessment triggers above" | §7 |
| 6 | "the current territorial analysis" | §8 |
| 7 | "the additional obligations described below" (Arts 4, 5, 50(1), 50(2)) | §10 |

---

## 2. System identification

### 2.1 Product version

| Field | Value | Source |
|---|---|---|
| System name | MentoMate AI mentor | `apps/mobile/app.json` (`expo.name`) |
| Application version at the date of this record | **1.0.1** | `apps/mobile/app.json` (`expo.version`) |
| OTA runtime versioning | `runtimeVersion.policy = "appVersion"` — over-the-air updates are pinned to the application version, so a version string identifies the shipped runtime | `apps/mobile/app.json` |
| Provider / owner | ZWIZZLY AS, org. no. 811 696 072, Fiskekroken 3B, 0139 Oslo, Norway | [`2026-07-06-eu-ai-act-technical-file-qms-skeleton.md`](2026-07-06-eu-ai-act-technical-file-qms-skeleton.md) §System Identification |
| Users | Consumer family accounts: learners aged 13+, parents/guardians, and adult solo learners | [`2026-07-06-eu-ai-act-technical-file-qms-skeleton.md`](2026-07-06-eu-ai-act-technical-file-qms-skeleton.md) |

> **Version-binding rule.** This record is bound to application version 1.0.1 and the model set in §2.2.
> A change to either does not automatically invalidate the classification, but the reviewer in §9 must
> confirm at each periodic review that the intended purpose and model set still match this description.
> A *material* change to the underlying model is a reassessment trigger in its own right (§7, trigger 6).

### 2.2 Underlying models and model providers

MentoMate does not train or fine-tune its own models. It routes requests to third-party models through a
single server-side router. The active set at the date of this record is:

| Role in the product | Model | Provider | Serving region |
|---|---|---|---|
| Primary text (default for all tiers and ages) | gpt-oss-120b (`high`) | Cerebras | US |
| Secondary text — free tier (EU-residency or Cerebras-unavailable branch) | Mistral Small 4 | Mistral | EU |
| Secondary text — paid tiers (same branch) | GPT-5 mini (`low`) | OpenAI | EU-residency deployment; zero-data-retention for minors |
| Vision — free tier | Mistral Small 4 | Mistral | EU |
| Vision — paid tiers | GPT-5 mini | OpenAI | EU-residency deployment |
| Interactive deep reasoning (paid, excl. Family tier) | gpt-5.4 (`medium`) | OpenAI | EU-residency deployment |
| Deep reasoning — Family tier | gpt-oss-120b (`high`) | Cerebras | US |
| Deep-reasoning fallback | Sonnet 4.6 | Anthropic | — |
| Asynchronous deep jobs (recaps, curriculum, assessment evaluation) | gpt-oss-120b (`high`) | Cerebras | US |
| Judge / envelope evaluator | Sonnet 4.6 (non-reasoning) | Anthropic | — |

*Source: [`../registers/llm-models/master.md`](../registers/llm-models/master.md) → "Active set". Routing
version 2 is live in staging and production since 2026-07-11.*

**Excluded providers.** Google Gemini / Vertex are excluded from the routing set (`FALLBACK_FORBIDDEN`),
so no MentoMate traffic reaches them. *Source: [`../registers/llm-models/master.md`](../registers/llm-models/master.md).*

### 2.3 ZWIZZLY's role — provider and deployer

| Layer | Role we take | Basis |
|---|---|---|
| The **MentoMate AI system** — the tutoring application placed on the market under our own name and trade mark | **Provider** | ZWIZZLY AS develops the system, sets its intended purpose, and makes it available under its own name. |
| The **underlying general-purpose models** listed in §2.2 | **Deployer / downstream integrator only** | ZWIZZLY neither develops nor markets a general-purpose AI model. It integrates third-party models via API. The DPO's seventh reassessment trigger (§7) is framed on exactly this basis: reassessment is required if "ZWIZZLY develops or markets a general-purpose AI model itself, rather than merely integrating a third-party model." |

*[OPEN — needs input: DPO confirmation that this two-layer provider/deployer characterisation is the one
he expects in the record. He required the role to be stated (addition 2) but did not himself state the
conclusion; the wording above is management's position, not his.]*

---

## 3. Exact intended purpose

MentoMate is a **voluntary, direct-to-consumer AI mentoring application purchased and used by families.**
It is not sold to, deployed by, or operated on behalf of any educational or vocational-training
institution.

The system's intended purpose is to:

- conduct conversational mentoring, homework help, and explain-back verification with a learner;
- evaluate a learner's responses in order to decide what explanation or practice to offer next;
- identify strengths, areas needing further practice, and topics for revision;
- maintain internal learning-progress and mastery indicators used to schedule spaced review;
- generate learning notes and parent-visible summaries of the learner's own activity;
- personalise future mentoring and revision timing.

These outputs exist to help the learner and their family direct their own informal learning. **They are
not grades, credentials, certifications, or institutional educational decisions, and no institution
receives or relies on them.**

*Source: [`DPO exchanges/2026-07-24-eu-ai-act-classification-review-request.docx`](DPO%20exchanges/2026-07-24-eu-ai-act-classification-review-request.docx)
§2, verified against [`2026-07-06-eu-ai-act-technical-file-qms-skeleton.md`](2026-07-06-eu-ai-act-technical-file-qms-skeleton.md)
§System Identification.*

### 3.1 Server-owned mastery policy (relevant to the "does it decide anything?" question)

Mastery is not a free-form LLM judgement. The model proposes structured per-concept evaluations; a
server-side rule (`decideMasteryAndReview()`) marks a topic mastery-verified only when **every** concept
evaluates as solid, and any partial, missing, or misconception result routes the concept back to further
practice. The decision is conservative, server-owned, and affects only what the learner is shown next.
*Source: [`../../AGENTS.md`](../../AGENTS.md) → "Non-Negotiable Engineering Rules", Challenge Round
mastery policy.*

---

## 4. Prohibited uses (standing product and marketing boundaries)

The following are **prohibited** for MentoMate unless and until a new classification assessment is
completed and approved under §9. They are not aspirations; they are the factual conditions the
non-high-risk classification rests on.

1. Sale, deployment, pilot, or integration with a school, district, tutoring centre, exam-prep provider,
   vocational-training provider, public authority, or any other educational institution.
2. Teacher, tutor, coach, school-administrator, or institutional dashboards over a learner roster.
3. Use of MentoMate outputs to grade, place, stream, certify, admit, retain, promote, discipline, or
   formally evaluate a learner.
4. Export of learning state, mastery, proof artifacts, or assessments into official school reports,
   transcripts, credentials, LMS gradebooks, SIS fields, or regulated education records.
5. Product gates that block institutional curriculum, formal assignments, examinations, certifications, or
   next-level education on the basis of AI-assessed mastery.
6. Examination proctoring, test-integrity monitoring, cheating or prohibited-behaviour detection, or
   classroom monitoring.
7. Biometric categorisation, emotion recognition, affect detection, or voice analysis beyond
   transcription.
8. Public copy that states or implies school readiness, classroom readiness, institutional readiness,
   high-risk compliance, regulator approval, formal-assessment suitability, or proctoring support.

*Source: [`2026-07-06-school-institutional-ai-act-tripwire.md`](2026-07-06-school-institutional-ai-act-tripwire.md)
§Triggers and §Copy Rule — that document is the operational enforcement packet for this list, and it
remains in force. The canonical statement of the prohibition lives in
[`../architecture.md`](../architecture.md) → Consumer Family Compliance Boundary.*

---

## 5. Geographic launch scope

The launch perimeter is an **allowlist**, enforced through store-distribution configuration and in-app
residence gating. A country enters it by exactly one of two routes:

| Set | Route | Status at the date of this record |
|---|---|---|
| EEA countries whose launch-day-verified GDPR Article 8 self-consent threshold is 13 | Route 1 — EEA | **In**, subject to the maintained country register, the common launch gates, and launch-day re-verification |
| United States | Route 2 — dated non-EEA admission screen | **Provisionally screened, not finally admitted.** Admission is conditional on closure of WI-1116, the launch-day rechecks, and signed management risk acceptance |
| United Kingdom | — | **Out at launch** (Article 27 representative requirement; ICO Children's Code; Online Safety Act) |
| Poland and other higher-threshold EEA states | — | **Out at launch** (Article 8 threshold above 13). Expansion wave 1, once the guardian-authorisation flow ships |
| Switzerland | — | **Out at launch** (representative requirement) |
| Everywhere else | — | Out until screened on demand |

*Source: [`2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md`](2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md),
as revised by the DPO's authoritative M3 wording of 2026-07-30.*

**Age floor:** 13+. **Users at the date of this record:** zero — the product is pre-launch and has never
been placed on the market. This fact is load-bearing for the Article 50(2) transitional analysis in §10.4.
*Source: [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md).*

---

## 6. Annex III, point 3 analysis and conclusion

### 6.1 Conclusion

**MentoMate, as described in §3 and constrained by §4 and §5, falls outside the high-risk education use
cases in Annex III, point 3.**

### 6.2 The DPO's reasoning (authoritative wording)

> "Based on the intended purpose and limitations described in the memo, I agree that the current
> voluntary, direct-to-family MentoMate MVP falls outside the high-risk education use cases in Annex III,
> point 3.
>
> The decisive factors are that the product is voluntarily used by families, is not used in or on behalf of
> an educational or vocational-training institution, and its outputs do not determine admission, grades,
> credentials, placement, access to education or another consequential institutional decision."

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx), section
"EU AI Act classification memo".*

### 6.3 The three decisive factors, restated as verifiable facts

| Decisive factor | Current factual position | Where it is enforced |
|---|---|---|
| Voluntarily used by families | Consumer purchase by a family account; no institutional procurement channel exists | §3; product has no institutional SKU |
| Not used in or on behalf of an educational or vocational-training institution | No school/district/LMS/SIS deployment, integration, or pilot | §4 items 1–4; [`2026-07-06-school-institutional-ai-act-tripwire.md`](2026-07-06-school-institutional-ai-act-tripwire.md) |
| Outputs do not determine admission, grades, credentials, placement, access to education, or another consequential institutional decision | Outputs are learner- and parent-facing only; mastery affects what the learner is offered next, nothing external | §3, §3.1; §4 items 3–5 |

If any of these three ceases to be true, the classification does not survive. That is what §7 exists to
catch.

### 6.4 No specialist referral required

> "I do not consider an additional specialist AI Act opinion necessary for the present, narrowly defined
> family-only MVP, provided the factual description is verified, the above additions are made and the
> prohibited institutional uses are technically, contractually and operationally maintained. A specialist
> review should be obtained before institutional deployment, formal assessment, biometric or
> emotion-related functionality, or another material expansion into an Annex III use case."

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx).*

The no-referral position is therefore **conditional on three things management owns**: verifying the
factual description (§2–§5), making the seven additions (§1.1), and maintaining the prohibited uses
technically, contractually, and operationally (§4).

---

## 7. Mandatory reassessment triggers

The DPO was explicit about the status of these items: they are **mandatory reassessment triggers, not
automatic reclassification events**.

> "The proposed boundaries are generally appropriate, but they should be described as mandatory
> reassessment triggers rather than changes that automatically produce a high-risk classification. I would
> require a new assessment before: […]"

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx).*

Read as standing product and marketing constraints: **none of the following may ship, be sold, be
marketed, or be contracted before a new assessment is completed and approved under §9.**

| # | Trigger (DPO's authoritative wording) | Practical constraint on the business |
|---|---|---|
| **T1** | "any school, university, vocational-training provider, tutoring institution or public authority requires, deploys or recommends the system as part of an institutional learning process" | No institutional sales, pilots, or partnerships — including arrangements where an institution merely *recommends* the product as part of a learning process. |
| **T2** | "outputs are transferred to or relied upon by teachers or institutions to determine grades, placement, promotion, certification, access or the direction of formal learning" | No teacher-facing output channel; no feature whose purpose is to feed institutional decisions. **See §7.1 — wording refinement pending.** |
| **T3** | "the system is integrated with an LMS, SIS, gradebook, examination system or official student record" | No integration work of this kind, including exploratory or partner-led integrations. |
| **T4** | "profiling or mastery indicators are used in an Annex III institutional context, since profiling can prevent reliance on the Article 6(3) exception" | Mastery indicators stay inside the consumer product. Note the DPO's reason: profiling can foreclose the Article 6(3) no-significant-risk exception, so an institutional context would not be rescued by that exception. |
| **T5** | "examination monitoring, cheating detection, biometric categorisation, emotion or affect inference is introduced" | Hard product ban — reinforced independently by the Article 5 check ([`2026-07-30-ai-act-art5-prohibited-practices-check.md`](2026-07-30-ai-act-art5-prohibited-practices-check.md)) and by the "voice is transcription only" invariant. |
| **T6** | "the intended purpose, customer group, provider/deployer role, underlying model or public marketing claims change materially" | Covers changes management might not think of as legal events: a new audience, a new model, a repositioning of the marketing claim. Material model changes are caught here as well as by the version-binding rule in §2.1. |
| **T7** | "ZWIZZLY develops or markets a general-purpose AI model itself, rather than merely integrating a third-party model" | Staying a downstream integrator is a compliance position, not just an engineering choice. |

### 7.1 T2 — teacher-reliance trigger: refinement pending DPO confirmation

MentoMate's core consumer use case is a learner voluntarily using the app to understand and complete
homework, which the learner then submits and a teacher grades in the ordinary way. On the DPO's own
decisive factors (§6.2) this learner-initiated, consumer-side use does not engage Annex III, point 3 —
the trigger is aimed at *institutional* reliance. Management asked the DPO to confirm a narrowing of the
wording so the trigger cannot be read against the core product:

> "outputs are transferred to or relied upon by teachers or institutions to determine grades, placement,
> promotion, certification, access or the direction of formal learning, **where such reliance is arranged,
> integrated, marketed or contracted by ZWIZZLY, or the system is otherwise used in or on behalf of an
> institution — excluding incidental, learner-initiated use of outputs in the learner's own schoolwork**."

*Source: [`DPO exchanges/2026-07-30-reply-consolidated-response-draft.md`](DPO%20exchanges/2026-07-30-reply-consolidated-response-draft.md)
§6, question Q4, sent 2026-07-30.*

**[OPEN — needs input: DPO answer to Q4.]** Until that answer arrives, **T2 stands in the DPO's original
wording** as recorded in the table above. The proposed narrowing is recorded here as a pending refinement,
not as an adopted position, and must not be relied on operationally.

---

## 8. Territorial analysis

| Question | Current position | Source |
|---|---|---|
| Has the AI Act been incorporated into the EEA Agreement? | **No.** "The AI Act has not yet been incorporated into the EEA Agreement." | DPO, 30.07.Answer.docx |
| Does it nevertheless apply to ZWIZZLY AS, a Norwegian company? | **Yes, where a Norwegian provider places an AI system on the EU market.** "Nevertheless, it applies where a Norwegian provider places an AI system on the EU market." | DPO, 30.07.Answer.docx |
| Is an EU authorised representative under Article 22 required? | **No, on the present non-high-risk classification.** "An EU authorised representative under Article 22 is not required for the present non-high-risk classification, but the issue must be reopened if the system becomes high-risk." | DPO, 30.07.Answer.docx |
| Which market are we placing the system on? | The EEA Route 1 allowlist set (§5), plus any admitted Route 2 country. The US is provisionally screened only. | [`2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md`](2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md) |

**Consequence for the reassessment triggers:** because Article 22 is answered *only* by the non-high-risk
classification, any trigger in §7 firing reopens the authorised-representative question at the same time.
The Article 22 analysis is not a separate, settled item.

*[OPEN — needs input: the pre-existing internal record notes that a Norwegian national AI Act
implementation was expected around summer 2026 but does not record an outcome. If Norwegian implementing
law is now in force, it should be added here at the next review.]*

---

## 9. Approval owner and review date

| Field | Value |
|---|---|
| **Approval owner** | Zuzana Kopecna, Chair, ZWIZZLY AS |
| **Reviewer (compliance advice)** | Stephan Hartmann, external DPO — providing AI Act input as separate compliance advice, outside the statutory DPO function (§11) |
| **Approved on** | *[OPEN — needs input: date of management approval; this document is Draft v0.1 and is not yet approved.]* |
| **Mandatory review — pre-launch** | Re-verify §2 (product and model version), §3 (intended purpose), §4 (prohibited uses in force), and §5 (perimeter) before the system is placed on the market. The classification depends on facts that must be true *at placing on the market*, not merely at drafting. |
| **Periodic review** | Proposed: every 12 months, next due **2027-07-30**. *[OPEN — needs input: management to confirm the cadence.]* |
| **Event-driven review** | Immediately on any §7 trigger, before the triggering change ships, is sold, or is marketed. |

**Change control.** This record is version-controlled in the repository. Any change to the classification,
the triggers, or the obligations mapping requires a new version, a dated entry in §13, and re-approval by
the owner above.

---

## 10. Obligations that apply despite the non-high-risk classification

The DPO identified four obligations that apply to the MVP notwithstanding the classification:

> "Despite the non-high-risk classification, the current MVP should address:
> Article 4 AI-literacy measures for staff and other persons operating the system;
> a documented Article 5 prohibited-practices check, particularly because the service is used by minors;
> Article 50(1) disclosure that users are interacting with an AI system; and
> Article 50(2) machine-readable marking and detectability of synthetic text, audio, image or video
> outputs, where applicable."

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx).*

| Obligation | Status | Record |
|---|---|---|
| Article 4 — AI literacy | Drafted | [`2026-07-30-ai-act-art4-ai-literacy-note.md`](2026-07-30-ai-act-art4-ai-literacy-note.md) |
| Article 5 — prohibited-practices check | Drafted | [`2026-07-30-ai-act-art5-prohibited-practices-check.md`](2026-07-30-ai-act-art5-prohibited-practices-check.md) |
| Article 50(1) — AI-interaction disclosure | **Shipped** | §10.3 below |
| Article 50(2) — marking/detectability of synthetic content | **OPEN — scope not yet fixed** | §10.4 below |

### 10.3 Article 50(1) — disclosure that the user is interacting with an AI system: SHIPPED

A persistent, non-dismissible disclosure is rendered in the chat header on every mentoring session
surface.

| Evidence | Detail |
|---|---|
| Implementation | `apps/mobile/src/components/session/ChatShell.tsx:906-924` — a header row rendering the disclosure text, with `testID="chat-ai-disclosure"` (line 911) |
| Accessibility | The same string is set as `accessibilityLabel` on an `accessible` container with `accessibilityRole="text"` (`ChatShell.tsx:907-909`), so the disclosure reaches screen-reader users as well as sighted users |
| Copy (English source) | `session.chatShell.aiDisclosure` = **"You're talking to an AI mentor"** — `apps/mobile/src/i18n/locales/en.json:893` |
| Localisation | Present in all seven shipped UI locales: `de.json:859`, `es.json:859`, `ja.json:859`, `nb.json:859`, `pl.json:892`, `pt.json:886`, plus `en.json:893` |
| Second disclosure point — consent | `tabs.adultSelfConsent.llmDisclosureBody` = "Your messages to your AI mentor are sent to an AI model provider so it can reply and teach. We never sell your data." — `apps/mobile/src/i18n/locales/en.json:3066`, rendered in the adult self-consent gate at `apps/mobile/src/app/(app)/_components/AdultSelfConsentGate.tsx:117` |
| Third disclosure point — privacy policy | "MentoMate is an AI-powered tutoring platform operated by ZWIZZLY AS…" — `apps/mobile/src/i18n/locales/en.json:2026` |

**Assessment.** The learner is informed at consent, informed in the privacy policy, and continuously
informed during use by a label that stays on screen for the whole session. Management's position is that
Article 50(1) is satisfied for the conversational surface.

*[OPEN — needs input: DPO confirmation that the shipped implementation is sufficient. He required the
obligation to be addressed; he has not yet inspected the implementation.]*

### 10.4 Article 50(2) — machine-readable marking and detectability of synthetic content: OPEN

**Timing.** The DPO's authoritative statement:

> "The Article 50 requirements apply from 2 August 2026, subject to the specific transitional period until
> 2 December 2026 for certain systems generating synthetic content that were already placed on the market
> before 2 August 2026."

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx).*

**Application to MentoMate.** The transitional relief is available only to systems *already placed on the
market before 2 August 2026*. MentoMate is pre-launch with zero users (§5) and will therefore be placed on
the market **after** that date. **The transitional period does not apply to us. Article 50 binds MentoMate
in full from the moment of launch.** There is no window in which we can ship first and mark later.

**Scope — the open question.** Management proposed to the DPO that, on a conversational surface where the
user is continuously and unambiguously informed they are talking to an AI (§10.3), the Article 50(1)
disclosure carries the transparency function, and Article 50(2) marking is relevant — if at all — to
content that can *leave* that context, rather than to the ephemeral chat stream itself:

> "(Q5) Article 50(2) applicability. […] Do you concur that we should scope 50(2) implementation to
> exportable/shareable synthetic content only? The answer determines whether this is a bounded item on the
> export surfaces or a broader engineering programme, so we would like to fix the scope before building."

*Source: [`DPO exchanges/2026-07-30-reply-consolidated-response-draft.md`](DPO%20exchanges/2026-07-30-reply-consolidated-response-draft.md)
§6, question Q5, sent 2026-07-30.*

**[OPEN — needs input: DPO answer to Q5. Until it arrives, the Article 50(2) implementation scope is
undetermined and no engineering commitment should be made either way.]**

**Candidate surfaces already identified in code** (recorded so the scoping decision has a concrete target,
not as an admission that each requires marking):

| Surface | Location | Nature |
|---|---|---|
| Mentor-memory share | `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:281` (`Share.share`) | Shares AI-generated content about the learner outside the app |
| Privacy data export share | `apps/mobile/src/app/(app)/more/privacy.tsx:77` (`Share.share`) | GDPR-export payload; contains AI-generated content |
| Invite message | `apps/mobile/src/components/home/ConnectSection.tsx:103` (`Share.share`) | Static translated copy — **not** AI-generated; listed for completeness and excluded |

**Risk note for management.** Because the transitional relief does not apply, Article 50(2) — whatever its
final scope — is a **launch-blocking** item once scoped, not a post-launch follow-up. The Q5 answer should
be chased rather than waited on passively.

---

## 11. Relationship to the DPIA and to the DPO's statutory function

### 11.1 This record stays separate from the DPIA

> "Finally, the AI Act classification memo should remain a separate compliance record. The DPIA should
> briefly summarise and cross-reference it where AI functionality affects personal-data risks, safeguards
> or transparency, but the two documents should not be merged because they answer different legal
> questions."

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx).*

The two records answer different questions and must not be merged:

| Record | Question it answers |
|---|---|
| This record | Is MentoMate a high-risk AI system, and what does the AI Act require of it? |
| [`dpia.md`](dpia.md) / [`edpb_dpia_filled_2026_v1.md`](edpb_dpia_filled_2026_v1.md) | What is the risk to individuals from processing their personal data, and what safeguards address it? |

**Existing cross-reference in the DPIA.** [`dpia.md`](dpia.md) §8 "AI Act intersection (record, don't
re-assess here)" already records the Article 50 transparency item and the Article 5(1)(f) no-emotion-
inference position, and states that the full AI Act analysis lives elsewhere rather than duplicating it.
That section should be updated to point at this record. *[OPEN — needs input: the DPIA cross-reference has
not been updated as part of this draft, because the DPIA is under separate DPO review. Management to
decide when to make that edit.]*

### 11.2 AI Act work sits outside the statutory DPO function

> "EU AI Act work is not part of the statutory DPO function and, where requested and accepted, is provided
> as separate compliance advice."

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx), scope wording
accepted verbatim by management.*

The DPO's AI Act input recorded here is therefore compliance advice, not a statutory DPO opinion, and does
not carry the independence protections of Articles 38–39 GDPR. *[OPEN — needs input: the commercial basis
for AI Act advice (within the existing retainer, or separately engaged) was asked as Q3 on 2026-07-30 and
is unanswered.]*

---

## 12. Legislative status

The 2026-07-24 memo's legislative-status section was incorrect and is corrected here on the DPO's
authority:

> "The memo's legislative-status section should also be updated. Regulation (EU) 2026/1744 was published
> in the Official Journal on 24 July 2026 and entered into force on 27 July 2026. The relevant Annex III
> high-risk requirements are now scheduled to apply from 2 December 2027. The AI Act has not yet been
> incorporated into the EEA Agreement."

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx).*

| Item | Date / status |
|---|---|
| Regulation (EU) 2026/1744 — Official Journal publication | **24 July 2026** |
| Regulation (EU) 2026/1744 — entry into force | **27 July 2026** |
| Annex III high-risk requirements — application | **2 December 2027** |
| Article 50 transparency requirements — application | **2 August 2026** (transitional period to 2 December 2026 for certain synthetic-content systems already on the market before that date — **not available to MentoMate**, see §10.4) |
| EEA incorporation of the AI Act | **Not yet incorporated** |
| Article 22 EU authorised representative | **Not required** on the present non-high-risk classification; reopens if the system becomes high-risk (§8) |

### 12.1 Note on the relationship between Regulation (EU) 2026/1744 and Regulation (EU) 2024/1689

Our own earlier records cite the base AI Act as **Regulation (EU) 2024/1689**
([`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md),
lines 290 and 403), and record that the Council gave final approval on 29 June 2026 to an **amending**
regulation moving the stand-alone Annex III high-risk rules, including education, to 2 December 2027 —
noting at the time that "the Official Journal citation, entry-into-force date, consolidated text, and EEA
status must therefore be checked rather than relying on either the original Article 113 date or a press
release alone."

The dates the DPO supplies (OJ publication 24 July 2026, entry into force 27 July 2026, Annex III
application 2 December 2027) are exactly the missing details of that amending regulation. **Management's
reading is therefore that Regulation (EU) 2026/1744 is the amending regulation and Regulation (EU)
2024/1689 remains the base act**, and that the two citations are complementary rather than contradictory.

**[OPEN — needs input: DPO confirmation of this reading, and of which instrument should be cited as the
governing text in external-facing material. Nothing in this record depends on the answer — the operative
dates are identical either way — but the citation should be right before it is used externally. Related:
article-letter references in the Article 5 check should be verified against the consolidated text.]**

---

## 13. Change log

| Version | Date | Change | Author |
|---|---|---|---|
| v0.1 | 2026-07-30 | Initial classification record. Supersedes the 2026-07-24 working memo. Incorporates the DPO's consolidated response of 2026-07-30: the not-high-risk conclusion and its reasoning, the seven required additions, the seven mandatory reassessment triggers, the corrected legislative status, and the separate-record instruction. | agent-drafted for management review |

---

## 14. Related records

| Record | Relationship |
|---|---|
| [`2026-07-30-ai-act-art4-ai-literacy-note.md`](2026-07-30-ai-act-art4-ai-literacy-note.md) | Article 4 obligation (§10) |
| [`2026-07-30-ai-act-art5-prohibited-practices-check.md`](2026-07-30-ai-act-art5-prohibited-practices-check.md) | Article 5 obligation (§10) |
| [`2026-07-06-school-institutional-ai-act-tripwire.md`](2026-07-06-school-institutional-ai-act-tripwire.md) | Operational enforcement of the prohibited uses (§4) and of triggers T1–T5 |
| [`2026-07-06-eu-ai-act-technical-file-qms-skeleton.md`](2026-07-06-eu-ai-act-technical-file-qms-skeleton.md) | Technical-file / QMS readiness index. Its "classification open with counsel/DPO" status is **now closed by this record** for the family-only MVP; its high-risk-readiness sections remain forward-looking only |
| [`2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md`](2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md) | Geographic launch scope (§5) |
| [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md) | EEA perimeter, age floor, prior legislative-status record (§12.1) |
| [`../registers/llm-models/master.md`](../registers/llm-models/master.md) | Model set and provider exclusions (§2.2) |
| [`dpia.md`](dpia.md), [`edpb_dpia_filled_2026_v1.md`](edpb_dpia_filled_2026_v1.md) | Separate records — cross-referenced, never merged (§11.1) |
| [`identity-compliance-register.md`](identity-compliance-register.md) | Control C-2: no emotion or intention inference from biometrics; voice is transcription only |
