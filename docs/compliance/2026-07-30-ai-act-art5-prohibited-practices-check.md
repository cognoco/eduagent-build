# MentoMate — EU AI Act Article 5 Prohibited-Practices Check

**Date:** 2026-07-30
**Status:** Draft v0.1 — for DPO review
**Author:** agent-drafted for management review
**Company:** ZWIZZLY AS, organisation number 811 696 072, Oslo, Norway
**Owner:** Zuzana Kopecna, Chair, ZWIZZLY AS
**Parent record:** [`2026-07-30-eu-ai-act-classification-record.md`](2026-07-30-eu-ai-act-classification-record.md) §10
**Scope of the check:** MentoMate application version **1.0.1**, family-only MVP, model set as recorded in the classification record §2.2

**Conclusion:** **No prohibited practice under Article 5(1) is engaged by MentoMate as currently intended and built.** Two provisions — the vulnerability-exploitation provision and the emotion-inference provision — are close enough to the product's territory that they generate standing constraints rather than a clean pass. Those constraints are set out in §4.

---

## 1. Why this check exists

The DPO required it, and gave the reason:

> "Despite the non-high-risk classification, the current MVP should address: […] a documented Article 5
> prohibited-practices check, **particularly because the service is used by minors** […]"

*— [`DPO exchanges/received/30.07.Answer.docx`](DPO%20exchanges/received/30.07.Answer.docx), section "EU
AI Act classification memo" (emphasis added).*

Article 5 is independent of the Annex III classification. A system can be outside the high-risk categories
and still be prohibited. The not-high-risk conclusion in the classification record therefore says nothing
about this question, and this check is not a formality.

**Two features of Article 5 make it the sharpest instrument facing this product:** its prohibitions apply
from the earliest application date rather than the deferred Annex III date, and its penalty tier is the
highest in the Act. Getting this wrong is not a remediation conversation.

### 1.1 Note on article lettering

The practice-by-practice walk below follows the Article 5(1) lettering of the base AI Act, Regulation
(EU) 2024/1689, which is the instrument our existing compliance records cite. The DPO has advised that
Regulation (EU) 2026/1744 was published on 24 July 2026 and entered into force on 27 July 2026 (see the
classification record §12 and the citation question at §12.1).

**[OPEN — needs input: the sub-paragraph letters used below should be verified against the consolidated
text before this document is relied on externally. The substance of each analysis is unaffected by
renumbering; only the labels are.]**

---

## 2. Facts the analysis depends on

Each of these is verifiable, and each is load-bearing for at least one conclusion below.

| # | Fact | Source |
|---|---|---|
| F1 | MentoMate processes **no biometric data**. Voice input is used for transcription only; the pipeline does not derive prosodic, spectral, or waveform features. | [`identity-compliance-register.md`](identity-compliance-register.md) C-2; [`dpia.md`](dpia.md) §8; [`history/2026-06-07-minors-compliance-requirements.md`](history/2026-06-07-minors-compliance-requirements.md) A14 |
| F2 | **No emotion or affect inference exists anywhere in the product**, from voice, face, or any other signal. Learner state is expressed in functional terms (for example "needs deepening"), never affective ones. | [`identity-compliance-register.md`](identity-compliance-register.md) C-2 |
| F3 | A **CI guard fails the build** on banned learner-facing tone vocabulary. | `scripts/check-no-clinical-copy.ts`, baseline `scripts/no-clinical-copy-baseline.json` |
| F4 | The product performs **no facial recognition, no biometric categorisation, and no biometric identification** of any kind. | [`identity-compliance-register.md`](identity-compliance-register.md) C-2; [`2026-07-06-school-institutional-ai-act-tripwire.md`](2026-07-06-school-institutional-ai-act-tripwire.md) trigger 7 |
| F5 | Mastery decisions are **server-owned and conservative**: the model proposes structured per-concept evaluations, and a server rule marks mastery only when every concept is solid. The output affects what the learner is shown next and nothing else. | [`../../AGENTS.md`](../../AGENTS.md) → Challenge Round mastery policy |
| F6 | **No institution receives or relies on any output.** No school, teacher, LMS, SIS, or public authority deployment, integration, or data flow exists. | [`2026-07-06-school-institutional-ai-act-tripwire.md`](2026-07-06-school-institutional-ai-act-tripwire.md); classification record §4 |
| F7 | The product is **not deployed in a workplace or by an educational institution**. It is bought and used voluntarily by families at home. | Classification record §3, DPO-confirmed §6.2 |
| F8 | Users include **minors from age 13**. Age floor 13+, launch perimeter as in the classification record §5. | [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md) |
| F9 | A persistent AI disclosure is rendered throughout every session; the user is continuously informed they are talking to an AI. | `apps/mobile/src/components/session/ChatShell.tsx:906-924`; copy at `apps/mobile/src/i18n/locales/en.json:893` |
| F10 | **No advertising, no ad profiling, and no sale of personal data.** | `apps/mobile/src/i18n/locales/en.json:3066` (product statement to users); [`ropa.md`](ropa.md) |

---

## 3. Practice-by-practice assessment

### 3.1 Article 5(1)(a) — subliminal, purposefully manipulative or deceptive techniques materially distorting behaviour and causing significant harm

**Applicability: not engaged.**

MentoMate uses no subliminal, purposefully manipulative, or deceptive technique. The system's nature is
disclosed continuously rather than concealed (F9) — the opposite of a deceptive technique. Its persuasive
surface is ordinary product copy and pedagogy: explanation, questioning, practice prompts, and revision
reminders. There is no covert channel, no deliberate exploitation of perceptual limits, and no design
intent to distort a decision the user would otherwise make differently to their detriment.

The provision requires both a manipulative or deceptive technique **and** material distortion of behaviour
appreciably impairing informed decision-making **and** significant harm. None of the three limbs is met.

**But note the interaction with §3.2.** Engagement mechanics (streaks, loss-aversion framing, guilt-shaped
reminders) are the realistic route by which a learning product drifts toward this territory, and they bite
harder where the user is a child. That risk is handled under (b), where the standard is lower.

### 3.2 Article 5(1)(b) — exploiting vulnerabilities due to age, disability, or a specific social or economic situation, materially distorting behaviour and causing significant harm

**Applicability: not engaged — and this is the provision that generates the strongest standing
constraints.**

This is the closest call in Article 5, because F8 is exactly the vulnerability the provision names:
**users are minors from age 13, and age is the enumerated vulnerability.**

*Current position.* MentoMate does not exploit that vulnerability. Its design commitments are the opposite:

| Design commitment | Status | Source |
|---|---|---|
| No dark patterns; no streak-guilt pressure | UX rules live | [`edpb_dpia_filled_2026_v1.md`](edpb_dpia_filled_2026_v1.md) §2.3.a, Fairness |
| Upsell is adult-facing and neutral | Live | ibid. |
| Children's-code defaults | **Partially implemented — full children's-code audit pending** | ibid. (implementation status recorded as "Partially implemented") |
| Banned negative-tone vocabulary in learner-facing copy | CI-enforced | F3 |
| No advertising and no profiling-based advertising | Live | F10 |
| Product design principle: never lock a learner out of a topic; human override available | Product rule | [`../../AGENTS.md`](../../AGENTS.md); [`../architecture.md`](../architecture.md) |

*Honest gap.* The children's-code alignment is recorded in our own DPIA as **partially implemented, with
the full audit pending**. That does not create an Article 5(1)(b) problem today — the provision requires
exploitation causing significant harm, and nothing in the current design approaches that — but it is the
area where an unreviewed future change is most likely to matter, and it should not be presented as
finished.

*The operative floor is lower than Article 5.* Article 5(1)(b) requires material distortion **and**
significant harm. Well below that bar sit the manipulation and dark-pattern rules applying to services
used by children — the DSA's dark-pattern and no-profiling-ads-to-minors provisions and the UK Children's
Code design standards. Our internal position, recorded before this check, is that **those rules, not
Article 5, are the binding floor on engagement design** for MentoMate. *Source:
[`history/age-country-explorer.html`](history/age-country-explorer.html):360; [`history/2026-06-07-minors-compliance-requirements.md`](history/2026-06-07-minors-compliance-requirements.md)
item A16.*

Practical consequence for management: **the question to ask of any engagement feature is not "does this
breach Article 5?" — it is "would this survive a children's-code review?" A feature can clear Article 5
comfortably and still be prohibited by the lower floor.**

### 3.3 Article 5(1)(c) — social scoring: evaluation or classification of natural persons over time based on social behaviour or personal characteristics, leading to detrimental or unfavourable treatment in unrelated contexts or disproportionate treatment

**Applicability: not engaged.**

MentoMate does evaluate a learner over time — mastery indicators, topics needing deepening, review
scheduling — so the provision deserves a real answer rather than a dismissal.

It is not social scoring, for three independent reasons:

1. **The evaluation is of demonstrated subject-matter understanding, not of social behaviour or personal
   characteristics.** The inputs are answers to learning questions.
2. **There is no detrimental treatment in an unrelated context.** The output is used inside the learning
   context that generated it, to decide what to explain or practise next (F5). It is not exported,
   not shared with any institution (F6), and does not affect the learner's access to anything outside the
   app.
3. **There is no unfavourable or disproportionate treatment at all.** The product rule is that a learner is
   never locked out of a topic on the basis of an AI-assessed mastery level; a lower mastery score produces
   *more* support, not less access.

The transition from "adaptive learning" to "scoring" would occur if a mastery indicator began to gate
access to something the learner is otherwise entitled to, or travelled into an unrelated context. Both are
already prohibited by the classification record §4 (items 3–5) and by reassessment triggers T2 and T4.

### 3.4 Article 5(1)(d) — risk assessment predicting criminal offending based on profiling or personality traits

**Applicability: not engaged.** MentoMate makes no prediction about criminal behaviour and has no law-
enforcement application, user, or data flow. Nothing in the product or roadmap approaches this provision.

### 3.5 Article 5(1)(e) — untargeted scraping of facial images from the internet or CCTV to build or expand facial-recognition databases

**Applicability: not engaged.** MentoMate performs no scraping of any kind and maintains no facial-
recognition database (F4). Image input, where used, is learner-submitted material for the mentoring
task (for example a photograph of a homework problem) processed by the vision models recorded in the
classification record §2.2 — it is not collected into any identification database.

### 3.6 Article 5(1)(f) — inferring emotions of a natural person in the areas of workplace and education institutions

**Applicability: not engaged — twice over, on independent grounds.**

This is the provision most often assumed to catch a learning product, so both grounds are set out.

**Ground 1 — there is no emotion inference at all.** The prohibition presupposes a system that infers
emotions. MentoMate does not, from any signal (F2). Learner state is functional, the vocabulary is
functionally constrained, and the constraint is CI-enforced (F3). Voice is transcription only, with no
prosodic or spectral analysis (F1). No emotion inference means no prohibition, regardless of context.

**Ground 2 — the contextual limb is not satisfied either.** The prohibition is confined to the areas of
**workplace and education institutions**. MentoMate is neither: it is a voluntary consumer product used at
home, not deployed by or on behalf of an educational institution (F7) — the same factual basis on which
the DPO concluded the product sits outside Annex III, point 3 (classification record §6.2).

**Our prior layered position, reused.** An internal analysis dated 2026-06-03 examined this provision
specifically and concluded that the doctrine is **layered rather than binary**, and that "not prohibited"
must never be read as "permitted":

| Layer | Description | Where MentoMate sits |
|---|---|---|
| **Prohibited** | Emotion or intention inferred from **biometric** data, in a **workplace or education-institution** context — Article 5(1)(f) | Not applicable: no biometric data (F1), no emotion inference (F2), no institutional context (F7) |
| **High-risk** | Biometric emotion recognition **outside** that context — the emotion-recognition entry in Annex III | Not applicable: no biometric emotion recognition would exist even outside an institution (F1, F2) |
| **Neither, but still regulated** | Affect inferred from **non-biometric** data such as text sentiment — outside the biometric definition entirely, but subject to GDPR, and to the education high-risk category if used institutionally | Not built. **The constraint in §4 keeps it unbuilt.** |
| **Clear** | Functional learning state derived from discrete behavioural events (correctness, latency, retries) | **This is what MentoMate does.** GDPR profiling rules apply; the AI Act's emotion provisions do not. |

The decisive scope point is that a business-to-consumer, self-purchased, at-home learning product is not an
"education institution" for the purposes of this provision — an institution being an accredited or
officially sanctioned body whose participation is required rather than chosen. The corollary matters more
than the conclusion: **a school channel is the cliff.** The same emotion feature that is merely
ill-advised in a consumer product becomes an outright prohibited practice once an institution requires
learners to use it. This is the compliance reason — separate from the Annex III reason — that
reassessment trigger T1 and the institutional tripwire exist.

*Source: internal analysis of 2026-06-03 (E1-bis ledger entry, second-opinion web-verified against the AI
Act text and the Commission guidelines on prohibited AI practices), condensed at
[`history/age-country-explorer.html`](history/age-country-explorer.html):360 — "Art 5(1)(f) is layered:
reading tone from TEXT is fine; biometric emotion inference is the prohibited/high-risk zone" — and
carried as a product rule at [`history/2026-06-07-minors-compliance-requirements.md`](history/2026-06-07-minors-compliance-requirements.md)
item A14.*

**[OPEN — needs input: the full 2026-06-03 layered analysis is held in the project's agent-memory store
rather than as a compliance document in this repository. If the DPO wishes to rely on it, it should be
promoted to a dated document under `docs/compliance/`, and its citation to the Commission guidelines on
prohibited AI practices (recorded internally as C(2025) 5052 final of 29 July 2025) verified against the
adopted text.]**

### 3.7 Article 5(1)(g) — biometric categorisation to deduce race, political opinions, trade-union membership, religious or philosophical beliefs, sex life or sexual orientation

**Applicability: not engaged.** MentoMate performs no biometric categorisation of any kind (F1, F4) and
deduces none of the listed attributes by any means.

### 3.8 Article 5(1)(h) — real-time remote biometric identification in publicly accessible spaces for law-enforcement purposes

**Applicability: not engaged.** MentoMate performs no biometric identification, operates in no publicly
accessible space, and has no law-enforcement purpose or user (F4).

---

## 4. Standing product constraints arising from this check

These are the operative output. They are **prohibitions, not preferences**, and hold until this check is
re-performed and a different conclusion is approved under the classification record §9.

| # | Constraint | Arises from |
|---|---|---|
| **C1** | **Never build emotion or affect inference** — from voice, face, image, typing dynamics, or any biometric signal. No mood field, no frustration detector, no engagement-via-affect model. This holds even where the product is not in an institutional context, because such a feature would be high-risk rather than merely permitted, and would become prohibited the moment any institutional channel opened. | §3.6 |
| **C2** | **Voice remains transcription-only.** The pipeline emits transcript and timing only — no prosodic, spectral, or waveform-derived affect signal. Any third-party voice component must be vetted for hidden affect scoring before adoption. | F1; §3.6 |
| **C3** | **Learner-state vocabulary stays functional**, never affective, in code, prompts, and learner-facing copy. The CI guard stays in place and its baseline is not to be relaxed to admit new violations. | F2, F3 |
| **C4** | **No emotion-adjacent feature may be introduced under a pedagogical justification.** The narrow medical/safety exception to the emotion provisions does not extend to wellbeing, motivation, or learning-satisfaction purposes, so it is not available to this product. | §3.6 |
| **C5** | **Any text-based distress or safety detection stays architecturally separated from pedagogy.** Such detection is a distinct, permitted safety purpose operating on non-biometric data; it must never feed the mentoring loop as an inferred mood, and must remain text-only — voice-based distress detection would cross into biometric territory. | §3.6; F1 |
| **C6** | **No social scoring.** Mastery indicators never gate access to anything the learner is otherwise entitled to, never travel to an unrelated context, and never leave the product to an institution. | §3.3; classification record §4 |
| **C7** | **No manipulative engagement design on minor-facing surfaces.** No loss-aversion or compulsion mechanics, no guilt framing, penalty-free disengagement, symmetric prominence of choices, no profiling-based advertising to under-18s. The binding standard is the children's-code and dark-pattern floor, which sits **below** the Article 5 threshold — clearing Article 5 is not sufficient. | §3.2 |
| **C8** | **No subliminal or deceptive technique**, and no design that conceals or undermines the AI disclosure. The persistent disclosure is a compliance control, not a UI element available for redesign. | §3.1; F9 |
| **C9** | **No biometric categorisation, no facial recognition, no scraping, no biometric identification** — under any product rationale, including account security or age assurance. Any future age-assurance proposal that involves biometric processing requires a fresh Article 5 assessment before design work starts. | §3.5, §3.7, §3.8 |
| **C10** | **Re-run this check before any institutional channel opens.** The consumer context is doing real work in §3.6 and §3.2. It is not a permanent property of the company. | §3.6; classification record §7, trigger T1 |

**Relationship to the reassessment triggers.** C1, C2, and C9 overlap with reassessment trigger T5, and C6
and C10 with T1–T4 in the classification record §7. The overlap is intentional: a change here would engage
both records, and each must be checked in its own right rather than one being taken as covering the other.

---

## 5. Limitations of this check

1. **It is a management assessment**, prepared for DPO review. It is not legal advice and not a compliance
   claim.
2. **It is bound to application version 1.0.1** and the model set recorded in the classification record
   §2.2. It says nothing about any later version.
3. **It assesses intended and implemented functionality**, verified against the sources cited in §2. It is
   not a code audit, and does not independently verify the absence of affect-related processing inside the
   third-party models we call — only that MentoMate neither requests nor derives such output.
4. **The children's-code alignment is partial** by our own record (§3.2), and the pending audit is the most
   material open item touching this check.
5. **The article lettering is unverified against the consolidated text** — see §1.1.

---

## 6. Conclusion

MentoMate at version 1.0.1, in its family-only consumer form, **engages no prohibited practice under
Article 5(1)**. The result is not incidental: it follows from three deliberate design positions — no
biometric processing, no emotion or affect inference, and no institutional deployment — each of which is
also load-bearing for the not-high-risk classification.

The realistic risk is not that MentoMate is prohibited today. It is that a plausible-sounding future
feature — reading how a learner feels in order to help them, or a school partnership — crosses a line that
looks distant from where the product now stands. §4 exists so that those decisions are recognised as
compliance decisions at the moment they are proposed, rather than after they ship.

---

## 7. Review

| Field | Value |
|---|---|
| Owner | Zuzana Kopecna, Chair |
| Next review | With the classification record — proposed annually, next due **2027-07-30** |
| Mandatory re-check | Before any institutional channel opens; before any biometric, voice-analysis, affect-related, or age-assurance-by-biometrics feature enters design; on any material change to the model set |

## 8. Change log

| Version | Date | Change | Author |
|---|---|---|---|
| v0.1 | 2026-07-30 | Initial Article 5 prohibited-practices check, responding to the DPO's requirement of 2026-07-30. Incorporates the prior layered Article 5(1)(f) emotion-inference position of 2026-06-03. | agent-drafted for management review |
