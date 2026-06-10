# Path 7 + Assessment + Interleaved — Quiz & Self-Test Surfaces: Deep-Dive
> Cluster scope: Quiz mini-game (Capitals/Guess-Who/Vocabulary), the Assessment verification-depth ladder (recall→explain→transfer), the three parallel retention universes (`retention_cards` vs `vocabulary_retention_cards` vs `quiz_mastery_items`), the dormant Interleaved Retrieval engine, and the `gap_fill` spawn. · Analyst: quiz · Date 2026-06-10 · Sources verified at HEAD of `new-llm`.

VERIFIED = read in source this session. INFERRED = reasoned from verified facts, not directly observed. Line numbers cited from HEAD of `new-llm`.

---

## 1. Feature inventory (verified)

| Feature / branch | What it does | Status | Load-bearing? (why) | Evidence |
|---|---|---|---|---|
| Quiz activity types | Exactly 3: `capitals`, `vocabulary`, `guess_who`. **No topic-bound type exists.** | prod-active | **Incidental as a learning instrument.** It is recall trivia, not subject-bound practice. Load-bearing only as a gamified streak/XP feeder. | VERIFIED `quizActivityTypeSchema` = `['capitals','vocabulary','guess_who']`, `packages/schemas/src/quiz.ts:4-8` |
| Capitals engine | **Deterministic** (no LLM) — built from `CAPITALS_DATA`, mastery items injected. | prod-active | Load-bearing for the Capitals tile. | VERIFIED `generate-round.ts:495-529` (`buildCapitalsDiscoveryRound` + `injectMasteryQuestions`) |
| Vocabulary engine | LLM round, four_strands subjects only; upserts discovery words into `vocabulary` bank, SM-2 on `vocabulary_retention_cards`. | prod-active | Load-bearing for language learners; ties to the vocab bank. | VERIFIED `complete-round.ts:578+`; `quiz/index.tsx:279-314` (one card per active four_strands subject) |
| Guess-Who engine | Progressive-clue LLM round; score scales with `cluesUsed`; SM-2 on `quiz_mastery_items`. | prod-active | Incidental (generic trivia). | VERIFIED `complete-round.ts:670-693`; atlas `quiz-challenge-mastery.md:43` |
| Server-checked answers | `POST /quiz/rounds/:id/check` grades server-side; correct answer stripped from options, revealed only on wrong. | prod-active | **Load-bearing (anti-cheat / integrity).** | VERIFIED atlas `quiz-challenge-mastery.md:67` (`routes/quiz.ts:306-345`, `toClientSafeQuestions:79-126`) |
| Missed-items loop | Wrong answers → `quiz_missed_items`; re-injected into next round's prompt. Silent — never surfaced to learner. | prod-active | Load-bearing internally; **invisible** to learner. | VERIFIED `complete-round.ts:515-540` (write), `generate-round.ts:484-490` (read-back) |
| Quiz XP | `xpEarned` written to `quiz_rounds.xpEarned` + a `practice_activity_events` deferred event. **NOT `xp_ledger`.** | prod-active | Incidental — does **not** move the main progress bar/streak XP. | VERIFIED `complete-round.ts:511,545-573`; no `xpLedger.insert` in `services/quiz/**` (grep clean; only a test mock at `complete-round.test.ts:810`) |
| Celebration tier | `getCelebrationTier(score,total)` computed, returned to client, stored in `quiz_rounds`/event metadata. **Never queued** in the persistent celebration queue. | prod-active | Incidental — momentary client toast only. | VERIFIED `complete-round.ts:512,569`; celebration queue is fed only by `session-completed.ts` (grep), which quiz never dispatches |
| Difficulty-bump banner | 3 perfect rounds → harder questions + a one-tap "challenge" banner before play. | prod-active | Incidental; overloads the word "challenge". | VERIFIED atlas `:42,74` (`difficulty-bump.ts:10`, `launch.tsx:255-289`) |
| Mid-round prefetch | `usePrefetchRound` + `POST /quiz/rounds/prefetch` exist; **no production screen calls the hook.** | dead code | Not load-bearing — safe to delete. | VERIFIED atlas `:66,179` (`use-quiz.ts:44`); doc `learning-path-flows.md:392` |
| Assessment ladder | Route-level evaluated practice: recall (cap 0.5) → explain (0.8) → transfer (1.0); max 4 exchanges. | prod-active | **Load-bearing.** The only *topic-bound* self-test that writes canonical retention. | VERIFIED topics atlas `:176` (`assessments.ts:50-59`) |
| Assessment terminal co-commit | On terminal status: `updateRetentionFromSession` (SM-2 → `retention_cards`) + (on `passed`) `insertSessionXpEntry` (→ `xp_ledger`) in the **same transaction**. | prod-active | **Load-bearing (correctness).** Settles the doc's "Assessment XP UNVERIFIED" cell. | VERIFIED `routes/assessments.ts:199-238` |
| Assessment terminal routing | `passed`→Done; `borderline`→`gap_fill` session or decline-refresh; `failed_exhausted`→`learning` session. Decided by `resolveAssessmentStatus` server-side. | prod-active | Load-bearing. | VERIFIED `assessments.ts:185-189`; topics atlas `:178-181` (`assessment/index.tsx:490-530`) |
| `decline-refresh` PATCH | Logs `assessment.refresh_declined`, returns `{ok:true}`. No state change; only valid in terminal states. | prod-active | Incidental (telemetry only). | VERIFIED `assessments.ts:299-328` |
| Quick-check sibling | `POST /sessions/:id/quick-check` — standalone LLM eval of one answer; **writes nothing** (no retention, no XP). | prod-active | Incidental — a lightweight inline check; not the ladder. | VERIFIED `assessments.ts:370-416` |
| `gap_fill` mode | Spawned only by Assessment `borderline`. **No `SESSION_MODE_CONFIGS` entry** → renders freeform "Chat" chrome; server keys off `gaps`+`topicId`. | prod-active (spawned only) | Load-bearing flow, **broken chrome**. | VERIFIED `components/session/sessionModeConfig.ts:10-66,76-77` (no gap_fill key → `DEFAULT_CONFIG`=freeform); opener falls through to freeform fallback `:247-261` |
| Interleaved Retrieval | Mixed-topic spaced-retrieval session; full API end-to-end; SM-2-updates all practiced topics. | server-built / **mobile-dormant** | **Zero mobile callers.** | VERIFIED grep `apps/mobile/src` → only 2 unrelated hits (`mentor-memory.tsx:345` prose, `my-notes/[kind].tsx:103` display label) |

---

## 2. Complexity map

### 2.1 User-felt complexity (what a kid sees)

- **Two undifferentiated "test" surfaces.** Quiz (a 3-deep mini-game, 4 entry doors) and Assessment (a 3-tap chat ladder behind a separate picker) are conceptually "test yourself" but live in two unrelated stacks with different chrome, different depth, and different discoverability. VERIFIED quiz depth 3 / round-review 3-4 (atlas `quiz-challenge-mastery.md:110`); Assessment run 3 taps from Practice (topics atlas `:317`). A kid never learns they're related.
- **Trivia, not my subjects.** A biology learner who taps "Quiz" gets **Capitals / Guess-Who** — country trivia, not biology. The only subject-bound quiz is Vocabulary, and only for four_strands language subjects. VERIFIED `quizActivityTypeSchema` (`quiz.ts:4-8`); `quiz/index.tsx:279-314`. This is the single biggest user-felt mismatch in the cluster.
- **Locked rows.** When no four_strands subject exists, the Quiz index shows a **dimmed locked "add a language" card** (`quiz/index.tsx:340-349`); the Practice Hub shows a `lock-closed` Assessment row when `assessmentCount===0` (diff-doc cite `practice/index.tsx:649-651`). Locked rows advertise absence.
- **"Challenge" overloaded 3 ways.** Quiz difficulty-bump banner, the Quiz index "challenge explainer" copy, and the flag-OFF Challenge Round mastery feature all share the word but are unrelated. VERIFIED atlas `:169-172` (`launch.tsx:255-289`, `index.tsx:251-256`).
- **Invisible XP / no real reward.** Quiz XP and celebration never reach the persistent XP ledger or celebration queue — the round feels rewarding for ~2s, then nothing carries to Home. VERIFIED §1 rows.

### 2.2 Hidden complexity — three retention universes (full writer/reader map)

All three are independent SM-2 stores, keyed differently, feeding different readers. **No central `applyRetentionUpdate()` exists yet** (spec §8.3 confirms it is net-new).

| Universe | Key | Distinctive cols | Writers (prod) | Readers (prod) |
|---|---|---|---|---|
| **`retention_cards`** | `(profileId, topicId)` UNIQUE | `masteredAt`, `xpStatus`, `evaluateDifficultyRung` | `retention-data.ts` (`ensureRetentionCard`, recall-test, `updateRetentionFromSession`), assessment tx (`routes/assessments.ts:223`), `verification-completion.ts` + `evaluate-data.ts`, `retention-mastery.ts`, `topic-probe-extract.ts`, `review-calibration-grade.ts` — **~9-10 writers / 7 files** | `overdue-topics.ts` (`GET /retention/overdue`), `coaching-cards.ts` (home card), `dashboard.ts`, `progress.ts`, `snapshot-aggregation.ts`, `session-recap.ts`, `milestone-detection.ts`, `interleaved.ts`, `curriculum.ts`, `export.ts` |
| **`vocabulary_retention_cards`** | `vocabularyId` UNIQUE | — (no mastery/XP cols) | `vocabulary.ts` (`upsertCard`/SM-2 update), quiz `complete-round.ts:578+` (vocab branch) | `quiz/queries.ts:195` (next vocab round), `vocabulary.ts:415+` (vocab review), `snapshot-aggregation.ts:252,335` (progress snapshot) |
| **`quiz_mastery_items`** | `(profileId, activityType, itemKey)` UNIQUE | `mcSuccessCount`, `itemAnswer` (string-key, NO topicId) | quiz `complete-round.ts:678-797` (capitals/guess_who only) | **`quiz/queries.ts:352` ONLY** (`getDueMasteryItems` → next quiz round) |

> Sources VERIFIED: schema defs `assessments.ts:112-161`, `language.ts:62-101`, `quiz-mastery.ts:15-62`; writer/reader greps over `apps/api/src/services` (`!*.test.ts`); spec §8.3 writer enumeration.

**The crux:** `retention_cards` is topic-keyed and feeds the due-work surfaces (`overdue`, coaching card) that the spec's `GET /now` (§8.1) will replace. `quiz_mastery_items` is a **closed loop** — one writer, one reader, both inside the quiz round generator; nothing else in the app reads it. `vocabulary_retention_cards` is semi-open (it does feed the progress snapshot). So a `retention_cards`-only `/now` feed sees Assessment + session retention but is **blind to quiz mastery** unless quiz is unified or the feed reads all three.

### 2.3 Load-bearing vs incidental verdict

- **Load-bearing (must survive any simplification):** Assessment ladder + its atomic SM-2/XP co-commit; server-checked answers; `retention_cards` as the canonical topic-retention store; the missed-items re-injection loop (works, just invisible); `gap_fill` as a flow (its *chrome* is broken, the flow is real).
- **Incidental (relabel/merge/retire candidates):** Quiz as a *learning* instrument (it is gamified recall, not subject practice); quiz XP→`quiz_rounds` and celebration→ephemeral (both dead-ends today); `quiz_mastery_items` (closed loop, lowest blast radius to migrate); difficulty-bump banner; the quick-check sibling; the dead prefetch hook.
- **Dead:** Interleaved (zero mobile callers); mid-round prefetch hook.

---

## 3. Hypothesis audit (claims from proposed / diff docs on this cluster)

| Claim | Verdict | Evidence |
|---|---|---|
| "Quiz↔Assessment merge + retention-universe unification is the single largest XL risk" (diff `:29,79,262,364`) | **CONFIRMED as XL, but the framing over-merges two instruments** — see §5 C1 verdict | VERIFIED: two architecturally distinct backends (`quiz/**` non-session activity vs `routes/assessments.ts` topic tx); three keying schemes (`topicId`/`vocabularyId`/`itemKey`) that genuinely cannot be relabeled into one. Migration + backfill real. |
| "No topic-bound quiz type exists; needs new enum + topic-content LLM prompt (eval-harness) + mastery-key scheme" (diff `:221`) | **CONFIRMED** | VERIFIED `quiz.ts:4-8` (enum); `mastery-keys.ts` is per-activity hardcoded (`computeCapitalsItemKey`, `computeGuessWhoItemKey`); eval harness has exactly 3 quiz flows (`eval-llm/flows/quiz-{capitals,guess-who,vocabulary}.ts`) — a 4th type needs a 4th flow + fixtures |
| "Quiz XP not in `xp_ledger`" (diff `:222`; doc `:393`) | **CONFIRMED** | VERIFIED `complete-round.ts:545-573`; `xp.ts:104,132` shows `xp_ledger` is dedupe-keyed on `(profileId, topicId)` — topicless quiz structurally cannot use the existing entry path |
| "No celebration queued on quiz completion" (doc `:391`) | **CONFIRMED** | VERIFIED celebration is computed `complete-round.ts:512`; persistent queue (`services/celebrations.ts`) is dispatched only from `session-completed.ts`, never quiz |
| "Mid-round prefetch is dead code" (doc `:392`) | **CONFIRMED** | VERIFIED atlas `:66,179`; `usePrefetchRound` uncalled |
| "`gap_fill` has no config → freeform chrome" (diff `:82`; doc `:85,449,764`) | **CONFIRMED** | VERIFIED `sessionModeConfig.ts` has no `gap_fill` key → `DEFAULT_CONFIG`=freeform; opener falls through `:247-261`. (Cite-correction: file is `components/session/sessionModeConfig.ts`, not `lib/`.) |
| "Interleaved has zero real mobile callers" (diff `:88`; doc `:468`) | **CONFIRMED** | VERIFIED grep `apps/mobile/src` → 2 unrelated hits only |
| "Assessment XP UNVERIFIED" (doc matrix `:717`) | **REFUTED — now settled** | VERIFIED Assessment **does** write `xp_ledger` via `insertSessionXpEntry`, atomically with SM-2, on `passed` (`assessments.ts:230-237`) |
| "Unify quiz onto topic-level `retention_cards`; Guess-Who scoring → optional" (diff `:226,262`) | **PARTIAL / MIRAGE for the trivia half** — see §5 | VERIFIED quiz mastery is keyed on `itemKey` (a country/person string), which has **no topicId** to map onto `retention_cards`. Capitals/Guess-Who cannot be "migrated onto topic-level cards" — there is no topic. Only a *new topic-bound quiz type* could write `retention_cards`. |

---

## 4. Current-doc corrections (`learning-path-flows.md`)

1. **"Assessment XP UNVERIFIED" (`:717`) — SETTLE: Assessment XP is written to `xp_ledger`.** On `passed`, `insertSessionXpEntry(txDb, profileId, topicId, subjectId)` runs inside the same transaction as the SM-2 update and status flip (`routes/assessments.ts:230-237`). Replace the matrix cell with "`xp_ledger` (topic-scoped, on `passed`, atomic with SM-2)". VERIFIED.
2. **`gap_fill` cite location (`:85`, `:764`).** The "no config → freeform chrome" fact is correct, but the implementing file is `apps/mobile/src/components/session/sessionModeConfig.ts` (the diff-doc's `sessionModeConfig.ts:68,77` line refs are off, and the doc gives no path). The verified facts: `SESSION_MODE_CONFIGS` lacks a `gap_fill` key (`:10-66`); `getModeConfig` returns `DEFAULT_CONFIG`=freeform for it (`:76-77`); `getOpeningMessage('gap_fill', …)` has no branch and falls through to the freeform fallback (`:247-261`).
3. **Quiz "Does quiz feed retention?" (`:396`) is correct but understates the closure.** Worth adding: `quiz_mastery_items` is a **fully closed loop** — its sole reader is `quiz/queries.ts:352` (the next round). Capitals/Guess-Who mastery is invisible to every dashboard, snapshot, `/overdue`, and the future `/now`. (`vocabulary_retention_cards` is the exception — it *is* read by `snapshot-aggregation.ts`.) VERIFIED.
4. **Open question #1 (Interleaved, `:760`) can be answered.** Zero mobile callers VERIFIED — it is dead *as a path*. See §5 disposition (retire path, keep engine; the spec gives it a revival slot).
5. No correction needed to the missed-items, server-checked-answer, deterministic-Capitals, or celebration-not-queued claims — all VERIFIED accurate.

---

## 5. Simplification candidates

**T1 — Quiz XP → `xp_ledger` (the "make it count" #1).**
User gain: a finished quiz moves the *real* progress bar / streak, not a throwaway counter. Deleted/kept: keep `quiz_rounds.xpEarned`; add an XP-ledger write. Size: **M** — `insertSessionXpEntry` is dedupe-keyed on `(profileId, topicId)` and quiz has no topic (`xp.ts:104,132`), so this needs either a nullable-topic ledger row or an activity-scoped XP path; not a one-liner. Disposition: **SPEC-ABSORBED — feeds §8.1 `/now` + the activity ledger §8.2** (a quiz moment becomes a ledger row). Independent of T2/T3. Risk: double-counting if the activity-event XP and a new ledger row both surface; keep one canonical reader. **Verdict: REAL WIN (conditional on the topicless-XP decision).**

**T2 — Fire the celebration queue on quiz completion (#2).**
User gain: a perfect quiz produces a Home celebration like a mastered topic does. Deleted/kept: keep `celebrationTier`; enqueue it. Size: **S** — `celebrationTier` is already computed (`complete-round.ts:512`); the queue API exists (`services/celebrations.ts`). Disposition: **SHIP-NOW** (independent of T1/T3; no schema change). Risk: low. **Verdict: REAL WIN.**

**T3 — Surface the missed-items loop ("3 things to review") (#3).**
User gain: the silent `quiz_missed_items` re-injection becomes a visible "review these" card. Deleted/kept: keep the loop; add a read endpoint + UI. Size: **M** — write/read already exist (`complete-round.ts:515-540`, `generate-round.ts:484-490`); net-new is a surfacing endpoint/card. Disposition: **SPEC-ABSORBED (§8.1 `/now` card)** — a natural `/now` "review" card kind. Risk: low. **Verdict: REAL WIN.** *(T1/T2/T3 are genuinely S/M and independent — confirmed.)*

**T4 — Topic-bound quiz type ("quiz my actual subjects").**
User gain: the biology learner gets biology, killing the trivia-mismatch (§2.1). Deleted/kept: keep all 3 existing types; add a 4th. Size: **L** — needs `quizActivityTypeSchema`/`quizActivityTypeEnum` extension, a new topic-content LLM generation prompt in `quiz-prompts.ts`, a 4th eval-harness flow + fixtures (3 exist today), and a mastery-key scheme (existing keys are country/person string hashes — a topic type would key on `topicId`/concept, i.e. it could write `retention_cards` directly). Disposition: **CONDITIONAL — gate behind the spec evidence gate (S2→S3)**; it is the highest-value *learner* fix but it is net-new content surface, not a simplification. Risk: med (eval-harness + LLM cost). **Verdict: REAL WIN as a feature, but it is addition, not simplification — sequence after the cheap trio.**

**T5 — Merge Quiz into the Assessment self-test; unify retention onto `retention_cards` (the XL).**
User gain: one "test yourself" surface, two depth tiers (playful recall / serious transfer). Deleted/kept: keep both engines; collapse entry + (claimed) retention. Size: **XL** (migration + backfill). Disposition: **CONFLICTS / partial MIRAGE.** The honest verdict on the XL merge:
- **The entry-surface merge is a REAL WIN** (one door, two tiers) and is **M-L** on its own — re-point the Practice tiles, present Assessment as the "serious" tier next to a "playful" quiz tier.
- **The *retention-universe unification* is a MIRAGE for the trivia half.** `quiz_mastery_items` is keyed on `itemKey` (a country/person string) with **no topicId** (`quiz-mastery.ts:24-25,51-55`); Capitals/Guess-Who have no curriculum topic to map onto `retention_cards`. You cannot "migrate quiz onto topic-level cards" — there is no topic. Relabeling `quiz_mastery_items` as `retention_cards` would force fake topic rows for "France" and "Cleopatra". These are **two genuinely different pedagogical instruments** (string-fact drill vs topic-mastery SRS), and the only legitimate bridge is T4 (a *new* topic-bound type that natively writes `retention_cards`). So: do **not** unify the trivia universe; let T4 add a topic-native quiz that joins `retention_cards` organically, and leave `quiz_mastery_items` as the closed trivia loop (lowest blast radius, harms nothing).
- `vocabulary_retention_cards` similarly stays — it is vocab-bank-keyed and already feeds the snapshot.
**Verdict: entry-merge = REAL WIN (M-L); retention-universe unification = MIRAGE — drop it from scope.** This de-risks the document's single XL: the *merge* is real, the *backfill migration* that made it XL is largely unnecessary.

**T6 — Fix `gap_fill` chrome.**
User gain: a borderline-assessment learner lands in a session that says "let's close these gaps," not "Chat / Ask anything." Deleted/kept: add one `SESSION_MODE_CONFIGS` entry + an opener branch. Size: **S** — add a `gap_fill` key to `sessionModeConfig.ts:10-66` and a `mode==='gap_fill'` branch in `getOpeningMessage` (`:200-214` pattern). Disposition: **SHIP-NOW** (server already keys off `gaps`+`topicId`; this is pure chrome). Risk: none. **Verdict: REAL WIN.**

**T7 — Interleaved: retire the *path*, keep the *engine*.**
User gain: removes a launch-relevant dead question; no UI debt. Deleted/kept: keep `services/interleaved.ts` + the API (it works and SM-2-updates all topics); do not wire a mobile entry now. Size: **S** (a doc/disposition decision, not a code change). Disposition: **SPEC-ABSORBED — the spec gives it a natural revival slot:** §8.1 `GET /now` ranks due-work and explicitly contemplates "mixed review" cards; a `/now` "mixed review across N due topics" card is exactly what the interleaved engine produces. So **do not delete the engine** — mark the path dormant and earmark the engine as the implementation behind a future `/now` "mixed review" card kind. Risk: none. **Verdict: REAL WIN — retire path, hold engine for the `/now` mixed-review card.** (This *changes* the disposition from the diff-doc's flat "RETIRE path": the spec's feed model resurrects it.)

---

## 6. Bottom line

**Score: 4 / 5** — high simplification value, mostly cheap, with one over-scoped XL that shrinks to M-L once the mirage is dropped.

**Highest-value move:** the cheap **trio T1+T2+T3** ("make quiz count" — XP-ledger, celebration queue, surface missed-items), all S/M and independent, all feeding the spec's `/now` + activity ledger. They convert quiz from a dead-end mini-game into a real progress contributor for near-zero risk. T6 (`gap_fill` chrome, **S**) ships alongside them.

**The one thing that must NOT be simplified away:** the **Assessment terminal co-commit** — `updateRetentionFromSession` + `insertSessionXpEntry` inside one transaction (`routes/assessments.ts:199-238`). It is the only path that atomically writes canonical topic retention + ledger XP, and it exists *because* an earlier non-atomic version (CR #8) let assessments commit `passed` while XP/retention silently failed. Any Quiz↔Assessment merge that touches this transaction must preserve its atomicity and its FOR-UPDATE terminal-state guard. **Do not collapse the trivia retention universe into `retention_cards`** (the XL mirage) — the legitimate bridge is a *new* topic-bound quiz type (T4), not a backfill that fabricates topics for country trivia.

**Spec conflicts / dispositions:** none regress the V0 5-tab shell, the envelope contract, profileId scoping, or safeSend. T1/T3 are SPEC-ABSORBED into §8.1; T7's engine is held for a §8.1 "mixed review" card; the §8.3 `applyRetentionUpdate()` gate (the ~9-10-writer `retention_cards` refactor) is on its own track (S0-R) and does **not** need to absorb the quiz universes — the feed reads `retention_cards`, and quiz mastery is best left as its closed loop until T4 gives it a topic-native home.
