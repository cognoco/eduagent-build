# Learning Product Evolution Audit

**Date:** 2026-05-06
**Status:** Draft planning audit
**Branch:** `ux/emotional-retention-language`
**Purpose:** Capture what is already in place, what needs changing, and how substantial each change is for the product direction discussed in the UX walkthrough.

---

## Product Direction

MentoMate should not feel like "AI tutor with setup screens." The stronger product promise is:

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
MentoMate already has more active-practice machinery than the first-run UX reveals. The first-turn redesign should surface that strength immediately.

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

> **Verification pass (2026-05-06):** Every "Today" claim below was re-checked against the actual codebase. Most original claims understated what is already shipped — the dominant pattern across this repo is "built and present, but not user-visible because the surface is gated, the UI doesn't render the data, or the deletion of an old surface never happened." Sizes have been adjusted accordingly. The genuine net-new work in this plan is much smaller than the first draft suggested.

## What Needs Changing

### A. Make The First Turn Teach, Not Interview

**Today (verified)**
- Subject creation leads into an onboarding interview screen. Interview screen still uses "Step 1 of 4" framing.
- The fast-path session transition, 25s polling loop, signal extraction from interview, and full session-streaming branch in `interview.tsx` (lines 89–102, 520–563) are **all built and tested**. They are in the bundle but never reached in production because `ONBOARDING_FAST_PATH` is `false` there.
- The conversation is persisted in `onboarding_drafts`, not `learning_sessions`. Signal extraction (`interview.ts → extractSignals`) reads from in-process `ExchangeEntry[]`, not from a `learning_sessions` transcript.
- **Pre-warm is genuinely missing.** `interview-persist-curriculum.ts` is only dispatched after the full interview completes (from `routes/interview.ts`). `subjects.ts` emits zero curriculum events. No `materialize-*` Inngest function exists outside the post-interview path.

**Desired**
- After subject confirmation, the first learner-visible turn should feel like tutoring (one tiny explanation, one active prompt, no "I need to learn about you first" framing).
- Diagnostic signals should be extracted from that learning interaction.

**Change size:** **M** (was: L to XL — overstated)

**Why moderate, not substantial**
- The teach-first prompt rule, fast-path routing code, signal extraction, and session transition are already built. The audit's first draft mistook "shipped but flag-gated off in prod" for "needs to be built."
- The only genuinely new code is **pre-warm** — wire `subjects.ts` (or the `create-subject` mutation) to dispatch curriculum materialization on subject creation, not on interview completion.
- The XL "merge interview into `learning_sessions`" architecture is genuinely not started, but is no longer required for Slice 1 — the fast-path bypass plus pre-warm achieves the product feeling without it.

**Recommendation**
Ship pre-warm + flip `ONBOARDING_FAST_PATH` default to on in production. That is the work. The "L bridge" and "XL architecture" options from the original audit are no longer in scope for this slice.

### B. Make First Win Happen Within 30 Seconds

**Today (verified)**
- **The first-turn prompt rule is already enforced.** `exchange-prompts.ts` (lines 449–469) and `interview-prompts.ts` (lines 8–27, `INTERVIEW_SYSTEM_PROMPT`) both require: open with one concrete fact/insight, then ask one focused question. This is unconditional — not flag-gated.
- The reason the first win does not feel like a win in production is the fast-path bypass not firing (Section A) and the chatty fun-fact opener at exchange `count === 0` (Section F), not a missing prompt rule.
- **Time-to-first-prompt telemetry is genuinely missing.** Zero matches for `time_to_first`, `first_token_latency`, `ttfp`, or any `first_prompt_latency` metric. There is no baseline to measure against. The "30 seconds" target in the original audit was unmeasurable as written.

**Desired**
- The first visible response should create a small win the learner can answer/solve/explain before seeing any preference screen.
- A measurable baseline for time-to-first-active-prompt exists.

**Change size:** **M** (was: M to L — telemetry is the only real lift)

**Why moderate**
- Prompt rule shipped.
- Net-new: emit a `time_to_first_active_prompt` metric at session-create → first-token boundary, capture a 7-day staging baseline before Wave 1 begins.

**Recommendation**
Add the telemetry hook in Wave 1, capture baseline, then make "P50 drop ≥ 40%" the milestone acceptance criterion (already in Slice 1's acceptance list).

### C. Keep Subject Confirmation, But Make It Lighter

**Today (verified)**
- `direct_match` already calls `doCreate()` immediately and skips the suggestion card (`create-subject.tsx` line 252).
- All other resolved cases (`corrected`, `resolved`) hit the same Accept/Edit JSX (lines 808–855), regardless of resolver confidence.
- **Backend gap:** `SubjectResolveResult` (`packages/schemas/src/subjects.ts` lines 95–106) has no `confidence` field. The classify endpoint carries per-candidate confidence floats; the resolve endpoint exposes only `status`, `resolvedName`, `focus`, `focusDescription`, `suggestions`, `displayMessage`. The mobile client cannot vary copy by confidence without a backend schema addition first.

**Desired**
- For confident single suggestions, lighter copy ("We'll start with Italian — Verb conjugation," primary `Start`, secondary `Change`).
- Ambiguous / no-match cases keep heavier clarification.

**Change size:** **S to M** (unchanged, but with the schema dependency surfaced)

**Why not huge**
- Mostly mobile UI/copy and tests in `create-subject`.
- Add a `confidence: number` (or `isHighConfidence: boolean`) field on `SubjectResolveResult`, populated from the existing classify result. This is a tiny backend change but a real one — not pure mobile/copy work as the original audit implied.

### D. Defer Preference Collection

**Today (verified — original audit substantially understated this)**
- `analogy-preference`, `interests-context`, `accommodations`, `curriculum-review` still exist as routes (`onboarding/_layout.tsx` lines 23–26).
- Fast path bypasses them when the flag is on.
- **The "settings replacement" the original audit said was "not clearly in place" is shipped in three locations:**
  - `more.tsx` (lines 561–585) renders the `LearningModeOption` accommodations selector, backed by `useUpdateAccommodationMode()` — same endpoint the onboarding screen uses.
  - `subject/[subjectId].tsx` (lines 26, 109–115) renders `AnalogyDomainPicker` with `useAnalogyDomain()` per-subject.
  - `mentor-memory.tsx` (both learner and parent variants) renders `TellMentorInput`, backed by `tellMentorInputSchema` in `packages/schemas/src/learning-profiles.ts`.
- Accommodations is already profile-level (not per-subject), so no migration is required to delete the per-subject onboarding screen.
- **Genuinely missing:** a *post-session adjustment* prompt — no Inngest function, no recap UI slot, no hook for "want me to use more analogies next time?" `post-session-suggestions.ts` generates topic suggestions, not style adjustments.

**Desired**
- No metacognitive preference screens in required per-subject onboarding.
- Preferences live in opt-in settings (already exist) and post-session adjustments (genuinely new — small).

**Change size:** **S for bypass, M for cleanup/deletion + post-session prompt** (was: M / L — overstated)

**Why moderate, not substantial**
- Bypass is essentially a flag flip.
- Deletion has fewer prerequisites than the original audit assumed: settings replacement is already live in three surfaces; accommodations doesn't need a data migration.
- The only net-new build is the post-session "adjust style" prompt + recap slot — small, optional, and doesn't block the deletion.

**Recommendation**

Bypass first, then delete — but with a hard deletion trigger this time. The two prior attempts (Conversation-First, Teach-First) bypassed without ever deleting, which is why this is the third attempt.

Concrete trigger: **PR 5h** (see Slice 1 sequencing table) deletes `interview.tsx`, `analogy-preference.tsx`, `interests-context.tsx`, `accommodations.tsx`, and `curriculum-review.tsx` **no later than 14 days after Wave 3 ships.** Owner assigned before Wave 1 begins. If 5h has not landed by deadline, Slice 1 is incomplete (see acceptance criteria → file-count guardrail). "Bypass now, delete later" without a named PR and a date is the failure mode this plan is specifically trying to avoid.

Accommodations data audit (parent/profile-level migration) is part of the deletion PR, not a blocker on bypass.

### E. Show Structure After The First Win

**Today (verified — original audit significantly understated this)**
- **The post-session "next topic" recap card is already shipped end-to-end.** API generates `nextTopicId`, `nextTopicTitle`, `nextTopicReason` via LLM (`session-recap.ts` lines 33–34, 79, 107–125, 387–388). Schema fields exist on `sessionSummarySchema` (`packages/schemas/src/sessions.ts` lines 426–428). Mobile renders `session-next-topic-card` at `session-summary/[sessionId].tsx` lines 1034–1074 with title, reason, and a "Continue learning" CTA. The reason is also fed back into the next session's system prompt via `session-context-builders.ts` line 324.
- **`topicOrder` (the ordered topic id list, ready for "present tense → irregulars → ...") is computed and present in the API response** (`apps/api/src/services/curriculum.ts` line 1473, schema at `packages/schemas/src/subjects.ts` line 333). **The mobile client does not consume it anywhere** — zero references in mobile source. Wiring it to an ordered-list view in the recap is small.
- **Genuinely missing:** the home / dashboard "next time we'll start with X" teaser at second-session open. No hook, no payload field, no component. `dashboard.tsx` and `snapshot-aggregation.ts` produce no teaser data.

**Desired**
- The recap surfaces the upcoming path (e.g., "I'll build this as: present tense → irregulars → sentence practice → mixed recall"), populated from `topicOrder`.
- A soft pre-session teaser at second-session open.
- Parent/adult users can inspect the path in Library/Progress at any point.

**Why not "after the first active answer"**
- One answer gives near-zero behavioral signal. Curriculum may not be fully materialized yet without Section A's pre-warm.

**Change size:** **S to M** (was: M to L — overstated)

**Why moderate, not substantial**
- The recap card surface, the LLM-generated next-step copy, and the backend ordered-topic list are all already shipped.
- Net-new work: render `topicOrder` as an ordered-list view inside the existing recap card; add a small home-screen teaser hook + payload field for the second-session-open case.

### F. Make Active Practice The Default Product Behavior

**Today (verified)**
- The "explain → verify → next concept" cycle is in `getSessionTypeGuidance` (`exchange-prompts.ts` line 158).
- **The chatty fun-fact opener is unconditional, not a leftover.** `exchange-prompts.ts` lines 455–468 fire on every `exchangeCount === 0 && sessionType === 'learning' && !isLanguageMode && !isRecitation` turn: *"Open with a surprising or fun fact about it to spark curiosity, then invite them into the conversation..."* No flag gates this. Removing it is a prompt edit.
- Quiz, dictation, recall, relearn, teach-back, evaluate flows exist as standalone screens but **have no inline trigger from the chat session.** The Practice hub (`/(app)/practice/index.tsx`) is a separately navigated screen. The session screen has no "ask for a quiz" or "switch to practice mode" button.
- **Eval rule for "ends with exactly one learner action" is genuinely missing.** Zero matches in `eval-llm/` for `endsWith`, `exactly one`, `learner action`, or `actionCount`. The harness tracks `understandingCheck` signal *distribution*, not per-response structural assertion.
- **`evaluate` and `teach_back` paths still emit JSON blocks in free text** (`exchange-prompts.ts` lines 687–722, marked `TODO: EVAL-MIGRATION`). They have not been migrated to `signals.evaluate_assessment` / `signals.teach_back_assessment` envelope fields.

**Desired**
- Every learning session includes an action (answer/solve/explain back/compare/debug/apply/recall).
- The first turn is not passive exposition.

**Change size:** **M** (unchanged)

**Why moderate**
- Net-new work: edit the fun-fact prompt block to require an active opening; add eval assertion for "first reply ends with one learner action"; optionally add inline practice-mode CTAs to the chat session.
- Bonus opportunity: clean up the EVAL-MIGRATION TODOs while in the prompt files.

**Recommendation**
Add a prompt/eval rule: first learning response must end with exactly one learner action, unless answering an urgent direct question. Remove the unconditional fun-fact opener.

### G. Turn Progress Into Proof Of Improvement

**Today (verified — original audit understated this; data plumbing is largely done)**
- **Topic-level deltas are already computed and present in the API:** `weeklyDeltaTopicsMastered`, `weeklyDeltaVocabularyTotal`, `weeklyDeltaTopicsExplored` (`packages/schemas/src/progress.ts` lines 266–269). They are rendered **only on the parent dashboard** (`ParentDashboardSummary.tsx` lines 237–256, `child/[profileId]/index.tsx` lines 389–403). The learner-facing progress screen does not consume any of these fields.
- **`daysSinceLastReview` is computed and reaches the LLM as retention context** (`exchange-prompts.ts` lines 604–606: `last reviewed N day(s) ago`). It does not reach any UI label. `RetentionPill.tsx` and `RetentionSignal.tsx` show static enum strings only — no elapsed-days branch and no commented-out one.
- **`retentionCardsDue / Strong / Fading` is computed in `snapshot-aggregation.ts`** (lines 398–415) and present in `progressMetricsSchema`. The learner UI does not surface "you remembered this after X days" copy from any of these fields.
- **Spaced-recall infrastructure is fully shipped and running.** `recall-nudge.ts` is an hourly Inngest cron; `recall-nudge-send.ts` delivers push notifications. They send pushes but do not produce an in-app proof card.
- `GrowthChart.tsx` exists and renders cumulative bar charts (topics mastered + vocabulary growth). No "before/after" or topic-level delta component exists.

**Desired**
- Progress answers: "Am I actually getting better?" with human proof copy ("You remembered this after 9 days," "This one is getting fuzzy," "Quick refresh today, then you are back on track").

**Change size:** **M** (was: M for first slice + L for proof cards — the L was based on assuming the data layer was missing; it isn't)

**Why moderate**
- The data layer is done. This is primarily a **UI exposure** project.
- Net-new work: pass `daysSinceLastReview` into `RetentionPill` and `RetentionSignal` and add a "remembered after N days" / "getting fuzzy after N days" branch; render `weeklyDelta*` fields on the learner progress screen (component already runs on the parent side); design and ship one new "proof card" component using the shipped retention metrics.
- Removing the residual gradebook-style copy is plain string work.

**Recommendation**
Treat Slice 3 as exposure, not redesign. Do not let it grow into a Progress tab redo.

### H. Bring-Your-Own-Material As A General Learning Layer

**Today (verified — the "XL" sizing is correct)**
- **OCR and multimodal pass-through are already provider-abstracted and not homework-coupled.** `apps/api/src/services/ocr.ts` exposes `OcrProvider` / `GeminiOcrProvider` / `StubOcrProvider` taking only `ArrayBuffer + mimeType`. `exchanges.ts` `ImageData` (line 73) and `buildUserContent()` (line 78) accept image input on `streamMessage` / `streamExchange` regardless of caller. The wedge for re-using OCR + multimodal LLM on non-homework inputs is shorter than the audit implied.
- **No object storage exists.** `apps/api/wrangler.toml` has zero `[[r2_buckets]]` blocks. Images today flow as base64 in request bodies. PDF / general document upload requires net-new R2 setup.
- **PDF / YouTube / transcript / general document ingestion confirmed missing.** Zero references to `pdf`, `pdf-parse`, `youtube`, `.vtt`, or video-transcript tooling. `transcript-purge-cron.ts` handles session transcript cleanup, not ingestion. Notes are scoped to `topicId`, bookmarks to `sessionId/eventId`. No `Material`, `Document`, `Source`, or `Asset` schema in `packages/schemas/`.

**Desired**
- Learner can paste/upload/link material and MentoMate turns it into questions / explanations / drills / projects / recall checks / study plan.

**Change size:** **XL** (confirmed)

**Why substantial**
- Net-new infrastructure: R2 bucket + multipart upload + PDF parser + (eventually) transcript fetcher + a `material` / `document` schema + library surface.
- Existing OCR + multimodal pass-through is the wedge — but does not reduce the storage / parsing / retrieval scope.

**Recommendation**
Do not bundle with onboarding. Slice 4 only.

### I. Projects Or Real Outputs

**Today (verified — original audit understated milestone work; project/essay gap is real)**
- **Milestone tracking is fully shipped, not partial.** `packages/schemas/src/snapshots.ts` lines 129–140 define `milestoneTypeSchema` with 9 values: `vocabulary_count`, `topic_mastered_count`, `session_count`, `streak_length`, `subject_mastered`, `book_completed`, `learning_time`, `cefr_level_up`, `topics_explored`. `apps/api/src/services/milestone-detection.ts` runs detection through `session-completed` Inngest. Thresholds defined and live. `cefr_level_up` is wired with a dedicated `/subjects/:subjectId/cefr-progress` route. `apps/mobile/src/app/(app)/progress/milestones.tsx` exists. Achievement set (`evaluate_success`, `teach_back_success`, `streak_7`, `streak_30`, `curriculum_complete`) is delivered in the session completion response.
- **`book_completed` is in the milestone enum but has no detection branch.** Schema-without-logic — fires never.
- **Essays / portfolios / projects / artifacts confirmed missing.** "essay" appears only in one prompt string ("Teens want speed, not essays"). No essay evaluation, no portfolio schema, no project session mode. `assessmentSchema.verificationDepth` is `recall | explain | transfer` only. No `evaluate-essay`, `grade-project`, or similar Inngest functions. Practice hub has 6 cards; none project-shaped.

**Desired**
- Serious learners can produce proof: small app, essay, mock exam, language conversation, exam-style problems, portfolio artifact.

**Change size:** **L to XL** (was: XL — milestone tracking already provides the conversation/CEFR/streak side; project/essay is the remaining XL)

**Recommendation**
- **Quick win in scope before Slice 5:** wire the `book_completed` detection branch — schema field exists, just no logic behind it.
- The conversation-milestone / CEFR / streak / subject-mastery facets of "proof" are already delivered via milestones; the remaining gap is artefact production (essays, projects, portfolios).
- Keep the artefact side as long-term strategy.

### J. Match First Topic To Learner Intent

**Today (verified)**
- The "first curriculum session" entry — the only path used directly after onboarding — strips topic-grain intent before it leaves the mobile client. `firstCurriculumSessionStartSchema` (`packages/schemas/src/sessions.ts` lines 248–251) is `sessionStartSchema.omit({ subjectId: true, topicId: true, metadata: true, rawInput: true }).extend({ bookId: z.string().uuid().optional() })`. The route at `apps/api/src/routes/sessions.ts:127-175` accepts only `bookId`, no `topicId`.
- Server-side, `findFirstAvailableTopicId` (`apps/api/src/services/session/session-crud.ts:249`) picks the first topic by `sortOrder`. There is no matcher between the learner's original `rawInput` (e.g., "how are chemical reactions created") and the materialized topic list. Whatever sits at `sortOrder=1` is the first turn's topic, regardless of intent.
- `SubjectResolveResult` (`packages/schemas/src/subjects.ts` lines 95–106) carries `name`, `focus`, `focusDescription` — no `topicHint`. The classifier knows the learner's free-form intent at create time but never propagates a topic-grain hint forward.
- Every other tutoring entry preserves topic intent: Guided Learning starts from a tapped topic row; Practice/Review starts from Topic Detail; Retention Relearn starts from a fading topic; Homework sets topic via filing post-hoc; Recitation is topic-agnostic by design. Only the first-curriculum path loses the signal.
- **Adjacent data-layer anomaly worth flagging:** Retention Relearn does not flow through the canonical `startSession` service. `apps/api/src/services/retention-data.ts:858-873` inserts directly into `learning_sessions` with `metadata: { effectiveMode: 'relearn' }`. Any topic-routing/intent-matching logic added to `startSession` will silently miss this code path unless explicitly extended. Not a topic-matching issue per se, but the next person who edits session-start logic needs to know.

**Desired**
- When a learner creates a subject with a topic-grain prompt ("how are chemical reactions created", "verb conjugation in Italian", "the Battle of Hastings"), the first turn lands on a topic that matches that prompt — not on whichever topic ended up first by sort order.
- Ambiguous / non-topic-grain inputs ("Chemistry", "Italian", "History") still land on the curriculum's intended starting point. The behavior change is for the topic-grain case.

**Change size:** **M**

**Why moderate**
- Net-new work: (a) add an optional `topicHint` field to `SubjectResolveResult` (and to the `create-subject` mutation payload that flows into curriculum materialization); (b) extend `firstCurriculumSessionStartSchema` to accept an optional `topicId` OR `topicHint`; (c) replace `findFirstAvailableTopicId` with an intent-aware matcher that scores materialized topics against the original `rawInput` (cheap LLM call or embedding similarity, both already in the stack); (d) fall back to the existing `sortOrder` pick if no match clears a confidence floor.
- Eval surface is small: snapshot the topic chosen for ~10 representative `rawInput` strings against a known curriculum and assert the expected match. Fits naturally in `apps/api/eval-llm/`.
- The relearn direct insert (above) is not a blocker for this slice — it does not consume `findFirstAvailableTopicId` — but it should be called out in the implementation PR description.

**Recommendation**
Bundle into Slice 1 as PR 5i (parallel-safe with Wave 2). "First turn lands on the right topic" is part of the same product promise as "first turn teaches" — without it, a learner who typed "chemical reactions" gets taught about something else first, undoing the teach-first win.

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
| 5b | First-turn prompt rule + eval baseline + remove fun-fact opener | `interview-prompts.ts`, `exchange-prompts.ts`, eval harness | S | — | 5a, 5d, 5g |
| 5d | Pre-warm curriculum on subject create | `subject-classify.ts` / Inngest trigger | M | — | 5a, 5b, 5g |
| 5g | `language-setup` reframe + locale default | `language-setup.tsx`, i18n | S | — | 5a, 5b, 5d |
| 5c | Default `ONBOARDING_FAST_PATH` on for staging | `feature-flags.ts` | XS | 5d (else 25s wait exposes to users) | 5e |
| 5e | Bypass analogy/interests/accommodations/curriculum-review | mobile routing | M | 5b (prompt rule must hold before bypass) | 5c |
| 5f | E2E: create-subject → first active prompt, language + non-language | Maestro/Playwright | M | all of 5a-5e | — |
| 5h | **Delete** old onboarding screens (`interview.tsx`, `analogy-preference.tsx`, `interests-context.tsx`, `accommodations.tsx`, `curriculum-review.tsx`) + i18n key sweep + E2E updates + accommodations data audit verification | mobile routing, i18n, E2E | M | 5f (E2E green proves the new flow works without the old screens) | — |
| 5i | Match first topic to learner `rawInput` (Section J): add `topicHint` to `SubjectResolveResult`; extend `firstCurriculumSessionStartSchema` with optional `topicId`/`topicHint`; replace `findFirstAvailableTopicId` sort-order pick with an intent-aware matcher (LLM or embedding similarity) and fall back to `sortOrder` when no match clears a confidence floor; eval-harness snapshot for the matcher | `packages/schemas/src/subjects.ts`, `packages/schemas/src/sessions.ts`, `apps/api/src/services/subject-classify.ts`, `apps/api/src/services/session/session-crud.ts`, `apps/api/eval-llm/` | M | 5d (pre-warm — the matcher needs materialized topics to score against) | 5c, 5e |

**Wave plan**
- **Wave 1 (parallel):** 5a, 5b, 5d, 5g.
- **Wave 2 (parallel):** 5c, 5e, 5i.
- **Wave 3:** 5f.
- **Wave 4:** 5h. **Deadline: ≤ 14 days after Wave 3 ships.** Owner: TBD (assign before Wave 1 begins). If 5h has not landed by deadline, Slice 1 is incomplete regardless of how 5a-5f feel in staging — see acceptance criteria below.

**Acceptance criteria for the milestone**
- P50 time-to-first-active-prompt drops by at least 40% versus a measured baseline captured before Wave 1 begins. (Replaces the earlier "30 seconds" target — that number was unmeasured.)
- For non-language subjects: first visible mentor turn teaches one concrete idea and asks one focused learner action.
- For language subjects: `language-setup` calibration retained (native + CEFR are not preferences, they are the floor for coherent first turns), but reframed as quick calibration rather than "Step 2 of 4." First mentor turn after `language-setup` must satisfy the same teach-and-act rule as non-language.
- No analogy, accommodations, interests-context, or curriculum-review screen appears before the first learning prompt for either path.
- Subject classification correction path remains.
- Eval harness baseline updated for the new first-turn prompt rule.
- **File-count guardrail (PR 5h):** the milestone is not complete until 5h has landed and the file count under `apps/mobile/src/app/(app)/onboarding/` has dropped by at least four (the four screens listed in Section D's deletion trigger). Performance and UX criteria can pass while the old screens remain on disk — that is exactly how the prior two attempts ended. If 5h has not landed within 14 days of Wave 3, Slice 1 has not succeeded regardless of how the new flow feels in staging.

### Slice 2 — Post-First-Win Path Preview

**Goal:** Give structure after value.

Includes:
- recap-card extension that renders the existing `topicOrder` as an ordered-list view
- second-session-open teaser (genuinely new — small home payload + component)
- Library/subject shelf path clarity (mostly already there; minor copy)

**Size:** **S to M** (was M to L — see Section E re-verification: the next-topic recap card is already shipped end-to-end, `topicOrder` is in the API response; this is wire-up, not invention)

### Slice 3 — Progress Proof Language

**Goal:** Progress feels like retained ability, not gradebook metrics.

Includes:
- memory-status labels (string change)
- "remembered after N days" / "getting fuzzy after N days" branches in `RetentionPill` and `RetentionSignal` (data already exists — `daysSinceLastReview` is computed, just not surfaced in the UI)
- learner-side rendering of `weeklyDelta*` fields (already rendered on the parent dashboard; component exists)
- one new "proof card" component using shipped retention metrics
- parent/learner vocabulary boundary
- **`book_completed` milestone detection branch** (Section I quick win — schema enum value exists in `milestoneTypeSchema`; detection logic in `apps/api/src/services/milestone-detection.ts` has no `book_completed` branch and the milestone never fires today). Add detection + threshold; surfaces automatically through the existing milestones screen and session-complete payload. Bundled here so it doesn't become another "built but never wired" item.

**Size:** **M** (was M for labels + L for proof cards — the L was based on assuming the data layer was missing; it isn't; `book_completed` is small and additive)

### Slice 4 — Bring-Your-Own-Material Expansion

**Goal:** Make MentoMate the layer above courses and notes.

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
- "Confident" is defined for this PR as `status === 'resolved' && suggestions.length === 1`. No backend schema change. (A future PR may add a numeric `confidence` field to `SubjectResolveResult` — out of scope for 5a.)
- Confident case (per the heuristic above) shows "We'll start with [subject]." with primary `Start` and secondary `Change`.
- `corrected` status (spelling fix) also takes the lighter copy. `resolved` with `suggestions.length > 1` and no-match cases keep the heavier clarification card.
- Direct-match path is unchanged (already skips confirmation).

### 5b — First-turn prompt rule + eval baseline

**User story:** When I read the first mentor message, I want to learn one concrete thing and be asked to do something with it, so the app feels like a tutor, not an intake form.

**Scope clarification:** This PR is the **only** Wave 1 owner of `exchange-prompts.ts` and `interview-prompts.ts`. It includes both the new rule AND the removal of the conflicting fun-fact opener (Section F). Without bundling these, the first turn would end up: open with a fun fact (still in the prompt) + teach one concrete idea + ask one action — three things instead of one teach + one action. Section F has no separate Wave 1 PR; its prompt-edit work lives here.

**Acceptance**
- Prompt rule added: first learning response must teach exactly one concrete idea and end with exactly one learner action, unless answering an urgent direct question.
- Fun-fact opener block removed from `exchange-prompts.ts` (current source: lines 455–468 — *"Open with a surprising or fun fact about it to spark curiosity, then invite them into the conversation..."*). The first-exchange branch retains nothing that asks the model to be conversational/chatty before the active prompt.
- Eval harness Tier 1 snapshot captures both changes (new rule + removed opener). Tier 2 (`pnpm eval:llm --live`) confirms the rule holds against real LLM responses for the existing scenario matrix and that the LLM no longer opens with a generic fun fact.
- Eval rule (or harness assertion) added: first learning response ends with exactly one learner action.
- Out of scope for 5b: the `EVAL-MIGRATION` TODOs on `evaluate` / `teach_back` envelope migration (Section F) — separate follow-up.

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

### 5h — Delete old onboarding screens (Wave 4)

**User story:** As an engineer, when I look at `apps/mobile/src/app/(app)/onboarding/`, I want only the screens we actually use to be present, so future contributors aren't tempted to wire production traffic through dead code paths (the failure mode of the previous two attempts).

**Owner:** TBD (assign before Wave 1 begins).
**Deadline:** ≤ 14 days after Wave 3 (5f) ships and is green in staging.

**Acceptance**
- Files deleted: `apps/mobile/src/app/(app)/onboarding/interview.tsx`, `analogy-preference.tsx`, `interests-context.tsx`, `accommodations.tsx`, `curriculum-review.tsx` (and their `.test.tsx` siblings).
- `onboarding/_layout.tsx` updated to remove the deleted routes.
- i18n keys belonging only to the deleted screens removed across all 7 locales (sweep with grep, not just one).
- Any imports / route references to the deleted files removed (typecheck must pass).
- Accommodations data audit: confirm no per-subject accommodations data exists in production (it shouldn't — accommodations is profile-level — but verify before deletion). If unexpected data is found, migrate to the profile-level field as part of this PR.
- E2E flows updated to reflect the new path; no Maestro/Playwright spec still drives through a deleted screen.
- `ONBOARDING_FAST_PATH` flag removed entirely (the bypass code paths it gated are now the only paths). Net feature-flag count drops by one.
- Post-merge: file count under `apps/mobile/src/app/(app)/onboarding/` is at most: `_layout.tsx`, `_layout.test.tsx`, `language-setup.tsx`, `language-setup.test.tsx`, `pronouns.tsx` (and any test counterpart). No more.

**Out of scope for 5h**
- Building the post-session "adjust style" prompt from Section D's "genuinely missing" item. That is a separate follow-up — replacement settings already exist in `more.tsx`, `subject/[subjectId].tsx`, and `mentor-memory.tsx`.

**Likely verification (per PR)**
- `pnpm exec jest --findRelatedTests <changed files> --no-coverage`
- `pnpm exec nx run api:typecheck`
- `cd apps/mobile && pnpm exec tsc --noEmit`
- For 5b/5d: `pnpm eval:llm` (Tier 1) and `pnpm eval:llm --live` (Tier 2) where prompt or context inputs change.
- Wave 3 only: Maestro/Playwright journey for create-subject → first active prompt, both language and non-language paths.

---

## Appendix — Baseline Attempted 2026-05-06: Deferred Until Store Launch

A baseline measurement was attempted on 2026-05-06 against both staging and production via `pnpm measure:t2fp` (script: `scripts/measure-time-to-first-prompt.ts`). **No usable real-onboarding rows were found.** The slice 1 success criterion that depends on a measured baseline (P50 drops by ≥40%) is therefore **deferred** until production has real users — currently blocked by store publishing (Apple enrollment pending; Google Play account flagged 2026-03-26). This appendix records what was tried, what was found, what was learned, and what unblocks the baseline.

### Window attempted

`--from 2026-04-01 --to 2026-05-06`. Cohort: profiles whose all-time-first subject was created in the window.

### Result against staging (`mentomate-stg`)

```json
{
  "totalFirstSubjects": 314,
  "buckets": {
    "reachedWithinCap": 0,
    "delayedStart": 1,
    "belowMinReply": 93,
    "noAiAfterSessionStart": 143,
    "noSession": 77
  }
}
```

Bucket sum check: 0 + 1 + 93 + 143 + 77 = 314 ✅ (matches `totalFirstSubjects`).

The 93 rows that initially looked like "reached first prompt" all had a first-AI gap of either negative seconds or sub-5s. A diagnostic (`scripts/diagnose-t2fp.ts`) showed two populations:

1. **Backdated seed fixtures** — `learning_sessions.started_at` set to exactly 1 day before `subjects.created_at` (gap = -86,400s). Identifiable by the negative gap.
2. **E2E test runs** — subject + session + ai_response all written within the same second (gap = 0.4–0.5s). Real human onboarding cannot finish that fast (interview turn + curriculum gen + first-session boot have a floor of several seconds at minimum).

To prevent these from polluting percentiles, `aggregate()` now applies a `MIN_HUMAN_REPLY_SECONDS = 5` floor; rows below that — including all negatives — bucket as `belowMinReply`.

### Result against production (`mentomate-prd`)

```json
{
  "totalFirstSubjects": 0
}
```

Production has zero subjects in the window because the app isn't shipped to either store yet. There are no real users.

### Secondary signal worth tracking

Even without percentile data, the staging diagnostic surfaced a Slice-1-relevant observation: **143 / 314 staging subjects (46%)** have a `learning_sessions` row but no `ai_response` event in `session_events`. This bucket — `noAiAfterSessionStart` — is consistent with the plan's naming caveat: interview AI replies live in `onboarding_drafts.exchangeHistory`, not `session_events`. So `noAiAfterSessionStart` here likely means "user started a session, never got past the interview, abandoned." If 5d (curriculum pre-warm) and Wave 1 work succeed, this bucket should shrink — even before percentile data is available, that distribution shift is observable signal.

The 77 `noSession` count is similarly informative: subject created, no session ever started. Wave 1 should drop this number too if "Start Learning" actually starts learning faster.

### What unblocks a real baseline

- Store launch (any platform — App Store, Google Play, web/PWA) producing real-user onboarding events in `mentomate-prd`.
- A re-run of `pnpm measure:t2fp --from <date> --to <date>` against `prd` after ~30 days of real traffic for statistical power (≥ `MIN_COHORT_FOR_P75_P90` = 20 reached rows per cohort).

### Re-run instructions

```bash
# After store launch, capture pre-5d baseline against production:
C:/Tools/doppler/doppler.exe run -p mentomate -c prd -- \
  pnpm measure:t2fp --from <FROM> --to <TO>

# After 5d ships, capture post-5d numbers against the same window length:
C:/Tools/doppler/doppler.exe run -p mentomate -c prd -- \
  pnpm measure:t2fp --from <FROM> --to <TO>
```

Append each run's JSON below this section as a dated row. Do not overwrite — comparisons need history.

### Slice 1 success criterion revision

Until a real baseline exists, the criterion shifts from quantitative-only to a tiered structure:

1. **Pre-launch (now):** No number-anchored criterion. Slice 1 ships behind the existing fast-path flag and is judged qualitatively (does the first turn feel like learning, per the audit's prose).
2. **Post-launch + ~30 days traffic:** Capture pre-5d baseline. Slice 1 success becomes "non-language P50 drops by ≥40% post-5d, OR `noSession` + `noAiAfterSessionStart` combined drop by ≥30%." The OR is intentional — the bucket-distribution shift is measurable even at small N where percentile noise dominates.

### Diagnostic script

`scripts/diagnose-t2fp.ts` is a one-off diagnostic that probes language_code distribution, event_type histogram, and a sample of cohort rows with raw timestamps + computed gap. Re-run when the next baseline produces unexpected numbers; faster than re-investigating from scratch.
