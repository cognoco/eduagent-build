# MMT-ADR-0047 — Pedagogy is a per-subject property, and language subjects do not use the Socratic mode

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Subject data model, tutoring-mode selection, and the language-learning surface (vocabulary, proficiency tracking, per-subject native language) · **Deciders:** pending Architecture sign-off

## Context

The tutoring loop was built around a single pedagogy: Socratic questioning, in which the system draws understanding out of the learner rather than presenting material. That works for conceptual subjects, where the learner has latent knowledge to be surfaced and the productive move is to ask rather than tell.

It does not work for acquiring a language. A learner who does not yet know a word cannot be questioned into it; the required activities are exposure to comprehensible input, structured practice of form, opportunity to produce, and repetition until retrieval becomes fluent. Socratic questioning applied to vocabulary produces conversation *about* the language instead of practice *in* it — the learner ends up discussing what a greeting is rather than being able to greet.

The choice was therefore between forcing language subjects through a pedagogy that structurally cannot teach them, and admitting a second pedagogy into the model. A second mode has a real cost: pedagogy stops being an implicit global property of the tutor and becomes a stored, per-subject fact that prompt construction, assessment, and progress tracking must all read.

## Decision

1. **Pedagogy is a stored property of the subject, not a global property of the tutor.** A subject carries a `pedagogyMode` of `socratic` or `four_strands`. `socratic` is the default, so subjects that predate the distinction and subjects that never state one behave as before.

2. **Language subjects use `four_strands`.** The mode names the balance it enforces — meaning-focused input, meaning-focused output, language-focused learning, and fluency development — and commits the language surface to covering all four rather than whichever is cheapest to generate.

3. **Direct correction is licensed under `four_strands` and remains disfavoured under `socratic`.** Withholding the answer is a pedagogical technique for concept learning and an obstacle in language production, where an uncorrected form is practised into permanence.

4. **The learner's native language is a per-subject fact, not a per-profile one.** It is stored on the subject's teaching preferences. A learner may study one language from another, and a single profile-level "native language" cannot express that.

5. **Proficiency is tracked on the CEFR scale for language subjects**, as a level-and-sublevel pair, and is distinct from the mastery and retention state used by concept subjects. The two are not interchangeable and neither is derived from the other.

6. **The mode selects the pedagogy within a shared shell; language-specific *state* is separate by design.** The session loop, the exchange path, and the assessment pipeline are single implementations that read the mode rather than forking. The things a language subject must remember, however, are genuinely different in kind and have their own stores: vocabulary carries its own retention cards and scheduling, distinct from concept-subject retention, and CEFR proficiency is tracked and served on its own path rather than folded into mastery. That split is deliberate and load-bearing — collapsing it into the concept-subject equivalents would destroy vocabulary scheduling and proficiency history. What is out of scope is a parallel language-only *session stack*, not language-specific state.

## Consequences

- Every surface that constructs a teaching prompt must read the subject's pedagogy mode. Prompt work that assumes Socratic questioning is a latent bug on language subjects rather than a style preference.
- The subject becomes the unit that carries pedagogy, which makes "what kind of thing is this subject?" a question the data model answers rather than one inferred from the subject's name at generation time.
- Assessment for language subjects must measure production rather than recall of facts about the language; that consequence is large enough to be recorded separately (see Links).
- Two proficiency vocabularies coexist. Any surface that reports "progress" across mixed subjects must choose which it means, and a change that collapses CEFR into the mastery scale would silently destroy language progress state.
- Adding a third pedagogy is now an enum extension and a prompt-selection branch rather than an architecture change — the extension point is the cost this decision already paid.
- Canon carries an unreconciled description of this area: `docs/architecture.md` still presents language learning as designed-for-but-not-built and deferred to a later release, in its scope summary, its epic table, its deferred-decisions table, and its extension-point note. The shipped schema contradicts all four. Correcting them is the lockstep half of this ADR and is sequenced separately (see Links).

## Alternatives considered

- **Force language subjects through the Socratic mode.** Rejected on pedagogical grounds: it cannot teach unknown vocabulary, and its observed output is discussion about the language rather than practice in it.
- **Build language learning as a separate product surface with its own session loop.** Rejected: it duplicates sessions, retention, progress, and assessment for one subject family, and it splits the learner's history across two systems that would then have to be reconciled on any cross-subject view.
- **Infer pedagogy from the subject name or from a language detector at prompt time.** Rejected: it makes the tutor's behaviour non-deterministic across sessions for the same subject, gives the learner nothing to correct when the inference is wrong, and puts a classification step in the latency path of every exchange.
- **Store the learner's native language once on the profile.** Rejected as a modelling error: it cannot express studying one non-native language through another, which is a normal case rather than an edge one.

## Links

- `docs/adr/MMT-ADR-0048-language-assessment-measures-production-not-knowledge-about-the-language.md` — the assessment consequence of clause 2, recorded separately because it constrains prompt and rubric design rather than the data model.
- `packages/schemas/src/language.ts` and `packages/schemas/src/account.ts` — the shipped `pedagogyMode`, CEFR, and per-subject native-language contracts, named here as the source of truth for the shapes rather than restated.
