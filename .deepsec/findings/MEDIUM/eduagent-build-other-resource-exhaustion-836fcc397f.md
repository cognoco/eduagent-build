# [MEDIUM] Unbounded attempt accumulation and unbounded answerGiven on /quiz/rounds/:id/check (no rate limit, no size cap)

**File:** [`apps/api/src/services/quiz/complete-round.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/quiz/complete-round.ts#L105-L259) (lines 105, 248, 259)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-resource-exhaustion`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

checkQuizAnswerWithCorrect() (L222-267) builds a RecordedQuestionResult containing the client-supplied answerGiven and appends it to the round's results JSONB on every call via appendRecordedAttempt() (L96-119): `results: sql`${quizRounds.results} || ${JSON.stringify([attempt])}::jsonb``. Three compounding gaps make this a resource-exhaustion vector: (1) answerGiven has NO maximum length — questionCheckInputSchema.answerGiven is `z.string().min(1)` (packages/schemas/src/quiz.ts:158) with no `.max()`, unlike every sibling string field (clues, funFact .max(200); themePreference .max(100)); (2) there is no per-round cap on the number of recorded attempts — assertAnswerInOptions only constrains multiple_choice on capitals/vocabulary, so an attacker simply sends answerMode:'free_text' (or guess_who) and the value is stored verbatim; (3) the route POST /quiz/rounds/:id/check (routes/quiz.ts:306-345) has assertNotProxyMode + requireProfileId but NO rate limit, and is intentionally excluded from meteringMiddleware (it makes no LLM call). An authenticated user can create one round (1 quota unit) and then issue unlimited /check calls carrying large answerGiven payloads, growing a single quiz_rounds.results JSONB row without bound. Downstream this also degrades performance: getServerAttemptElapsedMs sorts all checkedAt values, validateResults/finalRecordedResults iterate every attempt at completion (O(N) per complete), and computeRoundStats/findCompletedForStreaks load results arrays across up to 1000 rounds — a few bloated rows cause memory pressure / Worker timeouts. Impact is self-scoped (attacker's own account) but consumes shared DB storage and can degrade service; the codebase already protects the analogous /dictation/review endpoint with a 10/min rate limit and strict input caps, so this is an inconsistency rather than accepted design.

## Recommendation

Add a `.max(N)` bound to answerGiven in questionCheckInputSchema and questionResultSchema (mirror dictation's per-field caps, e.g. 200-500 chars). Enforce a per-round attempt cap in appendRecordedAttempt/checkQuizAnswerWithCorrect (reject once results length exceeds, e.g., total * smallConstant). Apply checkAndLogRateLimit (per profile+account) to POST /quiz/rounds/:id/check exactly as routes/dictation.ts does before the expensive operation.

## Revalidation

**Verdict:** true-positive

All three sub-claims verified against current code. (1) answerGiven is unbounded: questionCheckInputSchema.answerGiven = `z.string().min(1)` (packages/schemas/src/quiz.ts:158) and questionResultSchema.answerGiven = `z.string()` (L117) — neither has `.max()`, unlike sibling fields (clues/funFact `.max(200)`, themePreference `.max(100)`). (2) No per-round attempt cap: appendRecordedAttempt (complete-round.ts L96-119) does `results: sql\`${quizRounds.results} || ${JSON.stringify([attempt])}::jsonb\`` with no length guard, and the quizRounds.results JSONB column has no size constraint. checkQuizAnswerWithCorrect appends on every call (L259); for answerMode 'free_text' or 'guess_who', assertAnswerInOptions (L164-190) is a no-op, so answerGiven is stored verbatim. (3) No rate limit: the route POST /quiz/rounds/:id/check (routes/quiz.ts:306-345) has only assertNotProxyMode + requireProfileId; it is excluded from meteringMiddleware (LLM_ROUTE_PATTERNS_POST_ONLY in middleware/metering.ts:161-229 lists `/quiz/rounds` and `/quiz/rounds/prefetch` but NOT `/check`), and metering is a quota-decrement, not a rate/size limiter. There is no global bodyLimit (only homework.ts has a route-local content-length check) and no global rate limiter (only CORS + secureHeaders + auth/account/profile/consent/metering/llm in index.ts:162-241). The analogous /dictation/review (routes/dictation.ts:227-259) HAS checkAndLogRateLimit (10/min), zod per-field caps, and a 12k aggregate prompt budget — so this is a verified inconsistency, not accepted design. Concrete attack: an authenticated free-tier user creates one round (1 quota unit), keeps it `status='active'`, and issues unlimited unthrottled /check calls with multi-MB free_text answerGiven, growing a single results JSONB row without bound. The JSONB `||` append rewrites the whole array each call (escalating server work), and downstream reads degrade — getServerAttemptElapsedMs sorts all attempts per call (L70-74), validateResults/completion iterate every attempt, and computeRoundStats/findCompletedForStreaks load results across up to 1000 rounds — risking Worker CPU/memory limits. Self-scoped but consumes shared DB storage and degrades service. The finding's line cites (105, 248, 259) match the current post-WI-89 mechanism. Real and exploitable; MEDIUM is appropriate.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-24)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-23)
