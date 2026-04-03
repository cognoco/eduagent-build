# Epic 1 + Epic 2 Gap Analysis Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 5 negative findings from the Epic 1 + Epic 2 section of `docs/analysis/epics-vs-code-gap-analysis.md`.

**Architecture:** Five independent fixes across API services, route handlers, mobile hooks, and UI screens. Each task produces a self-contained commit. No schema migrations required — all changes use existing tables/columns.

**Tech Stack:** Hono (API routes, `streamSSE`), Zod 4 schemas, TanStack Query (mobile hooks), React Native (mobile UI), Jest 30 (co-located tests).

---

## File Map

| Finding | Files to modify | Files to create |
|---------|----------------|-----------------|
| 3: OCR fail-closed | `apps/api/src/services/ocr.ts`, `apps/api/src/routes/homework.ts`, `apps/api/src/services/ocr.test.ts` | — |
| 5: 5-skip warning | `apps/api/src/services/settings.ts`, `apps/api/src/services/settings.test.ts`, `apps/api/src/routes/sessions.ts`, `apps/mobile/src/app/session-summary/[sessionId].tsx` | — |
| 4: Recall bridge mobile | `apps/mobile/src/hooks/use-sessions.ts`, `apps/mobile/src/app/session-summary/[sessionId].tsx` | — |
| 2: Curriculum adaptation | `packages/schemas/src/subjects.ts`, `apps/api/src/services/curriculum.ts`, `apps/api/src/services/curriculum.test.ts`, `apps/api/src/routes/curriculum.ts`, `apps/mobile/src/hooks/use-curriculum.ts` | — |
| 1: Interview SSE | `apps/api/src/services/interview.ts`, `apps/api/src/routes/interview.ts`, `apps/mobile/src/hooks/use-interview.ts`, `apps/mobile/src/app/(learner)/onboarding/interview.tsx` | — |

---

## Task 1: OCR fallback fails closed when no provider is configured

**Finding 3 (High):** `getOcrProvider()` returns `StubOcrProvider` in production when `GEMINI_API_KEY` is missing, silently returning fake OCR text with 0.95 confidence.

**Files:**
- Modify: `apps/api/src/services/ocr.ts:138-150` (factory function)
- Modify: `apps/api/src/routes/homework.ts:77-80` (error handling)
- Modify: `apps/api/src/services/ocr.test.ts` (if it exists; otherwise the existing test coverage for ocr.ts)

### Steps

- [ ] **Step 1: Write failing test — `getOcrProvider` throws when no key and not in test mode**

In `apps/api/src/services/ocr.test.ts` (or create if missing), add:

```typescript
import { getOcrProvider, resetOcrProvider, StubOcrProvider, GeminiOcrProvider } from './ocr';

describe('getOcrProvider', () => {
  afterEach(() => {
    resetOcrProvider();
  });

  it('returns GeminiOcrProvider when useRouter is truthy', () => {
    const provider = getOcrProvider('some-key');
    expect(provider).toBeInstanceOf(GeminiOcrProvider);
  });

  it('returns StubOcrProvider when useRouter is falsy and allowStub is true', () => {
    const provider = getOcrProvider(undefined, true);
    expect(provider).toBeInstanceOf(StubOcrProvider);
  });

  it('throws when useRouter is falsy and allowStub is false', () => {
    expect(() => getOcrProvider(undefined, false)).toThrow(
      'OCR provider not configured'
    );
  });

  it('throws when useRouter is falsy and allowStub is not passed', () => {
    expect(() => getOcrProvider()).toThrow('OCR provider not configured');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --testPathPattern="ocr.test" --no-coverage
```

Expected: FAIL — current `getOcrProvider()` returns `StubOcrProvider` instead of throwing.

- [ ] **Step 3: Update `getOcrProvider` to fail closed by default**

In `apps/api/src/services/ocr.ts`, change the `getOcrProvider` function:

```typescript
/**
 * Returns the current OCR provider.
 *
 * When `useRouter` is truthy the Gemini provider is returned — it routes
 * through routeAndCall() so the API key comes from the registered LLM
 * provider, not from a parameter here.
 *
 * When `useRouter` is falsy:
 * - If `allowStub` is true, returns StubOcrProvider (for tests only).
 * - Otherwise throws — production must not silently return fake OCR text.
 */
export function getOcrProvider(
  useRouter?: boolean | string,
  allowStub?: boolean
): OcrProvider {
  if (_provider) {
    return _provider;
  }

  if (useRouter) {
    _provider = new GeminiOcrProvider();
    return _provider;
  }

  if (allowStub) {
    _provider = new StubOcrProvider();
    return _provider;
  }

  throw new Error(
    'OCR provider not configured: set GEMINI_API_KEY or use allowStub for testing'
  );
}
```

- [ ] **Step 4: Update the homework route to return a proper 503 when OCR is not configured**

In `apps/api/src/routes/homework.ts`, wrap the provider call:

```typescript
    let provider;
    try {
      provider = getOcrProvider(c.env.GEMINI_API_KEY);
    } catch {
      return apiError(
        c,
        503,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'OCR service is not configured. Please contact support.'
      );
    }
    const result = await provider.extractText(imageBuffer, file.type);
    return c.json(result);
```

Note: Check if `ERROR_CODES.SERVICE_UNAVAILABLE` exists; if not, use `ERROR_CODES.INTERNAL_ERROR` instead.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --testPathPattern="ocr.test" --no-coverage
```

Expected: PASS

- [ ] **Step 6: Run related tests to verify no regressions**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/ocr.ts src/routes/homework.ts --no-coverage
```

Expected: PASS (any test calling `getOcrProvider()` without args needs `allowStub: true` if it was relying on the stub)

- [ ] **Step 7: Type check**

```bash
cd apps/api && pnpm exec tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/ocr.ts apps/api/src/routes/homework.ts apps/api/src/services/ocr.test.ts
git commit -m "fix(api): OCR fallback fails closed when GEMINI_API_KEY missing

getOcrProvider() now throws instead of returning StubOcrProvider in
production. The homework /v1/ocr route catches this and returns 503.
Tests pass allowStub=true explicitly.

Closes Epic 2 finding 3 (FR32 / ARCH-14)."
```

---

## Task 2: Add 5-skip warning threshold for summary skips

**Finding 5 (Medium):** FR37 requires two thresholds — warning at 5 consecutive skips, then Casual Explorer prompt at 10. Only the 10-skip threshold exists.

**Files:**
- Modify: `apps/api/src/services/settings.ts:267-339`
- Modify: `apps/api/src/services/settings.test.ts`
- Modify: `apps/api/src/routes/sessions.ts:312-342`
- Modify: `apps/mobile/src/app/session-summary/[sessionId].tsx:165-236`

### Steps

- [ ] **Step 1: Write failing test — `shouldWarnSummarySkip` returns true at 5 skips**

In `apps/api/src/services/settings.test.ts`, add a new describe block (find the existing `shouldPromptCasualSwitch` tests and add near them):

```typescript
describe('shouldWarnSummarySkip', () => {
  it('returns false when no row exists (defaults: serious, 0 skips)', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    expect(await shouldWarnSummarySkip(db as unknown as Database, profileId)).toBe(false);
  });

  it('returns false when mode is casual', async () => {
    const db = createMockDb({
      findFirstResult: { mode: 'casual', consecutiveSummarySkips: 7 },
    });
    expect(await shouldWarnSummarySkip(db as unknown as Database, profileId)).toBe(false);
  });

  it('returns false when serious mode but skips < 5', async () => {
    const db = createMockDb({
      findFirstResult: { mode: 'serious', consecutiveSummarySkips: 4 },
    });
    expect(await shouldWarnSummarySkip(db as unknown as Database, profileId)).toBe(false);
  });

  it('returns true when serious mode and skips >= 5 but < 10', async () => {
    const db = createMockDb({
      findFirstResult: { mode: 'serious', consecutiveSummarySkips: 5 },
    });
    expect(await shouldWarnSummarySkip(db as unknown as Database, profileId)).toBe(true);
  });

  it('returns false when skips >= 10 (casual switch takes over)', async () => {
    const db = createMockDb({
      findFirstResult: { mode: 'serious', consecutiveSummarySkips: 10 },
    });
    expect(await shouldWarnSummarySkip(db as unknown as Database, profileId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --testPathPattern="settings.test" --no-coverage
```

Expected: FAIL — `shouldWarnSummarySkip` does not exist.

- [ ] **Step 3: Implement `shouldWarnSummarySkip` in settings service**

In `apps/api/src/services/settings.ts`, add after `CASUAL_SWITCH_PROMPT_THRESHOLD`:

```typescript
/** Threshold for showing a warning before the full casual-switch prompt */
export const SKIP_WARNING_THRESHOLD = 5;

/**
 * Returns true when the learner has skipped >= 5 but < 10 consecutive summaries
 * AND is in 'serious' mode. Used for an early warning before the casual-switch prompt.
 */
export async function shouldWarnSummarySkip(
  db: Database,
  profileId: string
): Promise<boolean> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  const mode = row?.mode ?? 'serious';
  const skips = row?.consecutiveSummarySkips ?? 0;

  return (
    mode === 'serious' &&
    skips >= SKIP_WARNING_THRESHOLD &&
    skips < CASUAL_SWITCH_PROMPT_THRESHOLD
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --testPathPattern="settings.test" --no-coverage
```

Expected: PASS

- [ ] **Step 5: Wire the warning flag into the skip-summary route response**

In `apps/api/src/routes/sessions.ts`, find the `.post('/sessions/:sessionId/summary/skip', ...)` handler. Import `shouldWarnSummarySkip` alongside `shouldPromptCasualSwitch`. Update the response:

```typescript
    const promptCasualSwitch = await shouldPromptCasualSwitch(db, profileId);
    const warnSummarySkip = promptCasualSwitch
      ? false
      : await shouldWarnSummarySkip(db, profileId);
    return c.json({
      ...result,
      shouldPromptCasualSwitch: promptCasualSwitch,
      shouldWarnSummarySkip: warnSummarySkip,
    });
```

Note: When `shouldPromptCasualSwitch` is true, we skip the warning check entirely — the 10-skip prompt supersedes the 5-skip warning.

- [ ] **Step 6: Show warning alert in the mobile summary screen**

In `apps/mobile/src/app/session-summary/[sessionId].tsx`, find the `handleContinue` function where it checks `skipResult?.shouldPromptCasualSwitch`. Add a warning branch before it:

```typescript
      // 5-skip warning (FR37) — early nudge before the 10-skip casual-switch prompt
      if (
        skipResult?.shouldWarnSummarySkip &&
        !skipResult?.shouldPromptCasualSwitch
      ) {
        Alert.alert(
          'Summaries help you learn',
          'Writing a quick summary after each session strengthens your memory. Try it next time!',
          [
            {
              text: 'Got it',
              onPress: () => {
                void (async () => {
                  await maybePromptForRecall();
                  router.replace('/(learner)/home');
                })();
              },
            },
          ]
        );
        return;
      }

      if (skipResult?.shouldPromptCasualSwitch) {
        // ... existing 10-skip casual-switch logic unchanged ...
```

- [ ] **Step 7: Run related tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/settings.ts src/routes/sessions.ts --no-coverage
```

Expected: PASS

- [ ] **Step 8: Type check both projects**

```bash
cd apps/api && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/settings.ts apps/api/src/services/settings.test.ts apps/api/src/routes/sessions.ts apps/mobile/src/app/session-summary/\[sessionId\].tsx
git commit -m "feat: add 5-skip summary warning threshold (FR37)

shouldWarnSummarySkip() fires at 5-9 consecutive skips in serious mode.
The skip-summary route returns shouldWarnSummarySkip alongside the
existing shouldPromptCasualSwitch. Mobile shows a gentle reminder alert.

Closes Epic 2 finding 5 (FR37)."
```

---

## Task 3: Wire recall bridge into the mobile session-summary flow

**Finding 4 (High):** The `POST /v1/sessions/:sessionId/recall-bridge` route and `generateRecallBridge` service exist, but the mobile app never calls them after homework sessions.

**Files:**
- Modify: `apps/mobile/src/hooks/use-sessions.ts` (add `useRecallBridge` hook)
- Modify: `apps/mobile/src/app/session-summary/[sessionId].tsx` (call hook, render questions)

### Steps

- [ ] **Step 1: Add `useRecallBridge` mutation hook**

In `apps/mobile/src/hooks/use-sessions.ts`, add a new hook (at the end of the file, before any default export or after the last named export):

```typescript
interface RecallBridgeResult {
  questions: string[];
  topicId: string;
  topicTitle: string;
}

export function useRecallBridge(
  sessionId: string
): UseMutationResult<RecallBridgeResult, Error, void> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<RecallBridgeResult> => {
      const res = await client.sessions[':sessionId']['recall-bridge'].$post({
        param: { sessionId },
      });
      await assertOk(res);
      return (await res.json()) as unknown as RecallBridgeResult;
    },
  });
}
```

- [ ] **Step 2: Add `sessionType` to the session-summary route params**

In `apps/mobile/src/app/session-summary/[sessionId].tsx`, add `sessionType` to the `useLocalSearchParams` generic:

```typescript
  const {
    sessionId,
    subjectName,
    exchangeCount,
    escalationRung,
    subjectId,
    topicId,
    wallClockSeconds,
    milestones,
    fastCelebrations,
    sessionType: sessionTypeParam,
  } = useLocalSearchParams<{
    sessionId: string;
    subjectName?: string;
    exchangeCount?: string;
    escalationRung?: string;
    subjectId?: string;
    topicId?: string;
    wallClockSeconds?: string;
    milestones?: string;
    fastCelebrations?: string;
    sessionType?: string;
  }>();
```

- [ ] **Step 3: Add recall bridge state and hook to the summary screen**

Near the existing hook declarations in the summary screen component, add:

```typescript
  import { useRecallBridge } from '../../hooks/use-sessions';

  // ... inside the component, after existing hook calls:
  const recallBridge = useRecallBridge(sessionId ?? '');
  const [recallQuestions, setRecallQuestions] = useState<string[] | null>(null);

  const isHomeworkSession =
    sessionTypeParam === 'homework' ||
    transcript.data?.session.sessionType === 'homework';
```

- [ ] **Step 4: Pass `sessionType` from the session screen to the summary screen**

In `apps/mobile/src/app/(learner)/session/index.tsx`, find the `router.replace` call to `/session-summary/` (around line 1031-1042) and add `sessionType` to the params:

```typescript
              params: {
                subjectName: effectiveSubjectName ?? '',
                exchangeCount: String(exchangeCount),
                escalationRung: String(escalationRung),
                subjectId: effectiveSubjectId ?? '',
                topicId: topicId ?? '',
                wallClockSeconds: String(result.wallClockSeconds),
                milestones: serializeMilestones(milestonesReached),
                fastCelebrations: serializeCelebrations(fastCelebrations),
                sessionType: sessionType ?? '',
              },
```

Note: `sessionType` should already be available in the session screen's state. Check whether it's destructured from the session start result or from route params.

- [ ] **Step 5: Fetch recall bridge questions after summary submit/skip for homework sessions**

Update the `handleContinue` function. After the existing skip/casual-switch handling and before `router.replace('/(learner)/home')`, add recall bridge fetching. Also update the submitted-continue path. The cleanest approach: update `maybePromptForRecall` or add the recall bridge call alongside it.

In the `handleContinue` function, replace the final navigation block (after the casual-switch handling) with:

```typescript
    // Fetch recall bridge for homework sessions (Story 2.7)
    if (isHomeworkSession && !recallQuestions) {
      try {
        const result = await recallBridge.mutateAsync();
        if (result.questions.length > 0) {
          setRecallQuestions(result.questions);
          return; // Stay on screen to show recall questions
        }
      } catch {
        // Best effort — navigate home if recall bridge fails
      }
    }

    await maybePromptForRecall();
    router.replace('/(learner)/home');
```

- [ ] **Step 6: Render recall bridge questions UI**

In the summary screen's JSX, add a recall bridge section that shows when `recallQuestions` is set. Place it after the summary form and before the navigation buttons:

```tsx
        {recallQuestions && (
          <View className="bg-surface rounded-2xl p-5 mb-4">
            <Text className="text-text-primary text-lg font-semibold mb-2">
              Quick recall check
            </Text>
            <Text className="text-text-secondary text-sm mb-4">
              Nice work on that homework! Can you answer these about the method you used?
            </Text>
            {recallQuestions.map((question, index) => (
              <View key={index} className="mb-3">
                <Text className="text-text-primary text-body">
                  {index + 1}. {question}
                </Text>
              </View>
            ))}
            <Pressable
              className="bg-primary rounded-xl py-3 items-center mt-2"
              onPress={() => {
                void (async () => {
                  await maybePromptForRecall();
                  router.replace('/(learner)/home');
                })();
              }}
            >
              <Text className="text-white text-body font-semibold">
                Done — head home
              </Text>
            </Pressable>
          </View>
        )}
```

Note: This is a display-only recall bridge — the student reads the questions to self-test. The spec says "1-2 question recall warmup" positioned as celebration, not a graded quiz.

- [ ] **Step 7: Run related tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/routes/sessions.ts src/services/recall-bridge.ts --no-coverage
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-sessions.ts src/app/session-summary/\[sessionId\].tsx --no-coverage
```

Expected: PASS

- [ ] **Step 8: Type check both projects**

```bash
cd apps/api && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/hooks/use-sessions.ts apps/mobile/src/app/session-summary/\[sessionId\].tsx apps/mobile/src/app/\(learner\)/session/index.tsx
git commit -m "feat(mobile): wire recall bridge into homework session summary (Story 2.7)

useRecallBridge hook calls POST /sessions/:id/recall-bridge.
Session screen now passes sessionType to the summary screen.
After homework summary submit/skip, 1-2 recall questions are shown
as a celebratory self-test before navigating home.

Closes Epic 2 finding 4 (UX-15)."
```

---

## Task 4: Add performance-driven curriculum adaptation endpoint

**Finding 2 (High):** FR21 requires an endpoint that accepts performance data and reorders the remaining curriculum. Currently only manual skip/unskip exists.

**Files:**
- Modify: `packages/schemas/src/subjects.ts` (add adaptation request/response schema)
- Modify: `apps/api/src/services/curriculum.ts` (add `adaptCurriculumFromPerformance` service)
- Modify: `apps/api/src/routes/curriculum.ts` (add POST adapt endpoint)
- Modify: `apps/mobile/src/hooks/use-curriculum.ts` (add `useAdaptCurriculum` hook)
- Test: `apps/api/src/services/curriculum.test.ts`

### Steps

- [ ] **Step 1: Add Zod schemas for performance-based adaptation**

In `packages/schemas/src/subjects.ts`, add after the existing curriculum schemas (near the skip/unskip schemas):

```typescript
export const curriculumAdaptRequestSchema = z.object({
  /** Topic that triggered the adaptation */
  topicId: z.string().uuid(),
  /** Performance signal that drives reordering */
  signal: z.enum(['struggling', 'mastered', 'too_easy', 'too_hard']),
  /** Optional context for the LLM reorder prompt */
  context: z.string().max(500).optional(),
});
export type CurriculumAdaptRequest = z.infer<typeof curriculumAdaptRequestSchema>;

export const curriculumAdaptResponseSchema = z.object({
  /** Whether the curriculum was actually reordered */
  adapted: z.boolean(),
  /** The reordered topic IDs (new sort order) */
  topicOrder: z.array(z.string().uuid()),
  /** Human-readable explanation of what changed */
  explanation: z.string(),
});
export type CurriculumAdaptResponse = z.infer<typeof curriculumAdaptResponseSchema>;
```

- [ ] **Step 2: Export new schemas from the package barrel**

Check `packages/schemas/src/index.ts` — the subjects barrel should re-export from `subjects.ts`. If it uses `export * from './subjects'`, no change needed. Otherwise add the new exports.

- [ ] **Step 3: Write failing test for `adaptCurriculumFromPerformance`**

In `apps/api/src/services/curriculum.test.ts` (find existing test file or create):

```typescript
describe('adaptCurriculumFromPerformance', () => {
  it('reorders topics and records an adaptation row', async () => {
    // This test depends on the mock DB pattern used in the file.
    // The key assertion: the function returns adapted: true with a
    // topicOrder array and writes a curriculumAdaptations row with
    // skipReason containing the signal.
    // Implement with the same mock pattern as existing curriculum tests.
  });

  it('returns adapted: false when topic is not found', async () => {
    // ...
  });
});
```

Note: Adapt the test to match the existing mock patterns in the test file. The important contract: the function accepts `(db, profileId, subjectId, request)` and returns `CurriculumAdaptResponse`.

- [ ] **Step 4: Implement `adaptCurriculumFromPerformance` service**

In `apps/api/src/services/curriculum.ts`, add:

```typescript
import type { CurriculumAdaptRequest, CurriculumAdaptResponse } from '@eduagent/schemas';

/**
 * Reorders the remaining curriculum based on a performance signal.
 *
 * - 'struggling': move the topic later, insert a simpler prerequisite-adjacent topic earlier
 * - 'mastered': move the topic's successors earlier, deprioritize review
 * - 'too_easy' / 'too_hard': adjust sort order and record the signal
 *
 * Records an adaptation row for audit purposes.
 */
export async function adaptCurriculumFromPerformance(
  db: Database,
  profileId: string,
  subjectId: string,
  request: CurriculumAdaptRequest
): Promise<CurriculumAdaptResponse> {
  const curriculum = await getCurriculum(db, profileId, subjectId);
  if (!curriculum) {
    return { adapted: false, topicOrder: [], explanation: 'No curriculum found.' };
  }

  const targetTopic = curriculum.topics.find((t) => t.id === request.topicId);
  if (!targetTopic) {
    return {
      adapted: false,
      topicOrder: curriculum.topics.map((t) => t.id),
      explanation: 'Topic not found in curriculum.',
    };
  }

  // Reorder logic: move struggling topics later, mastered topics' followers earlier
  const remaining = curriculum.topics.filter((t) => !t.skipped);
  const targetIndex = remaining.findIndex((t) => t.id === request.topicId);

  let reordered = [...remaining];
  if (targetIndex >= 0) {
    const [topic] = reordered.splice(targetIndex, 1);
    switch (request.signal) {
      case 'struggling':
      case 'too_hard':
        // Move topic 2 positions later (or to end)
        reordered.splice(Math.min(targetIndex + 2, reordered.length), 0, topic);
        break;
      case 'mastered':
      case 'too_easy':
        // Move topic 2 positions earlier (or to start)
        reordered.splice(Math.max(targetIndex - 2, 0), 0, topic);
        break;
    }
  }

  // Persist new sort order
  for (let i = 0; i < reordered.length; i++) {
    await db
      .update(curriculumTopics)
      .set({ sortOrder: i, updatedAt: new Date() })
      .where(
        and(
          eq(curriculumTopics.id, reordered[i].id),
          eq(curriculumTopics.curriculumId, curriculum.id)
        )
      );
  }

  // Record adaptation for audit
  await db.insert(curriculumAdaptations).values({
    profileId,
    subjectId,
    topicId: request.topicId,
    sortOrder: reordered.findIndex((t) => t.id === request.topicId),
    skipReason: `Performance adaptation: ${request.signal}${request.context ? ` — ${request.context}` : ''}`,
  });

  const explanation =
    request.signal === 'struggling' || request.signal === 'too_hard'
      ? `Moved "${targetTopic.title}" later to give you more preparation time.`
      : `Moved "${targetTopic.title}" earlier since you're ready.`;

  return {
    adapted: true,
    topicOrder: reordered.map((t) => t.id),
    explanation,
  };
}
```

- [ ] **Step 5: Add the route**

In `apps/api/src/routes/curriculum.ts`, add a new POST endpoint:

```typescript
import { curriculumAdaptRequestSchema } from '@eduagent/schemas';
import { adaptCurriculumFromPerformance } from '../services/curriculum';

  // Performance-driven curriculum adaptation (FR21)
  .post(
    '/subjects/:subjectId/curriculum/adapt',
    zValidator('json', curriculumAdaptRequestSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');

      const result = await adaptCurriculumFromPerformance(
        db,
        profileId,
        subjectId,
        input
      );
      return c.json(result);
    }
  )
```

- [ ] **Step 6: Add mobile hook**

In `apps/mobile/src/hooks/use-curriculum.ts`, add:

```typescript
import type { CurriculumAdaptRequest, CurriculumAdaptResponse } from '@eduagent/schemas';

export function useAdaptCurriculum(
  subjectId: string
): UseMutationResult<CurriculumAdaptResponse, Error, CurriculumAdaptRequest> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: CurriculumAdaptRequest
    ): Promise<CurriculumAdaptResponse> => {
      const res = await client.subjects[':subjectId'].curriculum.adapt.$post({
        param: { subjectId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as unknown as CurriculumAdaptResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['curriculum', subjectId],
      });
    },
  });
}
```

- [ ] **Step 7: Run tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/curriculum.ts src/routes/curriculum.ts --no-coverage
cd packages/schemas && pnpm exec jest --findRelatedTests src/subjects.ts --no-coverage
```

- [ ] **Step 8: Type check all three projects**

```bash
cd packages/schemas && pnpm exec tsc --noEmit
cd apps/api && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add packages/schemas/src/subjects.ts apps/api/src/services/curriculum.ts apps/api/src/routes/curriculum.ts apps/mobile/src/hooks/use-curriculum.ts apps/api/src/services/curriculum.test.ts
git commit -m "feat: add performance-driven curriculum adaptation endpoint (FR21)

POST /subjects/:id/curriculum/adapt accepts a performance signal
(struggling, mastered, too_easy, too_hard) and reorders remaining
topics. Records a curriculumAdaptations row for audit. Mobile hook
useAdaptCurriculum() wired up.

Closes Epic 1 finding 2 (Story 1.5 / FR21)."
```

---

## Task 5: Convert interview flow to real SSE streaming

**Finding 1 (High):** The interview route returns full JSON and the mobile animates it locally. FR14 requires real SSE streaming like sessions use.

**Files:**
- Modify: `apps/api/src/services/interview.ts:182-214` (add streaming variant)
- Modify: `apps/api/src/routes/interview.ts:28-78` (use `streamSSE`)
- Modify: `apps/mobile/src/hooks/use-interview.ts` (add streaming hook)
- Modify: `apps/mobile/src/app/(learner)/onboarding/interview.tsx` (switch to SSE)

### Steps

- [ ] **Step 1: Add `streamInterviewExchange` to the interview service**

In `apps/api/src/services/interview.ts`, add alongside `processInterviewExchange`:

```typescript
import { routeAndStream, type StreamResult } from './llm';

/**
 * Streaming variant of processInterviewExchange.
 * Returns an async iterable of string chunks plus an onComplete callback.
 */
export async function streamInterviewExchange(
  context: InterviewContext,
  userMessage: string
): Promise<{
  stream: AsyncIterable<string>;
  onComplete: (fullResponse: string) => Promise<InterviewResult>;
}> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${INTERVIEW_SYSTEM_PROMPT}\n\nSubject: ${context.subjectName}`,
    },
    ...context.exchangeHistory.map((e) => ({
      role: e.role as 'user' | 'assistant',
      content: e.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const streamResult: StreamResult = await routeAndStream(messages, 1);

  const onComplete = async (fullResponse: string): Promise<InterviewResult> => {
    const isComplete = fullResponse.includes('[INTERVIEW_COMPLETE]');
    const cleanResponse = fullResponse.replace('[INTERVIEW_COMPLETE]', '').trim();

    if (isComplete) {
      const signals = await extractSignals([
        ...context.exchangeHistory,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: cleanResponse },
      ]);
      return { response: cleanResponse, isComplete, extractedSignals: signals };
    }

    return { response: cleanResponse, isComplete };
  };

  return { stream: streamResult.stream, onComplete };
}
```

- [ ] **Step 2: Add a streaming POST route alongside the existing interview POST**

In `apps/api/src/routes/interview.ts`, add a new route. Keep the existing POST as-is (for backwards compatibility and tests), and add a `/stream` variant:

```typescript
import { streamSSE } from 'hono/streaming';
import { streamInterviewExchange } from '../services/interview';

  // Stream interview response via SSE (FR14)
  .post(
    '/subjects/:subjectId/interview/stream',
    zValidator('json', interviewMessageSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const subjectId = c.req.param('subjectId');
      const { message } = c.req.valid('json');

      const subject = await getSubject(db, profileId, subjectId);
      if (!subject) return notFound(c, 'Subject not found');

      const draft = await getOrCreateDraft(db, profileId, subjectId);

      const { stream, onComplete } = await streamInterviewExchange(
        { subjectName: subject.name, exchangeHistory: draft.exchangeHistory },
        message
      );

      return streamSSE(c, async (sseStream) => {
        let fullResponse = '';

        for await (const chunk of stream) {
          fullResponse += chunk;
          await sseStream.writeSSE({
            data: JSON.stringify({ type: 'chunk', content: chunk }),
          });
        }

        const result = await onComplete(fullResponse);

        const updatedHistory = [
          ...draft.exchangeHistory,
          { role: 'user' as const, content: message },
          { role: 'assistant' as const, content: result.response },
        ];

        if (result.isComplete) {
          await updateDraft(db, profileId, draft.id, {
            exchangeHistory: updatedHistory,
            extractedSignals: result.extractedSignals ?? draft.extractedSignals,
            status: 'completed',
          });
          await persistCurriculum(db, subjectId, subject.name, {
            ...draft,
            exchangeHistory: updatedHistory,
            extractedSignals: result.extractedSignals ?? draft.extractedSignals,
          });
        } else {
          await updateDraft(db, profileId, draft.id, {
            exchangeHistory: updatedHistory,
          });
        }

        await sseStream.writeSSE({
          data: JSON.stringify({
            type: 'done',
            isComplete: result.isComplete,
            exchangeCount: updatedHistory.filter((e) => e.role === 'user').length,
          }),
        });
      });
    }
  )
```

- [ ] **Step 3: Add `useStreamInterviewMessage` hook**

In `apps/mobile/src/hooks/use-interview.ts`, add:

```typescript
import { useRef, useCallback } from 'react';
import { getApiUrl } from '../lib/api';
import { streamSSEViaXHR, type StreamEvent } from '../lib/sse';

interface InterviewDonePayload {
  isComplete: boolean;
  exchangeCount: number;
}

export function useStreamInterviewMessage(subjectId: string): {
  stream: (
    message: string,
    onChunk: (accumulated: string) => void,
    onDone: (result: InterviewDonePayload) => void
  ) => Promise<void>;
  abort: () => void;
  isStreaming: boolean;
} {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();
  const abortRef = useRef<(() => void) | null>(null);
  const streamingRef = useRef(false);

  const abort = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    streamingRef.current = false;
  }, []);

  const stream = useCallback(
    async (
      message: string,
      onChunk: (accumulated: string) => void,
      onDone: (result: InterviewDonePayload) => void
    ): Promise<void> => {
      abort();
      streamingRef.current = true;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // Get auth token from the client's configured headers
      const token = (client as unknown as { _token?: string })._token;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (activeProfile?.id) headers['X-Profile-Id'] = activeProfile.id;

      const url = `${getApiUrl()}/v1/subjects/${subjectId}/interview/stream`;
      const { events, abort: xhrAbort } = streamSSEViaXHR(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
      });
      abortRef.current = xhrAbort;

      let accumulated = '';
      for await (const event of events) {
        if (event.type === 'chunk') {
          accumulated += event.content;
          onChunk(accumulated);
        } else if (event.type === 'done') {
          const payload = event as unknown as StreamEvent & InterviewDonePayload;
          onDone({
            isComplete: payload.isComplete ?? false,
            exchangeCount: payload.exchangeCount ?? 0,
          });
        }
      }

      streamingRef.current = false;
      void queryClient.invalidateQueries({
        queryKey: ['interview', subjectId],
      });
    },
    [subjectId, client, activeProfile?.id, queryClient, abort]
  );

  return { stream, abort, isStreaming: streamingRef.current };
}
```

Note: The auth token retrieval needs to match how `useStreamMessage` in `use-sessions.ts` gets its token. Check that file's pattern and replicate it exactly.

- [ ] **Step 4: Update the interview screen to use real SSE streaming**

In `apps/mobile/src/app/(learner)/onboarding/interview.tsx`, replace the `useSendInterviewMessage` usage with `useStreamInterviewMessage`. The key changes:

1. Import `useStreamInterviewMessage` instead of (or alongside) `useSendInterviewMessage`
2. Replace the send handler to stream instead of animate:

```typescript
  const { stream: streamInterview, abort: abortStream } =
    useStreamInterviewMessage(subjectId);

  // In the send handler, replace the animateResponse pattern:
  const handleSend = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Add user message
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text.trim() },
    ]);
    setIsStreaming(true);

    // Add placeholder for streaming AI response
    const streamingMsgId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', streaming: true, id: streamingMsgId },
    ]);

    try {
      await streamInterview(
        text.trim(),
        (accumulated) => {
          // Update the streaming message with accumulated chunks
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingMsgId
                ? { ...msg, content: accumulated }
                : msg
            )
          );
        },
        (result) => {
          // Finalize the streaming message
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingMsgId
                ? { ...msg, streaming: false }
                : msg
            )
          );
          setIsStreaming(false);
          if (result.isComplete) {
            setInterviewComplete(true);
          }
        }
      );
    } catch {
      // Remove failed streaming message, show error
      setMessages((prev) => prev.filter((msg) => msg.id !== streamingMsgId));
      setIsStreaming(false);
    }
  };
```

Important: Keep the existing `useSendInterviewMessage` import for the resume/expired-restart flows that don't need streaming. Only the active send path needs SSE.

Also add cleanup on unmount:

```typescript
  useEffect(() => {
    return () => {
      abortStream();
    };
  }, [abortStream]);
```

- [ ] **Step 5: Run related tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/interview.ts src/routes/interview.ts --no-coverage
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-interview.ts --no-coverage
```

- [ ] **Step 6: Type check all projects**

```bash
cd apps/api && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/interview.ts apps/api/src/routes/interview.ts apps/mobile/src/hooks/use-interview.ts apps/mobile/src/app/\(learner\)/onboarding/interview.tsx
git commit -m "feat: stream interview responses via SSE (FR14)

Add streamInterviewExchange() service + /interview/stream SSE route.
Mobile useStreamInterviewMessage hook uses streamSSEViaXHR for real-
time token display. The old JSON POST is kept for resume/test paths.

Closes Epic 1 finding 1 (Story 1.2 / FR14)."
```

---

## Post-Implementation

After all 5 tasks are complete:

1. Run full API test suite: `pnpm exec nx test api --no-coverage`
2. Run full mobile test suite: `pnpm exec nx test mobile --no-coverage`
3. Run `pnpm exec tsc --noEmit` across all projects
4. Update `docs/analysis/epics-vs-code-gap-analysis.md` to mark findings 1-5 as resolved with dates
