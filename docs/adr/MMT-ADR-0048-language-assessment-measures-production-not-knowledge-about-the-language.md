# MMT-ADR-0048 — Language assessment measures production, not knowledge about the language

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Assessment, review, and quiz generation for language subjects · **Deciders:** pending Architecture sign-off

## Context

The assessment pipeline was built for concept subjects, where checking understanding means asking the learner to explain, summarise, or apply an idea. Those prompts generalise badly: applied to a language topic, a generic "what were the main ideas?" rubric produces questions about the *subject matter of the lesson* rather than the language it taught.

The failure was observed directly in a review of an introductory greetings topic. The generated assessment asked for the main ideas of the lesson, and the follow-up questions drifted further in the same direction — what a greeting is, when one is used, how greetings differ by situation. Every question was answerable, none of them required a single word of the target language, and a learner could score full marks without being able to greet anyone.

That is not a hard-question-versus-easy-question problem. Learners already possess the meta-knowledge these questions test; they arrive knowing what a greeting is. The assessment was measuring something the learner had before the lesson, which makes it incapable of detecting whether the lesson worked.

## Decision

1. **A language assessment requires the learner to produce or interpret the target language.** An item that can be answered correctly without using the target language does not assess the language and does not belong in a language review.

2. **Items are concrete tasks, not summaries.** Recall and produce a word or chunk; add another to a set; translate a phrase in either direction; use an item in a short exchange. The learner performs the language rather than describing it.

3. **Meta-knowledge questions are excluded by default.** "What are the main ideas", "what other words did we cover", "when would you use this" and their variants are not language assessment. Cultural and register questions are legitimate only where the lesson explicitly taught culture or register, in which case they are assessing what was taught.

4. **Spelling is tolerated where it does not change the answer.** The construct being measured is retrieval and use, not orthographic precision, and a grader that fails a recognisably correct production teaches the learner that the system is arbitrary.

5. **Exchanges are short by design.** A two-line exchange is a sufficient production task. Length is not evidence of rigour, and long free production shifts the assessment toward composition skill.

## Consequences

- Language-subject assessment cannot reuse the concept-subject rubric unchanged. Prompt construction must branch on the subject's pedagogy rather than emitting one generic instruction set.
- Grading must accept a range of surface forms for the same correct answer, which makes exact-match grading unusable for these items and puts the tolerance rule in clause 4 into the grader rather than only into the prompt.
- Assessment output becomes directly informative about capability: a failed item now means the learner could not produce the language, which is actionable, where a failed summary item was ambiguous between not-knowing and not-articulating.
- The rule is stated as a property of the item rather than a list of banned phrasings, so it survives rewording. A new template is tested by asking whether it can be answered without the target language.
- Clause 3's carve-out is a judgement about what the lesson taught, and is the clause most likely to be applied loosely. A culture question is in scope only when the lesson's own content covered it, not when the topic merely has cultural dimensions.

## Alternatives considered

- **Improve the generic assessment prompt rather than branch by pedagogy.** Rejected: the generic rubric's instruction to check understanding of main ideas is correct for concept subjects, so tightening it to suit language subjects degrades it everywhere else.
- **Grade production strictly, including spelling.** Rejected under clause 4: it measures orthography rather than retrieval, and it penalises exactly the learner who has acquired the word but not yet its written form.
- **Ask for longer free production to get a richer signal.** Rejected: it converts the assessment into a composition task, raises the cost of an incorrect answer for a beginner, and returns a signal that is harder to grade consistently than a short targeted exchange.

## Links

- `docs/adr/MMT-ADR-0047-pedagogy-is-a-per-subject-property-and-language-subjects-do-not-use-the-socratic-mode.md` — the pedagogy split this decision follows from; clause 2 there is why a language assessment cannot be a Socratic check.
