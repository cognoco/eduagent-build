# Quiz, challenge round & mastery — Functional Atlas

> Scope: `apps/mobile/src/app/(app)/quiz/**`, `components/quiz/**`,
> `apps/api/src/routes/{quiz,challenge-round}.ts`,
> `services/{quiz,challenge-round,concept-mastery,concept-capture}/**`.
> Read-only audit, branch `new-llm`, 2026-06-09. Every claim cites `file:line`.

## TL;DR — two systems share one word "challenge"

The domain holds **three distinct, mostly-unrelated features** that the naming
collapses together. Untangling them is the single most important input to a
one-screen redesign:

1. **Quiz** (`quiz/**`, `services/quiz/**`) — a standalone mini-game flow:
   Capitals / Guess-Who / Vocabulary multiple-choice rounds. Self-contained
   stack with 6 screens. Has its own "challenge" — a **difficulty-bump banner**
   (3 perfect rounds → harder questions), `services/quiz/difficulty-bump.ts:1-25`.
2. **Challenge Round** (`services/challenge-round/**`, `routes/challenge-round.ts`)
   — the **mastery-verification** system. It is NOT a screen. It runs *inside a
   learning-session chat* as an offer card → in-chat Q&A → drafted note. Earns
   `mastery_challenge_verified_at`. Totally separate from the Quiz game above.
3. **Concept capture / mastery** (`concept-capture.ts`, `concept-mastery.ts`) —
   the additive ledger written by a completed Challenge Round; read elsewhere
   (notes, progress) to show per-concept verified/weak signals.

The word "challenge" appears in the Quiz UI (`quiz/index.tsx:251-256` explainer,
`quiz/launch.tsx:255-289` banner) AND as the Challenge Round mastery feature —
these are unrelated. This is itself a top complexity signal (see last section).

---

## Screens (route -> purpose)

All quiz screens live under one Expo Router stack, `quiz/_layout.tsx`. The stack
is gated: `quiz/_layout.tsx:115-127` redirects to `/home` when
`!navigationContract.canEnter('quiz')` (V1 flag on) or `isParentProxy` (V0).
`unstable_settings = { initialRouteName: 'index' }` (`_layout.tsx:12-14`).

| Route | File | Purpose / what the user DOES |
|---|---|---|
| `/(app)/quiz` (index) | `quiz/index.tsx` | Activity picker. Cards: Capitals, Guess Who, one Vocabulary card per active `four_strands` language subject (`index.tsx:279-314`), plus a dimmed "add a language" locked card when none exist (`index.tsx:340-349`). Each card stores activity in `QuizFlowContext` and pushes `launch`. Shows best-score / rounds-played subtitle from `useQuizStats`. |
| `/(app)/quiz/launch` | `quiz/launch.tsx` | Transient generation screen. Fires `POST /quiz/rounds` via `useGenerateRound` (`launch.tsx:153-176`), shows desk-lamp loader with rotating copy, 20s soft "taking longer" hint + 30s hard-timeout error panel (`launch.tsx:209-245`). If response has `difficultyBump`, shows a one-tap **challenge banner** before play (`launch.tsx:255-289`). Then `router.replace` → `play`. |
| `/(app)/quiz/play` | `quiz/play.tsx` | The actual gameplay (1212 lines). One question at a time; MC options or free-text (`freeTextEligible`) or Guess-Who clue-reveal. Each answer → `POST /quiz/rounds/:id/check`. Dot progress, count-up timer, dispute-answer link, fun-fact reveal, quit/save-quit modal. Final question auto-submits `POST .../complete`. |
| `/(app)/quiz/results` | `quiz/results.tsx` | Score + tier (perfect/great/nice), XP earned, theme, "What you missed" list (wrong answer vs correct + fun fact), Play-Again (consumes prefetched round if any), Done (→ practice), and a "View History" link. |
| `/(app)/quiz/history` | `quiz/history.tsx` | Date-grouped list of recent completed rounds (`useRecentRounds`, max 10). Each row → `[roundId]` review. Vocabulary rows get language extracted from theme (`history.tsx:60-66`). Empty / error / loading states all actionable. |
| `/(app)/quiz/[roundId]` | `quiz/[roundId].tsx` | Read-only completed-round review. Per-question correct/wrong, your answer, correct answer, expandable clues (Guess-Who) + fun-fact. Rejects non-`completed` rounds (`[roundId].tsx:19-33`). |

Supporting component: `components/quiz/GuessWhoQuestion.tsx` (clue-reveal sub-UI;
emits `onCheckAnswer`/`onResolved` consumed by `play.tsx:932-936`).

**Challenge Round has NO screen.** Its UI is three pieces injected into the
**session chat** screen (`app/(app)/session/index.tsx`):
- `ChallengeRoundBanner` (active-round "question N of M" strip) `session/index.tsx:1123-1129`, component at `components/session/ChallengeRoundBanner.tsx:4-25`.
- `ChallengeOfferCard` (accept / decline / don't-ask-again) `session/index.tsx:1130-1139`.
- `DraftedNoteReview` (edit + save the auto-drafted note) `session/index.tsx:1140-1150`.

---

## Capabilities (user task -> backend process file:line)

### Quiz game

| User task | API route | Service entry (file:line) | Reads / writes |
|---|---|---|---|
| Generate a round | `POST /quiz/rounds` `routes/quiz.ts:164-193` | `buildAndGenerateRound` `services/quiz/orchestrate-round.ts:27` → `generateQuizRound` `services/quiz/generate-round.ts` | Reads recent answers, vocab/guess-who context, due mastery items; LLM-generates questions; **writes** a `quiz_rounds` row. Answers stripped before client (`toClientSafeQuestions` `routes/quiz.ts:79-126`). |
| Prefetch next round (mid-round) | `POST /quiz/rounds/prefetch` `routes/quiz.ts:195-215` | same `buildAndGenerateRound` | Returns only `{id}`. **Hook `usePrefetchRound` is defined (`hooks/use-quiz.ts:44`) but NOT called in any production screen** — dead capability. |
| Check one answer | `POST /quiz/rounds/:id/check` `routes/quiz.ts:306-345` | `checkQuizAnswerWithCorrect` `services/quiz/*` (barrel `services/quiz/index.ts`) | Server-side grade; reveals `correctAnswer` only on wrong (`routes/quiz.ts:333-343`). Ownership via `getRoundByIdOrThrow`. |
| Complete round (score + XP) | `POST /quiz/rounds/:id/complete` `routes/quiz.ts:346-372` | `completeQuizRound` | **Writes** score/total/xp/results to `quiz_rounds`; dispatches `app/streak.record` via `safeSend` (`routes/quiz.ts:360-368`). |
| List recent rounds | `GET /quiz/rounds/recent` `routes/quiz.ts:216-238` | `listRecentCompletedRounds` (limit 10) | Read-only. |
| Round detail (history review) | `GET /quiz/rounds/:id` `routes/quiz.ts:239-305` | `getRoundByIdOrThrow` | Completed rounds expose `correctAnswer`+aliases (`routes/quiz.ts:252-291`). |
| Stats per activity | `GET /quiz/stats` `routes/quiz.ts:398-404` | `computeRoundStats` | Best score, rounds played, total XP. |
| Mark missed-item discovery surfaced | `POST /quiz/missed-items/mark-surfaced` `routes/quiz.ts:374-397` | `markMissedItemsSurfaced` | Consumed ONLY from Home coaching card `hooks/use-coaching-card.ts:67`, not from any quiz screen. |
| Dispute a wrong answer | (client-only flag) `play.tsx:534-542` | folded into `results` of `complete` call as `disputed:true` | No dedicated route; surfaced for triage. |
| Difficulty bump | (server-internal) | `shouldApplyDifficultyBump` `services/quiz/difficulty-bump.ts:10` | 3 perfect rounds in 14 days → harder questions + banner. |

### Challenge Round (mastery)

| User task | Route / trigger | Service (file:line) |
|---|---|---|
| Server OFFERS a Challenge Round | inside session exchange stream; gated by `evaluateChallengeReadiness` `services/challenge-round/trigger.ts:74` | LLM proposes via `signals.challenge_round_offer`; server suppresses unless eligible. Many gates: learning-session only, no struggle, ≥5 exchanges, correct-streak ≥2, retention=strong (or new-topic evidence), quota turns ≥3, free-tier quota ≥5%, 24h cooldown (`trigger.ts:22-135`). |
| Accept | `POST /challenge-round/accept` `routes/challenge-round.ts:23-36` | `acceptChallengeRound` `services/challenge-round/route-actions.ts:81` → `transitionChallengeState({type:'accept'})` |
| Decline / don't-ask-again | `POST /challenge-round/decline` `routes/challenge-round.ts:37-50` | `declineChallengeRound` `route-actions.ts:97`; writes a `challenge_round_cooldowns` row (`route-actions.ts:112-128`). |
| Abort | `POST /challenge-round/abort` `routes/challenge-round.ts:51-64` | `abortChallengeRound` `route-actions.ts:132` |
| Answer the in-chat questions | normal session chat turns | state machine advances via `answer_complete` `services/challenge-round/state.ts:102-146`; cap 3 questions (`caps.ts:13`). |
| Mastery decided on last answer | session exchange runtime | **`decideMasteryAndReview`** `services/challenge-round/evaluation.ts:128`, invoked from `session-exchange.ts:804`. ALL concepts `solid` → `markMasteryVerified` (`evaluation.ts:169-177`); any `partial`/`missing`/`misconception` blocks it. |
| Persist mastery / weak spots | session exchange runtime | `persistChallengeRoundMasteryEvidence` (writes `assessments` row w/ `masteryChallengeVerifiedAt`) `services/challenge-round/persistence.ts:135`; `upsertChallengeRoundWeakSpots` (writes `needs_deepening_topics`, `source='challenge_round'`, 7-day `pending_review` TTL) `persistence.ts:165`. Also `captureConceptMastery` `concept-capture.ts:81` writes `concepts` + `concept_mastery` ledger, called from `session-exchange.ts:829`. |
| Review & save drafted note | `DraftedNoteReview` card in chat → `useChallengeRound.saveNote` `hooks/use-challenge-round.ts:120-127` → `POST /notes` | Draft built + hallucination-guarded by `validateNoteDraft` (lexical-overlap ≥0.4 vs verified learner text) `services/challenge-round/note-draft.ts:117`. |

---

## Navigation depth map

Tab roots in scope: **Practice** (study tab) and **Home** (learner home).
Quiz is reached only via Practice or a Home coaching card — there is **no quiz
tab**. Depth = taps from a tab root.

| Capability | Path | Depth | Flag |
|---|---|---|---|
| Open quiz picker | Practice tab → "Quiz" card (`practice/index.tsx:397`) → `/quiz` | 1 | — |
| Start Capitals/Guess-Who | quiz index card → launch → play | **3** | >2 |
| Start Capitals/Guess-Who (shortcut) | Practice hub direct `openQuizActivity` (`practice/index.tsx:403`) → launch → play | 2 | (overlaps index — two ways in) |
| Start Vocabulary quiz | quiz index → per-language card → launch → play | **3** | >2; only if a `four_strands` subject exists |
| See results | auto after final question | (in-flow) | — |
| View quiz history | Practice → quiz index → … OR results → "View History" → `/quiz/history` | 2–3 | — |
| Review a past round | history row → `/quiz/[roundId]` | **3–4** | >2 — deeply buried read-only screen |
| Quiz discovery (re-test missed) | Home → coaching card → deep-link to launch | 1–2 | only when a `quiz_discovery` card is live (`use-coaching-card.ts:50`) |
| **Challenge Round** (entire mastery feature) | only appears mid-chat in a learning session when server offers; user cannot navigate to it | **N/A — non-navigable** | gated by ~9 runtime conditions in `trigger.ts` |
| Edit/save drafted mastery note | inside same session chat, after challenge completes | in-flow | — |

Flagged >2 deep: **Capitals/Guess-Who/Vocabulary play (3), round review (3–4)**.
The round-review screen `[roundId]` is the deepest read-only surface and is
reachable only through history.

---

## Backend processes & data model

**Tables touched**
- `quiz_rounds` — one row per generated round; status active→completed; holds
  `questions` JSON (full answers, server-side only), `results`, score/total/xp.
- `practice_activity_events` — per-answer events (referenced in
  `orchestrate-round.ts:76-80` IDOR note).
- `challenge_round_cooldowns` — per profile+topic, 24h offer cooldown
  (`route-actions.ts:112-128`, `trigger.ts:128-133`).
- `assessments` — Challenge Round writes `verificationDepth:'transfer'`,
  `status:'passed'`, `masteryChallengeVerifiedAt` (`persistence.ts:142-156`).
- `needs_deepening_topics` — weak-spot routing, `source='challenge_round'`,
  `pending_review` with 7-day TTL (`persistence.ts:17, 207-219`).
- `concepts` + `concept_mastery` — additive per-concept ledger upserted by
  `captureConceptMastery` (`concept-capture.ts:99-157`); supersedes stale live
  rows (`concept-capture.ts:43-69`).

**Challenge Round state machine** (`services/challenge-round/state.ts:45`):
`undefined → offered → accepted → active → drafting → complete` (+ `declined`,
`aborted`, re-offer from complete/aborted). Persisted in
`learning_sessions.metadata.challengeRound` (`route-actions.ts:24-33`,
`session-exchange.ts:2008-2027`). Pure function; callers persist via
`persistSessionMetadata`. Self-healing terminal guard for corrupt state
(`state.ts:120-146`).

**Server-owned mastery policy** (CLAUDE.md non-negotiable, verified):
- LLM proposes per-concept `solid|partial|missing|misconception` via
  `signals.challenge_round_evaluation`.
- `validateEvaluationEventIds` (`evaluation.ts:82`) rejects the whole evaluation
  unless every `answerEventId` is a real `user_message` owned by this profile in
  this session — replaces LLM `learnerQuote` with real DB content.
- `decideMasteryAndReview` (`evaluation.ts:128`): empty → `invalid` (never
  verifies — CRIT-9 guard `evaluation.ts:131-139`); all-missing → `reteach`;
  every concept solid → `verified`+`markMasteryVerified`; otherwise `partial`.
- Note draft sourced ONLY from `solidAnswerQuotes`; lexical-overlap guard
  `validateNoteDraft` (`note-draft.ts:117`, threshold 0.4 `caps.ts:19`).
- Read-side freshness: `resolveMasteryVerificationState` (`verification.ts:56`)
  downgrades a verified topic to `stale` if a newer `pending_review`/`active`
  weak-spot row exists.

**Hard caps** (`caps.ts`): `MAX_CHALLENGE_QUESTIONS=3`,
`MAX_CHALLENGE_ANSWER_CHARS=2000`, `CHALLENGE_OFFER_COOLDOWN_HOURS=24`.

**Gating summary**: Quiz routes call `assertNotProxyMode(c)` on all mutating
endpoints (`routes/quiz.ts:174,311,351,384`) and `requireProfileId`. Quiz stack
blocks parent-proxy / non-`canEnter` users (`_layout.tsx:121-123`). Challenge
Round is learning-session-only, owner-implicit (runs in the learner's own
session), free-tier quota-gated. No `isOwner`/age gate on quiz play itself.

---

## Complexity signals & redesign notes

1. **"Challenge" is overloaded 3 ways.** Quiz difficulty-bump banner
   (`launch.tsx:255-289`), the quiz index "challenge explainer" copy
   (`index.tsx:251-256`), and the Challenge Round mastery feature are unrelated
   but share the word. Any one-screen design must rename or merge.
2. **Quiz is a 3-deep stack with two entry paths.** Practice hub both links to
   the quiz **index** (`openQuiz`) AND launches activities **directly**
   (`openQuizActivity`/`openVocabularyQuiz`, `practice/index.tsx:397-423`),
   bypassing the index. Two doors to the same flow = redundant nav.
3. **Round review (`[roundId]`) is buried 3–4 taps deep** and reachable only via
   history. Low discoverability for a read-only recap.
4. **Dead / orphaned capability:** `usePrefetchRound` (`use-quiz.ts:44`) and the
   `POST /quiz/rounds/prefetch` route exist but no production screen calls the
   hook — wired-but-untriggered. (Results screen prefetch uses a *roundId stored
   in context*, set elsewhere; the dedicated prefetch hook is unused.)
5. **Challenge Round is invisible-by-design.** It only appears when ~9 runtime
   gates pass (`trigger.ts`). A user can never *find* it; it's pure
   server-push. For a one-screen redesign this is the opposite extreme from the
   quiz game — one feature is a discoverable menu, the other is unreachable.
6. **Modal-on-content in play.** Quit confirmation is an in-app `Modal`
   (`play.tsx:1137-1209`) layered over the play screen; the play screen itself
   has 4 distinct full-screen states (no-round, malformed, error, normal).
7. **Two "mastery" notions.** Quiz tracks score/XP/streak (gamified); Challenge
   Round tracks concept mastery (pedagogical). They never connect — a perfect
   quiz streak does not feed concept mastery, and vice-versa.
8. **Difficulty-bump and Challenge Round both claim "harder, you're ready"**
   semantics in different surfaces — candidate to unify into one "ready to
   prove it" moment.

---

## Overlaps with other domains

- **Notes:** Challenge Round's drafted note saves via the **Notes** domain
  (`useChallengeRound.saveNote` → `useCreateNote` → `POST /notes`,
  `hooks/use-challenge-round.ts:120-127`). Note display also reads
  `getConceptMasterySignalsForTopics` (`concept-mastery.ts:24`) — mastery
  surfaces inside notes too.
- **Sessions / chat:** The *entire* Challenge Round UX lives inside the session
  chat screen (`session/index.tsx`), not in this domain's screens. The
  orchestration (`decide → persist → capture → draft`) runs in
  `services/session/session-exchange.ts:796-851`. This domain's backend logic is
  driven by the session-exchange flow, not by the quiz/challenge routes.
- **Progress / mastery:** `needs_deepening_topics` (weak spots) and
  `assessments.masteryChallengeVerifiedAt` are consumed by the Progress and
  Review domains; `concept_mastery` is read for per-concept verified badges.
  Mastery state is thus shown in ≥3 places (notes, progress, review-due).
- **Practice hub:** Quiz stats (`useQuizStats`) are surfaced both on the quiz
  index AND duplicated as cues on the Practice hub
  (`practice/index.tsx:307,323-364`) — same data, two surfaces.
- **Streaks:** Completing a quiz round dispatches `app/streak.record`
  (`routes/quiz.ts:360-368`) — quiz feeds the cross-app streak/gamification
  domain.
- **Home:** A `quiz_discovery` coaching card on the learner home
  (`use-coaching-card.ts:50`, `LearnerScreen.tsx:127`) is a *fourth* entry path
  into the quiz flow (after Practice card, Practice direct-launch, and history's
  "try a quiz").
- **Vocabulary / Library:** Vocabulary quiz only appears for active
  `four_strands` language subjects (`quiz/index.tsx:115-121`); the locked card
  deep-links to **Library** (`index.tsx:345`). Vocabulary content comes from the
  Vocabulary domain (`getVocabularyRoundContext`).
