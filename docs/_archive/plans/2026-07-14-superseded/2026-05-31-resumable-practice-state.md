---
title: Resumable Practice State - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: deferred
recommendation: ship-80-20-copy-fix-now-defer-engine
implemented: false
last_verified: 2026-06-09
gap_ids: [practice-1, practice-2, practice-4]
---

# Resumable Practice State - Implementation Plan

> ## 📍 STATUS AT A GLANCE — read this first
>
> - **What this is:** Preserve in-progress quiz & dictation practice across
>   app-kills, and make "save" language honest (no button that says "save" while
>   it actually *finalizes* a partial round).
> - **Implemented?** ❌ **No.** Verified against `main` 2026-06-09:
>   `apps/mobile/src/lib/practice-recovery.ts` does not exist; the quiz quit modal
>   still shows the dishonest "Save and finish" (`play.tsx:1185`,
>   `quiz.play.saveAndFinish`); no practice key in `sign-out-cleanup.ts`
>   `PER_PROFILE_KEYS`. The codebase still equals the "Existing Code Facts"
>   baseline below.
> - **Should it be implemented?** ⚠️ **Not the full engine — not pre-launch.**
>   With zero active users, durable per-profile resume state is speculative polish
>   on a known cross-account-leak surface. **Do the 80/20 copy fix now** — it
>   kills the actual `practice-4` lie in ~1 hr with no new persisted state.
>   **Defer the persistence engine** (T1/T2/T4/T5/T6) until post-launch telemetry
>   or support shows learners actually losing in-progress practice to app-kill.
> - **Recommended next action:** Ship **T3-lite** (honest copy, see "80/20
>   Analysis" below). Leave the rest parked.
> - **If/when the engine IS built:** the build sections below were corrected
>   2026-06-09 for the end-user findings `[HIGH-1..4]` / `[MEDIUM-1..4]` — read
>   those before starting so the known design holes don't get baked in.

> **⚠️ Classification pending** (added 2026-06-01) — re-triage against the identity-foundation clean-cut target before acting on this plan. Not yet classified as identity-coupled vs. independent. See [`_wip/identity-foundation/ROADMAP.md`](../../_wip/identity-foundation/ROADMAP.md) § "Sibling-plan re-triage".

**Goal:** Preserve in-progress quiz and dictation practice across app kills and
make "save" language honest: either a practice activity is resumable, or the UI
says it is final.

**Approach:** Build a small practice-recovery layer parallel to tutoring-session
recovery. Quiz rounds already have server-side round IDs *and the server already
records every answer*, so quiz resume is mostly a server-reconstruction problem;
dictation playback has only in-memory data and must be persisted locally. Persist
minimal resumable state, slot one resume target into the existing home CoachBand,
and make the in-app "finish" action either truly resumable or honestly terminal.

## 80/20 Analysis — Should We Build This? (added 2026-06-09)

This plan solves a **copy** problem with a **persistence engine**. Its own
Approach line admits it: "make the in-app finish action either truly resumable or
honestly terminal" — and a later Product Decision says it "resolves `practice-4`
by building resume, not by re-wording a terminal action." The re-word *is* the
user value; the resume engine is gold-plating for a pre-launch app with no users.

- **What's actually harmful today:** the quiz quit modal's primary action,
  "Save and finish" / "Save progress and finish round" (`play.tsx:1185`,
  `quiz.play.saveAndFinish`), promises preservation while it *finalizes* a partial
  round. That lie is `practice-4`, and it ships in production code right now.
- **What's merely nice-to-have:** surviving an app-*kill* mid-quiz/dictation.
  Real, but low-frequency (activities are short; the loss window is minutes) and
  **unmeasured** — zero users means no signal that anyone is losing work.

### The split

| Slice | Cost | User value | Verdict |
|---|---|---|---|
| **Honest copy (T3-lite)** | ~1 hr: 7 locale strings + update BUG-268/269/892 tests | Kills the `practice-4` lie — the one real harm | **Do now** |
| **Quiz resume engine** (T1/T2/T5/T6) | New module + CoachBand slot + ancestor-chain nav + sign-out key + break test | Recover a ~2-min activity after app-kill | Defer to post-launch signal |
| **Dictation resume** (T4) | All of the above + persist LLM sentence objects + TTL + `[HIGH-1]` schema | Recover a ~30s activity | Defer; lowest value |

**Why the engine isn't a cheap half-build:** the cost is the *scaffold* (marker
module + CoachBand slot + nav chain + cleanup + break test), paid whether you
persist one activity or two. "Quiz is cheap because the server already records
the answers" is true only *relative to* dictation — the scaffold dominates either
way.

**The one thing that can't be cheated:** app-*kill* recovery requires persistence
by definition (a kill destroys the in-memory context). There is no clever
in-between for the kill case — it is "build the engine" or "make the copy honest
and accept the loss." Pre-launch, honest-copy wins.

### T3-lite — the do-now slice (no persistence, no new state) — `= T0 in Tasks`

Rename the modal's terminal action to tell the truth; touch nothing else:

- `quiz.play.saveAndFinish` ("Save and finish") → e.g. **"End round now"**
- `quiz.play.saveAndFinishLabel` ("Save progress and finish round") → e.g.
  **"Submit your answers so far as final"**
- Body copy (replaces "You've answered part of this round. Save it now, or jump
  back in for one more."): **"Your answers so far become your final score —
  unanswered questions are left blank."**
- Apply across all 7 locale files; update the BUG-268/269/892 assertions in
  `play.test.tsx` to the new honest strings (do **not** weaken — assert the new
  copy exactly, per the repo's test-reality rules).

This needs **no** marker, no AsyncStorage, no CoachBand change, and adds **no**
cross-account-leak surface. It is the recommended ship.

### When to build the full engine

Flip to "build" when **post-launch** telemetry or support shows learners losing
in-progress practice to app-kill. Then build **quiz-only** resume first (the
server-reconstructed half); add dictation (T4) only if dictation *specifically*
shows the pain — and fix `[HIGH-1]` before T4 either way.

---

> **Adversarial review applied 2026-05-31, grounded in the current code.** Every
> claim below was checked against the actual modules (`session-recovery.ts`,
> `summary-draft.ts`, `quiz/play.tsx`, `dictation/*`, `LearnerScreen.tsx`,
> `sign-out-cleanup.ts`, `profile.ts`). Finding IDs (e.g. `[HIGH-1]`) are cited
> inline where a decision or task changed. The "Existing Code Facts" section
> records the verified baseline so no task re-discovers it.

> **Second adversarial review — end-user perspective — applied 2026-06-09.**
> Re-grounded against `play.tsx`, `dictation/review.tsx`,
> `use-dictation-playback.ts`, `LearnerScreen.tsx`, `practice/index.tsx`. New
> findings `[HIGH-1..4]` and `[MEDIUM-1..4]` (dated 2026-06-09) are folded into
> the build sections below. Headline conclusion: the engine is deferred; the
> 80/20 copy fix is the recommended ship — see "80/20 Analysis" above.

## Existing Code Facts (verified)

- **`apps/mobile/src/lib/session-recovery.ts` EXISTS.** Tutoring-session
  recovery. SecureStore (via `./secure-storage`), key
  `sanitizeSecureStoreKey('session-recovery-marker-${profileId}')`
  (`session-recovery.ts:20-25`), 30-min freshness window
  (`RECOVERY_WINDOW_MS`, `:6`), **manual** `JSON.parse` + duck-type guard (no
  zod), value also carries `profileId` and is rejected on mismatch
  (`:62-69`). API: `writeSessionRecoveryMarker`, `readSessionRecoveryMarker`,
  `clearSessionRecoveryMarker`, `isRecoveryMarkerFresh`. This is the pattern to
  mirror.
- **`apps/mobile/src/lib/summary-draft.ts`** also uses **SecureStore** (not
  AsyncStorage), `KEY_PREFIX = 'summary-draft'` (`:5`), per-`(profileId,
  sessionId)` key, 7-day TTL (`DRAFT_TTL_MS`, `:10`), manual parse +
  `profileId`/`sessionId` revalidation, Sentry on failure (`:26-41`).
- **Sign-out cleanup is centralized.** `signOutWithCleanup`
  (`sign-out.ts:86`) → `clearProfileSecureStorageOnSignOut`
  (`sign-out-cleanup.ts`). It deletes `session-recovery-marker-${id}` from
  `PER_PROFILE_KEYS` (~`:57`), the legacy unscoped key from `GLOBAL_KEYS`
  (~`:105`), and prefix-wipes AsyncStorage `summary-draft-` and the per-profile
  `outbox-${id}-session` / `eduagent-query-cache`. **SecureStore has no
  `listKeys` API**, so only *deterministically-named* keys can be cleaned —
  prefix wipes are AsyncStorage-only.
- **Quiz play state is fully in-memory** (`quiz/play.tsx`): `useState`/`useRef`,
  `resultsRef` accumulates `QuestionResult[]`, `round` comes from
  `QuizFlowContext` (populated by `launch.tsx`, not from a route param). The
  server round id is `round.id` (`play.tsx:219`). **Every answer check already
  POSTs to the server** (`useCheckAnswer`) and completion POSTs via
  `useCompleteRound` — so the server already knows which questions are answered.
- **`quiz/[roundId].tsx` is the history/detail screen** (`useRoundDetail`), NOT
  the active-play route. There is no roundId-driven *play* route; play reads from
  context. Quiz resume must re-fetch the round and repopulate `QuizFlowContext`,
  then navigate to `play.tsx`.
- **`quiz/_layout.tsx` already exports** `unstable_settings = { initialRouteName:
  'index' }` (`:12-14`). The dictation layout must be checked (Task T5).
- **The in-app quiz quit modal already reads "Pause here?"** (title
  `quiz.play.pauseHere`, `play.tsx:1156`) but its primary action **"Save and
  finish"** (`quiz.play.saveAndFinish` = "Save and finish";
  `saveAndFinishLabel` = "Save progress and finish round", `en.json:772,779`)
  calls `handleSaveAndQuit` (`play.tsx:281`) → `submitRound()` →
  `completeRound` on the server → navigates to results. The body copy is
  "You've answered part of this round. Save it now, or jump back in for one
  more." (`play.test.tsx:1218`). **"Save progress" / "Save it now" promise
  preservation while the action finalizes** — this is exactly gap `practice-4`.
  A "Leave without saving" action (`handleConfirmQuit`, `play.tsx:1190`) discards
  without submitting. Existing tests: BUG-268, BUG-269, BUG-892 in
  `play.test.tsx`.
- **Dictation is entirely in-memory.** `dictation/_layout.tsx` provides
  `DictationDataContext` = `useState<DictationData | null>` (`completionKey`,
  `sentences`, `language`, `title?`, `topic?`, `mode`, `reviewResult?`).
  Sentences are **LLM-generated** by `useGenerateDictation` in `index.tsx`.
  `use-dictation-playback.ts` tracks `currentIndex` as `useState(0)`. The
  learner's typed corrections in `review.tsx` (`typedSentence`, `:34`) are never
  persisted. App kill loses everything.
- **`LearnerScreen.tsx` already surfaces recovery** via `CoachBand`
  (`FEATURE_FLAGS.COACH_BAND_ENABLED`). The `coachBand` `useMemo` has a fixed
  priority stack (`:312-399`): (1) tutoring `recoveryMarker` (read from
  SecureStore in a `useEffect` keyed on `activeProfile?.id`), (2) server
  `resumeTarget` (`useLearningResumeTarget`), (3) overdue review, (4) quiz
  discovery card. A practice resume must slot **into this stack**, not add a
  competing card.
- **Profile switch does not clear SecureStore.** `switchProfile`
  (`profile.ts:334`) resets profile-scoped TanStack queries and swaps the active
  id; per-profile SecureStore keys are key-isolated and only deleted on sign-out.
  So a profile-scoped key + read-time revalidation is sufficient isolation — the
  same pattern `session-recovery.ts` uses.

## Decisions Locked By Review

These resolve forks the draft left open. They are load-bearing for every task.

1. **Quiz: store a minimal server-pointer marker; reconstruct answers from the
   server.** `[HIGH-1]` Because every answer already POSTs to the server, the
   quiz marker does NOT need to carry the full answer array — it needs only
   `{ roundId, currentIndex }`. On resume, re-fetch the round (the server is the
   source of truth for which questions are answered/correct) and continue at the
   first unanswered question. This both simplifies the marker and removes the
   SecureStore size risk for quiz. The draft's "T2 writes answered results after
   each check" is downgraded to "writes the round pointer + current index"; the
   answered state is server-derived. `[MEDIUM-2 / 2026-06-09]` Consequence:
   `currentIndex` is a **hint only** — the resume authority is the server's first
   unanswered question, so never treat `currentIndex` as the resume position.
   Also note a question the learner *selected but had not checked* is lost on kill
   (`useCheckAnswer` POSTs only on check, `play.tsx:59`). That is acceptable, but
   state it — the UI must not imply an unsubmitted selection survives.
2. **Dictation: must persist the generated `sentences` array locally → use
   AsyncStorage.** `[HIGH-2]` Dictation sentences are LLM-generated and NOT
   faithfully reproducible by re-calling generation, so resume requires storing
   them. A multi-sentence dictation block can exceed the ~2 KB practical
   per-value ceiling of Android `expo-secure-store`, which both existing
   SecureStore modules avoid only because they store tiny payloads. Dictation is
   not secret data, so store the dictation marker in **AsyncStorage**
   (the app already uses AsyncStorage for `eduagent-query-cache` and the
   message outbox). AsyncStorage also supports the prefix-scan cleanup the
   sign-out path already uses for `summary-draft-`.
3. **One module, two kinds, AsyncStorage for both.** `[MEDIUM-1]` New module
   `apps/mobile/src/lib/practice-recovery.ts`. Use AsyncStorage for both quiz and
   dictation markers (one mechanism is simpler than splitting; dictation forces
   AsyncStorage anyway, and the quiz marker is tiny either way). Mirror the
   *conventions* of `session-recovery.ts` (profile-scoped key, freshness check,
   profileId revalidation) but not its storage backend.
4. **Profile-scoped key + read-time revalidation.** `[HIGH-3]` Cross-account
   local-state leakage is a known shipped bug class (sign-out `profileId` leak
   fixed in `237bcbf6c`; audit log at `profile-scope.ts:160`). Embed `profileId`
   in the AsyncStorage key AND re-check `marker.profileId === activeProfileId` on
   read before surfacing — exactly what `session-recovery.ts:62-69` does.
5. **One marker per profile, spanning both kinds.** `[MEDIUM-2-orig]` v1 keeps a
   single most-recent marker per profile; starting any new practice replaces it
   after confirmation. A learner cannot hold an in-progress quiz *and* dictation
   at once — the second start evicts the first. Explicit trade-off; the home card
   shows only the single most-recent activity. (A deterministic per-profile key
   also keeps sign-out cleanup trivial — see T6.)
6. **Practice resume must always have a reachable surface.**
   `[HIGH-2 / 2026-06-09]` The home CoachBand is a **single-slot priority stack**
   — `LearnerScreen.tsx`'s `coachBand` `useMemo` returns the *first* match and
   stops (`:312-392`). With practice at priority 2 behind the tutoring
   `recoveryMarker` (`:312`), a paused practice activity is **invisible** whenever
   a fresh tutoring marker also exists, and the Failure-Modes "other resumes from
   its own surface" line is empty — `practice/index.tsx` has **no** resume wiring
   today (grep-confirmed 2026-06-09). Therefore the `practice/index.tsx` resume
   affordance is **REQUIRED, not optional**: a paused activity must be reachable
   from the practice tab even when the CoachBand slot is occupied. Otherwise the
   plan promises "resume later" and then provides no later — the exact dishonesty
   it exists to remove.

## Marker Schema

`[HIGH-4]` The marker is the feature's contract, so it is specified here. The
existing modules hand-roll parsing; this plan upgrades to zod (consistent with
`@eduagent/schemas` usage elsewhere). Note the quiz variant carries no answer
array (Decision 1):

```ts
// apps/mobile/src/lib/practice-recovery.ts
import { z } from 'zod';
import { dictationSentenceSchema } from '@eduagent/schemas'; // [HIGH-1] real sentence shape (dictation.ts:18)

export const PRACTICE_MARKER_VERSION = 1;

const quizMarker = z.object({
  kind: z.literal('quiz'),
  roundId: z.string(),                 // server round; answers reconstructed server-side
  currentIndex: z.number().int().nonnegative(),
});

const dictationMarker = z.object({
  kind: z.literal('dictation'),
  completionKey: z.string(),           // matches DictationData.completionKey
  language: z.string(),
  // [HIGH-1 / 2026-06-09] MUST store full DictationSentence OBJECTS, not
  // z.array(z.string()). Playback reads sentence.chunks /
  // sentence.chunksWithPunctuation / sentence.withPunctuation
  // (use-dictation-playback.ts:95-108). A string[] loses the LLM-generated
  // chunking + punctuation variants, so resumed playback falls back to the
  // mechanical splitIntoChunks path and SOUNDS DIFFERENT (different chunking,
  // pacing, punctuation read-aloud) than before the kill — silently breaking
  // the "resume = same activity" promise.
  sentences: z.array(dictationSentenceSchema),
  currentSentenceIndex: z.number().int().nonnegative(),
  // [MEDIUM-3 RESOLVED 2026-06-09 — do NOT persist learner transcription.]
  // Playback has no typing (use-dictation-playback is TTS-only); the only typed
  // content is review.tsx corrections, which are DELIBERATELY throwaway even in
  // the live flow ("Accept whatever they type — the value is in the rewriting
  // act", review.tsx:43; typedSentence is never stored). Persisting them would
  // store MORE state than the live activity keeps and contradict the design.
  // No transcription field.
});

export const practiceMarkerSchema = z.object({
  schemaVersion: z.literal(PRACTICE_MARKER_VERSION),
  profileId: z.string(),
  createdAt: z.string(),               // ISO; drives dictation TTL
  updatedAt: z.string(),               // ISO; bumped each step
  payload: z.discriminatedUnion('kind', [quizMarker, dictationMarker]),
});

export type PracticeMarker = z.infer<typeof practiceMarkerSchema>;
```

`schemaVersion` makes the "old app version" failure mode deterministic: a bumped
version fails `safeParse` and the marker is cleared rather than half-restored.

## Scope

In scope:
- `apps/mobile/src/lib/practice-recovery.ts` (new)
- `apps/mobile/src/app/(app)/quiz/play.tsx` (write marker; wire resume)
- `apps/mobile/src/app/(app)/quiz/launch.tsx` (resume entry: reconstruct round → context)
- `apps/mobile/src/app/(app)/quiz/_layout.tsx` (`QuizFlowContext` may need a resume seed)
- `apps/mobile/src/app/(app)/dictation/playback.tsx` + `dictation/_layout.tsx`
  (`DictationDataContext`) + `hooks/use-dictation-playback.ts`
- `apps/mobile/src/app/(app)/dictation/index.tsx` (write marker on generation)
- `apps/mobile/src/components/home/LearnerScreen.tsx` (slot into `coachBand` stack)
- `apps/mobile/src/lib/sign-out-cleanup.ts` (add practice key to `PER_PROFILE_KEYS`)
- `apps/mobile/src/app/(app)/practice/index.tsx` (**REQUIRED** resume affordance — `[HIGH-2]`; guarantees a paused activity is reachable when the single CoachBand slot is taken)

Out of scope:
- Quiz scoring rules for completed rounds.
- Long-term history of abandoned attempts.
- Homework OCR/session flows.
- Cross-device practice resume (local device only).
- More than one active marker per profile (Decision 5).
- `quiz/[roundId].tsx` (history/detail screen — not part of resume).

## Product Decisions

- `[HIGH-5]` **Make the quiz modal honest.** Because the server already records
  answers, a *true* resume is cheap. Wire the in-app modal to: **"Pause and
  resume later"** — write the `{ roundId, currentIndex }` marker, leave the
  server round incomplete, navigate home; the CoachBand then offers resume. Keep
  a distinct **"Finish now"** action that submits partial results as final
  (today's `handleSaveAndQuit` behavior) and clears the marker. The current
  "Save and finish" / "Save progress and finish round" copy is removed — it
  promised preservation while finalizing. This resolves `practice-4` by building
  resume, not by re-wording a terminal action. `[HIGH-3 / 2026-06-09]` The
  **"Finish now" action MUST state its consequence** before submitting — e.g.
  "Your answers so far become your final score — unanswered questions are left
  blank." A bare "Finish now" reproduces the same dishonesty on the other button:
  the learner taps expecting "just stop" and silently finalizes a low partial
  score that lands in their quiz record / mastery. (This same consequence copy is
  the entire payload of the **T3-lite 80/20 fix** — see "80/20 Analysis" — which
  is shippable on its own without the resume engine.)
- Quiz app-kill resume re-fetches the active round; the server's answered state
  decides the resume position (first unanswered question). If the round is
  completed/expired/not-found, clear the marker and show the expired state.
- Dictation resume restores generated sentences + current index from the marker.
  No audio auto-recording.
- One marker per profile (Decision 5); starting new practice replaces it after
  confirmation. `[MEDIUM-1 / 2026-06-09]` The replace confirmation **MUST name
  what is discarded** — e.g. "Replace your paused fractions quiz?" — not a
  generic "you have unsaved progress, continue?". A vague prompt is the same
  vague "save"-language dishonesty this plan exists to remove.
- `[MEDIUM-4 / 2026-06-09]` **Guardian-proxy gating.** The practice resume
  CoachBand entry (and any `practice/index.tsx` resume affordance) MUST be
  suppressed when a guardian is viewing a child's home in proxy mode
  (`isParentProxy`), so a parent's tap cannot resume or "Finish now" the child's
  round and pollute the child's stats / mastery. Audit the existing tutoring
  `recoveryMarker` entry for the same gap while here (`LearnerScreen.tsx:312`).

## Staleness / TTL

`[HIGH-6]` The draft's "Resume after TTL" was undefined. Define per kind:

- **Quiz:** the server round is the source of truth. On resume, re-fetch; if the
  server says completed/expired/not-found, clear the marker. The client invents
  no TTL it cannot enforce. (Server round lifetime confirmed to exist via
  `useRoundDetail`/`useCompleteRound`; if there is a server-side expiry it
  governs — otherwise an active round simply stays resumable until completed.)
  `[HIGH-4 / 2026-06-09]` Two follow-ups before building: (1) **Verify the server
  round lifetime as a code fact** (does a paused round expire, and after how
  long?) — it is a lookup, not an open product question. If the server *does*
  expire rounds, the CoachBand must not keep offering "resume your quiz" for a
  round that will greet the learner with "this quiz expired" — a broken promise.
  (2) Independently, give the quiz marker a **client-side display TTL** (stop
  surfacing it in the CoachBand after e.g. 7 days even if the round is technically
  still alive) so a forgotten pause does not permanently occupy the single
  practice slot ahead of fresher, more useful prompts (a due review, a discovery
  card).
- **Dictation:** no server round → client TTL of **7 days** from `createdAt`
  (matching `summary-draft.ts` `DRAFT_TTL_MS`). Older markers are treated as
  expired and cleared on read.

## Tasks

> **Sequencing (2026-06-09):** **T0 is the recommended ship now** and is
> independent of the engine. T1–T6 (the persistence engine) are **deferred** to a
> post-launch signal — see "80/20 Analysis". Do not start T1–T6 without that
> signal; if you do, honor the `[HIGH-1..4]`/`[MEDIUM-1..4]` corrections folded in
> above.

- [ ] **T0 (DO NOW — 80/20, no persistence; = "T3-lite" in 80/20 Analysis): Make the quiz quit modal honest.**
  Done when: the modal's terminal action no longer says "save". Rename
  `quiz.play.saveAndFinish` → "End round now" and `quiz.play.saveAndFinishLabel`
  → "Submit your answers so far as final"; replace the body ("…Save it now, or
  jump back in…") with the consequence: "Your answers so far become your final
  score — unanswered questions are left blank." Apply across all 7 locale files.
  **Update the BUG-268/269/892 assertions in `play.test.tsx` to the new honest
  strings** (do not weaken — assert the new copy exactly). Adds no marker, no
  AsyncStorage, no CoachBand change, no leak surface. Resolves the *harmful* half
  of `practice-4` on its own. **This is the only task recommended for now.**

- [ ] **T1: Add `practice-recovery.ts` store.** *(deferred — engine)* Done when:
  the module writes profile-scoped markers to AsyncStorage (key embeds
  `profileId`), validates with `practiceMarkerSchema` on every read, supports
  `quiz` and `dictation` kinds, clears on `safeParse` failure, and enforces the
  dictation 7-day TTL. API: `writeMarker`, `readMarker(activeProfileId)`,
  `clearMarker(activeProfileId)`. Unit tests cover write/read/clear, **profile
  mismatch (A's marker not returned for B)**, corrupt marker, and
  schema-version mismatch.

- [ ] **T2: Persist quiz round pointer during play.** *(deferred — engine)* Done when:
  `quiz/play.tsx` writes `{ kind:'quiz', roundId, currentIndex }` after each
  answer check; an app-kill/remount path re-fetches the round and resumes at the
  first unanswered question (server-derived); a completed/expired/missing round
  clears the marker with a clear recovery message. Tests cover active-round
  resume and stale-round clear. Covers `practice-1`.

- [ ] **T3: Add the two-action modal (pause + honest finish).** *(deferred —
  engine; the honest-finish copy alone is already covered by T0)* Done when:
  `[HIGH-5]` the modal offers **"Pause and resume later"** (writes the marker,
  leaves the round incomplete) and a distinct honest terminal action; no visible
  action implies future completion while finalizing. `[HIGH-3]` the terminal
  action states its consequence ("Your answers so far become your final score —
  unanswered questions are left blank"). New i18n keys replace
  `quiz.play.saveAndFinish` / `saveAndFinishLabel` in all 7 locale files.
  **Update the existing BUG-268/269/892 tests in `play.test.tsx` to assert the new
  two-action behavior** (do not weaken them — pause leaves an active marker +
  active server round; finish clears the marker + completes the round). Note: if
  T0 shipped first, this task only *adds the "Pause and resume later" branch* — the
  honest terminal copy is already live. Covers the resume half of `practice-4`.

- [ ] **T4: Persist dictation playback progress.** *(deferred — engine; lowest
  value, see 80/20)* Done when: `dictation/index.tsx` writes the marker
  (`completionKey`, `language`, `sentences`, `currentSentenceIndex`) once
  generation completes, and `use-dictation-playback.ts` bumps
  `currentSentenceIndex` on advance; an app-kill/remount restores sentences +
  index and replay starts at the next unplayed sentence; intentional exit asks
  keep-or-discard. `[HIGH-1]` the marker stores **`z.array(dictationSentenceSchema)`**
  (full sentence objects), NOT `string[]` — otherwise resumed playback loses LLM
  chunking + punctuation and sounds different than before the kill. `[MEDIUM-3
  RESOLVED]` do **not** persist `review.tsx` corrections — playback has no typing
  and those corrections are deliberately throwaway even live (`review.tsx:43`);
  persisting them would store more state than the activity keeps. Tests cover
  resume (with chunking/punctuation preserved), discard, and corrupt marker.
  Covers `practice-2`.

- [ ] **T5: Slot practice resume into the home CoachBand + guaranteed practice-tab
  surface + safe navigation.** *(deferred — engine)* Done when: `LearnerScreen.tsx`'s
  `coachBand` `useMemo` reads the practice marker and inserts a resume entry into
  the **existing priority stack** (proposed order: tutoring `recoveryMarker` →
  **practice marker** → server `resumeTarget` → review → discovery; confirm with
  product). `[HIGH-2]` Because the CoachBand renders only ONE entry, ALSO render a
  resume affordance on `practice/index.tsx` so a paused activity is reachable when
  the slot is taken by the tutoring marker — a resume entry that only lives in the
  CoachBand can be permanently buried. `[MEDIUM-4]` Suppress both surfaces under
  `isParentProxy`. Tapping routes via the **full ancestor chain** (`CLAUDE.md`
  cross-stack rule): quiz → `quiz` then `quiz/launch` (reconstructs the round into
  `QuizFlowContext`, forwards to `play`); dictation → `dictation` then
  `dictation/playback`. Verify the **dictation `_layout.tsx` exports**
  `unstable_settings = { initialRouteName: 'index' }` (quiz already does,
  `_layout.tsx:12-14`); add if missing. Starting a different practice activity
  warns before replacing the marker, **naming the discarded activity** (`[MEDIUM-1]`).
  Tests cover target-string creation for both kinds AND the both-markers-fresh case
  (practice still reachable via the practice tab); back-stack behavior is verified
  via E2E/manual.

- [ ] **T6: Cleanup on completion and sign-out.** *(deferred — engine)* Done when:
  completing a quiz/dictation clears its marker; `sign-out-cleanup.ts` adds the
  deterministic per-profile practice key to `PER_PROFILE_KEYS` (the same place
  `session-recovery-marker-${id}` lives, ~`:57`) so `signOutWithCleanup` wipes it
  — do not fork a second sign-out path. `[HIGH-7]` **Break test required**
  (cross-account-leak surface, `CLAUDE.md` Fix Development Rules): write a marker
  as profile A, switch to B, assert no CoachBand practice entry and
  `readMarker(B)` returns null; revert the key-scoping line and confirm the test
  fails (red-green). Plus: sign out, assert the practice key is gone.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Marker corrupt or from old app version | `safeParse` fails (incl. `schemaVersion` mismatch) | CoachBand practice entry not shown; marker cleared on read | Start a new practice activity |
| Server quiz round abandoned/expired | Server reports round completed/expired/not-found on resume | "This quiz expired" state | Start a new round |
| Dictation content missing after app kill | Marker incomplete or fails schema | "This dictation cannot be resumed" | Start a new dictation |
| Dictation marker older than TTL | `createdAt` > 7 days | Entry not shown; marker cleared on read | Start a new dictation |
| Resume points at an already-completed round | `[MEDIUM-5]` completion-clear failed, then resume tapped | On open, server says round complete → marker cleared, routed to results | Start a new round |
| Both tutoring + practice markers fresh | Two recovery sources at once | Single CoachBand entry per the fixed priority order (T5); practice falls to 2nd | `[HIGH-2]` Practice still reachable via the REQUIRED resume affordance on the practice tab — never silently buried |
| Guardian views child's home in proxy mode | `isParentProxy` true | No practice resume entry on CoachBand or practice tab | `[MEDIUM-4]` Child resumes from their own session; parent tap can't finalize the child's round |
| User starts new practice with old marker | New round/dictation requested | Replace-progress confirmation | Continue old or replace |
| Profile switch | Different active profile | No other profile's entry (key-scoped + read-revalidated) | Switch back to original profile |
| Storage write fails | AsyncStorage error | Non-blocking warning after current action | Continue current in-memory practice |

> Silent clear of a corrupt/stale marker is acceptable: the
> "silent-recovery-without-escalation-is-banned" rule in `CLAUDE.md` is scoped to
> billing/auth/webhook code, which practice recovery is not. No structured metric
> is required for marker GC. (The existing `summary-draft.ts` does report
> SecureStore *failures* to Sentry; mirror that for AsyncStorage write failures.)

## Open Question (single remaining product call)

- **T5 CoachBand priority** — confirm where the practice marker sits relative to
  the tutoring `recoveryMarker` and the server `resumeTarget`. Proposed:
  tutoring active session first (highest intent), practice second, server
  resume-target third. This is the one genuine product decision; everything else
  is settled by the code facts above.

## Verification

Focused checks (the `(app)` segments are quoted — bare parens are a grouping
operator in PowerShell and mis-parse otherwise):

```powershell
Push-Location apps/mobile
pnpm exec jest --findRelatedTests `
  "src/app/(app)/quiz/play.tsx" `
  "src/app/(app)/quiz/launch.tsx" `
  "src/app/(app)/dictation/playback.tsx" `
  "src/app/(app)/dictation/index.tsx" `
  "src/components/home/LearnerScreen.tsx" `
  "src/lib/sign-out-cleanup.ts" --no-coverage
pnpm exec jest --testPathPattern practice-recovery --no-coverage
pnpm exec tsc --noEmit
Pop-Location
```

If quiz API persistence changes are needed (they should not be — the server
already records answers, Decision 1):

```powershell
pnpm exec nx run api:test --testPathPattern=quiz
pnpm exec nx test:integration api
```
