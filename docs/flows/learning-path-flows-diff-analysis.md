# Learning Path Flows — Current vs Proposed: Diff Analysis

> Flow-by-flow comparison of `learning-path-flows.md` (current code reality) vs
> `learning-path-flows-proposed.md` ("Challenger Edition"). Each change is scored on
> three axes: **codebase impact** (verified against real source, with `file:line`),
> **end-user experience**, and **size** (S / M / L / XL).
>
> Produced 2026-06-09 by a 16-agent parallel analysis. Every `file:line` below was read
> directly by an analyst; doc claims were verified against source, not taken on trust.
> Sizes: **S** = one file / a few hours · **M** = a screen or service + tests · **L** =
> multi-file feature, possible schema/endpoint · **XL** = cross-system, migration + backfill.
>
> **Update 2026-06-11.** First small implementation slice is now in source: subject-carousel opens shelf, topicless note CTA/editor is suppressed, `gap_fill` has Gap Check chrome, locked Assessment is non-pressable, recitation skips the filing wait, and quiz completion queues persistent celebrations. Rows below mark those as done where relevant; remaining sizing refers to the still-open broader proposal.

---

## Executive synthesis (read first)

**The proposal is overwhelmingly subtractive — collapse, not build.** It introduces *no
genuinely new path*. Every change is a merge, a retire, a promotion, or a fix. That is its
strength: most of the apparatus it needs already exists.

**Five cross-cutting findings that change the cost picture:**

1. **The proposal repeatedly over-states build cost — major pieces are already built.**
   - One-tap resume from Home already exists (`LearnerScreen.tsx:312-358`); Path 2's "5 taps → 1" is largely a label/UX refinement, not a build.
   - Review *already* records SM-2 via a live calibration-grading path (`review-calibration-grade.ts`); "make review count" is harden-not-build.
   - Dictation personalization plumbing is fully built but unfed — `generate.ts:72-108` supports interests/topics; `fetchGenerateContext` (`result.ts:178`) just never populates them.
   - Notes+Bookmarks are *already half-merged* in `my-notes/[kind].tsx:13-15`.

2. **The two biggest items are the testing-surface consolidation and the Quiz↔Assessment merge — and they overlap.** Quiz writes a *parallel retention universe* (`vocabulary_retention_cards`, `quiz_mastery_items`) while Assessment co-commits the canonical `retention_cards` + `xp_ledger`. Unifying them is a real **XL** migration with backfill — the single largest risk in the document.

3. **The 7→3 mode collapse needs NO database migration** (key de-risk). `mode` is never a DB column — it lives in `metadata.effectiveMode` JSONB + an Inngest event param. DB `session_type` is already a 3-value enum. Cost is mobile config + runtime branches + a test-fixture sweep, not schema.

4. **The V0/V1 navigation hard-constraint touches four+ changes** (Practice tab, More-fold, Recaps-tab fold). Any edit to the shared tab `Set`s must be scoped to learner shapes only, or the shipped 5-tab guardian shell (`MODE_NAV_V0_ENABLED=false`) regresses.

5. **One genuine product/safety DECISION recurs: Devil's-Advocate (deliberately-flawed-explanation overlay) for under-15s.** It currently fires *silently*; the documented failure mode is a 13-year-old absorbing the deliberate lie as fact. Recommend hard-cut for under-15, opt-in banner for 15+.

**Sizing rollup (whole proposal):**

| Size | Items |
|---|---|
| **XL** | Quiz↔Assessment merge + retention-universe unification |
| **L** | Talk-first Path 0 (topic-attach is net-new); Review→Relearn consolidation; Mode collapse 7→3; Verification-overlay collapse; Supporter "This Week" digest; Practice Hub rework; Practice-tab promotion; Challenge-Round learner-initiated rework; Freeform "Loose notes" bucket; Notes+Bookmarks "Saved" shelf; Dictation de-islanding |
| **M** | Most "fix the exit / fix the entry" items; More-fold; Recaps-tab fold; subtitle/CTA copy on resume |
| **S** | Retire Interleaved path; retire recall-test screen; spoken countdown; renames; all "KEEP" no-ops. The freeform cannot-save alert and `gap_fill` chrome items have shipped. |

**Cheapest high-value wins (ship independently):** freeform cannot-save alert is now fixed
for topicless prompts; auto-file homework + un-starve the Recall Bridge (M, coupled); retire
the two dead screens (S+S); remaining quiz "make it count" work is XP-ledger + surfaced
retention because celebration queueing has shipped.

---

## §1 — Audience model & navigation

| Change | Codebase impact | UX impact | Size | Confidence |
|---|---|---|---|---|
| **Add 4th learner tab "Practice"** (promote the buried hub) | NOT a tab today: absent from `TabKey`/`STUDY_TABS` (`navigation-contract.ts:13-19,146-169`); registered in `FULL_SCREEN_ROUTES` so its tab bar collapses to 0 (`_layout.tsx:55-60`); reached via `home-action-practice` button (`LearnerScreen.tsx:87-91`). Add to `TabKey`+`STUDY_TABS`, remove from full-screen routes, add `<Tabs.Screen>`, per-shape `visibleTabs`. | Persistent Practice tab vs buried button | **L** | High |
| **Fold "More" into header/avatar menu** (keep learner tabs = 4) | `more` is a first-class tab + RouteKeys (`navigation-contract.ts:146-169`, `_layout.tsx:724-735`). Drop from learner set, build header menu linking `more/account`+`more/privacy` (routes stay; `isOwner` gating unchanged). | More moves to header affordance, no feature loss | **M** | Med |
| **Unify subject-carousel destination with Library** | **DONE 2026-06-11.** Carousel now opens `/(app)/shelf/[subjectId]` [was: progress report]. | Same intent → one destination | **S** | High |
| **One canonical entry per verb; deep-links land inside it** (Relearn has 4 entries, Quiz 3) | Per-call-site re-pointing across `LearnerScreen.tsx`, `practice/index.tsx`, `book/[bookId].tsx`, `topic/relearn.tsx`; must honor cross-stack ancestor-chain push rule. | Back-nav always resolves; fewer dead ends | **M** | Med |
| **Home "Continue where you left off" card** | PARTIALLY BUILT: `useLearningResumeTarget` + carousel "Continue {topic}" already route to active/paused session (`LearnerScreen.tsx:122,282-285,350-356`); `IntentCard.test.tsx:75` references it. Remaining = a dedicated resume card. | 1-tap resume vs 5-tap dig | **S–M** | High |
| **KEEP V0/V1 contract + audience split untouched** | Verified intact (`navigation-contract.ts:362`, `:273-283`, `home.tsx:161`). | None | — | High |

**Notes.** The proposal frames §1 as "purely internal, untouched" — too optimistic. Adding
a Practice tab is genuine structural nav work. **Dominant risk = the V0/V1 hard constraint**:
`MODE_NAV_V0_ENABLED=false`+`MODE_NAV_V1_ENABLED=false` returns `LEGACY_GUARDIAN_TABS`
(5 tabs) for production guardians; tab-set edits must be learner-scoped or the shipped shell
regresses. No schema/Inngest involvement — all mobile-shell. Doc nit: there is no
`LEARNER_TABS` symbol; code has only `STUDY_TABS`. Confirmed `isAdultOwner` *does* null-guard
birthYear (`age.ts:60`) — the deferred `isAdultOwner` null bug does NOT reproduce.

---

## §2 — Path inventory (structural delta)

The inventory delta is **collapse, not addition**:

- **Mode taxonomy 7→3** (L) — fold freeform/learning/relearn/gap_fill into `tutor`; recitation→`tutor`+`verbatim`. No DB migration. Needs new `entryPoint` telemetry to avoid funnel-analytics regression.
- **Review (P4) → Relearn (P5)** (M) — one "Go over again"; reconcile timer/overlay-suppression; fix SM-2 no-op.
- **Assessment ladder → Quiz** (XL) — two architecturally distinct backends into one; retention-universe unification risk.
- **Retire Interleaved path** (S) — zero mobile callers (only prose-comment matches in `mentor-memory.tsx:350`, `my-notes/[kind].tsx`); keep engine.
- **Retire recall-test screen** (S) — orphaned; keep engine (load-bearing for relearn).
- **Fix `gap_fill` chrome** (DONE/S) — `SESSION_MODE_CONFIGS.gap_fill` now provides Gap Check chrome; broader mode-collapse/analytics questions remain.
- **Notes+Bookmarks → "Saved"** (M); **Promote Practice button→tab** (M); **Supporter simplify** (L).

**Verified structural facts:** 6-entry `SESSION_MODE_CONFIGS` with `practice→review`
normalization (`sessionModeConfig.ts:10-74`); four tab sets with no `practice` tab and
preserved `LEGACY_GUARDIAN_TABS` (`navigation-contract.ts:146-169`); Interleaved API complete
(`routes/sessions.ts`, `services/interleaved.ts`) with zero real mobile callers.

---

## Path 0 — Learn Something New ("talk-first")

| Change | Codebase impact | UX impact | Size | Confidence |
|---|---|---|---|---|
| **Fire-and-talk: open session instantly on submit** | `onSubmit` calls `resolveInput`→`POST /subjects/resolve` today (`create-subject.tsx:470-478`). Instant session must use the freeform path (no subjectId) — `startSession` requires `subjectId` (`session-crud.ts:192-263`); freeform start at `LearnerScreen.tsx:80-85`. | Lands on content in ~2s vs 60-90s of spinners | **L** | High |
| **Run resolve + structure + prewarm async; silently attach subject/topic when ready** | Prewarm infra exists (`subject.ts:135-141`, `subject-prewarm-curriculum.ts`); freeform subject-attach exists (`session-exchange.ts:1786-1828`) — **but attaches `subjectId` only, NOT `topicId`. No endpoint attaches a topicId to a running session.** This is the largest net-new piece. | Subject/topic appear silently after the conversation starts | **XL** | Med |
| **Drop synchronous Accept/Edit confirmation** | Removes suggestion-card branches (`create-subject.tsx:1040-1131`); ambiguity becomes a mentor question (needs `exchange-prompts` work, not yet specced). | No taxonomy chips for motivated kids | **M** | High |
| **Drop the book-picker gate** | `broad`→`router.replace('/pick-book/[subjectId]')` today (`create-subject.tsx:354-361`); make it an optional later Library affordance. | No forced "shop for a textbook" | **M** | Med |
| **Drop `/ready` from create path** (keep first-ever only) | `transitionToFirstSession` gated by `isFirstSubject` (`create-subject.tsx:169-221,307`); four_strands already skips it. | Returning learners skip a reflection screen | **S** | High |
| **Collapse the poll/409-retry latency** | `startFirstCurriculumSession` 25s poll (`session-crud.ts:858-948`) + mobile 3×@2s 409 retries (`create-subject.tsx:85-206`) move off the blocking path. | No "Preparing your first lesson…" stall | **M** | Med |

**Load-bearing dependency:** changes 1+2+6 are one coupled rework. The instant session is
only viable if the async path can attach **subject AND topic** back to it. Subject-attach
exists; **topic-attach does not** — this is the proposal's own flagged crux. Language
(`four_strands`) path still has its own `/onboarding/language-setup` gate the proposal leaves
ambiguous.

---

## Path 1 — Freeform Chat ("actually freeform")

| Change | Codebase impact | UX impact | Size | Confidence |
|---|---|---|---|---|
| **Gate "Write a note" CTA on `topicId != null`** | **DONE 2026-06-11.** `SessionFooter` now gates the prompt/editor on `topicId`. | Dead button stops appearing | **S** | High |
| **Delete the cannot-save alert path** | **DONE 2026-06-11 for topicless prompt/editor path.** Existing unused copy cleanup can be a follow-up i18n hygiene task. | "Try again" lie gone | **S** | High |
| **NEW "Loose notes" bucket** (topicless save) | No implementation exists (grep clean). `createNote` requires `topicId`; needs schema/migration if `topic_id` NOT NULL + new Library surface + topicless ownership story. | Freeform thoughts saveable | **L** | Med |
| **Silent, non-blocking first-turn classification** | Classification BLOCKS composer today (`session/index.tsx:1095-1096,1218-1219`); teach turn fires only after classify (`use-subject-classification.ts:759`). Reorder to answer-first. | First turn in ~2s, no "classifying…" banner | **M–L** | Med |
| **Remove "Looks like X" auto-pick + disambiguation chips** | Injected at `use-subject-classification.ts:546`; chips in `SessionAccessories.tsx`. These fixed prior bugs (BUG-31/234/236) — removal re-opens "wrong subject silently chosen." | No chips interrupting "ask anything" | **M** | Med |
| **Surface ≥5-exchange auto-file with a toast** | Silent server dispatch today (`session-filing-dispatch.ts:24,45-52`, ≥5 exchanges). Async timing means a synchronous toast can lie — needs completion signal. | Learner learns the deep session was saved | **M** | Med |

**Notes.** Spine is right; all 6 reuse existing infra. Changes 1+2 are the cheap high-value
pair (kill the lying button). Change 3 (Loose notes) is the outlier — only L, needs schema +
surface, and is in tension with the proposal's own "freeform needs no learner note." Changes
4+5 are coupled and touch the app's hottest path (highest regression risk).

---

## Path 2 — Guided Learning ("KEEP logic, fix resume ergonomics")

| Change | Codebase impact | UX impact | Size | Confidence |
|---|---|---|---|---|
| **Home "Continue where you left off" reusing `deriveStudyCTA`** | LARGELY BUILT: server-driven resume already 1-tap (`LearnerScreen.tsx:122,350-358`; `use-progress.ts:202-243`; `GET /progress/resume-target`). Gap: card does NOT reuse `deriveStudyCTA` (`topic/[topicId].tsx:228-245`); true reuse needs `completionStatus`+`retentionStatus` added to the resume-target payload (`schemas/progress.ts:314-324`). | Label/mode mirror Topic Detail exactly | **S–M** | Med-High |
| **Pair CTA verb with one-line "why" subtitle** | Net-new copy. `deriveStudyCTA` returns `{label,variant}` only; `CoachBand` has no `subtitle` prop (`LearnerScreen.tsx:553-558`). Extend both + i18n (Home headlines are currently hardcoded English — pre-existing i18n debt). | "Practice again" vs "Review" stop reading as synonyms | **S** | High |
| **KEEP reflection auto-note + immediate retention attach** | No change. | None | — | High |
| **KEEP state-aware CTA branch (overdue→review)** | No change to `deriveStudyCTA`/`handleStudyPress`. | None | — | High |

**Biggest correction:** the "5 taps to resume" framing is inaccurate — Home already resumes
in one tap. The real deltas are label-matching + the explanatory subtitle. **The one sizing
fork:** if product wants the Home label *identical* to `deriveStudyCTA`, that's an API/schema
change (M); if "approximate from `resumeKind`" is fine, it stays S.

---

## Path 3 — Homework Help ("KEEP, fix the exit")

| Change | Codebase impact | UX impact | Size | Confidence |
|---|---|---|---|---|
| **Kill the binary filing prompt at exit** | Only homework interrupts exit: `use-session-actions.ts:375-376` → `StandardFilingPrompt` (`SessionFooter.tsx:166-280`). Auto-file via `useFiling()`→`POST /filing`, then straight to summary. | End → straight to Summary, no save decision | **M** | High |
| **Run the Recall Bridge for EVERYONE** | `generateRecallBridge` returns `[]` when `!session.topicId` (`recall-bridge.ts:48-50`). Auto-filing populates topicId → existing bridge starts firing. | One-off rescue becomes learning | **S–M** | Med-High |
| **Quiet "Don't keep this" opt-out link in summary** | Reuse `useKeepSessionOutOfLibrary()`→`POST .../keep-out` (`use-filing.ts:354-360`). | Opt-out preserved without forcing it up front | **S** | High |
| **Demote mode chips to one default-off toggle** | `homeworkMode: help_me\|check_answer\|undefined` (`session/index.tsx:364-365`); server already handles `undefined` (`exchange-prompts.ts:130-139`). Mobile-only. | Urgent default = zero taps | **S** | High |
| **Mid-wait "type it instead" on OCR spinner** | OCR cascade in `use-homework-ocr.ts`; spinner at `homework/camera.tsx:509`. Add timed CTA on the server-OCR leg only. | No staring at a spinner on slow cellular | **S** | Med |

**Biggest unknown = filing/topicId timing.** If auto-file is async (Inngest dispatch via
`session-filing-dispatch.ts`) and topicId isn't committed before the bridge POST, the bridge
stays empty and the proposal's central win silently doesn't land. Implementation must
guarantee topicId-before-bridge ordering. Changes 1+2 are coupled (the prompt suppresses its
own payoff). Cite drift: doc says `exchange-prompts.ts:130` — file is `apps/api/src/services/exchange-prompts.ts` (contents correct).

---

## Path 4 — Practice / Review ("CONSOLIDATE into 'Go over again', make it count")

| Change | Codebase impact | UX impact | Size | Confidence |
|---|---|---|---|---|
| **Merge "Review" into Relearn — one "Go over again"** | Two modes + two entries: review CTA `mode:'review'` (`topic/[topicId].tsx:459-462`) vs relearn `POST /retention/relearn`. Merge must reconcile divergent prompts: review overrides at `exchange-prompts.ts:483-484,549-551,799,1111-1112` vs relearn standard. Touches enum across mobile+API+tests. | One button vs two near-synonym CTAs | **L** | Med |
| **"Make it count" — always non-null `effectiveQuality`** | **PARTIALLY BUILT.** Review ALREADY grades + writes SM-2 via `maybeDispatchReviewCalibration` (`session-exchange.ts:1038-1142`) → `review-calibration-grade.ts:96-130`. Remaining = make it guaranteed (it skips on non-substantive answer + 24h cooldown `:92-94`). | Review reliably moves the card | **S–M** | Med-Low |
| **Keep review timer + retention-aware rung on merged surface** | Timer client-side; rung injected in review path. If relearn's mode wins the merge, these must be *ported*, not just kept. | No perceived regression | **S** | Med |
| **Remove "Practice again"→`mode=learning` divergence** | Strong-topic branch routes `mode:'learning'` (`topic/[topicId].tsx:239-242`); proposal doesn't explicitly address it. | Ambiguous | **S** | Low |

**Biggest finding:** "make review count" is *largely already implemented* — both flow docs
under-state it (they describe only the post-session `update-retention` null-skip at
`session-completed.ts:687`). Existing spec `docs/specs/2026-06-03-review-relearn-findings...md`
documents the calibration grading accurately. "Always records SM-2" must address the 24h
cooldown + non-substantive-answer skip — not free. The genuine net-new work is the
consolidation (L) and reconciling two prompt regimes (regression risk to tuned review).

---

## Path 5 — Retention Relearn ("the one study-again surface; kill the fake choice")

| Change | Codebase impact | UX impact | Size | Confidence |
|---|---|---|---|---|
| **Kill the cosmetic method picker** | Verified cosmetic: `relearn.tsx` only *reads* `teachingPreference` (`:188-189`), never writes it; only writer is the standalone `PUT /subjects/:id/teaching-preference` (`retention.ts:151-200`), never called from relearn. Remove method phase (`relearn.tsx:35-79,274-363,618-668`); `RelearnTopicInput` schema loses fields. | No 4-way style choice that did nothing | **M** | High |
| **Fix remaining Challenge-Round block edges** | `startRelearn` inserts `needs_deepening_topics{status:active}` (`retention-data.ts:1104-1109`); Challenge gate rejects `struggleStatus!=='normal'` (`trigger.ts:80`). Quality-bearing completions now self-heal through `updateNeedsDeepeningProgress()` after 3 good completions; remaining risk is no-quality/abandoned sessions. | Relearning no longer leaves stale Challenge blocks | **S–M** | High |
| **Path 5 becomes THE study-again surface (Review merges in)** | Load-bearing work is on the Review side (always non-null quality). Path-5 wiring is small. | One "Go over again" | **S** (P5-only) / L (with P4) | Med |
| **Retire recall-test screen, keep engine** | `recall-test.tsx` fully orphaned (no inbound nav; `recall_nudge`→`/(app)/home` per `notification-tap-navigation.ts:34-37`); `processRecallTest` load-bearing. | None (already unreachable) | **S** | High |

**The relearn method-picker gap is real; the Challenge block is narrower than first written.** 4 live relearn entries confirmed
(`LearnerScreen.tsx:370`, `practice/index.tsx:515`, `book/[bookId].tsx:1184`,
`use-clone-from-child.ts:204`). The recap anchor + SM-2 baseline reset
(`session-completed.ts:636-650`, guard `effectiveQuality!=null && exchangeCount>0`) are
genuinely load-bearing. The picker-kill is a taste/dark-pattern call; stale no-quality
needs-deepening rows remain a correctness risk that should ship regardless (latent until
Challenge Round ships — currently flag-off).

---

## Path 6 — Recitation ("voice-first, subject-less")

| Change | Codebase impact | UX impact | Size | Confidence |
|---|---|---|---|---|
| **Voice-first default** | Input defaults to `text` + SecureStore restore (`session/index.tsx:333,341-353`); voice toggle exists (`:1258-1259`). Seed `voice` for `mode==='recitation'` without clobbering the global pref (BUG-357 guard at `:527`). Feedback prompt already branches on input mode (`exchange-prompts.ts:769-787`). | Lands in voice → discovers pace/expression feedback (the gem) | **S** | High |
| **Drop the subject** (synthetic/no bucket, never `subjects[0]`) | Auto-picks `availableSubjects[0]` today (`use-subject-classification.ts:509-521`); write binds it (`session-exchange.ts:2683-2695`, `practice_activity_events`). Remove auto-pick; allow null subject. | Recited poem stops polluting "Biology" progress | **M** (→L if migration) | High |
| **Kill the 60s topicless filing-wait** | **DONE 2026-06-11.** `waitForEvent` now skips recitation mode. | ~60s post-finish latency gone | **S–M** | Med |
| **Replace "Beta" with "Practice reciting"** | i18n only (`practice/index.tsx:942-950`); gated on voice-default working first. | "Beta" stops reading as "might not work" | **S** | High |

**Biggest unknown = nullability/migration.** Whether `subjectId` can be null or needs a
synthetic "Recitation" subject row determines M vs L. Downstream readers of
`practice_activity_events` (reports/aggregations) must tolerate it. Dropping the subject is
the load-bearing change. The filing-wait removal has shipped independently. Recitation
prompt/evidence source (`recitation_text`, `exchange-prompts.ts:439`) survive unchanged.

---

## Path 7 — Quiz ("quiz my actual subjects, and make it count")

| Change | Codebase impact | UX impact | Size | Confidence |
|---|---|---|---|---|
| **Generate quizzes from learner's active topics** | NO topic-bound type exists: `quizActivityTypeSchema` = `['capitals','vocabulary','guess_who']` (`packages/schemas/src/quiz.ts:4-8`). Capitals deterministic (`generate-round.ts:495-529`); vocab only four_strands; guess_who generic LLM. Needs new type + topic-content LLM prompt (eval-harness work) + mastery-key scheme. | Biology learner gets biology, not Capitals trivia | **L** | High |
| **Write quiz XP into main `xp_ledger`** | Quiz XP lives only in `quizRounds.xpEarned` + `practice_activity_events` (`complete-round.ts:509,554-574`); no `xpLedger.insert`. `xp.ts:84` is session/topic-scoped — quiz has no topic. | Quiz moves the real progress bar/streak | **M** | High |
| **Fire the celebration queue** | **DONE 2026-06-11.** `complete-round.ts` maps `celebrationTier` to a queued celebration through deferred `safeWrite`. | Good round → celebration on next Home | **S** | High |
| **Surface the retention loop ("3 things to review")** | Wrong answers→`quiz_missed_items` re-injected silently (`generate-round.ts:484-490`); SM-2 invisible. Net-new read endpoint/UI. | Learner sees what to review | **M** | Med |
| **Absorb Assessment ladder as "serious depth tier"; rename to "Check what you know"** | Assessment is a separate route/service co-committing SM-2+XP (`routes/assessments.ts:199-231`). Merge spans two paths; reconcile to avoid double-XP. | One self-test surface, two tiers | **L** | Med |
| **Keep engine; unify retention onto topic-level `retention_cards`** | Quiz SM-2 on `vocabulary_retention_cards`/`quiz_mastery_items` (parallel universe). Migrate onto `retention_cards`; Guess-Who scoring (`getGuessWhoSm2Quality:419-429`) → optional. | One retention universe | **L** | Med |

**Every current-doc claim verified.** Server-checked answers (`complete-round.ts:128-215`)
are sound and untouched. The "make it count" trio (XP-ledger / celebration / surfaced
retention) is now partly shipped: celebration queueing is done; XP-ledger + surfaced
retention remain **M and shippable independently** of the content rework. Hardest piece is
topic-bound generation + retention unification (XL together with the Assessment merge).

---

## Path 8 — Dictation ("one personalized entry, end the island")

| Change | Codebase impact | UX impact | Size | Confidence |
|---|---|---|---|---|
| **Collapse two-choice entry → single "Start dictation"** | Two `IntentCard`s today (`dictation/index.tsx:213-224`); primary CTA = `handleSurpriseMe()` (`:52-107`), demote "own text". | One tap → personalized dictation | **S** | High |
| **Interest/curriculum-aware generation (the real personalization)** | PLUMBING EXISTS BUT UNFED: `generate.ts:41-49,72-108` supports interests+libraryTopics; `fetchGenerateContext` returns only `{nativeLanguage,ageYears}` (`result.ts:166-179`). Fix = populate that function. No prompt/schema change. | "Surprise me" stops being irrelevant-by-construction | **M** | High |
| **"Use my own text" → camera-first** | `text-preview.tsx` no longer reads any dictation `ocrText` route param. Reuse homework camera/OCR output or add an explicit dictation OCR param before pushing text-preview. | Snap a worksheet vs hand-type | **M** | Med-High |
| **Route `/review` mistakes into shared retention/struggles store** | NO write-back today: `review.ts:38` only *reads* struggles; `recordDictationResult` (`result.ts:41-108`) writes reporting-only. Needs Inngest/scoped write + a topic anchor for spelling/grammar mistakes. | Dictation effort compounds elsewhere | **L** | Med |
| **Spoken 3.5s countdown** | `COUNTDOWN_MS=3500` (`use-dictation-playback.ts:43`); TTS only after countdown (`:211`). Add `Speech.speak` at countdown start. | "Ready… start writing" spoken | **S** | High |

**De-islanding (change 4) is the load-bearing risk** — the only item needing a new
persistence path + likely a data-model/migration decision (how non-topic mistakes anchor onto
a topic-bound store). The doc *under*-sells change 2: personalization is "populate one
function," not "build personalization." "Check my writing" has no flag gate (`complete.tsx:399`).

---

## Testing/checking surfaces — CONSOLIDATE ten → three (the biggest item)

**Ten → three mapping** (target buckets: **A** one self-test · **B** one study-again · **C** one ambient in-session check; SM-2 stays invisible, surfacing one fading/strong signal):

1. Quiz → **A** (playful recall tier) · 2. Assessment ladder → **A** (canonical) · 3. Challenge Round → **C** (or retire) · 4. Devil's-Advocate (`evaluate`) → **C** · 5. Feynman (`teach_back`) → **C** · 6. Review (P4) → **B** · 7. Relearn (P5) → **B** · 8. Interleaved → RETIRE path · 9. recall-test screen → RETIRE screen · 10. SM-2 → KEEP invisible, surface one signal.

**Only 4 of 10 are learner-reachable today** (Quiz, Assessment, Review, Relearn).

| Change | Codebase impact | Size | Confidence |
|---|---|---|---|
| **C1. Merge Quiz into Assessment self-test; unify quiz onto `retention_cards`** | Quiz writes parallel universe (`vocabulary_retention_cards`, `quiz_mastery_items`) vs Assessment canonical (`routes/assessments.ts:199-231`). Migration + backfill. | **XL** | High |
| **C2. Merge Review→Relearn, always record SM-2** | Review calibration grading exists, but no-quality/cooldown edges can still skip ordinary `update-retention`. | **L** | High |
| **C3. Merge `evaluate`+`teach_back` → one ambient check, one gate** | Gates `evaluate.ts:32` (ease≥2.5) vs `teach-back.ts:33` (ease≥2.3); collapse to one. | **L** | High |
| **C4. Merge Challenge Round into ambient check (or retire)** | Flag-OFF (`config.ts:145`); full engine in `services/challenge-round/`. Delete 5/8 gates + cooldown table; keep finalize pipeline. | **L–XL** | High |
| **C5. Retire Interleaved path; keep engine** | Zero mobile callers verified. | **S** | High |
| **C6. Retire recall-test screen; keep engine** | Orphaned; `processRecallTest` load-bearing. | **S** | High |
| **C7. Keep SM-2 invisible; surface one fading/strong signal** | Coupled to C1's retention-table merge. | **M** | Med |
| **C8. Collapse per-mechanism Practice-hub rows → self-test + study-again** | Hub routes `practice/index.tsx:399,427,515,887,928`. | **M** | High |

**The data-model asymmetry is the technical crux:** Quiz's parallel retention universe vs
Assessment's atomic `retention_cards`+`xp_ledger` co-commit. "Unify onto topic-level
retention_cards" is a real migration, not a relabel — the largest single risk in the whole
proposal. **Open decisions surfaced:** Q1 Quiz↔Assessment merge; Q2 Challenge ship-vs-park
(earns nothing flag-off); Q3 Devil's-Advocate for under-15s (highest-risk safety surface).

---

## Challenge Round + Verification Overlays

| Change | Codebase impact | Size | Confidence |
|---|---|---|---|
| **CR-1: AI-pushed surprise → learner-initiated "Challenge me"** | No learner-tap entry exists today; only `ChallengeOfferCard.tsx` SSE plumbing. Net-new button + route. Whole feature flag-OFF (`config.ts:145`). | **M** | High |
| **CR-2: Delete 5 of 8 eligibility gates (keep "enough evidence")** | All 8 gates in `trigger.ts:74-136`; keep evidence check to grey-out the button. | **M** | High |
| **CR-3: Delete decline state + dontAskAgain + 24h cooldown** | `declineChallengeRound` UNCONDITIONALLY inserts a 24h cooldown on EVERY decline (`route-actions.ts:113-128`) — confirms "polite decline punished invisibly." Drop `challenge_round_cooldowns` table (migration). | **S** | High |
| **CR-4: Fold CR into the ambient "Mate checks you" beat** | Routing into strongest check; touches auto-select `session-exchange.ts:1717-1729`. Depends on VO-1/VO-2. | **L** | Med |
| **CR-5: Finalize/mastery pipeline UNCHANGED** | `decideMasteryAndReview` (`evaluation.ts:128-186`) + `validateEvaluationEventIds` + note-draft guard intact. | **S** (no-op) | High |
| **VO-1: Collapse two overlays → one (teach-back only), one threshold** | Drop `evaluate` auto-path (`evaluate.ts:28-33`, `session-exchange.ts:1724-1725`); keep `teach_back` (`teach-back.ts:29-34`). | **M** | High |
| **VO-2: Make teach-back announced/opt-in** | Gate behind a learner prompt; edit prompt-injection + add announce step. | **M** | Med-High |
| **VO-3: Demote Devil's-Advocate to opt-in, or cut for under-15s** | Gate `evaluate.ts` behind opt-in+banner OR age-gate (separate gate, NOT `computeAgeBracket`). | **S–M** | Med |
| **VO-4: Path-gating doc-inversion is already code-true** | Real matrix (learning/relearn=yes, else=no) verified at `exchange-prompts.ts:483,1033-1035`, `session-exchange.ts:1719-1721`. No code change. | **S** (no-op) | High |

**Whole CR scope is flag-dark today** — "ship" means flag-on + reshape, not fix-live. **VO
overlays are NOT flag-gated and DO run live** in learning/relearn. Both current-doc accuracy
claims verified: the gating-matrix inversion is code-true; decline always writes a cooldown.
CLAUDE.md's "rung-floor mechanism planned" note is **stale** — `resolveChallengeRoundLlmRoutingRung`
is live (`session-exchange.ts:260`). **CR-4 depends on VO-1/VO-2** (land overlay collapse
first). **Genuine DECISION (Q3):** Devil's-Advocate under-15 — recommend hard-cut <15, opt-in 15+.

---

## Notes + Bookmarks ("one Saved shelf") + Opener/Recap (KEEP)

| Change | Codebase impact | Size | Confidence |
|---|---|---|---|
| **Unify Notes+Bookmarks into one "Saved" shelf** | Two separate systems: `topic_notes`/`notes.ts` (cap 50) vs `bookmarks`/`bookmarks.ts` (eventId provenance, topic-nullable). Needs authorship/type discriminator column + migration; data migration of bookmarks; reconcile cap vs uncapped + IDOR guard (`notes.ts:270`) for null-topic items. | **L** | Med-High |
| **Consolidate the FOUR saved surfaces** | Doc under-described: `progress/saved.tsx` (bookmarks), `my-notes/index.tsx` (hub), `my-notes/[kind].tsx:14-15` (ALREADY merges both), and topic-detail inline notes (`topic/[topicId].tsx`). Partial UI consolidation exists. | **M** | Med |
| **Fix freeform phantom-save → "Loose notes"** | topicId null guard alerts today; route to a loose bucket (couples to nullable-topic). | **M** | Med |
| **First-Turn Opener — KEEP** | No-op (fun-fact opener already removed). | **S** (none) | High |
| **Next-Topic Recap content — KEEP** | No-op to the card; its only change (placement/spinner) belongs to the session-close scope. | **S** (none) | High |

**Two separate systems verified** — distinct tables/services/routes/hooks. The merge is a
cross-table unification with a schema migration, not a relabel — but it's *partially built*
in `[kind].tsx`. **Watch:** `note-draft.ts` hallucination guard is currently UNWIRED
(`notes.ts:236-244`) — any merge touching the Challenge note route must re-add it + a test.
Parent-proxy delete-hide exists only on the bookmarks shelf (`saved.tsx:97`) — must port to
the merged shelf or it's a regression.

---

## Session close → Summary + Lifecycle riders + Mode taxonomy

| Change | Codebase impact | Size | Confidence |
|---|---|---|---|
| **1. Reward-first close: dispatch pipeline immediately (ungate from reflection)** | Pending close does NOT dispatch today; recap waits for Submit/Skip (`routes/sessions.ts:1268-1287,1579`). Fire a recap-only dispatch on pending close; preserve BUG-398 auto_closed exclusion + idempotency key (`:1610`). | **M** | High |
| **2. Reflection optional card; kill the poll-spinner** | Mobile polls `learnerRecap` every 2s with 15s timeout (`session-summary/[sessionId].tsx:190-251`). Render win+recap first; reflection optional; no user-facing dead-wait. | **M** | High |
| **3. Rider 2 — harden review→SM-2 no-quality edges** | Calibration grading exists, but `update-retention` still skips on null quality (`session-completed.ts:687-697`). Reverses Issue #19's deliberate anti-inflation skip only if there is a defensible quality *source*, not just guard removal. | **M** | Med-High |
| **4. Rider 1 — KEEP the rest of the pipeline** | Concurrency/idempotency, `relearn-retention-reset`, `stripEnvelopeJson`, crons all intact. | **S** (no-op) | High |
| **5. Mode taxonomy 7→3 (`tutor`/`review`/`homework`) + runtime modifiers** | **No DB column for `mode`** — JSONB `effectiveMode` (`schema/sessions.ts:140,156`); `session_type` enum already 3-value. `relearn` special-cased in pipeline (`session-completed.ts:637`) + created bypassing `startSession` — must re-key the reset off a runtime signal. Test-fixture sweep required. | **L** | High (no migration) / Med (blast radius) |
| **6. Add decoupled `entryPoint` telemetry** | Greenfield enum; modes currently double as analytics. Must ship same PR as the collapse or reporting breaks silently. | **S** | Med |

**Key de-risk: the 7→3 collapse needs no database migration.** Cost is mobile config +
runtime branches + fixture sweep. **Watch:** change 1 (immediate dispatch) + status-keyed
idempotency means pending-close + later submit/skip use *different* keys → confirm per-step
idempotency on re-entry or recap/insights regenerate twice. Doc line cites for the summary
section are imprecise (real poll lives in mobile `[sessionId].tsx:190-251`, not the API).

---

## §11 Supporter surfaces + Practice Hub + Cross-cutting + dispositions

| Change | Codebase impact | Size | Confidence |
|---|---|---|---|
| **Collapse 9+ supporter surfaces → one per-child "This Week" digest** | Greenfield component; data layer rich + present (9 `child/[profileId]/*` screens, recaps, `ParentHomeScreen.tsx`, `use-dashboard`/`use-recaps`). Re-skin, not rebuild; likely needs a digest endpoint or client merge (avoid N+1). | **L** | High |
| **Fold Recaps tab into the digest** | `recaps` is a V1 guardian tab (`navigation-contract.ts:152-154`); removing touches the nav contract (V0 hard constraint). Content overlap verified (`child/[profileId]/session/[sessionId].tsx:241-368`). Notification deep-links to `/(app)/recaps` need re-pointing. | **M** | High |
| **Reframe clone CTA "Learn together"→ secondary "Try this topic yourself"** | Copy/placement only; flow intact (`use-clone-from-child.ts:203-217`, `BridgeTriggerSurface` union). | **S** | High |
| **Practice Hub: 4 sections → 1 hero + collapsed "More ways"** | 1005-line `practice/index.tsx`; 4 `SectionLabel` sections (`:500,675,797,958`); review hero (`:503-582`). Layout rework. | **L** | High |
| **Hide/disable locked Assessment row** | **PARTLY DONE 2026-06-11.** Locked Assessment is now non-pressable with a hint, so no false navigation; fully hiding it remains a product/layout choice. | **S** | High |
| **Move Capitals/Guess-Who tiles inside Quiz** | Tiles `practice/index.tsx:720-766`; relocate to quiz screen. | **M** | Med |
| **Kid-legible renames** | i18n only (7 locales + orphan-key checker). | **S** | High |
| **Cross-cutting dimensions — KEEP** | No-op (serious/casual already removed). | **S** (no-op) | High |
| **Retire Interleaved path / recall-test screen / quiz prefetch / kill relearn picker** | Dispositions cross-referenced from other scopes (mostly S). `gap_fill` chrome is fixed; broader mode taxonomy remains. | S–M | Mixed |

**The two biggest §11 items (digest, Practice Hub) are both L re-skins of a verified-rich
data layer — backend stays.** Recaps-tab fold inherits the V0/V1 hard constraint + its test
requirements. Open questions reframed from 8 doc-freeze (infra/wiring) → 7 product-direction
Qs; Q7 (digest) and Q1 (Quiz/Assessment merge) gate the L items; Q3 (Devil's-Advocate
under-15) is the highest-risk safety surface.

---

## Coordination warnings (avoid double-counting / sequencing traps)

- **Quiz↔Assessment merge** appears in Path 7, the testing-surface consolidation (C1), and the inventory — it is **one XL effort**, not three.
- **Review→Relearn / always-record-SM-2** appears in Path 4, Path 5, the consolidation (C2), and the session-close rider 2 — **one L effort** plus a small resolve step.
- **Verification-overlay collapse** appears in Challenge+Overlays (VO-1..4) and the consolidation (C3) — same files (`evaluate.ts`, `teach-back.ts`, `session-exchange.ts`).
- **CR-4 depends on VO-1/VO-2** — land the overlay collapse first.
- **C7 (one retention signal) depends on C1** — order C1 first.
- **Nav hard constraint** binds the Practice tab, More-fold, and Recaps-tab fold simultaneously.
- **i18n hygiene** (delete orphan keys across 7 locales, `pnpm translate`) applies to every copy/rename change.
