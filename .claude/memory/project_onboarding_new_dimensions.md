---
name: New onboarding dimensions committed 2026-04-18
description: Three personalization dimensions decided but not yet DB-migrated: conversationLanguage (mandatory), interestContext (extends interests), pronouns (optional for older learners).
type: project
---

## Decision date

2026-04-18 — committed during the LLM personalization audit session. Not yet in schema or onboarding UI.

## Formal spec

Full implementation spec: `docs/specs/2026-04-19-onboarding-new-dimensions.md` (written 2026-04-19). Contains migration SQL, Failure Modes table, API surface, rollback analysis, and verified-by test list. Use that spec as the build-time reference; this memory is the decision record.

## 1. conversationLanguage (mandatory)

ISO 639-1 code. The language the tutor speaks to the learner during exchanges. Defaults to device locale but asked explicitly in onboarding.

**Why:** currently the only profile-level language signal is `teaching_preferences.native_language` (per-subject, for L1-aware grammar explanations) and `subjects.language_code` (target for language-learning subjects). Nothing captures "what language do you want the tutor to speak in". Bilingual learners and kids whose device locale doesn't match their preferred conversational language end up with wrong-language tutoring.

**Implementation scope:**
- New column `profiles.conversation_language` (ISO 639-1).
- Single onboarding question; defaults from device locale.
- Propagate to every LLM call as the primary language directive. Per-subject `teaching_preferences.native_language` override stays for language-learning subjects.

**Already reflected in** `apps/api/eval-llm/fixtures/profiles.ts:EvalProfile.conversationLanguage`. `17yo-french-advanced` exercises the split (Czech native, French conversation).

## 2. interestContext (extends `interests` shape)

Interest entries go from `string[]` to `Array<{label: string, context: 'free_time' | 'school' | 'both'}>`.

**Why:** a kid obsessed with dinosaurs in free time AND resentful of math at school should get dinosaur-themed dictation but NOT forced dinosaur themes in math prompts. The context tag lets prompts decide when interest-steering helps vs hurts.

**Implementation scope:**
- Extend `learning_profiles.interests` JSONB schema to the object form.
- Two-tap collection at onboarding: label first, context second.
- Extend `SESSION_ANALYSIS_PROMPT` (post-session) to emit context when inferring new interests — already has `interests: ["string"]` in its output; change to object form.
- Every prompt that injects interests should filter by context (`free_time`/`both` for theme picks).

**Already reflected in** `apps/api/eval-llm/fixtures/profiles.ts` — all 5 profiles use the new object shape.

## 3. pronouns (optional, older learners only)

Free-text string (`he/him`, `she/her`, `they/them`, or custom). Not mandatory. Prompted only for learners 13+.

**Why:** cosmetic but meaningful for older teens. Affects how the tutor addresses them (second-person stays invariant, third-person references vary — e.g. parent dashboard).

**Implementation scope:**
- New column `profiles.pronouns` (text, nullable).
- Optional onboarding question prompted conditionally.
- Consumed by UI labels + prompts that refer to the learner in third person.

**Already reflected in** eval harness: 3 of 5 fixture profiles populate pronouns (she/her, he/him, they/them).

## What was explicitly NOT committed

From the same audit brainstorm, four dimensions were discussed and left for later:

- Reading level (separate from age)
- Session length preference
- Learning goals / motivation threads
- Challenge response profile (how they cope with being wrong)
- Dietary / cultural sensitivities

These can be revisited if the committed three prove insufficient.

## How to apply

- Any DB schema work on `profiles` or `learning_profiles` should include these columns.
- Any onboarding flow work should integrate the three new questions.
- Any prompt builder getting a round of tuning should accept these new fields (the eval harness fixture already does).
