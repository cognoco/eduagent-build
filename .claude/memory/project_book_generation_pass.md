---
name: Book generation quality pass
description: Use when validating generated books, generated topics, or topic-map context before tutoring sessions.
type: project
---

The repo has a durable live book-generation quality gate at `scripts/book-generation-pass.ts`, exposed as `pnpm test:llm:book-generation`.

It calls the app's real book-generation services directly, not the emulator, and writes results under `tmp/book-generation/results/`. The default cases cover broad subject classification, narrow subject classification, language learning, serious history, adult biology, and middle-school science. Book/topic-map generation uses a strong tier and must not silently fall back to a weaker model; the concrete provider/model policy lives in `MMT-ADR-0014` + `docs/registers/llm-models/master.md`. The old Gemini-only / Gemini 2.5 Pro wording is superseded. The runner has one default whole-case retry for transient provider overloads/timeouts; real quality and source-safety failures still block.

**Why:** Added after the 2026-05-18 decision that book generation is upstream of the tutoring spine. The generated book/topic map can make a session weak even when the session reply logic is good.

**How to apply:** Run `pnpm test:llm:book-generation` after changing `book-generation.ts`, `book-suggestion-generation.ts`, `curriculum.ts`, `session-context-builders.ts`, or the runner itself. The change-class script lists it as a slow required validation for these files.

The runner checks more than JSON validity: broad/narrow shape, topic counts, sort order, duplicate titles, chapter continuity, visual connection references, age register, overload risk, and whether generated topics render into the existing previous/current/next topic-map context used by sessions. Precise factual claims are failures because book generation currently has no retrieval/source step; generated curriculum should stay source-neutral until a tutoring turn has reliable source support.
