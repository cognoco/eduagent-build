---
name: LLM source provenance and audit
description: Use when changing tutoring prompts, response envelopes, session exchange persistence, or live LLM quality gates.
type: project
---

MentoMate tutoring replies must be privately source-grounded. The learner should not see source IDs or audit details, but every session exchange should carry a `private_sources` envelope and server-side `sourceAudit` metadata so the team can later explain why an answer was allowed, replaced, or marked insufficient.

Reliable factual sources are server-provided trusted app/curriculum content, learner-provided homework/recitation/problem text where appropriate, app help map content, or deterministic reasoning over supplied problem data. Conversation history, learner/mentor memory, and learner messages can personalize or preserve continuity, but they are not reliable evidence for outside-world factual claims. Do not let LLM prompts cite model memory, forums, chats, or unstated assumptions as factual support.

When no reliable factual source is available, the assistant should not invent facts. It should give useful non-factual guidance: frame the question, ask for the textbook/worksheet/photo/trusted source, or prepare a claim-example-evidence structure. The server safety fallback and streaming `replace` frame exist to keep displayed text, persisted text, and audit metadata aligned.

Use `pnpm test:llm:enduser` after LLM prompt/session changes. The runner now checks private source audit status across freeform, learning, homework, review, and recitation; source-audit failures are hard failures, while intentionally insufficient no-source turns are warnings that should be inspected for usefulness.

Source-bound tripwires are universal policy checks, not topic-specific fixes. Concrete phrases such as armies moving easily, empire conquest/growth, unsupported trade goods, biology analogies, or cell-autonomy wording are regression examples from transcripts. The governing rule is broader: every factual claim in every subject and session mode must be supported by a reliable source pack entry or deterministic problem reasoning. Keep tripwires context-aware so domain-specific wording does not create false positives, e.g. "x all by itself" is normal algebra wording, but "what a cell can do all by itself" is biology drift unless the source says it.

For complaint/explainability work, inspect the persisted private `private_sources` envelope and server `sourceAudit` metadata. They should reveal which source IDs were relied on, whether reliable support existed, which unsupported source IDs or unsupported source-bound terms were detected, and whether the server replaced/scrubbed text with a safety fallback.
