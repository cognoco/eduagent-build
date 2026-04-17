# Quiz Activities (Phase 2: Vocabulary) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Vocabulary quiz activity type with full SM-2 mastery integration — the first activity type where mastery questions have real spaced-repetition consequences.

**Architecture:** Extends the Phase 1 quiz engine. Discovery questions are LLM-generated vocabulary at the learner's CEFR level + 1. Mastery questions are pulled from the learner's vocabulary bank (due for SM-2 review) and formatted as identical MC questions. On completion, mastery results feed back to `reviewVocabulary()` which updates the SM-2 retention card. The quiz play screen dispatches rendering by question `type` field ('capitals' vs 'vocabulary').

**Tech Stack:** Zod schemas in `@eduagent/schemas`, existing vocabulary + retention services, LLM via `routeAndCall()` (Gemini Flash, rung 1), Expo Router screens with NativeWind.

**Spec:** `docs/superpowers/specs/2026-04-16-quiz-activities-design.md` (Section 3.2 Vocabulary, Section 4 Two-Tier Question Model, Section 10 SM-2 Integration)

**Prerequisites:** Phase 1 (Capitals) must be fully implemented and merged. All Phase 1 files referenced below must exist.

---

## Execution Strategy (2026-04-16)

**Decision: gate, don't split.** Tasks 1-3 (schemas, provider helpers, generation dispatch) execute against the Task 0 audit output. Tasks 4-5 (SM-2 wiring, due-review filter, route) are **gated** on a bootstrap mini-spec being written first. Single merge. No Phase 2a/2b split.

**Rationale.** Phase 1 is not yet merged, so incremental-delivery benefits of a split don't apply. Gate-with-audit gets the same risk reduction with one merge. Tasks 1-3 are bootstrap-agnostic; only Task 4 (SM-2) and Task 5 (route layer) touch the bootstrap-sensitive flow.

**Revisit trigger.** If Phase 1 ships to `main` before Phase 2 execution completes, re-evaluate split vs. gate — once learners exist, time-to-ship becomes scarce and the split's incremental-delivery benefit reasserts.

## Decisions (Confirmed 2026-04-17)

| ID | Decision | Status |
|---|---|---|
| QP2-D1 | **MC SM-2 quality mapping:** Flat 4/2. Correct = quality 4, wrong = quality 2 (learner sees answer on feedback screen = SM-2 definition of quality 2). Timing-based refinement is a separate axis, deferred. | **Confirmed.** |
| QP2-D2 | **Single retention card per vocabulary item.** No `recall_mode` column. Revisit when Phase 5 (free-recall) is designed. Extension path: unique constraint on `(vocabularyId)` alone → Phase 5 migration drops it, adds `(vocabularyId, recallMode)`. Clean migration-with-backfill, not a schema blocker. | **Confirmed.** |
| QP2-D3 | **Bootstrap: Option C (discovery-only for new learners).** Mastery pool = items with `nextReviewAt IS NOT NULL AND nextReviewAt <= now`. New bank items sit unreviewed until an introduction flow (Phase 2.5) explicitly creates their first card. First vocabulary rounds for new learners are 100% LLM-generated discovery. Option A (cold-call MC on unseen words) rejected — violates SM-2 assumption that first review follows a learning phase; causes ease-factor damage from guess-correct responses. | **Confirmed.** |

## Review Findings (2026-04-16)

> **Read before executing.** These findings were raised against this plan and must be resolved as part of the task they affect. Each finding has an ID — fix commits MUST include the ID tag (e.g., `fix(quiz): mastery-weighted CEFR ceiling [QP2-R1]`). Per the Fix Verification Rules, every fix needs a "Verified By" entry (test or manual check) before the task is marked Done.

### Severity Summary

| ID | Severity | Task | Short title | Verified By |
|---|---|---|---|---|
| QP2-R1 | Serious | Task 5 | CEFR ceiling uses unfiltered `max`, not mastery-weighted signal | TBD — test + integration |
| QP2-R2 | ~~Serious~~ **Resolved** | Task 4 | SM-2 quality scores → **flat 4/2 confirmed** (see QP2-D1) | N/A — decision, not bug |
| QP2-R3 | Serious | Task 2/3 | `Math.random()` biased shuffle in capitals mastery path | TBD — unit test for Fisher-Yates |
| QP2-R4 | Serious | Task 5 | "Due for review" filter treats never-studied items as due → **fix via QP2-D3 (Option C)** | TBD — unit test for filter |
| QP2-R5 | ~~Serious~~ Medium | Task 3/Config | `resolveRoundContent` is generic and already activity-aware; vocab needs higher mastery ratio (see QP2-R16) | TBD — config + unit test |
| QP2-R6 | ~~Medium~~ **RESOLVED** | — | Discriminated union: Phase 1 already has `type: z.literal('capitals')` at `quiz.ts:18`. NO-OP. | Audit Q1 — verified |
| QP2-R7 | Medium | New Task 11 | No end-to-end vocabulary round integration test | TBD — integration test |
| QP2-R8 | Medium | Task 2 | `buildVocabularyMasteryQuestion` returns `null` silently with no telemetry | TBD — unit test + log assertion |
| QP2-R9 | Medium | Task 2 | `Intl.DisplayNames` try/catch silently falls back to raw code | TBD — explicit fallback test OR remove try/catch |
| QP2-R10 | Polish | Task 7 | `subject.name` assumed to be language display name — confirm or override | Manual: check subject creation path |
| QP2-R11 | Polish | Task 6 | `@ts-expect-error` on `client.quiz.rounds.$post` masks `subjectId` type errors | N/A — tracked as tech debt |
| QP2-R12 | Polish | Task 2 | `nextCefrLevel('A1 ')` silently coerces to `A2` — trim or throw | TBD — unit test for bad input |
| QP2-R13 | Polish | Task 2 | `pickDistractors` dedup is case-insensitive; confirm intended behavior | N/A — intended, documented here |
| QP2-R14 | Medium | Task 3/5 | LLM discovery can duplicate terms already in the vocab bank (same word as discovery + mastery in one round) | TBD — pass bank terms as exclusions |
| QP2-R15 | Medium | Task 4 | SM-2 update loop is a partial-failure hazard (for-await after round marked complete) | TBD — transaction or idempotency |
| QP2-R16 | Serious | Task 3/Config | Vocab mastery ratio (25%/35%) too low for mature SM-2 banks; 40 due items → only 2 per round | TBD — vocab-specific config + unit test |

---

### QP2-R1 — CEFR ceiling logic is backwards for new learners (Serious) — Task 5

**Problem.** In Task 5, `cefrCeiling = nextCefrLevel(detectCefrCeiling(allVocab))` has two defects:

1. **Beginner bootstrap bug.** For a learner with zero vocabulary, `detectCefrCeiling([])` returns `'A1'`, so `nextCefrLevel('A1')` returns `'A2'`. A brand-new beginner who has never added a word immediately gets A2 content instead of A1.
2. **Max-not-mastery bug.** `detectCefrCeiling` takes the max CEFR level across **all** vocabulary, not a mastery-weighted signal. One accidentally-imported C1 word (from a parent, an LLM out-of-range item that got persisted, or a manual add) jumps the ceiling to C2. The spec says "CEFR level + 1" — that should mean "one above what the learner has **mastered**," not "one above the hardest word that exists anywhere in their bank."

**Fix.**
- **Beginner path:** If the learner has no vocabulary yet (or no vocabulary with `cefrLevel` set), the ceiling MUST be `A1` (not `A2`). Introduce a `cefrCeilingForDiscovery` that returns `'A1'` for an empty mastery set rather than always advancing one level.
- **Mastery filter:** `detectCefrCeiling` must only consider vocabulary the learner has actually mastered. Define mastered as **either** `vocabularyRetentionCards.repetitions >= 3` **or** `vocabularyRetentionCards.interval >= 7` (pick one; I recommend `repetitions >= 3` because it's invariant to scheduling changes).
- Consider **percentile instead of max** for robustness (e.g., 90th percentile of mastered CEFR levels) so a single outlier doesn't shift the ceiling.

**New signature.**
```typescript
export function detectCefrCeilingMasteryWeighted(
  vocabWithCards: Array<{ cefrLevel: string | null; repetitions: number | null }>,
  minRepetitions = 3,
): string // returns 'A1' when no mastered items
```

**Tasks to update.** Task 2 (new helper + unit tests), Task 5 (route uses new helper, joins retention card repetitions).

**Verified By.** Unit test: "detectCefrCeilingMasteryWeighted returns A1 for empty bank", "returns A1 for bank with unmastered items", "ignores outlier with <3 repetitions", "returns 90th-percentile mastered level".

---

### QP2-R2 — SM-2 quality scores of 4/1 are crude and probably wrong (Serious) — Task 4

**Problem.** `getVocabSm2Quality(correct) → 4 | 1` ignores timing and MC mode. Standard SM-2 uses 0–5:
- 5 = perfect recall; 4 = correct with hesitation; 3 = correct with serious difficulty
- 2 = incorrect but remembered on seeing the answer; 1 = incorrect, familiar; 0 = complete blackout

Two consequences:

1. **Under-rating correct answers compresses intervals.** Always returning 4 for correct means intervals grow more slowly than they should, which over-schedules reviews — the opposite of what SRS is for.
2. **Wrong-answer score of 1 is wrong.** After a wrong answer, the learner sees the correct answer on the feedback screen. That's SM-2 quality 2 ("incorrect but remembered on seeing the answer"), not 1.

**Fix.** Use the `timeMs` already captured in `handleAnswer`:
```typescript
export function getVocabSm2Quality(
  correct: boolean,
  timeMs: number,
  mode: 'mc' | 'free-recall' = 'mc',
): number {
  if (!correct) return 2;                           // saw answer on feedback screen
  const fastThresholdMs = 3000;
  if (mode === 'mc') {
    // MC is easier than free recall — cap at 4, don't let it drive intervals like free recall
    return timeMs < fastThresholdMs ? 4 : 3;
  }
  return timeMs < fastThresholdMs ? 5 : 4;
}
```

**Design decision (flag for user).** The MC discount (cap at 4) is a pedagogical choice. Document it in the plan so it's intentional rather than emergent. Alternative: store raw `quality` and apply mode discount at schedule time — keeps data richer for future free-recall modes.

**Tasks to update.** Task 1 (pass `timeMs` through completion payload), Task 4 (new signature + tests), Task 9 (pass `timeMs` from client to server).

**Verified By.** Unit tests: "correct + fast MC → 4", "correct + slow MC → 3", "wrong → 2", "correct + fast free-recall → 5".

---

### QP2-R3 — `Math.random()` biased shuffle in capitals mastery path (Serious) — Task 3

**Problem.** In the capitals mastery branch:
```typescript
const otherCapitals = CAPITALS_DATA
  .filter((c) => c.capital.toLowerCase() !== item.answer.toLowerCase())
  .sort(() => Math.random() - 0.5)    // biased shuffle
  .slice(0, 3)
```
`.sort(() => Math.random() - 0.5)` is a biased shuffle (known statistically non-uniform across V8's TimSort) and matches the exact instability pattern previously flagged on MentoMate. The vocabulary path uses Fisher-Yates correctly; the capitals path regressed.

**Fix.** Replace the capitals mastery shuffle with the Fisher-Yates already in `vocabulary-provider.ts`. Extract `shuffle<T>(arr: T[]): T[]` to a shared utility (e.g., `apps/api/src/services/quiz/shuffle.ts`) and use it in both paths.

**Design decision (flag).** Per-request redistribution of distractors is fine for vocabulary (variety aids learning), but it's not stable across repeated views of the same question in a session. That's an intentional design call; state it in the plan so it's not re-flagged later.

**Tasks to update.** Task 3 (capitals mastery uses shared `shuffle`), Task 2 (export `shuffle` from vocabulary-provider or new module).

**Verified By.** Unit test: "shuffle is unbiased over 10,000 runs" (chi-squared on position frequency).

---

### QP2-R4 — "Due for review" filter treats never-studied items as due (Serious) — Task 5

**Problem.**
```typescript
libraryItems = dueVocab
  .filter((v) => !v.nextReviewAt || v.nextReviewAt <= now)
```
`!v.nextReviewAt` treats every vocabulary item **without a retention card** as due. The moment a learner adds a word, it becomes a mastery candidate in the next round — **before they've ever studied it**. Mastery questions are supposed to test things the learner has seen. This conflates "new, never-studied" with "due for review" and corrupts SM-2 data (the first "review" of an item is really a first exposure).

**Fix.**
- **Mastery pool = items with a retention card AND `nextReviewAt <= now`**. Never-studied items are excluded from the mastery pool.
- **New items flow through a different path** — either (a) the discovery LLM path (surface them as "new" vocabulary to introduce), or (b) an explicit "introduce new vocab" pre-round step that creates the first retention card via `reviewVocabulary(..., { quality: 3 })` after the learner answers.

**Tasks to update.** Task 5 (tighten the filter — require `nextReviewAt IS NOT NULL`). A separate spec may be needed for the "introduce new vocab" flow; flag to the user before implementing.

**Verified By.** Unit test: "filter excludes items with null nextReviewAt", "filter includes items with past nextReviewAt", "filter excludes items with future nextReviewAt".

---

### QP2-R5 — `plan.masteryItems` / `plan.discoveryCount` source unspecified; vocab-adaptive ratio needed (Serious) — Task 3

**Problem.** The vocabulary path calls `plan.masteryItems` and `plan.discoveryCount` but the plan never shows where `plan` is built. Phase 1 presumably has a `planRound()` helper; this plan assumes its shape works unmodified for vocabulary. For vocabulary with SM-2, the mastery/discovery ratio **must adapt to how many items are due** — if 40 items are due, a 2-mastery/6-discovery round buries review behind new content and inflates the due queue.

**Fix.**
1. Document the existing `planRound()` signature in this plan (Task 3, Step 0: "Read `planRound` before modifying"). Include its current output for capitals.
2. Add a vocabulary-specific planner input — e.g., `dueCount: number` — so the planner can cap discovery and scale mastery:
   ```typescript
   // rule of thumb: mastery = min(dueCount, 6), discovery = max(8 - mastery, 2)
   ```
3. If `planRound` is activity-type-aware, add a `vocabulary` branch. If it isn't, extract the ratio logic into an activity-specific strategy.

**Tasks to update.** Task 3 (add planner branch + test), Task 5 (pass `dueCount` into planner input).

**Verified By.** Unit test: "planner with 40 due items returns mastery ≥ 4", "planner with 0 due items returns all discovery", "planner with 2 due items returns 2 mastery + 6 discovery".

---

### QP2-R6 — ~~Discriminated union may break parsing of existing Phase 1 rows~~ RESOLVED (2026-04-17)

**Status: NO-OP.** Audit Q1 confirmed that Phase 1's `capitalsQuestionSchema` already includes `type: z.literal('capitals')` at `packages/schemas/src/quiz.ts:18`. All existing `quiz_rounds.questions` rows have the discriminator field. `z.discriminatedUnion('type', [...])` works as-is. No migration, no transform needed.

---

### QP2-R7 — No end-to-end vocabulary round integration test (Medium) — New Task 11

**Problem.** Every task has unit tests for its own function, but there is **no integration test that runs `generateQuizRound` → `completeQuizRound` for vocabulary and asserts SM-2 cards got updated correctly**. The SM-2 wiring is the core point of Phase 2 ("the first activity type where mastery questions have real spaced-repetition consequences"), so covering only the helpers in isolation is a miss.

**Fix.** Add a **Task 11: Vocabulary end-to-end integration test** before Task 10 (validation). The test must:

1. Seed a profile with a language subject and ≥ 10 vocabulary items with retention cards (some due, some not).
2. Call `generateQuizRound({ activityType: 'vocabulary', ... })` with a mocked LLM returning valid vocabulary LLM output.
3. Assert the returned round has the expected mastery/discovery split (per planner).
4. Call `completeQuizRound` with a mix of correct/wrong answers for mastery questions.
5. **Re-read the retention cards** and assert `nextReviewAt`, `interval`, `easiness`, and `repetitions` advanced per SM-2 rules.
6. Assert missed discovery items were written to `quiz_missed_items` with the vocabulary-formatted text (`Translate: ...`).

Use real DB (per `feedback_testing_no_mocks` + integration-test-no-internal-mocks rule); mock only the LLM router.

**Verified By.** The integration test itself (`apps/api/src/services/quiz/vocabulary-e2e.integration.test.ts`).

---

### QP2-R8 — `buildVocabularyMasteryQuestion` returns `null` silently (Medium) — Task 2

**Problem.** When the vocab pool is too small for 3 distractors, the item is silently dropped. Two consequences:
- **Zero telemetry.** In production, there's no way to detect how often this happens.
- **100%-discovery rounds for small banks.** A learner with < 4 vocab items gets zero SM-2 updates because every mastery attempt returns `null`, and nothing signals that the round was effectively all-discovery.

**Fix.**
1. **Precondition at the route layer.** Skip the mastery branch entirely when `allVocabulary.length < 4` and log a structured event (`quiz.vocabulary.mastery_pool_too_small`, with `profileId` and `poolSize`).
2. **Telemetry in the builder.** When `buildVocabularyMasteryQuestion` returns `null` despite the precondition passing (edge case: dedup removed too many), emit a warning with `{ vocabularyId, poolSize, distractorsFound }`.
3. **Return a reason enum instead of `null`:** `{ ok: false, reason: 'insufficient_distractors' } | { ok: true, question: VocabularyQuestion }` — forces callers to handle the failure explicitly and makes logging easier.

Per the global rule: "Silent Recovery Without Escalation is Banned" — `console.warn` alone isn't enough; use a structured log / metric.

**Tasks to update.** Task 2 (new return type + precondition + logging), Task 5 (route-level precondition).

**Verified By.** Unit test: "builder returns `insufficient_distractors` when pool has < 4 items", "route skips mastery branch for small pools and emits metric".

---

### QP2-R9 — `Intl.DisplayNames` silently falls back to raw language code (Medium) — Task 2

**Problem.** `getLanguageDisplayName` wraps `Intl.DisplayNames` in try/catch and falls back to the raw code. In a misconfigured Node version, the prompt to the LLM contains `"de"` instead of `"German"`, and the existing test passes because it only asserts `prompt.toContain('German')` on the happy path. A prod regression would ship silently.

**Fix.** Remove the try/catch. `Intl.DisplayNames` is standard since Node 14 (API 17) and available in all supported Jest environments. If it truly can throw in some environments, add an explicit test for the fallback path that asserts the raw code is used and logs a warning.

**Recommended:**
```typescript
function getLanguageDisplayName(code: string): string {
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
  if (!name) throw new Error(`Unknown language code: ${code}`);
  return name;
}
```

**Tasks to update.** Task 2 (remove try/catch; add `languageCode` validation at the route layer so bad codes fail early with a user-visible error, not a bad prompt).

**Verified By.** Unit test: "getLanguageDisplayName throws for unknown code". Route test: "POST /quiz/rounds returns 400 for subject with invalid languageCode".

---

### QP2-R10 — `subject.name` assumed to be language display name (Polish) — Task 7

**Problem.** In Task 7, `languageName = subject.name` is used for the card title (`Vocabulary: ${languageName}`). If a parent names the subject "Emma's German," the card reads "Vocabulary: Emma's German" — not broken, but awkward.

**Fix.** Use `subject.languageCode` → `getLanguageDisplayName(subject.languageCode)` for the display-language portion, keeping `subject.name` only for a secondary subtitle when it differs:
```typescript
const languageName = getLanguageDisplayName(subject.languageCode);
const subtitle = subject.name !== languageName ? subject.name : undefined;
```

**Verified By.** Manual: visual check of the quiz index card with a subject named `"Emma's German"` (expected: "Vocabulary: German" with subtitle "Emma's German").

---

### QP2-R11 — `@ts-expect-error` masks `subjectId` type errors (Polish, tech debt) — Task 6

**Problem.** `// @ts-expect-error quiz route types not yet wired to RPC client` in `use-quiz.ts` means the `subjectId` addition passes through without the type system catching mistakes (field-name typos, wrong type, missing at call site).

**Fix.** Low priority for this phase. Track as tech debt to wire Hono RPC types through to the mobile client. Do NOT remove the `@ts-expect-error` — without the RPC wiring, the call will break at compile time.

**Verified By.** N/A — tracked as tech debt. Add a follow-up note in the plan's "What Phase 2 Does NOT Include" section.

---

### QP2-R12 — `nextCefrLevel('A1 ')` coerces to `A2` silently (Polish) — Task 2

**Problem.** `nextCefrLevel(level: string)` defaults unknown input to `'A2'`. Trailing whitespace (`'A1 '`) or typos (`'a1'`) are silently "promoted" to `A2`, corrupting the difficulty curve.

**Fix.**
```typescript
export function nextCefrLevel(level: string): string {
  const normalized = level.trim().toUpperCase();
  const idx = CEFR_ORDER.indexOf(normalized as (typeof CEFR_ORDER)[number]);
  if (idx < 0) throw new Error(`Invalid CEFR level: "${level}"`);
  return CEFR_ORDER[Math.min(idx + 1, CEFR_ORDER.length - 1)];
}
```
Validate `cefrCeiling` at the route layer so bad values never reach the generator.

**Tasks to update.** Task 2 (throw on unknown), update the test `nextCefrLevel defaults to A2 for unknown input` to `throws on unknown input`.

**Verified By.** Unit test: "nextCefrLevel trims whitespace", "nextCefrLevel throws on 'X9'", "nextCefrLevel throws on empty string".

---

### QP2-R13 — `pickDistractors` case-insensitive dedup (Polish) — Task 2

**Problem.** Dedup is case-insensitive but output preserves original casing. If the bank has `"Dog"` and `"dog"`, only one survives.

**Fix.** Intended behavior — duplicates with different casing almost always represent a data-entry error. Document this in a code comment so future readers don't "fix" it into a case-sensitive dedup.

**Verified By.** N/A — intended. Add a comment in `pickDistractors` referencing QP2-R13.

---

### QP2-R14 — LLM discovery can duplicate vocab bank terms (Medium) — Task 3/5

**Problem.** Discovery questions are LLM-generated; mastery questions are pulled from the vocab bank. Nothing prevents the LLM from generating a word that's already in the learner's bank. Same word appears twice in one round with different semantics (discovery + mastery), doubling the SM-2 signal on one item. Confusing for the learner.

**Fix.** Pass the learner's bank terms into the `recentAnswers` exclusion list (or a separate `bankTerms` exclusion) so the LLM prompt includes them. The prompt already says "Do NOT include these words (recently seen)." Extend it to also exclude banked terms.

**Tasks to update.** Task 5 (route passes `allVocabulary.map(v => v.translation)` into `recentAnswers` or a new exclusion field), Task 2/3 (prompt builder accepts bank exclusions).

**Verified By.** Unit test: "buildVocabularyPrompt includes bank terms in exclusion list".

---

### QP2-R15 — SM-2 update loop partial-failure hazard (Medium) — Task 4

**Problem.** In Task 4, the SM-2 update loop is `for (const idx of libraryIndices) { await reviewVocabulary(...) }`. If the learner backgrounds the app or the connection drops mid-loop, cards 1-3 update and cards 4-6 don't. The round is already marked complete, so retry isn't straightforward. Partial SM-2 application with no visibility.

**Fix.** Wrap the SM-2 updates and round-completion DB write in a single transaction. If any SM-2 update fails, the whole batch rolls back and the round remains active. Alternatively, record per-item `sm2_applied_at` so completion is idempotent and resumable.

**Recommendation:** Transaction is simpler and matches existing patterns (per `feedback_drizzle_transaction_cast.md` — PgTransaction → Database cast).

**Tasks to update.** Task 4 (wrap completion + SM-2 updates in `db.transaction()`).

**Verified By.** Integration test: "if SM-2 update throws mid-loop, round status remains active and no cards are updated".

---

### QP2-R16 — Vocabulary mastery ratio too low for mature banks (Serious) — Task 3/Config

**Problem.** `resolveRoundContent` uses `libraryRatio = 0.25` (scale to `0.35` above 20 items). For vocabulary `roundSize = 6`: `0.25 * 6 = 1` mastery item normally, `0.35 * 6 = 2` at scale-up. With 40 SM-2-due items, 2 per round means ~20 rounds to clear the backlog (~7-10 sessions). Due items accumulate faster than they're reviewed.

**Fix.** Add vocabulary-specific overrides in `QUIZ_CONFIG.perActivity.vocabulary`:
```typescript
vocabulary: {
  roundSize: 6,
  libraryRatio: 0.5,              // 3 mastery + 3 discovery per round
  libraryRatioMinItems: 1,        // start mastery with even 1 due item
  libraryRatioScaleUpThreshold: 10,
  libraryRatioScaleUpValue: 0.67, // 4 mastery + 2 discovery when backlog > 10
},
```
The exact numbers are tunable; the point is vocabulary needs a materially higher mastery ratio than capitals because SM-2 due items have real scheduling consequences (interval penalties accrue when cards are overdue).

**Tasks to update.** Task 3/Config (add vocab-specific config values), test: "resolveRoundContent for vocabulary with 40 due items returns ≥ 3 mastery".

**Verified By.** Unit test: "vocabulary ratio produces expected mastery count at various library sizes".

---

## Audit Results (2026-04-17)

| Question | Answer | Impact |
|---|---|---|
| Q1: `capitalsQuestionSchema` has `type: z.literal('capitals')`? | **YES** (`packages/schemas/src/quiz.ts:18`) | QP2-R6 → NO-OP |
| Q2: `reviewVocabulary` lazy-creates retention cards? | **YES** (via `ensureVocabularyRetentionCard` at `vocabulary.ts:258`) | Missed-A → resolved; card initialization is automatic |
| Q3: `planRound` signature? | **Function is `resolveRoundContent`** in `content-resolver.ts:30-63`. Returns `{ discoveryCount, masteryItems, totalQuestions, recentAnswers }`. Activity-aware via `perActivity[activityType].roundSize`. | QP2-R5 → smaller extension; QP2-R16 raised for ratio tuning |

**Additional finding from audit:** `resolveRoundContent` handles zero-mastery correctly: `discoveryCount = roundSize - 0 = roundSize` (full discovery round for new learners). No code change needed for 0→1 edge case under QP2-D3 (Option C).

---

## Finding → Task Map

| Task | Findings that gate it |
|---|---|
| Task 1 | ~~QP2-R6~~ (resolved — NO-OP) |
| Task 2 | QP2-R3, QP2-R8, QP2-R9, QP2-R12, QP2-R13 |
| Task 3 | QP2-R3, QP2-R14, QP2-R16 |
| Task 4 | ~~QP2-R2~~ (resolved — D1 confirmed 4/2), QP2-R15 |
| Task 5 | QP2-R1, QP2-R4, QP2-R14 |
| Task 6 | QP2-R11 |
| Task 7 | QP2-R10 |
| Config | QP2-R16 (vocab-specific mastery ratio) |
| **Task 11 (new)** | QP2-R7 (integration test) |

---

## File Structure

### New Files

| File | Purpose |
|---|---|
| `apps/api/src/services/quiz/vocabulary-provider.ts` | CEFR helpers, vocab library fetching, mastery question builder, LLM prompt, validation |
| `apps/api/src/services/quiz/vocabulary-provider.test.ts` | Unit tests for vocabulary provider |

### Modified Files

| File | Change |
|---|---|
| `packages/schemas/src/quiz.ts` | Add `vocabularyQuestionSchema`, update `quizQuestionSchema` to discriminated union, add LLM output schema, add `subjectId` to input |
| `packages/schemas/src/quiz.test.ts` | Add vocabulary schema tests |
| `apps/api/src/services/quiz/generate-round.ts` | Refactor `injectMasteryQuestions` to generic, add vocabulary generation path |
| `apps/api/src/services/quiz/generate-round.test.ts` | Add vocabulary generation tests |
| `apps/api/src/services/quiz/complete-round.ts` | Wire SM-2 updates for vocabulary mastery questions, dispatch missed item text by type |
| `apps/api/src/services/quiz/complete-round.test.ts` | Add SM-2 wiring tests |
| `apps/api/src/services/quiz/index.ts` | Export vocabulary provider |
| `apps/api/src/routes/quiz.ts` | Add vocabulary subject validation, vocab library fetching, language context passing |
| `apps/api/src/routes/quiz.test.ts` | Add vocabulary route tests |
| `apps/mobile/src/hooks/use-quiz.ts` | Update `useGenerateRound` input type to include `subjectId` |
| `apps/mobile/src/app/(app)/quiz/_layout.tsx` | Add `subjectId` and `languageName` to QuizFlowContext |
| `apps/mobile/src/app/(app)/quiz/index.tsx` | Add Vocabulary card per language subject, conditional rendering |
| `apps/mobile/src/app/(app)/quiz/launch.tsx` | Pass `subjectId` to generate mutation |
| `apps/mobile/src/app/(app)/quiz/play.tsx` | Dispatch question rendering by `type`, vocabulary question layout, guard empty funFact |

---

### Task 0: Pre-Implementation Audit ✅ COMPLETE (2026-04-17)

**Audit results** are in the "Audit Results" section above. Summary:
- Q1 → YES (`type: z.literal('capitals')` exists) → QP2-R6 resolved as NO-OP
- Q2 → lazy-create (via `ensureVocabularyRetentionCard`) → Missed-A resolved; card init is automatic
- Q3 → `resolveRoundContent` in `content-resolver.ts:30-63`, already activity-aware → QP2-R5 downgraded to config tuning; QP2-R16 raised for mastery ratio

**Additional finding:** `resolveRoundContent` handles zero-mastery correctly (`discoveryCount = roundSize`). No special-casing needed for new learners under QP2-D3 (Option C).

**Decisions confirmed (2026-04-17):**
- [x] QP2-D1: Flat 4/2 quality mapping
- [x] QP2-D2: Single retention card, revisit Phase 5
- [x] QP2-D3: Option C — discovery-only for new learners; mastery pool requires `nextReviewAt IS NOT NULL`

**Bootstrap mini-spec scope (confirmed 2026-04-17):** Dramatically shrunk by audit. `reviewVocabulary` lazy-creates cards, so there is no "who creates the first card" problem — the first SM-2 call handles it automatically. Under QP2-D3, the first vocabulary rounds are 100% discovery. The remaining bootstrap work is Phase 2.5's introduction flow (a "learn this word" screen that calls `reviewVocabulary` to seed the first card before the word enters the mastery pool). Phase 2 does NOT need a separate bootstrap mini-spec.

**Gate.** ~~Tasks 4 and 5 MUST NOT start until bootstrap mini-spec and decisions are complete.~~ All decisions are confirmed. Tasks 1-5 may now execute. Tasks 4 and 5 must incorporate QP2-R4, QP2-R15, and QP2-R16 as part of implementation.

---

### Task 1: Extend Quiz Zod Schemas

**Files:**
- Modify: `packages/schemas/src/quiz.ts`
- Modify: `packages/schemas/src/quiz.test.ts`

- [ ] **Step 1: Add vocabulary question schema and update discriminated union**

In `packages/schemas/src/quiz.ts`, add the vocabulary question schema after `capitalsQuestionSchema`:

```typescript
export const vocabularyQuestionSchema = z.object({
  type: z.literal('vocabulary'),
  term: z.string(),
  correctAnswer: z.string(),
  acceptedAnswers: z.array(z.string()).min(1),
  distractors: z.array(z.string()).length(3),
  funFact: z.string(),
  cefrLevel: z.string(),
  isLibraryItem: z.boolean(),
  vocabularyId: z.string().uuid().nullable().optional(),
});
export type VocabularyQuestion = z.infer<typeof vocabularyQuestionSchema>;
```

Then replace the existing `quizQuestionSchema` (which is currently just `capitalsQuestionSchema`) with a discriminated union:

```typescript
export const quizQuestionSchema = z.discriminatedUnion('type', [
  capitalsQuestionSchema,
  vocabularyQuestionSchema,
]);
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
```

- [ ] **Step 2: Add vocabulary LLM output schema**

After the existing `capitalsLlmOutputSchema`, add:

```typescript
export const vocabularyLlmQuestionSchema = z.object({
  term: z.string(),
  correctAnswer: z.string(),
  acceptedAnswers: z.array(z.string()).min(1),
  distractors: z.array(z.string()).length(3),
  funFact: z.string(),
  cefrLevel: z.string(),
});

export const vocabularyLlmOutputSchema = z.object({
  theme: z.string(),
  targetLanguage: z.string(),
  questions: z.array(vocabularyLlmQuestionSchema).min(1),
});
export type VocabularyLlmOutput = z.infer<typeof vocabularyLlmOutputSchema>;
```

- [ ] **Step 3: Add `subjectId` to generate round input**

Update `generateRoundInputSchema` to accept an optional `subjectId` (required for vocabulary rounds):

```typescript
export const generateRoundInputSchema = z.object({
  activityType: quizActivityTypeSchema,
  themePreference: z.string().optional(),
  subjectId: z.string().uuid().optional(),
}).refine(
  (data) => data.activityType !== 'vocabulary' || !!data.subjectId,
  { message: 'subjectId is required for vocabulary rounds', path: ['subjectId'] },
);
```

- [ ] **Step 4: Write vocabulary schema tests**

Add to `packages/schemas/src/quiz.test.ts`:

```typescript
describe('vocabularyQuestionSchema', () => {
  const validVocabQuestion = {
    type: 'vocabulary' as const,
    term: 'der Hund',
    correctAnswer: 'dog',
    acceptedAnswers: ['dog', 'the dog'],
    distractors: ['cat', 'bird', 'fish'],
    funFact: 'Hund is one of the first German words most learners encounter.',
    cefrLevel: 'A1',
    isLibraryItem: false,
  };

  it('accepts valid vocabulary question', () => {
    expect(vocabularyQuestionSchema.parse(validVocabQuestion)).toEqual(validVocabQuestion);
  });

  it('requires exactly 3 distractors', () => {
    expect(() => vocabularyQuestionSchema.parse({
      ...validVocabQuestion,
      distractors: ['cat', 'bird'],
    })).toThrow();
  });

  it('requires at least 1 accepted answer', () => {
    expect(() => vocabularyQuestionSchema.parse({
      ...validVocabQuestion,
      acceptedAnswers: [],
    })).toThrow();
  });
});

describe('quizQuestionSchema (discriminated union)', () => {
  it('accepts capitals question', () => {
    const q = {
      type: 'capitals' as const,
      country: 'France',
      correctAnswer: 'Paris',
      acceptedAliases: ['Paris'],
      distractors: ['Berlin', 'Madrid', 'Rome'],
      funFact: 'Fact.',
      isLibraryItem: false,
    };
    expect(quizQuestionSchema.parse(q).type).toBe('capitals');
  });

  it('accepts vocabulary question', () => {
    const q = {
      type: 'vocabulary' as const,
      term: 'der Hund',
      correctAnswer: 'dog',
      acceptedAnswers: ['dog'],
      distractors: ['cat', 'bird', 'fish'],
      funFact: 'Fact.',
      cefrLevel: 'A1',
      isLibraryItem: true,
      vocabularyId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    };
    expect(quizQuestionSchema.parse(q).type).toBe('vocabulary');
  });

  it('rejects unknown type', () => {
    expect(() => quizQuestionSchema.parse({
      type: 'flashcard',
      question: 'test',
    })).toThrow();
  });
});

describe('generateRoundInputSchema with subjectId', () => {
  it('accepts vocabulary with subjectId', () => {
    expect(generateRoundInputSchema.parse({
      activityType: 'vocabulary',
      subjectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    })).toBeTruthy();
  });

  it('rejects vocabulary without subjectId', () => {
    expect(() => generateRoundInputSchema.parse({
      activityType: 'vocabulary',
    })).toThrow(/subjectId/);
  });

  it('accepts capitals without subjectId', () => {
    expect(generateRoundInputSchema.parse({
      activityType: 'capitals',
    })).toBeTruthy();
  });
});

describe('vocabularyLlmOutputSchema', () => {
  it('accepts valid LLM output', () => {
    const output = {
      theme: 'German Animals',
      targetLanguage: 'German',
      questions: [{
        term: 'die Katze',
        correctAnswer: 'cat',
        acceptedAnswers: ['cat', 'the cat'],
        distractors: ['dog', 'bird', 'fish'],
        funFact: 'Katze comes from Latin cattus.',
        cefrLevel: 'A1',
      }],
    };
    expect(vocabularyLlmOutputSchema.parse(output)).toEqual(output);
  });
});
```

- [ ] **Step 5: Run tests and commit**

Run: `cd packages/schemas && pnpm exec jest quiz.test.ts --no-coverage`

Expected: All tests PASS.

```bash
git add packages/schemas/src/quiz.ts packages/schemas/src/quiz.test.ts
git commit -m "feat(schemas): add vocabulary question schema, discriminated union, subjectId input [QUIZ-P2]"
```

---

### Task 2: Vocabulary Provider — CEFR Helpers + LLM Prompt + Validation

**Files:**
- Create: `apps/api/src/services/quiz/vocabulary-provider.ts`
- Create: `apps/api/src/services/quiz/vocabulary-provider.test.ts`

- [ ] **Step 1: Write the vocabulary provider tests (CEFR + prompt + validation)**

```typescript
// apps/api/src/services/quiz/vocabulary-provider.test.ts
import {
  CEFR_ORDER,
  nextCefrLevel,
  detectCefrCeiling,
  buildVocabularyPrompt,
  validateVocabularyRound,
  buildVocabularyMasteryQuestion,
  pickDistractors,
} from './vocabulary-provider';
import type { VocabularyLlmOutput } from '@eduagent/schemas';

describe('CEFR helpers', () => {
  it('nextCefrLevel advances one step', () => {
    expect(nextCefrLevel('A1')).toBe('A2');
    expect(nextCefrLevel('B2')).toBe('C1');
  });

  it('nextCefrLevel caps at C2', () => {
    expect(nextCefrLevel('C2')).toBe('C2');
  });

  it('nextCefrLevel defaults to A2 for unknown input', () => {
    expect(nextCefrLevel('X9')).toBe('A2');
  });

  it('detectCefrCeiling returns max level from vocabulary', () => {
    const vocab = [
      { cefrLevel: 'A1' },
      { cefrLevel: 'B1' },
      { cefrLevel: 'A2' },
      { cefrLevel: null },
    ];
    expect(detectCefrCeiling(vocab as Array<{ cefrLevel: string | null }>)).toBe('B1');
  });

  it('detectCefrCeiling returns A1 when no CEFR levels present', () => {
    expect(detectCefrCeiling([])).toBe('A1');
    expect(detectCefrCeiling([{ cefrLevel: null }])).toBe('A1');
  });
});

describe('buildVocabularyPrompt', () => {
  it('includes language, CEFR ceiling, and discovery count', () => {
    const prompt = buildVocabularyPrompt({
      discoveryCount: 4,
      ageBracket: '10-13',
      recentAnswers: ['dog', 'cat'],
      languageCode: 'de',
      cefrCeiling: 'A2',
      themePreference: 'Animals',
    });
    expect(prompt).toContain('German');
    expect(prompt).toContain('A2');
    expect(prompt).toContain('4');
    expect(prompt).toContain('dog');
    expect(prompt).toContain('Animals');
  });

  it('works without theme preference', () => {
    const prompt = buildVocabularyPrompt({
      discoveryCount: 6,
      ageBracket: '6-9',
      recentAnswers: [],
      languageCode: 'fr',
      cefrCeiling: 'A1',
    });
    expect(prompt).toContain('French');
    expect(prompt).toContain('choose an age-appropriate theme');
  });
});

describe('validateVocabularyRound', () => {
  const validOutput: VocabularyLlmOutput = {
    theme: 'German Animals',
    targetLanguage: 'German',
    questions: [
      {
        term: 'die Katze',
        correctAnswer: 'cat',
        acceptedAnswers: ['cat', 'the cat'],
        distractors: ['dog', 'bird', 'fish'],
        funFact: 'A fun fact.',
        cefrLevel: 'A1',
      },
      {
        term: 'der Vogel',
        correctAnswer: 'bird',
        acceptedAnswers: ['bird', 'the bird'],
        distractors: ['cat', 'dog', 'fish'],
        funFact: 'Another fact.',
        cefrLevel: 'A1',
      },
    ],
  };

  it('passes through valid questions', () => {
    const result = validateVocabularyRound(validOutput, 'A2');
    expect(result.questions.length).toBe(2);
    expect(result.theme).toBe('German Animals');
  });

  it('drops questions exceeding CEFR ceiling', () => {
    const output: VocabularyLlmOutput = {
      ...validOutput,
      questions: [
        { ...validOutput.questions[0], cefrLevel: 'A1' },
        { ...validOutput.questions[1], cefrLevel: 'C2' }, // way above A2 ceiling
      ],
    };
    const result = validateVocabularyRound(output, 'A2');
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].term).toBe('die Katze');
  });

  it('removes distractors that match correct answer', () => {
    const output: VocabularyLlmOutput = {
      ...validOutput,
      questions: [{
        term: 'die Katze',
        correctAnswer: 'cat',
        acceptedAnswers: ['cat'],
        distractors: ['cat', 'dog', 'fish'], // first distractor = correct answer
        funFact: 'Fact.',
        cefrLevel: 'A1',
      }],
    };
    const result = validateVocabularyRound(output, 'A2');
    expect(result.questions[0].distractors).not.toContain('cat');
  });
});

describe('pickDistractors', () => {
  const vocabPool = [
    { translation: 'dog' },
    { translation: 'cat' },
    { translation: 'bird' },
    { translation: 'fish' },
    { translation: 'horse' },
  ];

  it('picks 3 distractors excluding correct answer', () => {
    const result = pickDistractors('dog', vocabPool);
    expect(result.length).toBe(3);
    expect(result).not.toContain('dog');
  });

  it('returns fewer if pool is too small', () => {
    const smallPool = [{ translation: 'cat' }, { translation: 'dog' }];
    const result = pickDistractors('dog', smallPool);
    expect(result.length).toBe(1);
    expect(result[0]).toBe('cat');
  });
});

describe('buildVocabularyMasteryQuestion', () => {
  const allVocabulary = [
    { term: 'der Hund', translation: 'dog' },
    { term: 'die Katze', translation: 'cat' },
    { term: 'der Vogel', translation: 'bird' },
    { term: 'der Fisch', translation: 'fish' },
  ];

  it('builds a valid vocabulary question from library item', () => {
    const item = { id: 'v1', question: 'der Hund', answer: 'dog', vocabularyId: 'v1' };
    const result = buildVocabularyMasteryQuestion(item, allVocabulary, 'A1');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('vocabulary');
    expect(result!.term).toBe('der Hund');
    expect(result!.correctAnswer).toBe('dog');
    expect(result!.isLibraryItem).toBe(true);
    expect(result!.vocabularyId).toBe('v1');
    expect(result!.distractors.length).toBe(3);
    expect(result!.distractors).not.toContain('dog');
  });

  it('returns null when not enough distractors', () => {
    const tinyPool = [{ term: 'der Hund', translation: 'dog' }];
    const item = { id: 'v1', question: 'der Hund', answer: 'dog', vocabularyId: 'v1' };
    const result = buildVocabularyMasteryQuestion(item, tinyPool, 'A1');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest services/quiz/vocabulary-provider.test.ts --no-coverage`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the vocabulary provider**

```typescript
// apps/api/src/services/quiz/vocabulary-provider.ts
import type { VocabularyLlmOutput, VocabularyQuestion } from '@eduagent/schemas';
import type { LibraryItem } from './content-resolver';

// --- CEFR helpers ---

export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export function nextCefrLevel(level: string): string {
  const idx = CEFR_ORDER.indexOf(level as (typeof CEFR_ORDER)[number]);
  if (idx < 0) return 'A2'; // unknown → default to A2
  return CEFR_ORDER[Math.min(idx + 1, CEFR_ORDER.length - 1)];
}

export function detectCefrCeiling(
  vocabulary: Array<{ cefrLevel: string | null }>,
): string {
  let maxIdx = -1;
  for (const v of vocabulary) {
    if (!v.cefrLevel) continue;
    const idx = CEFR_ORDER.indexOf(v.cefrLevel as (typeof CEFR_ORDER)[number]);
    if (idx > maxIdx) maxIdx = idx;
  }
  return maxIdx >= 0 ? CEFR_ORDER[maxIdx] : 'A1';
}

function getLanguageDisplayName(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    return name ?? code;
  } catch {
    return code;
  }
}

// --- LLM Prompt ---

interface VocabularyPromptParams {
  discoveryCount: number;
  ageBracket: string;
  recentAnswers: string[];
  languageCode: string;
  cefrCeiling: string;
  themePreference?: string;
}

export function buildVocabularyPrompt(params: VocabularyPromptParams): string {
  const { discoveryCount, ageBracket, recentAnswers, languageCode, cefrCeiling, themePreference } = params;

  const languageName = getLanguageDisplayName(languageCode);

  const exclusions = recentAnswers.length > 0
    ? `Do NOT include these words (recently seen): ${recentAnswers.join(', ')}`
    : 'No exclusions.';

  const themeInstruction = themePreference
    ? `Theme: "${themePreference}"`
    : `Choose an age-appropriate theme (e.g., "${languageName} Animals", "${languageName} Food", "${languageName} at School").`;

  return `You are generating a vocabulary quiz round for a ${ageBracket} year old learner studying ${languageName}.

Target language: ${languageName}
Maximum CEFR level: ${cefrCeiling} (do not generate words above this level)
${themeInstruction}
Questions needed: exactly ${discoveryCount}

${exclusions}

Rules:
- Generate exactly ${discoveryCount} vocabulary questions
- Each question shows a ${languageName} word/phrase and asks for the English translation
- Each question must have exactly 3 distractors (wrong English translations) that are plausible but clearly wrong
- Distractors must not be synonyms or partial translations of the correct answer
- Include articles where the language uses them (e.g., "der Hund" not just "Hund" for German)
- acceptedAnswers should include the main translation plus common alternatives (e.g., ["dog", "the dog"])
- Fun facts should be about the word, its etymology, or a cultural note — one sentence max
- All words must be at or below CEFR level ${cefrCeiling}
- The theme should group related vocabulary naturally

Respond with ONLY valid JSON matching this exact structure:
{
  "theme": "Theme Name",
  "targetLanguage": "${languageName}",
  "questions": [
    {
      "term": "Word in ${languageName}",
      "correctAnswer": "English translation",
      "acceptedAnswers": ["English translation", "alternative"],
      "distractors": ["Wrong 1", "Wrong 2", "Wrong 3"],
      "funFact": "One interesting fact about this word.",
      "cefrLevel": "A1"
    }
  ]
}`;
}

// --- Validation ---

interface ValidatedVocabularyQuestion {
  term: string;
  correctAnswer: string;
  acceptedAnswers: string[];
  distractors: string[];
  funFact: string;
  cefrLevel: string;
}

interface ValidatedVocabularyRound {
  theme: string;
  questions: ValidatedVocabularyQuestion[];
}

export function validateVocabularyRound(
  llmOutput: VocabularyLlmOutput,
  cefrCeiling: string,
): ValidatedVocabularyRound {
  const ceilingIdx = CEFR_ORDER.indexOf(cefrCeiling as (typeof CEFR_ORDER)[number]);
  const maxIdx = ceilingIdx >= 0 ? ceilingIdx : CEFR_ORDER.length - 1;

  const validatedQuestions: ValidatedVocabularyQuestion[] = [];

  for (const q of llmOutput.questions) {
    // Drop questions exceeding CEFR ceiling
    const qIdx = CEFR_ORDER.indexOf(q.cefrLevel as (typeof CEFR_ORDER)[number]);
    if (qIdx > maxIdx) continue;

    // Remove distractors matching correct answer
    const correctLower = q.correctAnswer.toLowerCase();
    const acceptedLower = new Set(q.acceptedAnswers.map((a) => a.toLowerCase()));
    const cleanDistractors = q.distractors
      .filter((d) => !acceptedLower.has(d.toLowerCase()) && d.toLowerCase() !== correctLower)
      .slice(0, 3);

    validatedQuestions.push({
      term: q.term,
      correctAnswer: q.correctAnswer,
      acceptedAnswers: q.acceptedAnswers,
      distractors: cleanDistractors,
      funFact: q.funFact,
      cefrLevel: q.cefrLevel,
    });
  }

  return {
    theme: llmOutput.theme,
    questions: validatedQuestions,
  };
}

// --- Distractor selection from vocab bank ---

export function pickDistractors(
  correctTranslation: string,
  allVocabulary: Array<{ translation: string }>,
  count: number = 3,
): string[] {
  const correctLower = correctTranslation.toLowerCase();
  const seen = new Set<string>([correctLower]);
  const pool: string[] = [];

  for (const v of allVocabulary) {
    const lower = v.translation.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      pool.push(v.translation);
    }
  }

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count);
}

// --- Mastery question builder ---

export function buildVocabularyMasteryQuestion(
  item: LibraryItem,
  allVocabulary: Array<{ term: string; translation: string }>,
  cefrLevel: string,
): VocabularyQuestion | null {
  const distractors = pickDistractors(item.answer, allVocabulary, 3);
  if (distractors.length < 3) return null;

  return {
    type: 'vocabulary',
    term: item.question,
    correctAnswer: item.answer,
    acceptedAnswers: [item.answer],
    distractors,
    funFact: '',
    cefrLevel,
    isLibraryItem: true,
    vocabularyId: item.vocabularyId ?? undefined,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest services/quiz/vocabulary-provider.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 5: Export from service barrel and commit**

Add to `apps/api/src/services/quiz/index.ts`:

```typescript
export {
  buildVocabularyPrompt,
  validateVocabularyRound,
  buildVocabularyMasteryQuestion,
  pickDistractors,
  detectCefrCeiling,
  nextCefrLevel,
  CEFR_ORDER,
} from './vocabulary-provider';
```

```bash
git add apps/api/src/services/quiz/vocabulary-provider.ts apps/api/src/services/quiz/vocabulary-provider.test.ts apps/api/src/services/quiz/index.ts
git commit -m "feat(quiz): add vocabulary provider — CEFR helpers, LLM prompt, validation, mastery builder [QUIZ-P2]"
```

---

### Task 3: Refactor Round Generation + Add Vocabulary Path

**Files:**
- Modify: `apps/api/src/services/quiz/generate-round.ts`
- Modify: `apps/api/src/services/quiz/generate-round.test.ts`

- [ ] **Step 1: Write new vocabulary generation tests**

Add to `apps/api/src/services/quiz/generate-round.test.ts`:

```typescript
import { injectAtRandomPositions } from './generate-round';
import type { VocabularyQuestion } from '@eduagent/schemas';

describe('injectAtRandomPositions', () => {
  it('inserts items at random positions without replacing', () => {
    const base = ['a', 'b', 'c'];
    const injected = ['X', 'Y'];
    const result = injectAtRandomPositions(base, injected);
    expect(result.length).toBe(5);
    expect(result).toContain('X');
    expect(result).toContain('Y');
    expect(result).toContain('a');
  });

  it('returns base when injected is empty', () => {
    const base = ['a', 'b', 'c'];
    const result = injectAtRandomPositions(base, []);
    expect(result).toEqual(base);
  });
});

describe('buildVocabularyDiscoveryQuestions', () => {
  // Tests for converting validated LLM output to VocabularyQuestion[]
  it('converts validated questions to typed VocabularyQuestion array', () => {
    // This is tested through the integration in generateQuizRound
    // Pure function test added here for confidence
    const { buildVocabularyDiscoveryQuestions } = require('./generate-round');
    const validated = {
      theme: 'German Animals',
      questions: [{
        term: 'die Katze',
        correctAnswer: 'cat',
        acceptedAnswers: ['cat', 'the cat'],
        distractors: ['dog', 'bird', 'fish'],
        funFact: 'Fact.',
        cefrLevel: 'A1',
      }],
    };
    const result: VocabularyQuestion[] = buildVocabularyDiscoveryQuestions(validated);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('vocabulary');
    expect(result[0].isLibraryItem).toBe(false);
    expect(result[0].vocabularyId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd apps/api && pnpm exec jest services/quiz/generate-round.test.ts --no-coverage`

Expected: `injectAtRandomPositions` not found, `buildVocabularyDiscoveryQuestions` not found.

- [ ] **Step 3: Refactor inject function and add vocabulary generation path**

In `apps/api/src/services/quiz/generate-round.ts`, add the following changes:

**A. Add imports at the top:**

```typescript
import {
  vocabularyLlmOutputSchema,
  type VocabularyQuestion,
  type QuizQuestion,
} from '@eduagent/schemas';
import {
  buildVocabularyPrompt,
  validateVocabularyRound,
  buildVocabularyMasteryQuestion,
} from './vocabulary-provider';
```

**B. Add a generic injection utility** (alongside or replacing the old `injectMasteryQuestions`):

```typescript
/** Generic utility: inserts items at random positions without replacing */
export function injectAtRandomPositions<T>(base: T[], injected: T[]): T[] {
  if (injected.length === 0) return base;
  const combined = [...base];
  for (const item of injected) {
    const pos = Math.floor(Math.random() * (combined.length + 1));
    combined.splice(pos, 0, item);
  }
  return combined;
}
```

**C. Add vocabulary discovery question converter:**

```typescript
export function buildVocabularyDiscoveryQuestions(
  validated: { questions: Array<{ term: string; correctAnswer: string; acceptedAnswers: string[]; distractors: string[]; funFact: string; cefrLevel: string }> },
): VocabularyQuestion[] {
  return validated.questions.map((q) => ({
    type: 'vocabulary' as const,
    term: q.term,
    correctAnswer: q.correctAnswer,
    acceptedAnswers: q.acceptedAnswers,
    distractors: q.distractors,
    funFact: q.funFact,
    cefrLevel: q.cefrLevel,
    isLibraryItem: false,
  }));
}
```

**D. Extend `GenerateParams` interface** to include vocabulary-specific fields:

```typescript
interface GenerateParams {
  db: Database;
  profileId: string;
  activityType: QuizActivityType;
  ageBracket: string;
  themePreference?: string;
  libraryItems: LibraryItem[];
  recentAnswers: string[];
  // Vocabulary-specific (Phase 2)
  languageCode?: string;
  cefrCeiling?: string;
  allVocabulary?: Array<{ term: string; translation: string }>;
}
```

**E. Add vocabulary path inside `generateQuizRound`** — after the existing capitals path (the `// 2. Generate discovery questions via LLM` section), wrap the capitals-specific code in an `if (activityType === 'capitals')` block and add a vocabulary path:

```typescript
  let allQuestions: QuizQuestion[];
  let theme: string;

  if (activityType === 'capitals') {
    // --- Existing capitals path (unchanged) ---
    const prompt = buildCapitalsPrompt({
      discoveryCount: plan.discoveryCount,
      ageBracket,
      recentAnswers,
      themePreference,
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the quiz round.' },
    ];

    const llmResult = await routeAndCall(messages, 1);

    const jsonMatch = llmResult.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Quiz LLM returned no JSON');

    let llmOutput;
    try {
      llmOutput = capitalsLlmOutputSchema.parse(JSON.parse(jsonMatch[0]));
    } catch {
      throw new Error('Quiz LLM returned invalid structured output');
    }

    const validated = validateCapitalsRound(llmOutput);
    if (validated.questions.length === 0) throw new Error('No valid questions after validation');

    const discoveryQuestions: CapitalsQuestion[] = validated.questions.map((q) => ({
      type: 'capitals' as const,
      country: q.country,
      correctAnswer: q.correctAnswer,
      acceptedAliases: q.acceptedAliases,
      distractors: q.distractors,
      funFact: q.funFact,
      isLibraryItem: false,
    }));

    // Build mastery questions from library items
    const masteryQuestions = plan.masteryItems.map((item) => {
      const ref = CAPITALS_BY_COUNTRY.get(item.question.toLowerCase());
      const otherCapitals = CAPITALS_DATA
        .filter((c) => c.capital.toLowerCase() !== item.answer.toLowerCase())
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((c) => c.capital);
      return {
        type: 'capitals' as const,
        country: ref?.country ?? item.question,
        correctAnswer: ref?.capital ?? item.answer,
        acceptedAliases: ref?.acceptedAliases ?? [item.answer],
        distractors: otherCapitals,
        funFact: ref?.funFact ?? '',
        isLibraryItem: true,
        topicId: item.topicId ?? undefined,
      } satisfies CapitalsQuestion;
    });

    allQuestions = injectAtRandomPositions(discoveryQuestions, masteryQuestions);
    theme = validated.theme;

  } else if (activityType === 'vocabulary') {
    // --- New vocabulary path ---
    if (!languageCode || !cefrCeiling) {
      throw new Error('languageCode and cefrCeiling are required for vocabulary rounds');
    }

    const prompt = buildVocabularyPrompt({
      discoveryCount: plan.discoveryCount,
      ageBracket,
      recentAnswers,
      languageCode,
      cefrCeiling,
      themePreference,
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the quiz round.' },
    ];

    const llmResult = await routeAndCall(messages, 1);

    const jsonMatch = llmResult.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Quiz LLM returned no JSON');

    let llmOutput;
    try {
      llmOutput = vocabularyLlmOutputSchema.parse(JSON.parse(jsonMatch[0]));
    } catch {
      throw new Error('Quiz LLM returned invalid structured output');
    }

    const validated = validateVocabularyRound(llmOutput, cefrCeiling);
    if (validated.questions.length === 0) throw new Error('No valid questions after validation');

    const discoveryQuestions = buildVocabularyDiscoveryQuestions(validated);

    // Build mastery questions from library items
    const vocabPool = allVocabulary ?? [];
    const masteryQuestions = plan.masteryItems
      .map((item) => buildVocabularyMasteryQuestion(item, vocabPool, cefrCeiling))
      .filter((q): q is VocabularyQuestion => q !== null);

    allQuestions = injectAtRandomPositions(discoveryQuestions, masteryQuestions);
    theme = validated.theme;

  } else {
    throw new Error(`Unsupported activity type: ${activityType}`);
  }

  // 7. Assemble round (shared for all activity types)
  const round = assembleRound(theme, allQuestions);

  // 8. Persist to DB (shared)
  const [inserted] = await db
    .insert(quizRounds)
    .values({
      profileId,
      activityType,
      theme: round.theme,
      questions: round.questions,
      total: round.total,
      libraryQuestionIndices: round.libraryQuestionIndices,
      status: 'active',
    })
    .returning({ id: quizRounds.id });

  return {
    id: inserted.id,
    theme: round.theme,
    questions: round.questions,
    total: round.total,
  };
```

**F. Update `assembleRound` signature** to accept the union type:

```typescript
export function assembleRound(
  theme: string,
  questions: QuizQuestion[],
): AssembledRound {
  const libraryQuestionIndices = questions
    .map((q, i) => (q.isLibraryItem ? i : -1))
    .filter((i) => i >= 0);

  return {
    theme,
    questions,
    total: questions.length,
    libraryQuestionIndices,
  };
}
```

And update `AssembledRound`:

```typescript
export interface AssembledRound {
  theme: string;
  questions: QuizQuestion[];
  total: number;
  libraryQuestionIndices: number[];
}
```

- [ ] **Step 4: Run all generate-round tests**

Run: `cd apps/api && pnpm exec jest services/quiz/generate-round.test.ts --no-coverage`

Expected: All tests PASS (including existing capitals tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/quiz/generate-round.ts apps/api/src/services/quiz/generate-round.test.ts
git commit -m "feat(quiz): add vocabulary generation path, refactor to generic injection [QUIZ-P2]"
```

---

### Task 4: Extend Round Completion with SM-2 Updates

**Files:**
- Modify: `apps/api/src/services/quiz/complete-round.ts`
- Modify: `apps/api/src/services/quiz/complete-round.test.ts`

- [ ] **Step 1: Write SM-2 wiring tests**

Add to `apps/api/src/services/quiz/complete-round.test.ts`:

```typescript
import { buildMissedItemText, getVocabSm2Quality } from './complete-round';

describe('buildMissedItemText', () => {
  it('builds capitals text', () => {
    const q = { type: 'capitals' as const, country: 'France', correctAnswer: 'Paris' };
    expect(buildMissedItemText(q)).toBe('What is the capital of France?');
  });

  it('builds vocabulary text', () => {
    const q = { type: 'vocabulary' as const, term: 'der Hund', correctAnswer: 'dog' };
    expect(buildMissedItemText(q)).toBe('Translate: der Hund');
  });
});

describe('getVocabSm2Quality', () => {
  it('returns 4 for correct answer', () => {
    expect(getVocabSm2Quality(true)).toBe(4);
  });

  it('returns 1 for wrong answer', () => {
    expect(getVocabSm2Quality(false)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest services/quiz/complete-round.test.ts --no-coverage`

Expected: `buildMissedItemText` and `getVocabSm2Quality` not found.

- [ ] **Step 3: Implement SM-2 wiring and missed item text dispatch**

In `apps/api/src/services/quiz/complete-round.ts`:

**A. Add import:**

```typescript
import { reviewVocabulary } from '../vocabulary';
import type { QuizQuestion } from '@eduagent/schemas';
```

**B. Add exported helper functions:**

```typescript
/** Dispatch missed item text by question type */
export function buildMissedItemText(q: { type: string; [key: string]: unknown }): string {
  if (q.type === 'capitals') return `What is the capital of ${q.country}?`;
  if (q.type === 'vocabulary') return `Translate: ${q.term}`;
  return String(q.correctAnswer ?? '');
}

/** SM-2 quality score for vocabulary: correct=4, wrong=1 */
export function getVocabSm2Quality(correct: boolean): number {
  return correct ? 4 : 1;
}
```

**C. Update `completeQuizRound`** — replace the hardcoded capitals missed item text and add SM-2 updates:

Replace the existing missed items section:

```typescript
  // 3. Save missed discovery items (dispatched by question type)
  const questions = round.questions as QuizQuestion[];

  const missedDiscoveryItems = results
    .filter((r) => !r.correct)
    .map((r) => {
      const q = questions[r.questionIndex];
      if (!q || q.isLibraryItem) return null;
      return {
        profileId,
        activityType: round.activityType,
        questionText: buildMissedItemText(q),
        correctAnswer: q.correctAnswer,
        sourceRoundId: roundId,
      };
    })
    .filter(Boolean);
```

Replace the SM-2 placeholder comment with actual implementation:

```typescript
  // 4. SM-2 updates for vocabulary mastery questions
  const libraryIndices = round.libraryQuestionIndices as number[];
  if (round.activityType === 'vocabulary' && libraryIndices.length > 0) {
    for (const idx of libraryIndices) {
      const q = questions[idx];
      if (q?.type !== 'vocabulary' || !q.vocabularyId) continue;

      const resultForIdx = results.find((r) => r.questionIndex === idx);
      if (!resultForIdx) continue;

      const quality = getVocabSm2Quality(resultForIdx.correct);
      try {
        await reviewVocabulary(db, profileId, q.vocabularyId, { quality });
      } catch {
        // SM-2 update failure should not block round completion
        // The round is already scored — log but continue
        console.warn(`SM-2 update failed for vocabulary ${q.vocabularyId}`);
      }
    }
  }
```

- [ ] **Step 4: Run all completion tests**

Run: `cd apps/api && pnpm exec jest services/quiz/complete-round.test.ts --no-coverage`

Expected: All tests PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/quiz/complete-round.ts apps/api/src/services/quiz/complete-round.test.ts
git commit -m "feat(quiz): wire SM-2 updates for vocabulary mastery, dispatch missed item text by type [QUIZ-P2]"
```

---

### Task 5: Extend Quiz API Routes for Vocabulary

**Files:**
- Modify: `apps/api/src/routes/quiz.ts`
- Modify: `apps/api/src/routes/quiz.test.ts`

- [ ] **Step 1: Write vocabulary route tests**

Add to `apps/api/src/routes/quiz.test.ts`:

```typescript
describe('POST /v1/quiz/rounds (vocabulary)', () => {
  it('returns 400 for vocabulary without subjectId', async () => {
    const res = await app.request('/v1/quiz/rounds', {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ activityType: 'vocabulary' }),
    }, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it('returns 200 for vocabulary with valid subjectId', async () => {
    // Mock generateQuizRound to accept vocabulary params
    const { generateQuizRound } = require('../services/quiz/generate-round');
    (generateQuizRound as jest.Mock).mockResolvedValueOnce({
      id: 'vocab-round-1',
      theme: 'German Animals',
      questions: [{
        type: 'vocabulary',
        term: 'die Katze',
        correctAnswer: 'cat',
        acceptedAnswers: ['cat', 'the cat'],
        distractors: ['dog', 'bird', 'fish'],
        funFact: 'Fact.',
        cefrLevel: 'A1',
        isLibraryItem: false,
      }],
      total: 1,
    });

    const res = await app.request('/v1/quiz/rounds', {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        activityType: 'vocabulary',
        subjectId: 'test-subject-id',
      }),
    }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activityType).toBe('vocabulary');
    expect(body.questions[0].type).toBe('vocabulary');
  });
});
```

- [ ] **Step 2: Run tests to verify the new vocabulary tests fail**

Run: `cd apps/api && pnpm exec jest routes/quiz.test.ts --no-coverage`

Expected: vocabulary tests FAIL (route doesn't handle vocabulary yet).

- [ ] **Step 3: Extend the route handler for vocabulary**

In `apps/api/src/routes/quiz.ts`:

**A. Add imports:**

```typescript
import { subjects, vocabulary, vocabularyRetentionCards } from '@eduagent/database';
import { isNotNull, lte } from 'drizzle-orm';
import { detectCefrCeiling, nextCefrLevel } from '../services/quiz/vocabulary-provider';
import type { LibraryItem } from '../services/quiz/content-resolver';
```

**B. Extend `buildAndGenerateRound`** to handle vocabulary:

Replace the hardcoded `libraryItems = []` section with activity-type dispatch:

```typescript
async function buildAndGenerateRound(
  db: Database,
  profileId: string,
  profileMeta: ProfileMeta,
  input: GenerateRoundInput,
) {
  // Get recently seen answers from recent rounds
  const recentRounds = await db.query.quizRounds.findMany({
    where: and(
      eq(quizRounds.profileId, profileId),
      eq(quizRounds.activityType, input.activityType),
    ),
    orderBy: [desc(quizRounds.createdAt)],
    limit: 5,
  });

  const recentAnswers: string[] = [];
  for (const round of recentRounds) {
    const questions = round.questions as Array<{ correctAnswer?: string }>;
    for (const q of questions) {
      if (q.correctAnswer) recentAnswers.push(q.correctAnswer);
    }
  }

  const ageBracket = profileMeta.ageBracket ?? '10-13';

  // Activity-type specific context
  let libraryItems: LibraryItem[] = [];
  let languageCode: string | undefined;
  let cefrCeiling: string | undefined;
  let allVocabulary: Array<{ term: string; translation: string }> | undefined;

  if (input.activityType === 'vocabulary' && input.subjectId) {
    // 1. Validate subject exists, is active, and is a language subject
    const subject = await db.query.subjects.findFirst({
      where: and(
        eq(subjects.id, input.subjectId),
        eq(subjects.profileId, profileId),
      ),
    });

    if (!subject) throw new HTTPException(404, { message: 'Subject not found' });
    if (!subject.languageCode) throw new HTTPException(400, { message: 'Subject is not a language subject' });

    languageCode = subject.languageCode;

    // 2. Get all active vocabulary for this subject (for distractors + CEFR detection)
    const allVocab = await db.query.vocabulary.findMany({
      where: and(
        eq(vocabulary.profileId, profileId),
        eq(vocabulary.subjectId, input.subjectId),
      ),
    });

    allVocabulary = allVocab.map((v) => ({
      term: v.term,
      translation: v.translation,
    }));

    // 3. Detect CEFR ceiling from mastered vocabulary
    cefrCeiling = nextCefrLevel(
      detectCefrCeiling(allVocab.map((v) => ({ cefrLevel: v.cefrLevel })))
    );

    // 4. Get vocabulary due for SM-2 review (mastery candidates)
    const dueVocab = await db
      .select({
        id: vocabulary.id,
        term: vocabulary.term,
        translation: vocabulary.translation,
        nextReviewAt: vocabularyRetentionCards.nextReviewAt,
      })
      .from(vocabulary)
      .leftJoin(
        vocabularyRetentionCards,
        eq(vocabulary.id, vocabularyRetentionCards.vocabularyId),
      )
      .where(
        and(
          eq(vocabulary.profileId, profileId),
          eq(vocabulary.subjectId, input.subjectId),
        ),
      )
      .orderBy(vocabularyRetentionCards.nextReviewAt);

    // Filter to items that are due (nextReviewAt <= now or never reviewed)
    const now = new Date();
    libraryItems = dueVocab
      .filter((v) => !v.nextReviewAt || v.nextReviewAt <= now)
      .map((v) => ({
        id: v.id,
        question: v.term,
        answer: v.translation,
        vocabularyId: v.id,
      }));
  }

  return generateQuizRound({
    db,
    profileId,
    activityType: input.activityType,
    ageBracket,
    themePreference: input.themePreference,
    libraryItems,
    recentAnswers: recentAnswers.slice(0, 30),
    languageCode,
    cefrCeiling,
    allVocabulary,
  });
}
```

**C. Add missing import for `HTTPException`:**

```typescript
import { HTTPException } from 'hono/http-exception';
```

- [ ] **Step 4: Run route tests**

Run: `cd apps/api && pnpm exec jest routes/quiz.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm exec nx run api:typecheck`

```bash
git add apps/api/src/routes/quiz.ts apps/api/src/routes/quiz.test.ts
git commit -m "feat(api): extend quiz route for vocabulary — subject validation, vocab library, CEFR [QUIZ-P2]"
```

---

### Task 6: Mobile — Extend QuizFlowContext + Hooks

**Files:**
- Modify: `apps/mobile/src/app/(app)/quiz/_layout.tsx`
- Modify: `apps/mobile/src/hooks/use-quiz.ts`

- [ ] **Step 1: Add `subjectId` and `languageName` to QuizFlowContext**

In `apps/mobile/src/app/(app)/quiz/_layout.tsx`, update `QuizFlowState`:

```typescript
interface QuizFlowState {
  activityType: QuizActivityType | null;
  subjectId: string | null;
  languageName: string | null;
  round: QuizRoundResponse | null;
  prefetchedRoundId: string | null;
  completionResult: CompleteRoundResponse | null;
}
```

Update `QuizFlowContextType`:

```typescript
interface QuizFlowContextType extends QuizFlowState {
  setActivityType: (type: QuizActivityType) => void;
  setSubjectId: (id: string | null) => void;
  setLanguageName: (name: string | null) => void;
  setRound: (round: QuizRoundResponse) => void;
  setPrefetchedRoundId: (id: string | null) => void;
  setCompletionResult: (result: CompleteRoundResponse) => void;
  clear: () => void;
}
```

Update `INITIAL_STATE`:

```typescript
const INITIAL_STATE: QuizFlowState = {
  activityType: null,
  subjectId: null,
  languageName: null,
  round: null,
  prefetchedRoundId: null,
  completionResult: null,
};
```

Add setters in the provider:

```typescript
  const setSubjectId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, subjectId: id }));
  }, []);

  const setLanguageName = useCallback((name: string | null) => {
    setState((prev) => ({ ...prev, languageName: name }));
  }, []);
```

Add them to the provider value spread:

```typescript
  value={{ ...state, setActivityType, setSubjectId, setLanguageName, setRound, setPrefetchedRoundId, setCompletionResult, clear }}
```

- [ ] **Step 2: Update `useGenerateRound` to accept `subjectId`**

In `apps/mobile/src/hooks/use-quiz.ts`, update the input type:

```typescript
export function useGenerateRound(): UseMutationResult<
  QuizRoundResponse,
  Error,
  { activityType: QuizActivityType; themePreference?: string; subjectId?: string }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input) => {
      // @ts-expect-error quiz route types not yet wired to RPC client
      const res = await client.quiz.rounds.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as QuizRoundResponse;
    },
  });
}
```

Do the same for `usePrefetchRound`:

```typescript
export function usePrefetchRound(): UseMutationResult<
  { id: string },
  Error,
  { activityType: QuizActivityType; themePreference?: string; subjectId?: string }
> {
```

- [ ] **Step 3: Typecheck and commit**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

```bash
git add apps/mobile/src/app/"(app)"/quiz/_layout.tsx apps/mobile/src/hooks/use-quiz.ts
git commit -m "feat(mobile): extend quiz context with subjectId/languageName, update hook inputs [QUIZ-P2]"
```

---

### Task 7: Mobile — Vocabulary in Quiz Index

**Files:**
- Modify: `apps/mobile/src/app/(app)/quiz/index.tsx`

- [ ] **Step 1: Add language subject detection and Vocabulary card**

In `apps/mobile/src/app/(app)/quiz/index.tsx`:

**A. Add import:**

```typescript
import { useSubjects } from '../../../hooks/use-subjects';
```

**B. Add subject query inside the component, after the existing `useQuizStats` call:**

```typescript
  const { data: allSubjects } = useSubjects();
  const languageSubjects = allSubjects?.filter(
    (s) => s.pedagogyMode === 'four_strands' && s.languageCode && s.status === 'active',
  ) ?? [];
```

**C. Add handler for selecting vocabulary:**

```typescript
  const handleSelectVocabulary = (subjectId: string, languageName: string) => {
    setActivityType('vocabulary');
    setSubjectId(subjectId);
    setLanguageName(languageName);
    router.push('/(app)/quiz/launch' as never);
  };
```

**D. Update `useQuizFlow` destructure** to include new setters:

```typescript
  const { setActivityType, setSubjectId, setLanguageName } = useQuizFlow();
```

**E. Add Vocabulary cards after the Capitals IntentCard**, inside the `<View className="gap-4">` block:

```typescript
        {/* Phase 2: Vocabulary cards — one per language subject */}
        {languageSubjects.map((subject) => {
          const vocabStats = stats?.find(
            (s) => s.activityType === 'vocabulary',
          );
          const languageName = subject.name; // Subject name is the language display name
          return (
            <IntentCard
              key={subject.id}
              title={`Vocabulary: ${languageName}`}
              subtitle={
                vocabStats
                  ? `Best: ${vocabStats.bestScore}/${vocabStats.bestTotal} · Played: ${vocabStats.roundsPlayed}`
                  : 'New!'
              }
              onPress={() => handleSelectVocabulary(subject.id, languageName)}
              testID={`quiz-vocabulary-${subject.id}`}
            />
          );
        })}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/"(app)"/quiz/index.tsx
git commit -m "feat(mobile): add vocabulary cards in quiz index, one per language subject [QUIZ-P2]"
```

---

### Task 8: Mobile — Pass `subjectId` in Launch + Prefetch

**Files:**
- Modify: `apps/mobile/src/app/(app)/quiz/launch.tsx`

- [ ] **Step 1: Update launch screen to pass `subjectId`**

In `apps/mobile/src/app/(app)/quiz/launch.tsx`:

**A. Update `useQuizFlow` destructure** to include `subjectId`:

```typescript
  const { activityType, subjectId, setRound } = useQuizFlow();
```

**B. Update the generate mutation call** to pass `subjectId`:

```typescript
  useEffect(() => {
    if (!activityType) return;
    generateRound.mutate(
      { activityType, subjectId: subjectId ?? undefined },
      {
        onSuccess: (round) => {
          setRound(round);
          router.replace('/(app)/quiz/play' as never);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityType]);
```

**C. Update retry button** to also pass `subjectId`:

```typescript
  onPress={() => generateRound.mutate({
    activityType: activityType!,
    subjectId: subjectId ?? undefined,
  })}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/"(app)"/quiz/launch.tsx
git commit -m "feat(mobile): pass subjectId in quiz launch and retry [QUIZ-P2]"
```

---

### Task 9: Mobile — Vocabulary Question Rendering + Prefetch Fix

**Files:**
- Modify: `apps/mobile/src/app/(app)/quiz/play.tsx`

- [ ] **Step 1: Update play screen to dispatch by question type**

In `apps/mobile/src/app/(app)/quiz/play.tsx`:

**A. Add `VocabularyQuestion` import:**

```typescript
import type { CapitalsQuestion, VocabularyQuestion, QuestionResult, QuizQuestion } from '@eduagent/schemas';
```

**B. Update question typing** — change the line that types `questions`:

```typescript
  const questions = (round?.questions ?? []) as QuizQuestion[];
  const currentQuestion = questions[currentIndex];
```

**C. Update answer checking** in `handleAnswer` to handle both types:

```typescript
    const handleAnswer = useCallback(
      (answer: string) => {
        if (answerState !== 'unanswered' || !currentQuestion) return;

        const timeMs = Date.now() - questionStartTime;

        let isCorrect: boolean;
        if (currentQuestion.type === 'capitals') {
          isCorrect =
            answer.toLowerCase() === currentQuestion.correctAnswer.toLowerCase() ||
            currentQuestion.acceptedAliases.some(
              (alias) => alias.toLowerCase() === answer.toLowerCase(),
            );
        } else if (currentQuestion.type === 'vocabulary') {
          isCorrect =
            answer.toLowerCase() === currentQuestion.correctAnswer.toLowerCase() ||
            currentQuestion.acceptedAnswers.some(
              (a) => a.toLowerCase() === answer.toLowerCase(),
            );
        } else {
          isCorrect = answer.toLowerCase() === currentQuestion.correctAnswer.toLowerCase();
        }

        // ... rest unchanged (setSelectedAnswer, haptics, setResults, etc.)
      },
    );
```

**D. Update the question text rendering** to dispatch by type. Replace the existing question section:

```typescript
      {/* Question */}
      <View className="px-5 mb-8">
        {currentQuestion.type === 'capitals' ? (
          <>
            <Text className="text-text-secondary text-base mb-2">
              What is the capital of...
            </Text>
            <Text className="text-text-primary text-2xl font-bold">
              {currentQuestion.country}?
            </Text>
          </>
        ) : currentQuestion.type === 'vocabulary' ? (
          <>
            <Text className="text-text-secondary text-base mb-2">
              Translate:
            </Text>
            <Text className="text-text-primary text-2xl font-bold">
              {currentQuestion.term}
            </Text>
          </>
        ) : null}
      </View>
```

**E. Update correct-answer highlighting** in `getOptionStyle` and `getOptionTextColor` — replace the alias/answer check to handle both question types:

```typescript
  const isCorrectOption = (option: string) => {
    if (!currentQuestion) return false;
    if (option.toLowerCase() === currentQuestion.correctAnswer.toLowerCase()) return true;
    if (currentQuestion.type === 'capitals') {
      return currentQuestion.acceptedAliases.some((a) => a.toLowerCase() === option.toLowerCase());
    }
    if (currentQuestion.type === 'vocabulary') {
      return currentQuestion.acceptedAnswers.some((a) => a.toLowerCase() === option.toLowerCase());
    }
    return false;
  };

  const getOptionStyle = (option: string) => {
    if (answerState === 'unanswered') return 'bg-surface-secondary';
    if (isCorrectOption(option)) return 'bg-green-600';
    if (option === selectedAnswer && answerState === 'wrong') return 'bg-red-600';
    return 'bg-surface-secondary opacity-50';
  };

  const getOptionTextColor = (option: string) => {
    if (answerState === 'unanswered') return 'text-text-primary';
    if (isCorrectOption(option)) return 'text-white';
    if (option === selectedAnswer && answerState === 'wrong') return 'text-white';
    return 'text-text-secondary';
  };
```

**F. Guard empty fun fact** — wrap the fun fact section to only show when non-empty:

```typescript
      {answerState !== 'unanswered' && (
        <View className="px-5 mt-6">
          {currentQuestion.funFact ? (
            <View className="bg-surface-secondary rounded-xl p-4">
              <Text className="text-text-secondary text-sm">
                {currentQuestion.funFact}
              </Text>
            </View>
          ) : null}
          {showContinueHint && (
            <Text className="text-text-secondary text-xs text-center mt-3 animate-pulse">
              Tap anywhere to continue
            </Text>
          )}
        </View>
      )}
```

**G. Update prefetch to include `subjectId`:**

```typescript
  const { round, activityType, subjectId, setPrefetchedRoundId, setCompletionResult } = useQuizFlow();

  // In the prefetch useEffect:
  prefetchRound.mutate(
    { activityType, subjectId: subjectId ?? undefined },
    {
      onSuccess: (data) => setPrefetchedRoundId(data.id),
    },
  );
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/"(app)"/quiz/play.tsx
git commit -m "feat(mobile): dispatch quiz rendering by question type, vocabulary question layout [QUIZ-P2]"
```

---

### Task 10: Integration Validation

This task runs the full validation suite to confirm Phase 2 doesn't break Phase 1 and all new code is clean.

- [ ] **Step 1: Run schema tests**

Run: `cd packages/schemas && pnpm exec jest quiz.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 2: Run all quiz service tests**

Run: `cd apps/api && pnpm exec jest services/quiz/ --no-coverage`

Expected: All tests PASS across all service files (content-resolver, capitals-validation, capitals-data, vocabulary-provider, generate-round, complete-round).

- [ ] **Step 3: Run route tests**

Run: `cd apps/api && pnpm exec jest routes/quiz.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 4: API typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: PASS.

- [ ] **Step 5: Mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: API lint**

Run: `pnpm exec nx run api:lint`

Expected: PASS (fix any lint issues before committing).

- [ ] **Step 7: Mobile lint**

Run: `pnpm exec nx lint mobile`

Expected: PASS (fix any lint issues before committing).

- [ ] **Step 8: Final commit if any lint fixes needed**

```bash
git add -A
git commit -m "chore(quiz): lint and typecheck fixes for Phase 2 vocabulary [QUIZ-P2]"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|---|---|
| Vocabulary content provider (vocab bank for mastery, LLM for discovery) | Task 2 (provider), Task 3 (generation path) |
| CEFR-aware round generation | Task 2 (CEFR helpers + prompt), Task 5 (route CEFR detection) |
| SM-2 update on round completion for vocab mastery questions | Task 4 (completion SM-2 wiring) |
| Practice menu: show Vocabulary only when learner has a language subject | Task 7 (quiz index conditional rendering) |
| Vocabulary-specific validation (accepted translations) | Task 2 (validateVocabularyRound) |
| Mastery questions pulled from vocab bank, never LLM-generated | Task 2 (buildVocabularyMasteryQuestion) |
| Discovery at CEFR level + 1 | Task 2 (nextCefrLevel in prompt), Task 5 (route CEFR ceiling) |
| Same UI for mastery vs discovery (learner doesn't know) | Task 9 (same MC layout for all vocabulary questions) |
| Distractors from vocab bank for mastery questions | Task 2 (pickDistractors from allVocabulary) |
| Empty fun fact handled gracefully | Task 9 (guard empty funFact) |
| subjectId required for vocabulary rounds | Task 1 (schema refinement) |
| Discriminated union question schema | Task 1 (quizQuestionSchema update) |

## What Phase 2 Does NOT Include

- **Guess Who** — Phase 3
- **Coaching cards from quiz_missed_items** — Phase 4
- **Capitals SM-2 tracking** — Capitals remain pure discovery. SM-2 only for vocabulary.
- **Free-text unlock / difficulty adaptation** — Phase 5
- **Round history screen / per-activity stats** — Phase 5
- **No database migration needed** — Phase 1 already creates the `'vocabulary'` enum value and all needed tables. Audit confirmed `capitalsQuestionSchema` has `type: z.literal('capitals')`, so the discriminated union works without backfill (QP2-R6 resolved).
- **Vocabulary introduction flow ("learn this word" screen)** — Phase 2.5 scope. Phase 2 ships with Option C: new bank items sit unreviewed, mastery pool requires `nextReviewAt IS NOT NULL`. See QP2-D3.
- **Hono RPC type wiring for the quiz route** — see QP2-R11. `@ts-expect-error` remains in `use-quiz.ts` until a cross-cutting RPC wiring task lands. Adding `subjectId` passes through without compile-time checking.
