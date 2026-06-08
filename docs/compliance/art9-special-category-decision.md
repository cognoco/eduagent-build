# Decision: Special-Category (Art 9) Data — We Do Not Process It

**Checklist item:** A23 · **Law:** GDPR Article 9 · **Status:** DECIDED 2026-06-08 (user-ruled), pending DPO/counsel confirmation.
**Posture:** liability-minimizing — declare and enforce non-collection so we stay in the lighter processing lane.

---

## The decision

**MentoMate does NOT collect, infer, derive, label, or store special-category personal data under GDPR Article 9** — specifically **no health data and no disability data**. We do not diagnose, screen for, flag, or infer dyslexia, ADHD, dyscalculia, autism, any learning disability, or any physical/mental-health condition, about any user, of any age.

This keeps us out of the Art 9 regime entirely: no explicit-consent gate for special-category data, and a materially lighter DPIA.

## What we DO process — and why it is NOT Art 9 data

We process **educational-performance data**: which concepts a learner has covered, mastery state, misconceptions surfaced during a session, vocabulary learned, quiz/dictation results, and session summaries. This is ordinary personal data about learning, **not** health data.

The line is intent and characterisation:

- "Learner has not yet mastered fractions" / "misconception: confuses area and perimeter" → **performance data. Allowed.**
- "Learner shows signs of dyscalculia" / "this child appears to have ADHD" / "flag for a learning disability" → **Art 9 inference. Forbidden** under this decision.

A school keeping a record that a pupil struggles with fractions is not processing health data; a school recording a suspected disability is. We sit firmly on the first side and must stay there.

## The "even inferring counts" rule (the trap to avoid)

GDPR Art 9 bites on **inference**, not just on a checkbox. A feature that *derives* a probable disability from behaviour (e.g. response latency + error patterns → "likely dyslexic") would pull us into Art 9 even though no user ever typed the word. Therefore:

- **No model prompt, classifier, or heuristic may output a clinical or disability label or probability.**
- **No UI may display, and no table may store, a health/disability characterisation.**
- The persistent learning memory (notes, extracted facts, mastery state — see DPIA §6 and checklist A24) must contain **performance** characterisations only, never clinical ones.

## Existing enforcement (already in the codebase)

- The repo already carries a **no-clinical-copy baseline** guard (`scripts/no-clinical-copy-baseline.json` pattern) preventing clinical language from entering user-facing copy. This decision is the policy that guard implements.
- **Action for eng:** confirm the no-clinical-copy guard also covers LLM-extracted `memory_facts.text`, `topic_notes.content`, and `needs_deepening_topics.misconception` content paths, not only static copy. If a model could write a clinical inference into those fields, add a server-side reject/scrub on that path. (Tracked in DPIA §6 mitigations.)

## Consequence for the DPIA (A1)

The DPIA must state explicitly:

1. No Art 9 data is processed; the Art 9 conditions and the explicit-consent requirement are therefore **not engaged**.
2. The profiling we do perform (tailoring tuition to a learner) is **ordinary-personal-data profiling**, and is **not** Art 22 automated decision-making — it has no legal or similarly significant effect (it personalises teaching only). See DPIA §6.
3. The non-collection of health/disability data is a deliberate, enforced design constraint, not an accident — with the guard above as evidence.

## What would reopen this decision

Any future feature that wants to **detect, accommodate, or report** a learning disability or health condition (e.g. a dyslexia-friendly mode that *infers* dyslexia rather than letting a user simply switch it on). That flips us into Art 9 and requires: explicit consent, an expanded DPIA section, and counsel review. Do not build it under this decision — escalate first.

---

**Sign-off:** DPO / counsel to confirm this characterisation holds for the shipped feature set. ☐ Confirmed · Name: ____________ · Date: ________
