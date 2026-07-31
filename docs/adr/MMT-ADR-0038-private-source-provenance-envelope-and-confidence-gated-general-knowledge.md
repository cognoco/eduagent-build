# MMT-ADR-0038 — Every tutoring turn carries a private source-provenance envelope; general knowledge is admissible only above a named confidence floor

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Tutoring prompts, LLM response envelope, session-exchange persistence, live end-user quality gates · **Deciders:** pending Architecture sign-off · **Builds on:** MMT-ADR-0018 (single LLM entry point), MMT-ADR-0016 (safety and judge architecture)

## Context

A tutoring reply is generated prose. When a parent later asks "why did the mentor tell my child that?", the only honest answer is one reconstructed from what the model actually relied on for that turn — which, without a deliberate record, is unrecoverable. Reply text alone cannot distinguish a claim grounded in the learner's own worksheet from one the model produced unsupported.

Two constraints pull against each other. The audit record must be complete enough to explain, after the fact, why an answer was allowed, replaced, or marked insufficient. But a learner reading a tutoring reply must not see source identifiers, confidence numbers, or audit machinery — surfacing them turns teaching into a citation exercise and teaches nothing.

The other live tension is between refusing too much and asserting too much. A mentor that demands a source before answering "how many days in February?" is unusable. A mentor that answers "what does this worksheet's paragraph 3 argue?" from general knowledge is fabricating. These are different classes of turn and the correct posture differs between them, so a single global "always cite" or "never cite" rule is wrong in one direction or the other.

## Decision

1. **The envelope is private and mandatory.** Every session exchange carries a `private_sources` envelope on the model response and server-derived `sourceAudit` metadata persisted alongside the exchange. Neither is ever rendered to the learner. Together they record which source ids were relied on, whether reliable support existed, which unsupported source ids or unsupported source-bound terms were detected, and whether the server replaced or scrubbed the displayed text with a safety fallback.

2. **Reliable factual sources are an explicit, closed set.** Server-provided trusted app/curriculum content; learner-provided homework, recitation, or problem text where appropriate; app help-map content; deterministic reasoning over supplied problem data; and confidence-gated general knowledge when — and only when — the server has explicitly exposed general knowledge for that turn.

3. **Continuity material is not evidence.** Conversation history, learner and mentor memory, and learner messages may personalize a reply or preserve continuity, but they are never reliable evidence for a claim about the outside world. Forums, chats, and unstated assumptions are never citable support.

4. **Turns are source-bound or general-knowledge-eligible, and the classes are not interchangeable.** Source-bound turns — homework, review, recitation, and language-grammar feedback; precise quotes, citations, statistics, and dates; ranking, most-important, and main-idea claims; and medical, legal, financial, or safety topics — may never be answered from general knowledge. They require the relevant supplied source, or a route to a professional or trusted-adult path.

5. **General knowledge is admissible only above a single named server-side confidence floor.** For ordinary low-stakes freeform and early-rung learning turns, the assistant may answer from general knowledge when general knowledge is exposed for the turn, the envelope's `relied_on` includes it, and the envelope's declared factual confidence is at or above the floor. Below the floor the required behaviour is to rely on supplied source material or to ask for a source, photo, worksheet, or clearer details — never to guess. **The decision is the existence, singularity, and server-ownership of the floor; its value is a tuned parameter of this contract, not a separate decision.** The floor's current value is `0.88`, held once as `GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR`. Retuning that number against observed behaviour does not supersede this ADR; introducing a second, differently-sourced threshold, or moving the gate to the client, does.

6. **Displayed text, persisted text, and audit metadata must agree.** When the server replaces a reply, the safety fallback and the streaming `replace` frame exist to keep what the learner saw, what was stored, and what the audit records describe from diverging.

7. **Tripwires are universal policy checks, not topic-specific string fixes.** Concrete phrasings recovered from failing transcripts are regression examples, never the rule. The governing rule is that a source-specific factual claim must be supported by a reliable source-pack entry or deterministic problem reasoning. Tripwires stay context-aware, because the same wording can be ordinary in one domain and unsupported drift in another.

## Consequences

- Complaint and explainability work is answerable from stored state: the persisted envelope and `sourceAudit` are the record, and no reconstruction from reply prose is required.
- Prompt changes that affect source discipline are observable — the live end-user quality gates check source-audit status across freeform, learning, homework, review, and recitation, and source-audit failures are hard failures.
- Every general-knowledge path acquires a cost: the model must declare a confidence before asserting, and a low-confidence turn converts into a request for material rather than an answer. This is deliberate; the failure it prevents is confident fabrication to a child.
- The floor lives in exactly one place, so tuning it is a single edit with a single blast radius. Any code path that hardcodes its own threshold is a defect against this ADR, not a local choice.
- Because the taxonomy is a closed set, a genuinely new source class (a new content vendor, a new learner-supplied artifact type) requires an explicit amendment rather than silent admission.

## Alternatives considered

- **Show sources to the learner.** Rejected: source identifiers are internal, and a tutoring surface that renders them trades teaching for bibliography. The audit need is served by private metadata, which does not require learner-facing citations.
- **Require a supplied source for every factual claim.** Rejected: it makes ordinary low-stakes questions unanswerable and pushes learners away from the mentor for exactly the questions it handles best.
- **Allow general knowledge everywhere, with no gate.** Rejected: it is precisely wrong on the high-stakes classes, where a confident wrong answer is the worst outcome.
- **A second ADR for the confidence threshold itself.** Rejected: the threshold is a tuned parameter inside this contract, in the same way per-tier and per-rung model names are register data rather than clauses of MMT-ADR-0014. Splitting it would create two documents that must be superseded together every time the number moves.
- **Classify reply content to decide whether the source rules applied.** Rejected on evidence; see MMT-ADR-0043, which records why a regex over model output cannot decide gate applicability.

## Links

- `packages/schemas/src/llm-envelope.ts` — `private_sources` envelope shape (`relied_on`, `factual_confidence`).
- `apps/api/src/services/exchange-types.ts` — `GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR`, the single named floor.
- `apps/api/src/services/exchanges.ts` — server-side `sourceAudit` derivation and persistence.
- `apps/api/src/services/exchange-prompts.ts` — the source-discipline prompt rules that implement the turn taxonomy.
- `docs/adr/MMT-ADR-0043-gate-exemptions-key-on-turn-identity-not-output-classification.md` — the companion rule for exempting a turn from the source-audit gate.
- `docs/adr/MMT-ADR-0032-verified-learning-artifacts-require-source-and-verification-state.md` — the artifact-side source/verification contract; this ADR governs the turn, that one governs what a turn's output may later be shown as proof of.
