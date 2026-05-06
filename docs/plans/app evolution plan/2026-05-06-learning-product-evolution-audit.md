# Learning Product Evolution Audit

**Date:** 2026-05-06  
**Status:** Draft planning audit  
**Branch:** `ux/emotional-retention-language`  
**Purpose:** Capture what is already in place, what needs changing, and how substantial each change is for the product direction discussed in the UX walkthrough.

---

## Product Direction

EduAgent should not feel like "AI tutor with setup screens." The stronger product promise is:

> Get unstuck now, use the knowledge actively, and still remember it later.

The core shift is from **setup-first tutoring** to **practice-coach learning**:

1. First turn teaches, not interviews.
2. Every session asks the learner to do something.
3. Progress proves retained ability, not just completion.
4. Structure appears after value is proven, not before.
5. User-provided material becomes an input layer over time.

---

## Size Key

| Size | Meaning |
| --- | --- |
| XS | Copy or test update only. |
| S | Single-surface UI change, little backend impact. |
| M | Multiple files or one route/service seam; normal tests needed. |
| L | Cross mobile/API behavior; routing, prompts, tests, and E2E affected. |
| XL | Product architecture change; data model, async jobs, routing, and prompt semantics may all shift. |

---

## What Is Already Shipped But Not Turned On

This is the third attempt at this product direction. Two prior attempts shipped end-to-end and remain in the codebase, but the old screens were never removed alongside them, so the user-visible app still runs the original flow.

**Prior attempts already in the codebase:**

1. **Conversation-First Learning Flow** (Epic 12.2, PR #115). The framing of the early conversation as a learning flow — not a setup form — landed as a real epic. Old onboarding screens were not removed.

2. **Teach-First** (TF-1 through TF-8). A full spec shipped including teach-first role identity in the system prompt, teach-first LEARNING session type guidance, teach-first client-side greeting text, and a relocated `Done` spec. Still active in `apps/api/src/services/session/session-exchange.ts` (first-exchange gating). Old onboarding screens were not removed.

3. **Fast Path Subject Onboarding** (`f9da2998` + `b830a735`). Bypass code exists and works. Defaulted **on** in dev/staging via `EXPO_PUBLIC_ONBOARDING_FAST_PATH`, **off in production**. The interview screen at `apps/mobile/src/app/(app)/onboarding/interview.tsx:176` still branches on this flag — when off (production), users walk through `interests-context` → `analogy-preference` → `accommodations` → `curriculum-review` exactly as before.

**Old onboarding screens still in `apps/mobile/src/app/(app)/onboarding/`:**

```
interview.tsx
analogy-preference.tsx
interests-context.tsx
accommodations.tsx
curriculum-review.tsx
pronouns.tsx
language-setup.tsx
```

All seven are live routes. Production users hit the long path.

**Implication for this plan**

The remaining work is mostly **retirement of old surfaces**, not invention of new ones. Treating Slice 1 as "build teach-first" is the failure mode of the previous two attempts. Slice 1 is "delete what teach-first and fast path were supposed to replace, and turn the bypass on by default."

---

## What Is Already In Place

### 1. Subject Creation And Classification

**Already in place**
- `create-subject` accepts free-form learner intent and sends `rawInput`.
- The resolver can return `direct_match`, suggestions, broad subjects, and focused subjects.
- Direct matches already create immediately without showing the suggestion card.
- Ambiguous / no-match cases preserve an explicit correction path (`Accept`, `Edit`, suggestion list).
- Broad subjects can still route to `pick-book`, preserving learner agency over scope.

**Important files**
- `apps/mobile/src/app/create-subject.tsx`
- `packages/schemas/src/subjects.ts`
- `apps/api/src/services/subject-classify.ts`

**Implication**
We should not rebuild subject creation from scratch. The classification layer is useful. The change should make confirmation lighter and make the next step feel like learning, not administration.

### 2. Fast-Path Onboarding Plumbing

**Already in place**
- `FEATURE_FLAGS.ONBOARDING_FAST_PATH` exists on mobile.
- In dev/staging-like environments it defaults on unless explicitly disabled; production defaults off.
- `interview.tsx` can route directly to `startFirstCurriculumSession` for non-language subjects.
- `language-setup.tsx` can route to session when fast path is on.
- API has `startFirstCurriculumSession`, which waits for first materialized curriculum topic and completed interview signals, then creates a `learning_sessions` row.
- First session metadata stores `onboardingFastPath.extractedSignals`.

**Important files**
- `apps/mobile/src/lib/feature-flags.ts`
- `apps/mobile/src/app/(app)/onboarding/interview.tsx`
- `apps/mobile/src/app/(app)/onboarding/language-setup.tsx`
- `apps/api/src/services/session/session-crud.ts`
- `apps/api/src/routes/sessions.ts`

**Implication**
The "bypass preference screens" portion is partly built. The bigger unresolved question is whether the first learner-visible interaction should still be the interview screen or should become the first tutoring session.

### 3. Interview Signal Extraction

**Already in place**
- The interview prompt has already moved away from the worst generic opener. It asks for one concrete fact / insight and one specific diagnostic question.
- Post-hoc extraction supports:
  - `goals`
  - `experienceLevel`
  - `currentKnowledge`
  - `interests`
  - `interestContext`
  - `analogyFraming`
  - `paceHint`
- `paceHint` is mechanically inferred server-side.
- Fast-path signals are passed into session prompt context.

**Important files**
- `apps/api/src/services/interview-prompts.ts`
- `apps/api/src/services/interview.ts`
- `packages/schemas/src/sessions.ts`
- `apps/api/src/services/exchange-prompts.ts`

**Implication**
We do not need to invent personalization extraction. It exists. The change is to make the learner experience feel like tutoring while preserving extraction in the background.

### 4. Mentor Session Pedagogy

**Already in place**
- The learning session prompt already says: explain clearly, use a concrete example, then ask one question to verify understanding.
- Age-aware voice tiers exist: early teen, teen, young adult, adult.
- Homework mode has different guidance: check answer / help me solve it.
- Retention-aware prompt guidance exists for strong/fading/weak/forgotten topics.
- Onboarding signals are inserted into the exchange prompt as "data only; use gently."
- Voice-mode and text-mode constraints exist.

**Important files**
- `apps/api/src/services/exchange-prompts.ts`
- `apps/api/src/services/session/session-exchange.ts`
- `apps/api/src/services/escalation.ts`

**Implication**
The Mentor posture is directionally aligned. The first session should reuse this rather than keep a separate diagnostic "setup" personality.

### 5. Active Practice Mechanics

**Already in place**
- Learning sessions ask verification questions.
- Assessment depth exists: recall -> explain -> transfer.
- Teach-back and evaluate session types exist.
- Practice hub exists.
- Recall test, relearn flow, quiz, dictation, recitation, and homework modes exist.
- Quiz and dictation have full multi-screen flows and result surfaces.

**Important files**
- `packages/schemas/src/assessments.ts`
- `apps/api/src/services/assessments.ts`
- `apps/api/src/services/verification-completion.ts`
- `apps/mobile/src/app/(app)/practice/*`
- `apps/mobile/src/app/(app)/topic/recall-test.tsx`
- `apps/mobile/src/app/(app)/topic/relearn.tsx`
- `apps/mobile/src/app/(app)/quiz/*`
- `apps/mobile/src/app/(app)/dictation/*`

**Implication**
EduAgent already has more active-practice machinery than the first-run UX reveals. The first-turn redesign should surface that strength immediately.

### 6. Progress, Retention, And Proof Surfaces

**Already in place**
- Progress tab shows global sessions, topics, vocabulary, growth history, milestones, subjects, and subject detail.
- Subject detail shows topic counts, time, sessions, vocabulary, language milestones, and retention status.
- Topic detail has recall/relearn paths and retention-derived CTAs.
- Parent surfaces already use "Understanding" and some plain-English retention labels.
- Session summaries, transcript view, bookmarks, and saved explanations exist.
- Snapshot aggregation and retention cards power the progress layer.

**Important files**
- `apps/mobile/src/app/(app)/progress/index.tsx`
- `apps/mobile/src/app/(app)/progress/[subjectId]/index.tsx`
- `apps/mobile/src/components/progress/*`
- `apps/mobile/src/components/library/RetentionPill.tsx`
- `apps/api/src/services/snapshot-aggregation.ts`
- `apps/api/src/services/dashboard.ts`
- `packages/schemas/src/progress.ts`

**Implication**
The data foundation for "proof I improved" exists, but much of the UI still speaks in completion/mastery/status language. This is a UI and product-framing project, not a total backend rebuild.

### 7. Bring-Your-Own-Material Foundations

**Already in place**
- Homework photo capture + OCR.
- Gallery import for homework photos.
- Manual fallback when OCR is weak.
- Image pass-through to multimodal LLM for homework.
- Dictation can start from pasted/photo-derived text.
- Notes, bookmarks, saved explanations, and library search over notes exist.
- Session transcript view exists.

**Important files**
- `apps/mobile/src/app/(app)/homework/camera.tsx`
- `apps/api/src/routes/homework.ts`
- `apps/api/src/services/ocr/*`
- `apps/api/src/services/exchanges.ts`
- `apps/api/src/routes/notes.ts`
- `apps/api/src/routes/bookmarks.ts`
- `apps/api/src/routes/library-search.ts`
- `apps/mobile/src/components/library/NoteInput.tsx`
- `apps/mobile/src/app/(app)/progress/saved.tsx`

**Not in place**
- PDF upload.
- YouTube / video transcript ingestion.
- Coursera / Udemy transcript ingestion.
- General document library.
- Turning arbitrary material into a durable course-like path with drills, projects, and recall checks.

**Implication**
BYO material is not starting from zero, but the current implementation is homework/photo/note-oriented, not a general "layer above courses."

---

## What Needs Changing

### A. Make The First Turn Teach, Not Interview

**Today**
- Subject creation leads into an onboarding interview screen.
- The interview prompt is better than before, but the screen still says "Set up," "Step 1 of 4," and "Why am I asking first?"
- The conversation is persisted in `onboarding_drafts`, not `learning_sessions`.
- The learner can still experience this as setup before learning.

**Desired**
- After subject confirmation, the first learner-visible turn should feel like tutoring:
  - one tiny explanation or example
  - one active prompt
  - no "I need to learn about you first" framing
- Diagnostic signals should be extracted from that learning interaction.

**Change size:** L to XL

**Why substantial**
- A true "first tutoring turn" means deciding whether the conversation belongs in `onboarding_drafts`, `learning_sessions`, or both.
- Curriculum materialization currently depends on completed interview drafts.
- The first session needs a topic/curriculum anchor, but the learner should not wait on visible setup.

**Likely implementation options**
1. **M-sized pre-warm:** Trigger curriculum materialization from the `create-subject` mutation (not from `onboarding_drafts.completed`), so by the time the learner finishes turn 1, `topicId` is usually ready. Keeps interview backend; reframes interview screen as first practice. Cheapest unlock for the time-to-first-prompt budget. **Required precondition for Section E's timing — without pre-warm, the path preview at session-end risks showing a placeholder.**
2. **L-sized bridge:** Option 1 + restyle the interview screen as "warm first practice" and fast-path to session after 1-2 active turns.
3. **XL architecture:** Merge interview and first tutoring turn into `learning_sessions`, then run signal extraction and curriculum materialization from the session transcript. Drops the `extractedSignals` requirement from `startFirstCurriculumSession` (`session-crud.ts:223-324` — currently waits up to 25s for both `topicId` and `extractedSignals`).

**Latency floor today**
`startFirstCurriculumSession` polls every 750ms for up to 25s, blocking until both `topicId` exists *and* `onboarding_drafts.status = 'completed'` with parsed `extractedSignals`. The 25s wait alone can blow any sub-30s time-to-first-prompt budget; option 1 (pre-warm) is what makes the budget reachable without the XL rewrite.

**Recommendation**
Start with options 1 + 2 (pre-warm + bridge) unless we deliberately schedule the architecture work. It gets the product feeling right sooner and preserves existing curriculum/draft machinery.

### B. Make First Win Happen Within 30 Seconds

**Today**
- The first useful educational moment may happen in the interview, but it is wrapped in setup UI.
- After two interview turns, the user may still hit another setup screen if fast path is off.

**Desired**
- The first visible response should create a small win:
  - "Io sono means I am. What do you think you are is?"
  - "A fraction is a part of a whole. Which is bigger: 3/4 or 2/3?"
- The learner should answer/solve/explain before seeing any preferences.

**Change size:** M to L

**Why substantial**
- Prompt/copy changes are moderate.
- Guaranteeing the flow always reaches a learning prompt quickly needs E2E coverage and timeout/error behavior.

**Recommendation**
Define this as the primary acceptance criterion for the next PR.

### C. Keep Subject Confirmation, But Make It Lighter

**Today**
- Direct matches skip confirmation.
- Other resolved cases show a full suggestion card with `Accept` and `Edit`.
- The card reads like approval of the classifier rather than momentum into learning.

**Desired**
- Keep correction control.
- For confident single suggestions, use lighter copy:
  - "We'll start with Italian - Verb conjugation."
  - Primary CTA: "Start"
  - Secondary CTA: "Change"
- For ambiguous / no-match cases, keep heavier clarification.

**Change size:** S to M

**Why not huge**
- Mostly mobile UI/copy and tests in `create-subject`.
- Backend classification can stay intact.

### D. Defer Preference Collection

**Today**
- `analogy-preference`, `interests-context`, `accommodations`, and `curriculum-review` still exist.
- Fast path can bypass them when enabled.
- Settings affordance for "Tell the Mentor how you learn best" is not clearly in place as a replacement.
- Accommodations persistence and migration need investigation before deletion.

**Desired**
- No metacognitive preference screens in required per-subject onboarding.
- Preferences become opt-in settings or post-session adjustments.
- Accommodations remain parent/profile-level and careful.

**Change size:** M for bypass, L for cleanup/deletion

**Why substantial**
- Bypass is already mostly implemented.
- Deleting screens safely requires:
  - settings replacement
  - i18n cleanup
  - E2E updates
  - accommodations data audit
  - rollback plan

**Recommendation**

Bypass first, then delete — but with a hard deletion trigger this time. The two prior attempts (Conversation-First, Teach-First) bypassed without ever deleting, which is why this is the third attempt.

Concrete trigger: **delete `interview.tsx`, `analogy-preference.tsx`, `interests-context.tsx`, `accommodations.tsx`, and `curriculum-review.tsx` no later than 14 days after Wave 3 ships.** If the replacement settings surface (post-session adjustments + opt-in preferences in `more.tsx`) is not ready by then, Wave 3 does not ship — the work waits until the deletion PR can land in the same milestone. "Bypass now, delete later" without a date is the failure mode this plan is specifically trying to avoid.

Accommodations data audit (parent/profile-level migration) is part of the deletion PR, not a blocker on bypass.

### E. Show Structure After The First Win

**Today**
- Curriculum generation exists.
- `curriculum-review` can show the plan as a separate setup step.
- Library/progress show topics and books after creation/progress.
- The first learning session does not clearly say: "Here is the path I am setting up."

**Desired**
- At the end of the first session, show a lightweight path preview as part of the recap:
  - "I'll build this as: present tense -> irregulars -> sentence practice -> mixed recall."
- A soft "next time we'll start with X" teaser surfaces at second-session open.
- The learner gets structure after value, not before. One answer is not value — a completed session is.
- Parent/adult users can inspect the path in Library/Progress at any point.

**Why not "after the first active answer"**
- One answer gives near-zero behavioral signal.
- Curriculum may not be fully materialized yet (see Section A — without pre-warm, materialization can race the first answer). Promising a path the system doesn't have is the "AI tutor with setup screens" feel we are removing.
- This timing depends on Section A option 1 (pre-warm) shipping first; without it, the recap may show a placeholder.

**Change size:** M to L

**Why substantial**
- Primary surface is the existing `session-recap` block — extends a built surface rather than inventing one.
- Secondary surface is second-session open teaser.
- Backend curriculum already exists, but the "path promise" copy and recap integration are missing.

### F. Make Active Practice The Default Product Behavior

**Today**
- The session prompt already says explain -> verify -> next concept.
- Quiz, dictation, recall, relearn, teach-back, and evaluate flows exist.
- Some first-turn guidance still says "fun fact" and "invite conversation," which can become chatty rather than active.

**Desired**
- Every learning session includes an action:
  - answer
  - solve
  - explain back
  - compare
  - debug
  - apply
  - recall
- The first turn should not be passive exposition.

**Change size:** M

**Why moderate**
- Core mechanics exist.
- The change is mainly prompt policy, eval harness coverage, and UI acceptance checks.

**Recommendation**
Add a prompt/eval rule: first learning response must end with exactly one learner action, unless answering an urgent direct question.

### G. Turn Progress Into Proof Of Improvement

**Today**
- Progress uses topics mastered, sessions, vocabulary, growth, milestones, retention cards, and subject stats.
- Some language is still metric/gradebook-like: mastered, retention, status, weak/fading/forgotten.
- The data can show review timing and remembered concepts, but the UI rarely says "you remembered this after X days."

**Desired**
- Progress answers: "Am I actually getting better?"
- Use human proof:
  - "You remembered this after 9 days."
  - "This one is getting fuzzy."
  - "You can now do X without help."
  - "Quick refresh today, then you are back on track."

**Change size:** M for first slice, L for full progress redesign

**Why substantial**
- Label replacement is easy.
- Proof of retained ability may require:
  - richer API fields
  - topic-level deltas
  - "before/after" comparisons
  - delayed recall outcomes surfaced in Progress

**Recommendation**
Do not let vocabulary work consume the project. Treat emotional retention language as a thin UI layer, then separately design proof cards.

### H. Bring-Your-Own-Material As A General Learning Layer

**Today**
- Homework photo/OCR and notes/bookmarks exist.
- Dictation can use photo/text.
- No general upload/link/transcript ingestion.

**Desired**
- Learner can paste/upload/link material and EduAgent turns it into:
  - questions
  - explanations
  - drills
  - projects
  - recall checks
  - study plan

**Change size:** XL

**Why substantial**
- Requires ingestion, parsing, storage, source attribution, chunking, retrieval, safety/privacy, and product surfaces.
- PDFs and video transcripts bring new file/storage/security concerns.

**Recommendation**
Do not bundle this with onboarding. Treat as a later major spec. Existing homework/OCR is the wedge.

### I. Projects Or Real Outputs

**Today**
- The product has exercises, quizzes, dictation, recall, and homework.
- It does not yet guide learners toward durable artifacts like essays, apps, portfolios, mock certifications, or language conversation milestones.

**Desired**
- Serious learners can produce proof:
  - build a small app
  - write an essay
  - pass a mock exam
  - hold a language conversation
  - solve exam-style problems
  - prepare a portfolio artifact

**Change size:** XL

**Recommendation**
This is course-replacement territory. Keep it as long-term strategy, not near-term onboarding work.

---

## What Should Not Be Redone

- Do not rename internal schemas/enums just to make UI copy warmer.
- Do not remove `Accept/Edit`; make it lighter.
- Do not add a syllabus screen before the first win.
- Do not delete old onboarding screens until the settings/post-session replacement exists.
- Do not rebuild retention, assessments, quiz, dictation, homework OCR, or progress aggregation from scratch.
- Do not turn this into a pure vocabulary/copy project. Copy matters, but the main product problem is time-to-first-learning.
- **Do not re-spec teach-first or conversation-first.** Both shipped end-to-end (Epic 12.2 and TF-1..TF-8). The remaining work is to retire the old screens that still run alongside them, not to design new prompt rules. If a Wave 1 PR description starts with "make the first turn teach-first," it is mis-scoped — that work is already done. The PR's job is to make the existing teach-first prompts the only thing the user can encounter.

---

## Recommended Sequencing

### Slice 1 — First-Turn Learning (milestone, not single PR)

**Goal:** "Start Learning" actually starts learning.

This slice ships as a milestone of small PRs, not one large PR. Each PR is independently revertible. PRs marked "parallel" share no source files and can be picked up by separate workers in the same session.

| # | Change | Surface | Size | Depends on | Parallel-safe with |
| --- | --- | --- | --- | --- | --- |
| 5a | Lighter subject confirmation copy | `create-subject.tsx`, tests | XS | — | 5b, 5d, 5g |
| 5b | First-turn prompt rule + eval baseline | `interview-prompts.ts` or `exchange-prompts.ts`, eval harness | S | — | 5a, 5d, 5g |
| 5d | Pre-warm curriculum on subject create | `subject-classify.ts` / Inngest trigger | M | — | 5a, 5b, 5g |
| 5g | `language-setup` reframe + locale default | `language-setup.tsx`, i18n | S | — | 5a, 5b, 5d |
| 5c | Default `ONBOARDING_FAST_PATH` on for staging | `feature-flags.ts` | XS | 5d (else 25s wait exposes to users) | 5e |
| 5e | Bypass analogy/interests/accommodations/curriculum-review | mobile routing | M | 5b (prompt rule must hold before bypass) | 5c |
| 5f | E2E: create-subject → first active prompt, language + non-language | Maestro/Playwright | M | all of 5a-5e | — |

**Wave plan**
- **Wave 1 (parallel):** 5a, 5b, 5d, 5g.
- **Wave 2 (parallel):** 5c, 5e.
- **Wave 3:** 5f.

**Acceptance criteria for the milestone**
- P50 time-to-first-active-prompt drops by at least 40% versus a measured baseline captured before Wave 1 begins. (Replaces the earlier "30 seconds" target — that number was unmeasured.)
- For non-language subjects: first visible mentor turn teaches one concrete idea and asks one focused learner action.
- For language subjects: `language-setup` calibration retained (native + CEFR are not preferences, they are the floor for coherent first turns), but reframed as quick calibration rather than "Step 2 of 4." First mentor turn after `language-setup` must satisfy the same teach-and-act rule as non-language.
- No analogy, accommodations, interests-context, or curriculum-review screen appears before the first learning prompt for either path.
- Subject classification correction path remains.
- Eval harness baseline updated for the new first-turn prompt rule.
- **File-count guardrail:** the milestone is not complete until the file count under `apps/mobile/src/app/(app)/onboarding/` drops by at least four (the four screens listed in Section D's deletion trigger). Performance and UX criteria can pass while the old screens remain on disk — that is exactly how the prior two attempts ended. If the deletion PR has not landed within 14 days of Wave 3, Slice 1 has not succeeded regardless of how the new flow feels in staging.

### Slice 2 — Post-First-Win Path Preview

**Goal:** Give structure after value.

Includes:
- first-session or post-turn plan preview
- Library/subject shelf path clarity
- Progress subject detail starts showing "what you can do next"

**Size:** M to L

### Slice 3 — Progress Proof Language

**Goal:** Progress feels like retained ability, not gradebook metrics.

Includes:
- memory-status labels
- proof cards / remembered-after-X-days copy
- parent/learner vocabulary boundary

**Size:** M for labels; L for proof cards

### Slice 4 — Bring-Your-Own-Material Expansion

**Goal:** Make EduAgent the layer above courses and notes.

Includes:
- paste/upload/link material
- source handling
- generated drills and recall plan

**Size:** XL

### Slice 5 — Real Output / Course Replacement Tracks

**Goal:** Support artifacts and capability proof.

Includes:
- projects
- mock exams
- portfolio outputs
- language conversation milestones

**Size:** XL

---

## First Wave PR Candidates

The "First PR" framing has been replaced by Slice 1's milestone (above). Wave 1 ships four parallel PRs. Each carries its own user story and acceptance criteria so they can be reviewed independently.

### 5a — Lighter subject confirmation copy

**User story:** When my subject is confidently classified, I want a single-tap "Start" rather than an "Accept / Edit" approval screen, so the moment feels like momentum into learning.

**Acceptance**
- Confident single-suggestion case shows "We'll start with [subject]." with primary `Start` and secondary `Change`.
- Ambiguous and no-match cases keep the heavier clarification card.
- Direct-match path is unchanged (already skips confirmation).

### 5b — First-turn prompt rule + eval baseline

**User story:** When I read the first mentor message, I want to learn one concrete thing and be asked to do something with it, so the app feels like a tutor, not an intake form.

**Acceptance**
- Prompt rule added: first learning response must teach exactly one concrete idea and end with exactly one learner action, unless answering an urgent direct question.
- Eval harness Tier 1 snapshot captures the new rule. Tier 2 (`pnpm eval:llm --live`) confirms the rule holds against real LLM responses for the existing scenario matrix.

### 5d — Pre-warm curriculum on subject creation

**User story:** When I create a subject, I want the curriculum to start materializing immediately, so the first session does not stall waiting for setup.

**Acceptance**
- Subject creation triggers curriculum materialization Inngest job before interview turns begin.
- `startFirstCurriculumSession`'s 25s wait is rarely hit on the staging happy path (measure both before and after).
- No change to ownership/profile-scoping invariants — curriculum still belongs to the subject's profile.

### 5g — `language-setup` reframe + locale default

**User story:** When I pick a language subject, I want the calibration step to feel like a quick check rather than another setup screen, so the first mentor turn arrives fast.

**Acceptance**
- Native language pre-selects from device locale (Norwegian device → `nb` preselected, single tap to confirm or change).
- Step indicator and "Step 2 of 4" copy removed; framed as quick calibration.
- First mentor turn after submission satisfies the 5b rule.

**Likely verification (per PR)**
- `pnpm exec jest --findRelatedTests <changed files> --no-coverage`
- `pnpm exec nx run api:typecheck`
- `cd apps/mobile && pnpm exec tsc --noEmit`
- For 5b/5d: `pnpm eval:llm` (Tier 1) and `pnpm eval:llm --live` (Tier 2) where prompt or context inputs change.
- Wave 3 only: Maestro/Playwright journey for create-subject → first active prompt, both language and non-language paths.

