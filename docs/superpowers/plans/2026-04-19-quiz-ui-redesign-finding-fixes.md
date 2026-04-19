# Quiz UI-Redesign Finding Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the quiz learning loop — the server computes which answers were wrong and what the correct answers are, but the UI currently throws most of that away. After this plan ships, users see exactly what they missed and can learn from it.

**Architecture:** API-only change for F-032 (conditional response shape based on round status). Schema extension to include `answerGiven` in the completion response. Mobile-only changes for F-040 (results screen enhancement) and Group 3a (polish). Cross-package change for F-036b (activity label formatting).

**Tech Stack:** Hono (API routes), Zod (schema validation), React Native + Expo Router (mobile), NativeWind/Tailwind (styling), Jest (testing)

**Spec:** [docs/specs/2026-04-18-quiz-ui-redesign-finding-fixes.md](../../specs/2026-04-18-quiz-ui-redesign-finding-fixes.md)

---

## Already Implemented (Do NOT Re-implement)

These items from the spec are already in the codebase — verified by adversarial review 2026-04-19:

| Finding | Status | Evidence |
|---------|--------|----------|
| F-034 (practice subtitle) | DONE | `practice.tsx:41-64` dynamically aggregates quizStats |
| F-037 (date headers) | DONE | `history.tsx:7-23` has `formatDateHeader` with Today/Yesterday/locale |
| F-036a main back button | DONE | `[roundId].tsx:58-66` uses `Ionicons name="arrow-back"` |
| F-038 (GuessWho label) | DONE | No redundant label exists; only placeholder "Type a name" + accessibilityLabel |
| F-040 missed section (partial) | PARTIAL | `results.tsx:70-184` renders missed cards — but missing `answerGiven`, fun fact, colors, accessibility |

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/schemas/src/quiz.ts` | Modify | Add `answerGiven` to `validatedQuestionResultSchema`; add `activityLabel` to round response |
| `apps/api/src/services/quiz/complete-round.ts` | Modify | Include `answerGiven` in returned `questionResults` |
| `apps/api/src/routes/quiz.ts` | Modify | Add `acceptedAliases` + `celebrationTier` to completed round; add `activityLabel` |
| `apps/api/src/routes/quiz.test.ts` | Modify | Add tests for completed-round branch, in-progress stripping, cross-profile 404 |
| `apps/mobile/src/app/(app)/quiz/results.tsx` | Modify | Enhance missed-question cards with `answerGiven`, fun fact, colors, accessibility |
| `apps/mobile/src/app/(app)/quiz/results.test.tsx` | Create | Test missed-question rendering for mixed/perfect/edge-case rounds |
| `apps/mobile/src/app/(app)/quiz/history.tsx` | Modify | Replace back button plain text with Ionicon |
| `apps/mobile/src/app/(app)/quiz/[roundId].tsx` | Modify | Replace error-state back button plain text with Ionicon; use `activityLabel` |

---

### Task 1: Extend `ValidatedQuestionResult` schema with `answerGiven`

The completion response (`POST /quiz/rounds/:id/complete`) returns `questionResults` without `answerGiven`. The results screen needs it to show "You said: {answer}". The DB already stores `answerGiven` in `round.results` (the raw `QuestionResult[]`), but the typed response schema omits it.

**Files:**
- Modify: `packages/schemas/src/quiz.ts:176-183`
- Modify: `apps/api/src/services/quiz/complete-round.ts:443-452`

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/services/quiz/complete-round.test.ts` (or the file that tests `completeQuizRound`). If no such test file exists, we verify via the route-level test in Task 3. For now, add an assertion in `apps/api/src/routes/quiz.test.ts` inside the existing `POST /v1/quiz/rounds/:id/complete` describe block:

```typescript
// Inside the 'scores the round and persists results' test, after the existing assertions:
expect(body.questionResults[0]).toHaveProperty('answerGiven');
expect(body.questionResults[0].answerGiven).toBe('Vienna');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest --testPathPattern quiz.test.ts --no-coverage -t "scores the round"`

Expected: FAIL — `answerGiven` is not present on `questionResults[0]`

- [ ] **Step 3: Extend the schema**

In `packages/schemas/src/quiz.ts`, add `answerGiven` to the validated result schema:

```typescript
export const validatedQuestionResultSchema = z.object({
  questionIndex: z.number().int().min(0),
  correct: z.boolean(),
  correctAnswer: z.string(),
  answerGiven: z.string(),
});
```

- [ ] **Step 4: Include `answerGiven` in the completion response**

In `apps/api/src/services/quiz/complete-round.ts`, update the `questionResults` mapping (around line 443):

```typescript
const questionResults: ValidatedQuestionResult[] = validatedResults.map(
  (result) => {
    const question = questions[result.questionIndex];
    return {
      questionIndex: result.questionIndex,
      correct: result.correct,
      correctAnswer: question?.correctAnswer ?? '',
      answerGiven: result.answerGiven,
    };
  }
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest --testPathPattern quiz.test.ts --no-coverage -t "scores the round"`

Expected: PASS

- [ ] **Step 6: Typecheck both packages**

Run: `pnpm exec nx run api:typecheck && cd packages/schemas && pnpm exec tsc --noEmit`

Expected: No errors. The `ValidatedQuestionResult` type is used in `complete-round.ts` and `results.tsx` — both must compile.

- [ ] **Step 7: Commit**

```
fix(schemas): add answerGiven to ValidatedQuestionResult [F-040]
```

---

### Task 2: F-032 — Complete the GET /quiz/rounds/:id response for completed rounds

The route handler at `quiz.ts:283-301` already returns `correctAnswer`, `score`, `results`, `xpEarned`, `completedAt`, and `status` for completed rounds. Still missing: `acceptedAliases` on each question and `celebrationTier`.

**Files:**
- Modify: `apps/api/src/routes/quiz.ts:283-301`
- Modify: `apps/api/src/routes/quiz.test.ts` (add completed-round tests)

- [ ] **Step 1: Write the failing tests**

Add a `COMPLETED_ROUND` fixture and new tests in `apps/api/src/routes/quiz.test.ts`. Place this fixture below the existing `ACTIVE_ROUND`:

```typescript
const COMPLETED_ROUND = {
  id: 'round-completed',
  profileId: 'test-profile-id',
  activityType: 'capitals',
  theme: 'Central European Capitals',
  questions: [
    {
      type: 'capitals',
      country: 'Austria',
      correctAnswer: 'Vienna',
      acceptedAliases: ['Vienna', 'Wien'],
      distractors: ['Salzburg', 'Graz', 'Innsbruck'],
      funFact: 'Vienna is famous for its coffee houses.',
      isLibraryItem: false,
    },
    {
      type: 'capitals',
      country: 'Germany',
      correctAnswer: 'Berlin',
      acceptedAliases: ['Berlin'],
      distractors: ['Munich', 'Hamburg', 'Frankfurt'],
      funFact: 'Berlin has more bridges than Venice.',
      isLibraryItem: false,
    },
  ],
  total: 2,
  status: 'completed' as const,
  score: 1,
  xpEarned: 15,
  completedAt: new Date('2026-04-18T10:00:00Z'),
  results: [
    { questionIndex: 0, correct: true, answerGiven: 'Vienna', timeMs: 3000 },
    { questionIndex: 1, correct: false, answerGiven: 'Munich', timeMs: 5000 },
  ],
};
```

Add these tests inside the existing `describe('GET /v1/quiz/rounds/:id')` block, after the existing tests:

```typescript
it('returns results + correctAnswer + acceptedAliases for completed round', async () => {
  (mockDb as any).query.quizRounds.findFirst = jest
    .fn()
    .mockResolvedValue(COMPLETED_ROUND);

  const res = await app.request(
    '/v1/quiz/rounds/round-completed',
    { headers: AUTH_HEADERS },
    TEST_ENV
  );

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe('completed');
  expect(body.score).toBe(1);
  expect(body.xpEarned).toBe(15);
  expect(body.celebrationTier).toBe('nice');
  expect(body.completedAt).toBeDefined();
  expect(body.results).toHaveLength(2);
  // Completed rounds MUST expose correctAnswer + acceptedAliases
  expect(body.questions[0].correctAnswer).toBe('Vienna');
  expect(body.questions[0].acceptedAliases).toEqual(['Vienna', 'Wien']);
  expect(body.questions[1].correctAnswer).toBe('Berlin');
  // Completed rounds must NOT expose distractors (no reason to)
  expect(body.questions[0].distractors).toBeUndefined();
});

it('does NOT expose correctAnswer or acceptedAliases for in-progress round (security)', async () => {
  (mockDb as any).query.quizRounds.findFirst = jest
    .fn()
    .mockResolvedValue(ACTIVE_ROUND);

  const res = await app.request(
    '/v1/quiz/rounds/round-1',
    { headers: AUTH_HEADERS },
    TEST_ENV
  );

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBeUndefined(); // active rounds don't include status
  for (const q of body.questions) {
    expect(q.correctAnswer).toBeUndefined();
    expect(q.acceptedAliases).toBeUndefined();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest --testPathPattern quiz.test.ts --no-coverage -t "GET /v1/quiz/rounds/:id"`

Expected: FAIL — `acceptedAliases` and `celebrationTier` not in response

- [ ] **Step 3: Update the route handler**

In `apps/api/src/routes/quiz.ts`, add the import for `getCelebrationTier`:

```typescript
import {
  checkQuizAnswer,
  completeQuizRound,
  getVocabularyRoundContext,
  getGuessWhoRoundContext,
  computeRoundStats,
  generateQuizRound,
  getRecentAnswers,
  getRecentCompletedByActivity,
  getRoundByIdOrThrow,
  listRecentCompletedRounds,
  markMissedItemsSurfaced,
  getDueMasteryItems,
  shouldApplyDifficultyBump,
  getCelebrationTier,
} from '../services/quiz';
```

Then update the completed branch in the `.get('/quiz/rounds/:id')` handler (replace lines 283-301):

```typescript
if (round.status === 'completed') {
  return c.json(
    {
      id: round.id,
      activityType: round.activityType,
      theme: round.theme,
      status: round.status,
      score: round.score,
      total: round.total,
      xpEarned: round.xpEarned,
      celebrationTier: getCelebrationTier(round.score ?? 0, round.total),
      completedAt: round.completedAt?.toISOString(),
      questions: questions.map((q) => {
        const base = toClientSafeQuestions([q])[0]!;
        return {
          ...base,
          correctAnswer: q.correctAnswer,
          acceptedAliases:
            q.type === 'vocabulary'
              ? q.acceptedAnswers
              : 'acceptedAliases' in q
              ? q.acceptedAliases
              : undefined,
        };
      }),
      results: round.results,
    },
    200
  );
}
```

Note: `getCelebrationTier` is currently defined in `complete-round.ts` but not exported from the `services/quiz/index.ts` barrel. You may need to add the export.

- [ ] **Step 4: Export `getCelebrationTier` from the quiz service barrel**

Check `apps/api/src/services/quiz/index.ts` — if `getCelebrationTier` is not already exported, add it:

```typescript
export { getCelebrationTier } from './complete-round';
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && pnpm exec jest --testPathPattern quiz.test.ts --no-coverage -t "GET /v1/quiz/rounds/:id"`

Expected: All tests PASS

- [ ] **Step 6: Run full API typecheck + lint**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:lint`

Expected: No errors

- [ ] **Step 7: Commit**

```
fix(api): GET /quiz/rounds/:id returns acceptedAliases + celebrationTier for completed rounds [F-032]
```

---

### Task 3: F-040 — Enhance results screen missed-question cards

The missed-question section already exists (`results.tsx:164-184`) but only shows `correctAnswer`. This task adds: user's wrong answer, muted red/green colors, fun fact caption, and accessibility labels. The `answerGiven` field is now available from Task 1.

**Files:**
- Modify: `apps/mobile/src/app/(app)/quiz/results.tsx:164-184`
- Create: `apps/mobile/src/app/(app)/quiz/results.test.tsx`

- [ ] **Step 1: Write the test file**

Create `apps/mobile/src/app/(app)/quiz/results.test.tsx`:

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react-native';

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock theme
jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#00bcd4',
    warning: '#ff9800',
    textPrimary: '#ffffff',
    textSecondary: '#aaaaaa',
    background: '#121212',
  }),
}));

// Mock navigation
jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: jest.fn(),
}));

// Mock BrandCelebration
jest.mock('../../../components/common/BrandCelebration', () => ({
  BrandCelebration: () => null,
}));

// Mock use-quiz hook
jest.mock('../../../hooks/use-quiz', () => ({
  useFetchRound: () => ({ data: null, isLoading: false }),
}));

// Controllable quiz flow state
const mockQuizFlow = {
  activityType: 'capitals' as const,
  completionResult: null as any,
  prefetchedRoundId: null,
  round: null as any,
  setCompletionResult: jest.fn(),
  setPrefetchedRoundId: jest.fn(),
  setRound: jest.fn(),
  clear: jest.fn(),
  subjectId: null,
  languageName: null,
  setActivityType: jest.fn(),
  setSubjectId: jest.fn(),
  setLanguageName: jest.fn(),
};

jest.mock('./_layout', () => ({
  useQuizFlow: () => mockQuizFlow,
}));

import QuizResultsScreen from './results';

describe('QuizResultsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuizFlow.round = {
      id: 'r-1',
      activityType: 'capitals',
      theme: 'European Capitals',
      total: 4,
      questions: [
        { type: 'capitals', country: 'Austria', options: ['Vienna', 'Graz'], funFact: 'Vienna has coffee houses.', isLibraryItem: false },
        { type: 'capitals', country: 'Germany', options: ['Berlin', 'Munich'], funFact: 'Berlin has bridges.', isLibraryItem: false },
        { type: 'capitals', country: 'France', options: ['Paris', 'Lyon'], funFact: 'Paris has the Eiffel Tower.', isLibraryItem: false },
        { type: 'capitals', country: 'Spain', options: ['Madrid', 'Barcelona'], funFact: 'Madrid is in the center.', isLibraryItem: false },
      ],
    };
  });

  it('renders missed-questions section when at least one wrong', () => {
    mockQuizFlow.completionResult = {
      score: 2,
      total: 4,
      xpEarned: 20,
      celebrationTier: 'nice' as const,
      droppedResults: 0,
      questionResults: [
        { questionIndex: 0, correct: true, correctAnswer: 'Vienna', answerGiven: 'Vienna' },
        { questionIndex: 1, correct: false, correctAnswer: 'Berlin', answerGiven: 'Munich' },
        { questionIndex: 2, correct: true, correctAnswer: 'Paris', answerGiven: 'Paris' },
        { questionIndex: 3, correct: false, correctAnswer: 'Madrid', answerGiven: 'Barcelona' },
      ],
    };

    render(<QuizResultsScreen />);

    expect(screen.getByTestId('quiz-results-missed-section')).toBeTruthy();
    expect(screen.getByText('What you missed')).toBeTruthy();
    // Shows the user's wrong answers
    expect(screen.getByText('You said: Munich')).toBeTruthy();
    expect(screen.getByText('You said: Barcelona')).toBeTruthy();
    // Shows correct answers
    expect(screen.getByText('Berlin')).toBeTruthy();
    expect(screen.getByText('Madrid')).toBeTruthy();
    // Shows fun facts for missed questions
    expect(screen.getByText('Berlin has bridges.')).toBeTruthy();
    expect(screen.getByText('Madrid is in the center.')).toBeTruthy();
    // Does NOT show fun facts for correct questions
    expect(screen.queryByText('Vienna has coffee houses.')).toBeNull();
  });

  it('skips missed-questions section on perfect round', () => {
    mockQuizFlow.completionResult = {
      score: 4,
      total: 4,
      xpEarned: 50,
      celebrationTier: 'perfect' as const,
      droppedResults: 0,
      questionResults: [
        { questionIndex: 0, correct: true, correctAnswer: 'Vienna', answerGiven: 'Vienna' },
        { questionIndex: 1, correct: true, correctAnswer: 'Berlin', answerGiven: 'Berlin' },
        { questionIndex: 2, correct: true, correctAnswer: 'Paris', answerGiven: 'Paris' },
        { questionIndex: 3, correct: true, correctAnswer: 'Madrid', answerGiven: 'Madrid' },
      ],
    };

    render(<QuizResultsScreen />);

    expect(screen.queryByTestId('quiz-results-missed-section')).toBeNull();
    expect(screen.queryByText('What you missed')).toBeNull();
  });

  it('handles missing correctAnswer gracefully without crashing', () => {
    mockQuizFlow.completionResult = {
      score: 1,
      total: 2,
      xpEarned: 10,
      celebrationTier: 'nice' as const,
      droppedResults: 0,
      questionResults: [
        { questionIndex: 0, correct: true, correctAnswer: 'Vienna', answerGiven: 'Vienna' },
        { questionIndex: 1, correct: false, correctAnswer: '', answerGiven: 'Munich' },
      ],
    };

    // Should not throw
    expect(() => render(<QuizResultsScreen />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `cd apps/mobile && pnpm exec jest --testPathPattern "quiz/results.test" --no-coverage`

Expected: FAIL — "You said: Munich" text not found (current UI doesn't render `answerGiven`)

- [ ] **Step 3: Update the missed-question card rendering**

In `apps/mobile/src/app/(app)/quiz/results.tsx`, replace the missed section (lines 164-184) with:

```tsx
{/* [F-040] Show missed questions with correct answers */}
{missed.length > 0 && (
  <View className="mt-8 w-full" testID="quiz-results-missed-section">
    <Text className="mb-3 text-body-sm font-semibold uppercase tracking-wide text-text-secondary">
      What you missed
    </Text>
    {missed.map((qr) => {
      // Defensive: skip cards with empty correctAnswer (server partial-data)
      if (!qr.correctAnswer) return null;
      const prompt = questionPrompt(qr.questionIndex);
      const question = round?.questions[qr.questionIndex];
      return (
        <View
          key={qr.questionIndex}
          className="mb-2 rounded-card bg-surface p-3"
          testID={`quiz-results-missed-item-${qr.questionIndex}`}
          accessibilityRole="text"
          accessibilityLabel={`${prompt}. You said ${qr.answerGiven}. Correct answer ${qr.correctAnswer}.`}
        >
          <Text className="text-body-sm text-text-secondary">
            {prompt}
          </Text>
          <Text className="mt-1 text-body text-danger opacity-70">
            You said: {qr.answerGiven}
          </Text>
          <Text className="mt-0.5 text-body font-semibold text-success">
            {qr.correctAnswer}
          </Text>
          {question?.funFact ? (
            <Text className="mt-1 text-caption text-text-secondary opacity-70">
              {question.funFact}
            </Text>
          ) : null}
        </View>
      );
    })}
  </View>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --testPathPattern "quiz/results.test" --no-coverage`

Expected: All 3 tests PASS

- [ ] **Step 5: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: No errors

- [ ] **Step 6: Commit**

```
feat(mobile): surface answerGiven + funFact + accessibility on quiz results [F-040]
```

---

### Task 4: Group 3a — Mobile polish (back button icons)

Two remaining plain-text back buttons need Ionicon treatment: the history screen back button (`history.tsx:79-84`) and the round detail error-state back button (`[roundId].tsx:37-43`).

**Files:**
- Modify: `apps/mobile/src/app/(app)/quiz/history.tsx:78-84`
- Modify: `apps/mobile/src/app/(app)/quiz/[roundId].tsx:37-43`

- [ ] **Step 1: Update history back button**

In `apps/mobile/src/app/(app)/quiz/history.tsx`, the back button currently reads:

```tsx
<Pressable
  testID="quiz-history-back"
  onPress={() => goBackOrReplace(router, '/(app)/practice')}
>
  <Text className="text-primary">Back</Text>
</Pressable>
```

Add the `useThemeColors` import and Ionicons import at the top of the file (Ionicons is already available via `@expo/vector-icons`):

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../../lib/theme';
```

Add `const colors = useThemeColors();` inside `QuizHistoryScreen`, after `const { data: rounds, isLoading } = useRecentRounds();`.

Replace the back button:

```tsx
<Pressable
  testID="quiz-history-back"
  onPress={() => goBackOrReplace(router, '/(app)/practice')}
  className="min-h-[32px] min-w-[32px] items-center justify-center self-start"
  accessibilityRole="button"
  accessibilityLabel="Go back"
>
  <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
</Pressable>
```

- [ ] **Step 2: Update round detail error-state back button**

In `apps/mobile/src/app/(app)/quiz/[roundId].tsx`, the error state back button (lines 37-43) currently reads:

```tsx
<Pressable
  testID="round-detail-back"
  className="mt-4"
  onPress={() => goBackOrReplace(router, '/(app)/quiz/history')}
>
  <Text className="text-primary">Go Back</Text>
</Pressable>
```

Replace with:

```tsx
<Pressable
  testID="round-detail-back"
  className="mt-4 min-h-[32px] min-w-[32px] items-center justify-center"
  onPress={() => goBackOrReplace(router, '/(app)/quiz/history')}
  accessibilityRole="button"
  accessibilityLabel="Go back"
>
  <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
</Pressable>
```

Note: `colors` is already available from `const colors = useThemeColors();` at line 16 and `Ionicons` is already imported at line 3. No new imports needed for this file.

- [ ] **Step 3: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Manual verification**

Navigate to quiz history screen — confirm Ionicon back arrow, not plain text.
Navigate to round detail error state — confirm Ionicon back arrow, not plain text.

- [ ] **Step 5: Commit**

```
style(mobile): replace plain-text back buttons with Ionicon arrows [F-036a, F-037-adj]
```

---

### Task 5: F-036b — Add `activityLabel` to round response

Cross-package change: add a human-readable `activityLabel` to the `GET /quiz/rounds/:id` response and the recent rounds list, so the client doesn't need to title-case raw enum values.

**Files:**
- Modify: `packages/schemas/src/quiz.ts` (add `activityLabel` to `recentRoundSchema`)
- Modify: `apps/api/src/routes/quiz.ts` (add `activityLabel` to both completed and active round responses + recent rounds)
- Modify: `apps/mobile/src/app/(app)/quiz/[roundId].tsx` (use `activityLabel` instead of `formatActivityType`)
- Modify: `apps/mobile/src/app/(app)/quiz/history.tsx` (use `activityLabel` instead of inline `.replace('_', ' ')`)

- [ ] **Step 1: Add the formatter utility to the API route file**

In `apps/api/src/routes/quiz.ts`, add a pure function near the top (below the `shuffle` function):

```typescript
/** Format an activity type enum for display: "capitals" → "Capitals", "guess_who" → "Guess Who" */
function formatActivityLabel(activityType: string): string {
  return activityType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [ ] **Step 2: Add `activityLabel` to all round responses**

In the completed branch of `GET /quiz/rounds/:id`, add after the `activityType` line:

```typescript
activityLabel: formatActivityLabel(round.activityType),
```

In the active (in-progress) branch of `GET /quiz/rounds/:id`, add after the `activityType` line:

```typescript
activityLabel: formatActivityLabel(round.activityType),
```

In the `GET /quiz/rounds/recent` handler, add to each mapped round after `activityType`:

```typescript
activityLabel: formatActivityLabel(round.activityType),
```

- [ ] **Step 3: Write a test**

Add to `apps/api/src/routes/quiz.test.ts` inside the `GET /v1/quiz/rounds/:id` describe:

```typescript
it('includes activityLabel for all round statuses', async () => {
  (mockDb as any).query.quizRounds.findFirst = jest
    .fn()
    .mockResolvedValue(COMPLETED_ROUND);

  const res = await app.request(
    '/v1/quiz/rounds/round-completed',
    { headers: AUTH_HEADERS },
    TEST_ENV
  );

  const body = await res.json();
  expect(body.activityLabel).toBe('Capitals');
});
```

- [ ] **Step 4: Run the test**

Run: `cd apps/api && pnpm exec jest --testPathPattern quiz.test.ts --no-coverage -t "activityLabel"`

Expected: PASS

- [ ] **Step 5: Update round detail client**

In `apps/mobile/src/app/(app)/quiz/[roundId].tsx`:

Remove the `formatActivityType` function (lines 9-11) and replace the usage at line 71:

```tsx
{(round as any).activityLabel ?? formatActivityType((round as any).activityType ?? '')} ·{' '}
```

Actually, keep `formatActivityType` as a fallback for older cached data:

```tsx
{(round as any).activityLabel ??
  formatActivityType((round as any).activityType ?? '')} ·{' '}
```

- [ ] **Step 6: Update history client**

In `apps/mobile/src/app/(app)/quiz/history.tsx`, replace the activity type display at line 104-105:

```tsx
<Text className="text-on-surface font-semibold">
  {(round as any).activityLabel ?? round.activityType.replace('_', ' ')}
</Text>
```

Remove the `capitalize` class since the server now provides proper casing.

- [ ] **Step 7: Run typecheck + lint**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:lint && cd apps/mobile && pnpm exec tsc --noEmit`

Expected: No errors

- [ ] **Step 8: Commit**

```
feat(api,mobile): add formatted activityLabel to round responses [F-036b]
```

---

### Task 6: F-033 — Deploy verification (manual step)

This is a deploy action, not a code change. The route `POST /quiz/missed-items/mark-surfaced` exists in source (quiz.ts:352) but staging hasn't been redeployed to pick it up.

- [ ] **Step 1: Verify route works locally**

Run: `cd apps/api && pnpm exec jest --testPathPattern quiz.test.ts --no-coverage -t "mark-surfaced"`

If no test exists yet, add one:

```typescript
describe('POST /v1/quiz/missed-items/mark-surfaced', () => {
  it('marks items for activityType', async () => {
    const res = await app.request(
      '/v1/quiz/missed-items/mark-surfaced',
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ activityType: 'capitals' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('markedCount');
    expect(typeof body.markedCount).toBe('number');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/api && pnpm exec jest --testPathPattern quiz.test.ts --no-coverage -t "mark-surfaced"`

Expected: PASS

- [ ] **Step 3: Commit the test**

```
test(api): add mark-surfaced route test [F-033]
```

- [ ] **Step 4: Manual — trigger staging deploy**

This is a manual ops action. After deploy, verify:

```bash
curl -XPOST https://api-stg.mentomate.com/v1/quiz/missed-items/mark-surfaced \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"activityType":"capitals"}'
```

Expected: `200 { "markedCount": <number> }`

---

## Task Ordering and Dependencies

```
Task 1 (schema)
  └─→ Task 2 (F-032 API) ──→ Task 5 (F-036b, same endpoint)
  └─→ Task 3 (F-040 results screen)
Task 4 (polish) — independent, can run in parallel with Tasks 1-3
Task 6 (deploy) — independent, can run anytime
```

## Items NOT in This Plan

| Item | Reason |
|------|--------|
| F-041 (alias hints) | Deferred per adversarial review — revisit after F-040 usage validates the need |
| F-034 (practice subtitle) | Already implemented |
| F-037 (date headers) | Already implemented |
| F-038 (GuessWho label) | Already fixed — no redundant label exists |
| Group 4 (usability gaps) | Product discussion, not engineering work |
| Deploy smoke-test | Recommended in spec but separate infrastructure work |
