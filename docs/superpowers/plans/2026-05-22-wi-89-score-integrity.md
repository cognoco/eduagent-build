# WI-89 Score Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver WI-89 so quiz score, XP, and mastery cannot be inflated by forged completion results or duplicate `questionIndex` entries.

**Architecture:** Keep the fix migration-free by using the existing `quiz_rounds.results` JSONB column as active-round server attempt state. `/quiz/rounds/:id/check` records a server-derived attempt before revealing feedback; `/quiz/rounds/:id/complete` ignores scoring claims from the request body whenever server attempts exist, deduplicates by first `questionIndex`, and persists final per-question results. The mobile client also prevents duplicate local result assembly as conformance, but the API remains the trust boundary.

**Tech Stack:** Hono routes, Drizzle/Neon JSONB update, `@eduagent/schemas`, React Native/Expo, Jest.

---

### Task 1: API Attempt State And Server-Authoritative Completion

**Files:**
- Modify: `apps/api/src/services/quiz/complete-round.ts`
- Modify: `apps/api/src/routes/quiz.ts`
- Test: `apps/api/src/services/quiz/complete-round.test.ts`
- Test: `apps/api/src/routes/quiz.test.ts`

- [ ] **Step 1: Add failing service tests for duplicate dedup**

Add tests under `describe('validateResults (anti-tampering)')`:

```ts
it('[BREAK/WI-230] keeps only the first result for each questionIndex', () => {
  const duplicated: QuestionResult[] = [
    { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 100 },
    { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 100 },
    { questionIndex: 1, correct: true, answerGiven: 'Berlin', timeMs: 100 },
  ];

  const validated = validateResults(questions, duplicated);

  expect(validated).toHaveLength(2);
  expect(validated.map((result) => result.questionIndex)).toEqual([0, 1]);
  expect(calculateScore(validated)).toBe(2);
  expect(calculateXp(validated, questions.length)).toBe(
    calculateXp(validated.slice(0, 2), questions.length),
  );
});
```

Run:

```bash
pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/services/quiz/complete-round.test.ts --runInBand --no-coverage
```

Expected: FAIL because duplicates are currently retained.

- [ ] **Step 2: Add failing route tests for WI-163**

In `apps/api/src/routes/quiz.test.ts`, add:

```ts
it('[BREAK/WI-163] check records wrong attempts before revealing correctAnswer', async () => {
  (mockDb as any).query.quizRounds.findFirst = jest
    .fn()
    .mockResolvedValue(ACTIVE_ROUND);

  const res = await app.request(
    `/v1/quiz/rounds/${ROUND_ID_1}/check`,
    {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        questionIndex: 0,
        answerGiven: 'Salzburg',
        answerMode: 'multiple_choice',
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ correct: false, correctAnswer: 'Vienna' });
  expect((mockDb as any).update).toHaveBeenCalled();
});

it('[BREAK/WI-163] complete scores from recorded attempts, not forged request results', async () => {
  (mockDb as any).query.quizRounds.findFirst = jest.fn().mockResolvedValue({
    ...ACTIVE_ROUND,
    results: [
      {
        questionIndex: 0,
        correct: false,
        answerGiven: 'Salzburg',
        timeMs: 3000,
        answerMode: 'multiple_choice',
      },
    ],
  });

  const res = await app.request(
    `/v1/quiz/rounds/${ROUND_ID_1}/complete`,
    {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        results: [
          {
            questionIndex: 0,
            correct: true,
            answerGiven: 'Vienna',
            timeMs: 1,
            answerMode: 'multiple_choice',
          },
        ],
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.score).toBe(0);
  expect(body.questionResults[0]).toMatchObject({
    questionIndex: 0,
    correct: false,
    answerGiven: 'Salzburg',
    correctAnswer: 'Vienna',
  });
});
```

Run:

```bash
pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/routes/quiz.test.ts --runInBand --no-coverage
```

Expected: FAIL because `/check` does not persist attempts and `/complete` still uses request results.

- [ ] **Step 3: Implement attempt recording**

In `complete-round.ts`, replace `checkQuizAnswerWithCorrect` internals with a transactional or explicit profile-scoped update path:

```ts
type ServerRecordedQuestionResult = QuestionResult & { checkedAt?: string };

function getServerAttemptElapsedMs(
  roundCreatedAt: Date,
  existingResults: ServerRecordedQuestionResult[],
  now: Date,
): number {
  const latestCheckedAt = existingResults
    .map((result) => result.checkedAt)
    .filter((value): value is string => typeof value === 'string')
    .sort()
    .at(-1);
  const startedAt = latestCheckedAt ? new Date(latestCheckedAt) : roundCreatedAt;
  return Math.max(0, now.getTime() - startedAt.getTime());
}
```

`checkQuizAnswerWithCorrect()` should:

1. Read the active round via `createScopedRepository`.
2. Validate the question and answer option.
3. Compute `correct` with `isAnswerCorrect`.
4. Build an attempt with server-derived `correct`, `timeMs`, and `checkedAt`.
5. Append it to `quiz_rounds.results` using an update guarded by `id`, `profileId`, and `status = 'active'`.
6. Throw `ConflictError` if the append update affects zero rows.
7. Return `{ correct, correctAnswer }`.

- [ ] **Step 4: Implement authoritative completion source**

In `completeQuizRound()`, choose:

```ts
const recordedResults = Array.isArray(round.results)
  ? (round.results as QuestionResult[])
  : [];
const completionSourceResults =
  recordedResults.length > 0 ? recordedResults : [];
const validatedResults = validateResults(questions, completionSourceResults);
const droppedResults =
  (recordedResults.length > 0 ? recordedResults.length : results.length) -
  validatedResults.length;
```

Do not fall back to request body scoring when no server attempts exist. This makes direct forged complete requests complete with score `0`, not attacker-chosen score.

- [ ] **Step 5: Implement dedup in `validateResults()`**

Add a `seenQuestionIndices` set and skip any result whose `questionIndex` has already been accepted.

- [ ] **Step 6: Run API tests green**

Run:

```bash
pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/services/quiz/complete-round.test.ts apps/api/src/routes/quiz.test.ts --runInBand --no-coverage
```

Expected: PASS.

### Task 2: Mobile Duplicate Result Conformance

**Files:**
- Modify: `apps/mobile/src/app/(app)/quiz/play.tsx`
- Test: `apps/mobile/src/app/(app)/quiz/play.test.tsx`

- [ ] **Step 1: Add failing mobile test for duplicate assembly**

Add a test that configures a two-question `guess_who` round, fires `guess-who-resolve-correct` twice before continuing, then answers question 2 and asserts the completion payload has one result per question:

```ts
it('[BREAK/WI-282] does not submit duplicate results when Guess Who resolves twice', async () => {
  mockRound = {
    id: 'round-wi-282',
    activityType: 'guess_who' as const,
    theme: 'Inventors',
    total: 2,
    questions: [
      {
        type: 'guess_who' as const,
        clues: ['1', '2', '3', '4', '5'],
        mcFallbackOptions: ['Nikola Tesla', 'Ada Lovelace', 'Grace Hopper', 'Alan Turing'],
        funFact: 'Fact',
        isLibraryItem: true,
      },
      {
        type: 'guess_who' as const,
        clues: ['1', '2', '3', '4', '5'],
        mcFallbackOptions: ['Nikola Tesla', 'Ada Lovelace', 'Grace Hopper', 'Alan Turing'],
        funFact: 'Fact',
        isLibraryItem: true,
      },
    ],
  };

  render(<QuizPlayScreen />);

  fireEvent.press(screen.getByTestId('guess-who-resolve-correct'));
  fireEvent.press(screen.getByTestId('guess-who-resolve-correct'));
  await waitFor(() => screen.getByText('Correct'));
  await new Promise((resolve) => setTimeout(resolve, 280));
  fireEvent.press(screen.getByTestId('quiz-next-question'));
  fireEvent.press(screen.getByTestId('guess-who-resolve-correct'));

  await waitFor(() => {
    expect(mockCompleteRoundMutate).toHaveBeenCalled();
  });
  const payload = mockCompleteRoundMutate.mock.calls.at(-1)?.[0];
  expect(payload.results.map((result: { questionIndex: number }) => result.questionIndex)).toEqual([0, 1]);
});
```

Run:

```bash
cd apps/mobile && pnpm exec jest src/app/\\(app\\)/quiz/play.test.tsx --runInBand --no-coverage
```

Expected: FAIL because Guess Who appends duplicate results today.

- [ ] **Step 2: Implement local dedup helper and Guess Who guard**

In `play.tsx`, add:

```ts
function appendUniqueQuestionResult(
  results: QuestionResult[],
  nextResult: QuestionResult,
): QuestionResult[] {
  return [
    ...results.filter((result) => result.questionIndex !== nextResult.questionIndex),
    nextResult,
  ].sort((a, b) => a.questionIndex - b.questionIndex);
}
```

Use it in `handleAnswer()` and `handleGuessWhoResolved()`. Add an early guard to `handleGuessWhoResolved()`:

```ts
if (answerState !== 'unanswered' || answerSubmittedRef.current) return;
answerSubmittedRef.current = true;
```

- [ ] **Step 3: Run mobile test green**

Run:

```bash
cd apps/mobile && pnpm exec jest src/app/\\(app\\)/quiz/play.test.tsx --runInBand --no-coverage
```

Expected: PASS.

### Task 3: Validation, PR, And Review Closure

**Files:**
- Potentially modified by prior tasks only.

- [ ] **Step 1: Run targeted suite**

```bash
pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/services/quiz/complete-round.test.ts apps/api/src/routes/quiz.test.ts --runInBand --no-coverage
cd apps/mobile && pnpm exec jest src/app/\\(app\\)/quiz/play.test.tsx --runInBand --no-coverage
```

- [ ] **Step 2: Run required change-class validation**

```bash
bash scripts/check-change-class.sh --run
```

- [ ] **Step 3: Commit via repo commit skill**

Load `.agents/skills/commit/SKILL.md` before staging. Commit message should reference WI-89 and children WI-163, WI-230, WI-282.

- [ ] **Step 4: Open PR**

Open a PR that references WI-89, WI-163, WI-230, WI-282 and lists red-green tests plus validation.

- [ ] **Step 5: Drive PR green**

Check CI and automated reviews. Fix all critical/high/medium findings. Do not mark the goal complete until CI is clean and reviewer findings at those severities are resolved.
