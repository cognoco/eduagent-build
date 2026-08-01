# MentoMate — EU AI Act Article 4 AI-Literacy Note

**Date:** 2026-07-30
**Status:** Draft v0.1 — for DPO review
**Author:** agent-drafted for management review
**Company:** ZWIZZLY AS, organisation number 811 696 072, Oslo, Norway
**Owner:** Zuzana Kopecna, Chair, ZWIZZLY AS
**Parent record:** [`2026-07-30-eu-ai-act-classification-record.md`](2026-07-30-eu-ai-act-classification-record.md) §10

---

## 1. Why this note exists

The DPO required it as one of four obligations that apply to MentoMate despite the non-high-risk
classification:

> "Despite the non-high-risk classification, the current MVP should address: Article 4 AI-literacy
> measures for staff and other persons operating the system […]"

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx), section "EU
AI Act classification memo".*

Article 4 is not a training-certificate requirement. It obliges providers and deployers to take measures,
**to their best extent**, to ensure a sufficient level of AI literacy among staff and other persons
dealing with the operation and use of their AI systems — calibrated to those persons' technical knowledge,
experience, education and training, to the context of use, and to the persons on whom the system is used.

*[OPEN — needs input: the paraphrase above should be checked against the consolidated Article 4 text
before this note is used externally. See the citation question in the classification record §12.1.]*

**Two consequences follow for a company of our size, and they pull in opposite directions:**

1. **Proportionality works in our favour on formality.** Two people, pre-launch, no institutional
   customers, no dedicated compliance staff. A formal training programme, an LMS, or external
   certification would be disproportionate and is not what "to their best extent" asks of us.
2. **The context works against us on substance.** The persons on whom the system is used include
   **minors from age 13**. That is exactly the factor Article 4 tells us to weigh, and it means literacy
   here has to be real, not nominal. Proportionality reduces the *ceremony*; it does not reduce the
   *standard*.

This note is written to be honest about both.

---

## 2. Who operates and oversees the system

| Person / actor | Role in relation to the AI system | Literacy level required |
|---|---|---|
| **Zuzana Kopecna** — Chair, ZWIZZLY AS | Owns the intended purpose, the prohibited-use boundaries, marketing claims, launch-perimeter decisions, and the approval of the classification record. Sets what the system is for and what it must never do. **Non-technical.** | **Highest in the organisation.** Every decision that could move MentoMate into Annex III (a customer type, a partnership, a marketing claim, a new feature category) is hers. She does not need to understand model internals; she must reliably recognise a reassessment trigger when it appears in a commercial conversation. |
| **Second founder** — *[OPEN — needs input: name and role]* | *[OPEN — needs input: confirm whether this founder holds technical/engineering oversight, commercial responsibility, or both.]* | To be set once the role is confirmed. |
| **AI coding agents** (under human direction) | Perform the bulk of engineering execution — implementation, tests, refactors — against written repository rules, with human review and CI gates before anything ships. | Not persons; not subjects of Article 4. Their behaviour is governed by the written constraints in §4.3, and the accountable humans remain those above. |
| **External DPO** — Stephan Hartmann | Provides GDPR advice under Articles 38–39 and, separately, AI Act compliance advice outside the statutory function. | Independent professional; his competence is a given, not something ZWIZZLY provides. |
| **Third-party model providers** (Cerebras, Mistral, OpenAI, Anthropic) | Supply the underlying models via API. Their staff do not operate MentoMate. | Out of scope for our Article 4 duty. |
| **Learners, parents, guardians** | Users, not operators. | Out of scope for Article 4 — but they are the beneficiaries of the Article 50(1) disclosure, which is a *transparency* duty and is recorded separately in the classification record §10.3. |

**Honest characterisation of the operating model.** ZWIZZLY has no employees dealing with the operation of
the AI system beyond its two founders. Most engineering work is executed by AI agents working to written
specifications, with the founders directing, reviewing, and accepting the output. This is unusual enough
that it should be stated plainly to the DPO rather than concealed behind conventional language about
"staff training". It has one specific implication for Article 4: **the leverage point for literacy is not
a training course, it is the written rule set the agents and the reviewing humans both work from** — so
that is where we have put the effort (§4.3).

---

## 3. What "sufficient AI literacy" means for this company

Rather than a generic syllabus, the required knowledge is defined by what could actually go wrong here.
Each item below maps to a concrete failure this company could plausibly commit.

| # | What the operator must know | The failure it prevents |
|---|---|---|
| L1 | MentoMate is **classified not high-risk on a set of facts**, not by nature — voluntary family use, no institutional deployment, outputs that decide nothing outside the app | Assuming the classification is a permanent property of the product and acting accordingly |
| L2 | The **seven reassessment triggers**, well enough to recognise one in a live commercial conversation before agreeing to anything | Accepting a school pilot, an LMS integration, or a "recommended by our district" arrangement on a call, and only discovering the compliance consequence afterwards |
| L3 | The **Article 5 prohibited practices**, especially the emotion-inference line and the manipulation/vulnerability provisions that bite hardest where users are minors | Commissioning a "detect when the learner is frustrated" feature because it sounds pedagogically helpful |
| L4 | The **Article 50 transparency duties** and that the transitional relief does **not** apply to us | Treating AI-content marking as a post-launch item when it binds in full at launch |
| L5 | What the **marketing boundary** is — no school-readiness, classroom-readiness, formal-assessment, or "EU AI Act approved" claims | A store listing or landing page that creates an institutional intended purpose we have not assessed |
| L6 | That the models are **third-party, general-purpose, and fallible** — they produce confident errors, and that is a product-safety fact, not just an engineering one | Designing a surface that presents model output as authoritative, or removing the human/learner check |
| L7 | That the **model set is a compliance object** — a material model change is itself a reassessment trigger | Swapping a provider as a routine engineering decision |
| L8 | **Where the records live** and that they are version-controlled artefacts, not background documents | Making a decision that contradicts an approved record without noticing |

Depth is calibrated per person: the Chair needs L1–L5 and L8 at decision-making depth and L6–L7 at
awareness depth; anyone holding engineering oversight needs L3, L6, and L7 at implementation depth.

---

## 4. Measures in place and proposed

### 4.1 Measures already in place (evidence, not intention)

These exist today and are cited so the DPO can verify them rather than take them on trust.

| Measure | Where it lives | What it does for literacy |
|---|---|---|
| **Written institutional-deployment gate** | [`2026-07-06-school-institutional-ai-act-tripwire.md`](2026-07-06-school-institutional-ai-act-tripwire.md) | States the eight triggering moves and the allowed/blocked marketing vocabulary in plain language. This is the single most useful literacy artefact the company has: it turns "would this make us high-risk?" into a checklist a non-lawyer can apply. |
| **Prohibited-use boundary in the architecture canon** | [`../architecture.md`](../architecture.md) → Consumer Family Compliance Boundary | Puts the constraint where engineering decisions are actually made, not only in a compliance folder. |
| **Compliance control register** | [`identity-compliance-register.md`](identity-compliance-register.md) → C-2 | Records the "no emotion or intention inference from biometrics; voice is transcription only" invariant as a standing control. |
| **Automated copy guard** | `scripts/check-no-clinical-copy.ts` (CI-enforced, with baseline at `scripts/no-clinical-copy-baseline.json`) | Fails CI on banned tone words in learner-visible strings. Literacy that does not depend on anyone remembering. |
| **Model register with governance rule** | [`../registers/llm-models/master.md`](../registers/llm-models/master.md) | "No row may change without a new immutable record in `vetting/`" — makes a model change a documented act rather than a silent one, which is what L7 requires. |
| **Classification record** | [`2026-07-30-eu-ai-act-classification-record.md`](2026-07-30-eu-ai-act-classification-record.md) | The reference text for L1, L2, L4, and L8. |
| **Article 5 check** | [`2026-07-30-ai-act-art5-prohibited-practices-check.md`](2026-07-30-ai-act-art5-prohibited-practices-check.md) | The reference text for L3. |

### 4.2 Measures proposed (not yet done)

| # | Measure | Owner | Proposed timing |
|---|---|---|---|
| M1 | **Documented read-and-acknowledge.** Each founder reads the classification record, the Article 5 check, and the tripwire document, and records a dated acknowledgement in a single-table log in this repository. No LMS, no quiz — a dated line each, kept as the Article 4 evidence. | Chair | Before launch |
| M2 | **Trigger card.** A one-page plain-language card listing the seven reassessment triggers and the blocked marketing vocabulary, written for use during a sales or partnership conversation rather than at a desk. | Chair | Before first external commercial conversation about institutional use |
| M3 | **Refresh on trigger.** Whenever a reassessment trigger fires or the classification record is revised, both founders re-read the changed record and re-acknowledge. Ties literacy to the same events that drive reassessment, so it cannot silently go stale. | Chair | Standing |
| M4 | **Periodic refresh.** Re-read and re-acknowledge at each periodic review of the classification record (proposed annually). | Chair | Annual, with the classification review |
| M5 | **Onboarding gate.** Any new employee, contractor, or advisor who will deal with the operation of the AI system completes M1 before being given the access their role requires. Written now, while the answer is trivially small, so that it exists before the company grows past the point where it is obvious. | Chair | On first hire or engagement |
| M6 | **Founder-level model-limitations briefing.** A short written explanation, aimed at a non-technical reader, of what the underlying models can and cannot do — confident errors, no understanding of the individual learner beyond what is stored, no emotional perception. Covers L6 for a non-technical decision-maker without pretending to technical depth. | *[OPEN — needs input: assign owner]* | Before launch |

### 4.3 Literacy embedded in the engineering rule set

Because engineering execution is largely agent-driven, the constraints an operator would otherwise have to
remember are written into the artefacts that direct the work and enforced mechanically:

- Repository agent instructions (`AGENTS.md`, imported by `CLAUDE.md`) carry the compliance-relevant
  engineering rules, including the server-owned mastery policy and the requirement that state-machine
  decisions come from a structured, capped response envelope rather than free-text model output.
- CI checks fail the build on classes of violation — including the banned learner-facing tone vocabulary
  (`scripts/check-no-clinical-copy.ts`) and hardcoded untranslated user-visible copy — rather than relying
  on review attention.
- The model register requires a dated vetting record before any model row changes.

**What this does and does not achieve.** It makes the *rules* durable and machine-checkable, which is a
genuine strength for a company this size. It does **not** discharge Article 4: the obligation runs to
persons, and the accountable persons are the two founders. The measures in §4.1 and §4.2 are what
discharge it; §4.3 is the enforcement layer beneath them.

---

## 5. Honest limitations

Recorded deliberately, so the DPO reviews a true picture:

1. **No measure has yet been executed.** Everything in §4.2 is proposed. The Article 4 position at the date
   of this note rests on §4.1 — written constraints and automated guards, not on any recorded training.
2. **Key-person concentration.** One person, non-technical by her own description, holds the decisions most
   likely to move the classification. Mitigations are documentary (a trigger card, a written record, an
   external DPO to escalate to), not structural. A second competent reviewer would be the real mitigation
   and does not exist at present.
3. **No named engineering-oversight person is recorded here**, pending the [OPEN] item in §2.
4. **Nothing here is externally validated.** No training has been assessed by a third party, and this note
   is not a compliance claim.
5. **The AI-agent operating model is unusual** and its Article 4 treatment (agents as tools governed by
   written rules; humans as the accountable operators) is management's reasoned position, not a settled
   regulatory reading. *[OPEN — needs input: DPO view on whether this characterisation is sound.]*

---

## 6. Review

| Field | Value |
|---|---|
| Owner | Zuzana Kopecna, Chair |
| Next review | With the classification record — proposed annually, next due **2027-07-30**, and immediately on any reassessment trigger |
| Evidence location | This document plus the acknowledgement log created by M1 |

## 7. Change log

| Version | Date | Change | Author |
|---|---|---|---|
| v0.1 | 2026-07-30 | Initial Article 4 note, responding to the DPO's requirement of 2026-07-30. | agent-drafted for management review |
