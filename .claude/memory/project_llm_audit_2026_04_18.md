---
name: LLM personalization + reliability audit (2026-04-18)
description: Three specs in docs/specs/ map every LLM prompt surface, catalog marker anti-patterns, and define the response envelope migration. Phase 3 tuning COMPLETE. All 4 agents merged. Envelope migration complete (3ce28b45).
type: project
---

## Three audit docs in the repo

All under `docs/specs/`, dated 2026-04-18:

1. **`2026-04-18-llm-personalization-audit.md`** — maps all 9 LLM prompt surfaces in `apps/api/src/services/`. Catalogs which personalization fields (interests, struggles, libraryTopics, strengths, urgency, etc.) are wired into each prompt and which are captured but ignored. Includes a P0/P1/P2/P3 backlog.
2. **`2026-04-18-llm-reliability-ux-audit.md`** — finds a family of free-text marker anti-patterns driving state transitions. Documents F1.1–F8. Major finding: `[INTERVIEW_COMPLETE]`, `[PARTIAL_PROGRESS]`, `[NEEDS_DEEPENING]` + `{"notePrompt":true}` + `{"fluencyDrill":...}`. See `project_llm_marker_antipattern.md`.
3. **`2026-04-18-llm-response-envelope.md`** — design spec for the structured `{reply, signals, ui_hints, confidence}` envelope that replaces every marker. Defines Zod schema, server-side caps pattern, rollout telemetry.

## The 9 LLM prompt surfaces

| # | Flow | File:function |
|---|---|---|
| 1 | Live exchange (main tutoring loop) | `exchanges.ts:buildSystemPrompt` (L218-572) |
| 2 | Post-session profile analysis | `learner-profile.ts:SESSION_ANALYSIS_PROMPT` (L35, now exported) |
| 3 | Topic filing | `filing.ts:buildPreSessionPrompt` + `buildPostSessionPrompt` (both now exported) |
| 4 | Quiz capitals | `quiz/generate-round.ts:buildCapitalsPrompt` |
| 5 | Quiz vocabulary | `quiz/vocabulary-provider.ts:buildVocabularyPrompt` |
| 6 | Quiz guess-who | `quiz/guess-who-provider.ts:buildGuessWhoPrompt` |
| 7 | Dictation generate | `dictation/generate.ts:buildGeneratePrompt` (now exported) |
| 8 | Dictation review (multimodal) | `dictation/review.ts:buildReviewSystemPrompt` (refactored from const — Agent 2) |
| 9 | Dictation prepare-homework | `dictation/prepare-homework.ts:SYSTEM_PROMPT` (now exported) |

## Phase 3 (tuning) — COMPLETE

Four parallel agents dispatched 2026-04-19:

| Agent | Commit | Scope |
|---|---|---|
| Phase 0 (me) | `3b32b0a1` | F1.2 hotfix + response envelope spec + harness extension + audit updates |
| 4 — tone + F7 | `349ecad8` | Remove "learning mate" / "dive in" / "enthusiastic" across exchanges + interview. Interview 3-5 → 2-3 exchanges. Lower analysis threshold for interview context. |
| 2 — dictation + dead-code | `970a82a5` | interests/libraryTopics → dictation generate. Dictation review refactored to `buildReviewSystemPrompt(ageYears?, preferredExplanations?)`. **Removed `AgeBracket.child`** and dictation ≤7/≤10 branches (unreachable in 11+ product). |
| 3 — memory enrichment | `413ece4f` | `buildMemoryBlock` now returns `{text, entries[]}` with kind/sourceSessionId/sourceEventId metadata (F8 prep). Surfaces strengths (top 3) + urgency_boost_reason. 8 new tests. |
| 1 — quiz personalization | `1f513d1c` | Quiz capitals/vocab/guess-who: accept optional interests + libraryTopics + ageYears + L1-aware distractors. |

Envelope migration COMPLETE (3ce28b45): all markers (F1.1–F2.2) migrated to structured response envelope.

## Key product constraints surfaced by the audit

- **Product is strictly 11+.** This invalidated two dead-code branches (see `project_llm_marker_antipattern.md` companion + Agent 2's cleanup).
- **Three new onboarding dimensions shipped** (schema migrated in 99d234fc): see `project_onboarding_new_dimensions.md`.

## How to apply

- Future LLM work on this repo should start by reading the three specs.
- The eval harness (`apps/api/eval-llm/`) validates every prompt change — see `project_eval_llm_harness.md`.
- Migration pattern for markers/JSON-in-free-text → structured envelope documented in the envelope spec.
