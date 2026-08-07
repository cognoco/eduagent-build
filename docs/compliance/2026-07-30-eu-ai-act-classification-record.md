# MentoMate — EU AI Act Classification Record

**Date:** 2026-07-30 (record date) — **last updated 2026-08-05**
**Status:** **v0.2 — verification-complete and approval-ready.** This supersedes the former "Draft v0.1"
status: the DPO's seven additions have been verified against the source memo (§1.1) and the reassessment
triggers carry his final wording (§7). **It is not approved.** Management approval is the one field still
open and is routed to the operator (§9). Verification-complete means the factual and sourcing checks in
this record are done — it does **not** mean the record has been legally reviewed, approved, or found
compliant (§11).
**Author:** agent-drafted for management review
**Company:** ZWIZZLY AS, organisation number 811 696 072, Fiskekroken 3B, 0139 Oslo, Norway
**Approval owner:** Zuzana Kopečná, Founder, ZWIZZLY AS (see §9)
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

The DPO stated that the 2026-07-24 memo is "a good basis for the family-only MVP". His own verb for the
seven items was **recommend** — "I recommend adding the following before treating it as the final
classification record" — but he then made his no-referral position (§6.4) expressly conditional on their
completion ("provided the factual description is verified, **the above additions are made** and the
prohibited institutional uses are technically, contractually and operationally maintained"). They are
therefore treated here as **required**: not because he used that word, but because the advice this record
relies on is conditioned on them. Each is mapped below so the reviewer can check coverage directly.

| # | DPO's required addition (his wording, 30.07.Answer.docx) | Where it lives in this record |
|---|---|---|
| 1 | "the relevant product and model version" | §2.1, §2.2 |
| 2 | "the underlying model providers and ZWIZZLY's provider/deployer role" | §2.2, §2.3 |
| 3 | "the exact intended purpose, prohibited uses and geographic launch scope" | §3, §4, §5 |
| 4 | "an approval owner and review date" | §9 |
| 5 | "the reassessment triggers above" | §7 |
| 6 | "the current territorial analysis" | §8 |
| 7 | "the additional obligations described below" | §10 — the obligations he then enumerated are Articles 4, 5, 50(1) and 50(2); that enumeration is this record's editorial expansion of "described below", not additional wording of his |

**Verification note (2026-08-05).** The seven rows above were checked against the source memo rather than
asserted. Method: the DPO's consolidated response
([`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx)) was text-extracted
from the DOCX and the seven quoted cells compared against his enumerated list in the section "EU AI Act
classification memo". Result: the seven items map **one-to-one and in his original order**, and the quoted
wording matches the source. Two corrections were made in the course of the check — the row-7 parenthetical
"(Arts 4, 5, 50(1), 50(2))" was presented inside a column labelled "his wording" although it is ours, and
the lead-in sentence attributed the verb "required" to him; both are corrected above. No other divergence
was found **within the scope of that comparison** — the seven quoted cells against his enumerated list.
This is deliberately not a claim that the table and the memo agree everywhere: nothing outside those seven
cells was compared, so a broader statement would assert more than the method performed.

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

> **Status of this characterisation — management's position, routed for DPO confirmation.** The DPO
> required the role to be *stated* (addition 2) but did not himself state the conclusion; the two-layer
> characterisation above is management's position, not his. **Routed:** it is in scope of the
> separately-commissioned DPO review pass of the completed classification record (§11.2). It is not a
> blank awaiting an unassigned actor, and nothing else in this record depends on his confirming it — the
> Annex III conclusion in §6 turns on intended purpose and institutional context, not on the
> provider/deployer split.

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
| **T2** | *(final wording, DPO 2026-07-31 — supersedes his 2026-07-30 formulation.* ***PARTIAL QUOTATION: this cell carries the first of two paragraphs. The full operative text — including the incidental-learner-use carve-out and the explicit reassessment condition — is quoted in §7.1 and governs.****)* "Outputs are transferred to or relied upon by teachers or educational institutions to evaluate learning outcomes or determine grades, placement, promotion, certification, access to education or the direction of formal learning, where such reliance forms part of the system's intended purpose, is arranged, integrated, marketed or contracted by ZWIZZLY, or the system is otherwise used by or on behalf of an educational or vocational-training institution." | No teacher-facing output channel; no feature whose purpose is to feed institutional decisions. Incidental, learner-initiated use of outputs in the learner's own schoolwork does **not** by itself trigger reclassification — but systematic institutional use, or a material change of intended purpose, functionality, marketing or contracts, does (§7.1). |
| **T3** | "the system is integrated with an LMS, SIS, gradebook, examination system or official student record" | No integration work of this kind, including exploratory or partner-led integrations. |
| **T4** | "profiling or mastery indicators are used in an Annex III institutional context, since profiling can prevent reliance on the Article 6(3) exception" | Mastery indicators stay inside the consumer product. Note the DPO's reason: profiling can foreclose the Article 6(3) no-significant-risk exception, so an institutional context would not be rescued by that exception. |
| **T5** | "examination monitoring, cheating detection, biometric categorisation, emotion or affect inference is introduced" | Hard product ban — reinforced independently by the Article 5 check ([`2026-07-30-ai-act-art5-prohibited-practices-check.md`](2026-07-30-ai-act-art5-prohibited-practices-check.md)) and by the "voice is transcription only" invariant. |
| **T6** | "the intended purpose, customer group, provider/deployer role, underlying model or public marketing claims change materially" | Covers changes management might not think of as legal events: a new audience, a new model, a repositioning of the marketing claim. Material model changes are caught here as well as by the version-binding rule in §2.1. |
| **T7** | "ZWIZZLY develops or markets a general-purpose AI model itself, rather than merely integrating a third-party model" | Staying a downstream integrator is a compliance position, not just an engineering choice. |

### 7.1 T2 — teacher-reliance trigger: narrowing RESOLVED 2026-07-31, final wording adopted

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

**RESOLVED 2026-07-31 — the DPO agreed with the substance and supplied final trigger wording, adopted
verbatim as T2:**

> "Outputs are transferred to or relied upon by teachers or educational institutions to evaluate learning
> outcomes or determine grades, placement, promotion, certification, access to education or the direction
> of formal learning, where such reliance forms part of the system's intended purpose, is arranged,
> integrated, marketed or contracted by ZWIZZLY, or the system is otherwise used by or on behalf of an
> educational or vocational-training institution.
>
> Mere incidental, learner-initiated use of AI-assisted outputs in the learner's ordinary schoolwork does
> not by itself trigger reclassification. A reassessment is nevertheless required if the intended purpose,
> product functionality, marketing, contractual arrangements or actual systematic institutional use
> materially changes."

*Source: DPO reply to Q4, received 2026-07-31. This wording supersedes both the DPO's original T2
formulation of 2026-07-30 and management's proposed narrowing — the consumer-side homework use case is
preserved, and systematic institutional adoption or a change of intended purpose triggers reassessment.
It is carried into the T2 row of the §7 table as the operative trigger wording.*

> **Provenance limitation — read before relying on this quotation.** Unlike every other DPO quotation in
> this record, this one **cannot be diffed against a source document held in the repository.** No verbatim
> copy of the DPO's 2026-07-31 reply is retained here; the 2026-07-30 consolidated response
> (`30.07.Answer.docx`) is the last DPO document held in full. What does exist is **two operator-authored
> records of a single assertion — not two independent confirmations of it.** Both were written by the
> operator rather than by an agent, and the same commit introduced both, so the second corroborates the
> first only in the sense that it was written at the same time by the same hand:
>
> - the correspondence log entry for 2026-07-31 in
>   [`DPO exchanges/2026-07-26-action-register-tracker.md`](DPO%20exchanges/2026-07-26-action-register-tracker.md),
>   recording "(Q4) teacher-reliance trigger — agreed in substance, supplied **final T2 wording, adopted
>   verbatim** into the classification record §7"; and
> - commit `f42b2e719` ("docs(compliance): record DPO answers to Q1-Q6 (2026-07-31)"), which introduced
>   this quotation and that log entry together.
>
> The wording is therefore recorded on the operator's attestation that it is verbatim, **not** on a
> verification against the DPO's own text. Retaining the 2026-07-31 reply as a source document — as was
> done for 2026-07-30 — would close this gap and is worth doing before the record is relied on externally.
>
> **RESOLVED 2026-08-07.** The DPO's 2026-07-31 reply is now retained in the repository:
> [`DPO exchanges/received/2026-07-31-answers-q1-q6.md`](DPO%20exchanges/received/2026-07-31-answers-q1-q6.md)
> (full text, transcribed verbatim from the original email supplied by the operator on 2026-08-07; the
> original remains in the operator's mailbox). The T2 quotation above has been compared against the Q4
> section of that filing — **verbatim match, both paragraphs**. The residual caveat is only that the
> filing is an operator-supplied transcription rather than the original DOCX/EML file; the DPO can
> trivially confirm it against his own sent mail in the commissioned review pass.

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

### 8.1 Norwegian implementing law — checked 2026-08-05, PENDING

**Status: pending, with no outcome recorded.** This item was checked on 2026-08-05 against the internal
records and the position is unchanged: **no Norwegian national AI Act implementing law is recorded as in
force, and the AI Act is not yet incorporated into the EEA Agreement.**

What the internal records actually say:

| Source | What it records |
|---|---|
| DPO, `30.07.Answer.docx` (2026-07-30) | "The AI Act has not yet been incorporated into the EEA Agreement." |
| [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md) lines 283–286, 317–319 | The AI Act is "under scrutiny for EEA incorporation" and "not yet incorporated into the EEA Agreement"; a Norwegian provider "may therefore be a third-country provider under the EU act"; and "Norwegian implementation and EEA-incorporation status must be rechecked at that pilot's launch date." |

**Correction to the previous wording of this item.** Until this version, this section stated that "the
pre-existing internal record notes that a Norwegian national AI Act implementation was expected around
summer 2026". **That statement is unsupported.** A search of the compliance and plans documentation on
2026-08-05 found the phrase nowhere outside this record itself; no internal source records such an
expectation or its date. The unsupported expectation has been removed rather than carried forward, and is
replaced by the sourced position in the table above.

**Routed:** to the **mandatory pre-launch review in §9**, which already requires re-verification of the
territorial position before the system is placed on the market. This is the correct owner — the question
only becomes operative at placing on the market, and the launch-country ruling independently requires the
same recheck at that moment.

**Deliberately not resolved by external research.** No outside legal-database or web check was performed
to close this item. A legislative status sourced that way, attributed to neither counsel nor the DPO,
would be an unattributed legal fact in a compliance record — worse than an openly dated pending item. If
this needs a firm answer before launch, it goes to the DPO or to qualified counsel, not to a search.

---

## 9. Approval owner and review date

| Field | Value |
|---|---|
| **Approval owner** | Zuzana Kopečná, Founder, ZWIZZLY AS |
| **Reviewer (compliance advice)** | Stephan Hartmann, external DPO — providing AI Act input as separate compliance advice, outside the statutory DPO function (§11) |
| **Approved on** | **OPEN — BLOCKED ON THE OPERATOR. Not forgotten, not deferrable to an agent.** See §9.1 for the route. This record is v0.2, verification-complete and approval-ready; it is **not approved**, and nothing in it may be read or cited as approved until this field carries a date. |
| **Mandatory review — pre-launch** | Re-verify §2 (product and model version), §3 (intended purpose), §4 (prohibited uses in force), §5 (perimeter), and **§8 (territorial position — including the EEA-incorporation and Norwegian-implementing-law status left open and dated at §8.1)** before the system is placed on the market. The classification depends on facts that must be true *at placing on the market*, not merely at drafting. §8 is listed explicitly because §8.1 routes its open item here: a route into a checklist that does not name the item is not a route. |
| **Periodic review** | Proposed: every 12 months, next due **2027-07-30**. Cadence is unconfirmed and is **routed to the same operator approval decision** (§9.1) — the owner who approves the record fixes the cadence in the same act. |
| **Event-driven review** | Immediately on any §7 trigger, before the triggering change ships, is sold, or is marketed. |

**Change control.** This record is version-controlled in the repository. Any change to the classification,
the triggers, or the obligations mapping requires a new version, a dated entry in §13, and re-approval by
the owner above.

### 9.1 Approval routing — where the open approval field goes

The approval in the table above is **operator-owned by design**. It is a management act by the approval
owner; no agent, and no automated lifecycle step, may supply it, infer it, or treat the record as approved
without it. It was deliberately left open when this record was finalized to v0.2.

| Field | Value |
|---|---|
| Decision required | Management approval of this classification record, and confirmation of the periodic-review cadence |
| Decision owner | Zuzana Kopečná, Founder, ZWIZZLY AS (the approval owner named above) |
| Route | **Cosmo Operator Queue** — the estate's queue for human approvals and operator-only actions (database `3948bce91f7c810096d9d78f2351a442`, as configured at [`../../zdx-config.yaml`](../../zdx-config.yaml) → `zdx.operator-queue.database_id`) |
| Queue item | **To be filed.** No Operator Queue item number is cited here because none had been raised for this approval at the time of writing; citing one would be an invented reference. The escalation was raised on 2026-08-05 when the record reached approval-ready. |
| What the approver receives | This record at v0.2, verification-complete: the seven additions verified against the source memo (§1.1), the seven triggers carrying the DPO's final wording (§7), legislative status corrected (§12) |
| What the approver should know before approving | Two items are disclosed rather than closed: the T2 wording has no verbatim in-repo source (§7.1 provenance limitation), and Norwegian implementing law is dated-pending (§8.1). Separately, the DPO's own review of the completed record is a **separately commissioned** engagement that has not yet run (§11.2) — approval by management is not, and does not substitute for, that review. |

**Why this reads as blocked rather than incomplete.** A blank approval date in a compliance record is
ambiguous between "nobody has got to it" and "the responsible human has not yet ruled". This is the
second. The record is complete and waiting on a named person through a named queue.

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
| Article 50(2) — marking/detectability of synthetic content | **Scope ruled 2026-07-31** (broader than management proposed — see §10.4); implementation assessment drafted, implementation outstanding and launch-blocking | §10.4 below; [`2026-07-31-ai-act-art50-2-implementation-assessment.md`](2026-07-31-ai-act-art50-2-implementation-assessment.md) (WI-2915) |

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

> **Routed, not open-ended.** The DPO required the obligation to be *addressed*; he has not inspected the
> shipped implementation, and management's sufficiency position above is therefore unconfirmed by him.
> **Route:** the separately-commissioned DPO review pass, whose scope expressly includes Article 50
> implementation (§11.2). Note the limit of what is claimed here: the evidence table above establishes
> what ships and where, not that it satisfies Article 50(1) as a matter of law.

### 10.4 Article 50(2) — machine-readable marking and detectability of synthetic content: scope ruled 2026-07-31, assessment pending

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

**ANSWERED 2026-07-31 — the DPO did NOT confirm the exportable-only limitation.** His ruling (reply to
Q5, correspondence log in the action-register tracker):

- Article 50(1) and 50(2) are **separate obligations** — a visible AI-interaction disclosure does not by
  itself remove the machine-readable marking and detectability requirement for synthetic text.
- The implementation assessment must cover **both** exportable/shareable content (including recap
  documents) **and** synthetic text displayed in the interactive chat. Identical technical measures need
  not apply to both surfaces, but the chat stream **stays inside the assessment** rather than being
  excluded in advance.
- **Exportable content is an immediate and clearly applicable implementation item.**
- Before a final technical position, the Company must document: (i) all synthetic-output surfaces;
  (ii) whether ZWIZZLY qualifies as the relevant provider for each surface; (iii) what marking or
  provenance functionality the underlying model providers supply; (iv) the technical feasibility and
  current state of the art for chat-based text; (v) the proposed machine-readable mechanism for each
  applicable surface; and (vi) any specific exclusion or proportionality argument relied upon.
- The final position is then documented by reference to the Commission's Article 50 Guidelines, the
  applicable Code of Practice, and the system architecture.

**Consequence:** WI-2915 (Art 50(2) scoping) was unblocked with this broader scope, and **has since been
produced**: the six-point implementation assessment is drafted at
[`2026-07-31-ai-act-art50-2-implementation-assessment.md`](2026-07-31-ai-act-art50-2-implementation-assessment.md)
(2026-07-31), with exportable-surface marking (mentor-memory share, privacy export) as the first build
item. The surface table below is the starting inventory for point (i) that the assessment builds on.
**Scoping is therefore closed; implementation is not.**

**Candidate surfaces already identified in code** (recorded so the scoping decision has a concrete target,
not as an admission that each requires marking):

| Surface | Location | Nature |
|---|---|---|
| Mentor-memory share | `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:281` (`Share.share`) | Shares AI-generated content about the learner outside the app |
| Privacy data export share | `apps/mobile/src/app/(app)/more/privacy.tsx:77` (`Share.share`) | GDPR-export payload; contains AI-generated content |
| Invite message | `apps/mobile/src/components/home/ConnectSection.tsx:103` (`Share.share`) | Static translated copy — **not** AI-generated; listed for completeness and excluded |

**Risk note for management.** Because the transitional relief does not apply, Article 50(2) is a
**launch-blocking** item, not a post-launch follow-up. The scope question (Q5) is answered and the
assessment is drafted; what remains is **implementation**, which must land before the system is placed on
the market. Article 50 has applied since 2 August 2026, so the obligation is live law rather than a future
deadline — the only thing standing between MentoMate and it is that the product has not yet launched.

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
That section should be updated to point at this record.

> **Routed to the DPIA, deliberately not performed here.** The cross-reference edit belongs in
> [`dpia.md`](dpia.md), and this record does not make it — the DPIA is under separate DPO review, and
> editing it from an AI Act work item is exactly the merging of two records the DPO's instruction above
> forbids. **Route:** the DPIA's own review cycle; the owner of that cycle makes the edit when the DPIA
> next moves. The direction of the reference matters and is one-way — the DPIA points at this record; this
> record does not restate DPIA content.

### 11.2 AI Act work sits outside the statutory DPO function

> "EU AI Act work is not part of the statutory DPO function and, where requested and accepted, is provided
> as separate compliance advice."

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx), scope wording
accepted verbatim by management.*

The DPO's AI Act input recorded here is therefore compliance advice, not a statutory DPO opinion, and does
not carry the independence protections of Articles 38–39 GDPR.

**RESOLVED 2026-07-31 — commercial basis of the AI Act advice.** The question asked as Q3 on 2026-07-30 was
answered on 2026-07-31. As recorded in the correspondence log at
[`DPO exchanges/2026-07-26-action-register-tracker.md`](DPO%20exchanges/2026-07-26-action-register-tracker.md):

| Item | Position |
|---|---|
| The classification input in his 2026-07-30 response (quoted throughout this record) | **Initial advice within the existing appointment** — no separate commission |
| Review of the **completed** classification record, Article 50 implementation, and future reassessments | **Separately commissioned** — not covered by the retainer |
| Basis for those separate assignments | EUR 75/h after prior scope-and-effort confirmation, or a fixed fee for defined deliverables |

**Consequence for this record — the distinction that matters.** The DPO's advice quoted here was given on
the 2026-07-24 memo. **He has not reviewed this record in its completed form**, and that review is a
commissioned engagement that has not yet run: a commissioning ask covering this record, the Article 4 note
and the Article 5 check was sent to him on 2026-07-31 and awaits his scope confirmation. Every item routed
elsewhere in this document "to the DPO review pass" (§2.3, §10.3, §12.1) is routed to **that** engagement.
Until it runs, this record carries his advice on the earlier memo, not his sign-off on this document.

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
| Article 50 transparency requirements — application | **2 August 2026.** **No transition period is available to MentoMate — Article 50 binds it in full from launch.** The Regulation's transitional period to 2 December 2026 reaches only certain synthetic-content systems *already placed on the market before 2 August 2026*; MentoMate is pre-launch with zero users (§5) and will be placed on the market after that date, so the relief does not reach it (§10.4). |
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

> **Routed, and non-load-bearing.** Two things remain unconfirmed: whether the DPO endorses this
> base-act/amending-act reading, and which instrument should be cited as the governing text in
> external-facing material. **Route:** the separately-commissioned DPO review pass (§11.2), together with
> the related check that article-letter references in the Article 5 check hold against the consolidated
> text. **Nothing in this record turns on the answer** — the operative dates are identical on either
> reading, which is why this is a citation-hygiene item rather than a gate. It must nonetheless be settled
> before either regulation number is cited in external-facing material.

---

## 13. Change log

| Version | Date | Change | Author |
|---|---|---|---|
| v0.1 | 2026-07-30 | Initial classification record. Supersedes the 2026-07-24 working memo. Incorporates the DPO's consolidated response of 2026-07-30: the not-high-risk conclusion and its reasoning, the seven required additions, the seven mandatory reassessment triggers, the corrected legislative status, and the separate-record instruction. | agent-drafted for management review |
| **v0.2** | **2026-08-05** | **Finalized out of draft to verification-complete and approval-ready.** (1) §1.1 coverage table **verified** against `30.07.Answer.docx` by text-extracting the DOCX and comparing all seven quoted cells to the DPO's enumerated list — one-to-one and in his order; two wording corrections applied (a management gloss sat inside a column labelled as his wording; the verb "required" was attributed to him where he wrote "recommend" and made his no-referral position conditional on completion). (2) §7 **T2 replaced with the DPO's final 2026-07-31 wording** — it previously sat in §7.1 as resolved while the operative table still carried the superseded formulation and a stale "pending" pointer; T1 and T3–T7 re-diffed against the memo and unchanged. A **provenance limitation** is now disclosed on §7.1: no verbatim copy of the 2026-07-31 reply is held in-repo, so that quotation rests on the operator's attestation (tracker log + commit `f42b2e719`) rather than on a source diff. (3) §12 Article 50 row re-stated so the unavailability of the transitional period to MentoMate is unmissable; publication (24.07.2026) and entry into force (27.07.2026) re-verified against the memo; §12.1 relationship note retained. (4) OPEN placeholders resolved or routed: §11.2 **resolved** from the 2026-07-31 Q3 answer; §2.3, §10.3 and §12.1 routed to the separately-commissioned DPO review pass; §11.1 routed to the DPIA's own cycle (deliberately not performed here); §8 rewritten as §8.1 — checked 2026-08-05, **dated pending**, and an **unsupported claim removed** (the "Norwegian implementation expected around summer 2026" statement had no internal source); §9 approval and review cadence routed to the Cosmo Operator Queue via new §9.1. (5) Separation from the DPIA preserved — cross-references only, no DPIA content imported and no DPIA file edited. **Per the change-control rule in §9, this trigger-wording change requires re-approval by the approval owner; that approval is the one field left open.** **(6) Four corrections applied during independent review of this version, before approval and therefore inside v0.2 rather than as a new version — all four narrowing a claim rather than changing a position: §9's mandatory pre-launch review now names §8 explicitly, because §8.1 routed its open territorial item to a checklist that did not contain it; §1.1's verification note now states that the no-divergence finding covers the seven compared cells and not the table as a whole; the §7 T2 cell is now labelled a partial quotation pointing at §7.1 for the full operative text, since it carries the first of two paragraphs under a column headed as authoritative wording; and §7.1's provenance limitation no longer calls the two operator records "independent attestations", because both were authored by the operator in the same commit and are two records of one assertion.** | agent-drafted for management review |
| v0.2.1 | 2026-08-07 | Cosmetic only: approval-owner name/title aligned to the operator ruling of 2026-08-01 (Zuzana Kopečná, Founder — was "Kopecna, Chair") in the header, §9, and §9.1. No change to the classification, triggers, or obligations mapping, so §9 change-control re-approval is not engaged by this edit. | agent-drafted for management review |
| v0.2.2 | 2026-08-07 | §7.1 provenance limitation RESOLVED: the DPO's 2026-07-31 reply filed verbatim at `DPO exchanges/received/2026-07-31-answers-q1-q6.md` (operator-supplied transcription); T2 quotation diffed against its Q4 section — verbatim match. His 2026-08-07 reply (memory-unlock set revision + EUR 450 review commissioning) filed at `…/received/2026-08-07-answers-two-questions.md` in the same change. No change to the classification, triggers, or obligations mapping. | agent-drafted for management review |

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
