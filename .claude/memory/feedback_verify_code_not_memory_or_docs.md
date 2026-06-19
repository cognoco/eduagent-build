---
name: Answer code questions from code, never memory/docs
description: When the user asks anything code-related, verify against current source before answering — never rely on memory or plan/spec docs alone
type: feedback
---

For ANY code-related question — "is X built / wired / live / blocked", "does the app
use Y", "what's the state of Z" — read the current source (grep, open the file, check
the flag/config) BEFORE answering. Never answer from memory entries, plan docs, or spec
docs alone.

**Why:** In the V2 / identity-foundation conversation (2026-06-14) I answered several
turns from `MEMORY.md` + `docs/plans/v2-plan/` + spec, calling S5 "identity-blocked,
model doesn't exist yet." When I finally grepped, the truth was different and sharper:
the whole `identity-v2/` service tree IS built and wired into routes, gated behind a
single flag `IDENTITY_V2_ENABLED` (`apps/api/src/config.ts:171`, default `'false'`) —
flag-off in every deployed env, flips once at WI-586 convergence. The user caught this
("are you at all looking at the code?"). Docs/memory describe *intent or past state*;
code is ground truth (AGENTS.md Universal Principle 7).

**How to apply:** Default to a quick grep/read of the actual source first. Use memory and
plan/spec docs only to know *where* to look and *why*, then confirm the current behavior
in code and cite `file:line`. Treat any memory/doc claim about build/wiring/live status as
a hypothesis to verify, not an answer. See [[feedback_subagent_reports_are_intent_not_evidence]].
