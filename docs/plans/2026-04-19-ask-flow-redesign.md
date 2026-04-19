# Ask Flow Redesign — "Answer First, Classify Silently" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove visible subject classification from freeform "Ask" sessions, add silent background classification after exchange 2, and gate post-session filing on a meaningful-exchange evaluation — so kids always get an answer first and only see filing when the session had real depth.

**Architecture:** Server-side depth evaluation service with heuristic short-circuits (saves ~60-70% of LLM calls). Silent classification stored in session metadata JSONB (no DB migration). Mobile `SessionFooter` rebuilt as a state machine driven by the depth evaluation result. Resume nudge on home screen for abandoned meaningful sessions.

**Tech Stack:** Hono API routes, Inngest events, React Native (Expo Router), TanStack Query, `@eduagent/schemas` shared types, `routeAndCall` LLM router (Gemini Flash / rung 1).

**Spec:** `docs/specs/2026-04-19-ask-flow-redesign.md`

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `packages/schemas/src/depth-evaluation.ts` | `DepthEvaluation` and `DetectedTopic` types + zod schemas — shared API contract |
| `apps/api/src/services/session/session-depth.config.ts` | Exported heuristic constants (`MIN_EXCHANGES_FOR_MEANINGFUL`, `GATE_TIMEOUT_MS`, `LANGUAGE_REGEX`, etc.) |
| `apps/api/src/services/session/session-depth.ts` | `evaluateSessionDepth()` — heuristics + LLM gate, returns `DepthEvaluation` |
| `apps/api/src/services/session/session-depth.test.ts` | Unit/integration tests for depth service |
| `apps/mobile/src/hooks/use-depth-evaluation.ts` | `useDepthEvaluation()` — mutation hook calling `POST /sessions/:id/evaluate-depth` |
| `apps/mobile/src/app/(app)/session/_helpers/SessionFooter.test.tsx` | Tests for the redesigned footer state machine |

### Modified files

| File | Change summary |
|---|---|
| `packages/schemas/src/index.ts` | Re-export from `depth-evaluation.ts` |
| `apps/api/src/services/session/session-exchange.ts` | Silent background classification after exchange 2; pedagogy hint injection; language regex pre-classifier |
| `apps/api/src/services/session/index.ts` | Re-export `evaluateSessionDepth` |
| `apps/api/src/routes/sessions.ts` | New `POST /sessions/:sessionId/evaluate-depth` endpoint |
| `apps/api/src/inngest/functions/session-completed.ts` | Gate filing wait on depth evaluation for freeform sessions |
| `apps/mobile/src/app/(app)/session/index.tsx` | Remove `useSubjectClassification` from freeform path; add depth evaluation state |
| `apps/mobile/src/app/(app)/session/_helpers/use-session-actions.ts` | Replace `shouldAutoFile` with depth evaluation for freeform; remove auto-file path |
| `apps/mobile/src/app/(app)/session/_helpers/SessionFooter.tsx` | Full state machine: evaluating → meaningful (single/multi) → not-meaningful → fail-open → filing states |
| `apps/mobile/src/hooks/use-filing.ts` | Add `useMultiTopicFiling()` for sequential per-topic filing calls |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Resume nudge card for abandoned meaningful freeform sessions |

---

## Task 1: Depth Evaluation Types + Configuration

Defines the shared API contract and tuning constants. No business logic — just types and config.

**Files:**
- Create: `packages/schemas/src/depth-evaluation.ts`
- Modify: `packages/schemas/src/index.ts`
- Create: `apps/api/src/services/session/session-depth.config.ts`

- [ ] **Step 1: Create depth evaluation schema**

```ts
// packages/schemas/src/depth-evaluation.ts
import { z } from 'zod';

export const detectedTopicSchema = z.object({
  summary: z.string().min(1).max(80),
  depth: z.enum(['substantial', 'partial', 'introduced']),
});
export type DetectedTopic = z.infer<typeof detectedTopicSchema>;

export const depthEvaluationSchema = z.object({
  meaningful: z.boolean(),
  reason: z.string(),
  topics: z.array(detectedTopicSchema),
});
export type DepthEvaluation = z.infer<typeof depthEvaluationSchema>;
```

- [ ] **Step 2: Export from schemas barrel**

Add to `packages/schemas/src/index.ts`:

```ts
export {
  detectedTopicSchema,
  depthEvaluationSchema,
  type DetectedTopic,
  type DepthEvaluation,
} from './depth-evaluation';
```

- [ ] **Step 3: Create session depth config**

```ts
// apps/api/src/services/session/session-depth.config.ts

/** Minimum exchange count to consider a session meaningful via heuristic shortcut */
export const MIN_EXCHANGES_FOR_MEANINGFUL = 3;

/** Minimum learner word count (across all user messages) for meaningful heuristic */
export const MIN_LEARNER_WORDS = 50;

/** Exchange count at which we auto-mark meaningful (skip LLM for topic detection only) */
export const AUTO_MEANINGFUL_EXCHANGE_THRESHOLD = 5;

/** Hard timeout for the depth evaluation gate (ms) */
export const GATE_TIMEOUT_MS = 2000;

/** Timeout for the topic-detection-only Flash call (ms) — used when heuristic says meaningful */
export const TOPIC_DETECTION_TIMEOUT_MS = 1500;

/** Confidence threshold for silent background classification (FR-ASK-2) */
export const SILENT_CLASSIFY_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Language pre-classifier regex (AD-ASK-2). Matches common language-intent
 * patterns to inject Four Strands pedagogy from exchange 1 without waiting
 * for the full classification after exchange 2.
 */
export const LANGUAGE_REGEX =
  /\b(how do (you|I) say|translate|in (french|spanish|german|czech|italian|portuguese|japanese|chinese|korean|arabic|russian|hindi|dutch|polish|swedish|norwegian|danish|finnish|greek|turkish|hungarian|romanian|thai|vietnamese|indonesian|malay|tagalog|swahili|hebrew|ukrainian|croatian|serbian|slovak|slovenian|bulgarian|latvian|lithuanian|estonian)|what('s| is) .+ in \w+)\b/i;
```

- [ ] **Step 4: Verify schemas build**

Run: `pnpm exec nx run schemas:build` (or `cd packages/schemas && pnpm exec tsc --noEmit`)
Expected: PASS — no type errors.

- [ ] **Step 5: Commit**

```
feat(schemas,api): depth evaluation types + session-depth config [FR-ASK-3]
```

---

## Task 2: Session Depth Service — Heuristics + LLM Gate

Core service that evaluates whether a freeform session was meaningful. Uses heuristic short-circuits for obvious cases, LLM for ambiguous middle ground.

**Files:**
- Create: `apps/api/src/services/session/session-depth.test.ts`
- Create: `apps/api/src/services/session/session-depth.ts`
- Modify: `apps/api/src/services/session/index.ts`

**Read first:** `apps/api/src/services/session/session-exchange.ts` (exchange history format), `apps/api/src/services/llm/index.ts` (routeAndCall signature), `apps/api/src/services/session/session-crud.ts` (`getSessionTranscript` signature)

### 2A: Heuristic shortcuts

- [ ] **Step 1: Write failing test — shallow session heuristic**

```ts
// apps/api/src/services/session/session-depth.test.ts
import { evaluateSessionDepth } from './session-depth';
import type { SessionTranscript } from '@eduagent/schemas';

// Minimal transcript factory for testing
function makeTranscript(
  exchanges: Array<{ user: string; ai: string }>
): SessionTranscript {
  return {
    session: {
      id: 'test-session',
      profileId: 'test-profile',
      subjectId: null,
      topicId: null,
      sessionType: 'learning',
      exchangeCount: exchanges.length,
      escalationRung: 1,
      status: 'closed',
      createdAt: new Date().toISOString(),
      rawInput: null,
    },
    exchanges: exchanges.map((e, i) => ({
      exchangeNumber: i + 1,
      userMessage: e.user,
      aiResponse: e.ai,
    })),
  } as SessionTranscript;
}

describe('evaluateSessionDepth', () => {
  describe('heuristic shortcuts', () => {
    it('returns not meaningful for < 3 exchanges and < 50 learner words', async () => {
      const transcript = makeTranscript([
        { user: 'What is the capital of France?', ai: 'Paris is the capital of France.' },
        { user: 'Thanks', ai: "You're welcome!" },
      ]);
      const result = await evaluateSessionDepth(transcript);
      expect(result.meaningful).toBe(false);
      expect(result.topics).toEqual([]);
    });

    it('returns meaningful for >= 5 exchanges (auto threshold)', async () => {
      const transcript = makeTranscript([
        { user: 'Tell me about photosynthesis', ai: 'Photosynthesis is the process by which plants convert sunlight into energy...' },
        { user: 'How does chlorophyll work?', ai: 'Chlorophyll is the green pigment in plants that absorbs light energy...' },
        { user: 'What wavelengths does it absorb?', ai: 'Chlorophyll primarily absorbs red and blue light...' },
        { user: 'So plants reflect green light?', ai: 'Exactly! That is why plants appear green to our eyes...' },
        { user: 'What about plants in the deep ocean?', ai: 'Deep ocean plants use different pigments to absorb the blue light that penetrates deeper water...' },
      ]);
      const result = await evaluateSessionDepth(transcript);
      expect(result.meaningful).toBe(true);
    });

    it('returns not meaningful for < 3 exchanges even with many words', async () => {
      const transcript = makeTranscript([
        {
          user: 'Can you explain the entire history of the Roman Empire from founding to fall, including all the major emperors, wars, and cultural achievements that shaped Western civilization?',
          ai: 'The Roman Empire has a rich and complex history spanning over a thousand years...',
        },
      ]);
      const result = await evaluateSessionDepth(transcript);
      expect(result.meaningful).toBe(false);
      expect(result.topics).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest session-depth.test.ts --no-coverage`
Expected: FAIL — `Cannot find module './session-depth'`

- [ ] **Step 3: Implement evaluateSessionDepth with heuristic shortcuts**

```ts
// apps/api/src/services/session/session-depth.ts
import type { DepthEvaluation, SessionTranscript } from '@eduagent/schemas';
import { depthEvaluationSchema } from '@eduagent/schemas';
import { routeAndCall } from '../llm';
import type { ChatMessage } from '../llm';
import { createLogger } from '../logger';
import {
  MIN_EXCHANGES_FOR_MEANINGFUL,
  MIN_LEARNER_WORDS,
  AUTO_MEANINGFUL_EXCHANGE_THRESHOLD,
  GATE_TIMEOUT_MS,
  TOPIC_DETECTION_TIMEOUT_MS,
} from './session-depth.config';

const logger = createLogger();

const DEPTH_EVALUATION_PROMPT = `Given this session transcript between a learner and a tutor, evaluate:

1. Did the learner engage with educational content beyond a simple factual lookup?
2. Did the tutor explain, teach, or guide (not just answer)?
3. Did the learner respond to the teaching (ask follow-ups, express understanding, try to apply the concept)?

If ALL THREE are true, this is a meaningful learning exchange.
If the session was a quick Q&A (≤2 exchanges, factual answers, no teaching depth), it is NOT meaningful.

Return JSON:
{
  "meaningful": boolean,
  "reason": string,
  "topics": [{ "summary": "3-5 word topic label", "depth": "substantial" | "partial" | "introduced" }]
}

Return ONLY the JSON object. No markdown fences, no explanation.`;

const TOPIC_DETECTION_PROMPT = `Given this session transcript between a learner and a tutor, identify the topics discussed.

Return JSON:
{
  "meaningful": true,
  "reason": "Session showed educational depth",
  "topics": [{ "summary": "3-5 word topic label", "depth": "substantial" | "partial" | "introduced" }]
}

Rules:
- "substantial": the learner explored this topic in depth with follow-up questions
- "partial": the topic was discussed with some teaching but not deeply explored
- "introduced": the topic was mentioned briefly with no real engagement

Return ONLY the JSON object. No markdown fences, no explanation.`;

function countLearnerWords(transcript: SessionTranscript): number {
  return transcript.exchanges.reduce((sum, e) => {
    return sum + e.userMessage.split(/\s+/).filter(Boolean).length;
  }, 0);
}

function formatTranscriptForPrompt(transcript: SessionTranscript): string {
  return transcript.exchanges
    .map(
      (e) =>
        `Learner: ${e.userMessage}\nTutor: ${e.aiResponse}`
    )
    .join('\n\n');
}

function parseDepthResponse(raw: string): DepthEvaluation | null {
  try {
    // Strip markdown fences if present
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const result = depthEvaluationSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Evaluates whether a freeform session contained meaningful learning depth.
 * Uses heuristic short-circuits for obvious cases, LLM for ambiguous middle ground.
 *
 * @param transcript - Full session transcript
 * @param options.timeoutMs - Override gate timeout (default: GATE_TIMEOUT_MS)
 * @returns DepthEvaluation — { meaningful, reason, topics[] }
 */
export async function evaluateSessionDepth(
  transcript: SessionTranscript,
  options?: { timeoutMs?: number }
): Promise<DepthEvaluation> {
  const exchangeCount = transcript.exchanges.length;
  const learnerWordCount = countLearnerWords(transcript);

  // Heuristic shortcut 1: Shallow session — skip LLM entirely
  if (
    exchangeCount < MIN_EXCHANGES_FOR_MEANINGFUL &&
    learnerWordCount < MIN_LEARNER_WORDS
  ) {
    return {
      meaningful: false,
      reason: `Quick Q&A: ${exchangeCount} exchanges, ${learnerWordCount} words`,
      topics: [],
    };
  }

  // Heuristic shortcut 2: Clearly deep session — skip full evaluation,
  // but still need LLM for topic detection (use faster prompt + shorter timeout)
  if (exchangeCount >= AUTO_MEANINGFUL_EXCHANGE_THRESHOLD) {
    const topics = await detectTopicsOnly(
      transcript,
      options?.timeoutMs ?? TOPIC_DETECTION_TIMEOUT_MS
    );
    return {
      meaningful: true,
      reason: `Deep session: ${exchangeCount} exchanges with follow-up engagement`,
      topics,
    };
  }

  // Middle ground (3-4 exchanges, or >= MIN but unclear depth) — full LLM judgment
  return evaluateWithLlm(
    transcript,
    exchangeCount,
    learnerWordCount,
    options?.timeoutMs ?? GATE_TIMEOUT_MS
  );
}

async function detectTopicsOnly(
  transcript: SessionTranscript,
  timeoutMs: number
): Promise<DepthEvaluation['topics']> {
  const transcriptText = formatTranscriptForPrompt(transcript);
  const messages: ChatMessage[] = [
    { role: 'system', content: TOPIC_DETECTION_PROMPT },
    { role: 'user', content: transcriptText },
  ];

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Topic detection timeout')), timeoutMs)
    );
    const llmPromise = routeAndCall(messages, 1);
    const result = await Promise.race([llmPromise, timeoutPromise]);
    const parsed = parseDepthResponse(result.text);
    return parsed?.topics ?? [];
  } catch (err) {
    logger.warn('[session-depth] topic detection failed, returning empty topics', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function evaluateWithLlm(
  transcript: SessionTranscript,
  exchangeCount: number,
  learnerWordCount: number,
  timeoutMs: number
): Promise<DepthEvaluation> {
  const transcriptText = formatTranscriptForPrompt(transcript);
  const messages: ChatMessage[] = [
    { role: 'system', content: DEPTH_EVALUATION_PROMPT },
    { role: 'user', content: transcriptText },
  ];

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Depth evaluation timeout')), timeoutMs)
    );
    const llmPromise = routeAndCall(messages, 1);
    const result = await Promise.race([llmPromise, timeoutPromise]);
    const parsed = parseDepthResponse(result.text);

    if (parsed) return parsed;

    // LLM returned unparseable response — fail open
    logger.warn('[session-depth] unparseable LLM response, failing open', {
      raw: result.text.slice(0, 200),
    });
    return failOpen(exchangeCount, learnerWordCount);
  } catch (err) {
    logger.warn('[session-depth] LLM gate failed, failing open', {
      error: err instanceof Error ? err.message : String(err),
    });
    return failOpen(exchangeCount, learnerWordCount);
  }
}

function failOpen(exchangeCount: number, learnerWordCount: number): DepthEvaluation {
  return {
    meaningful: true,
    reason: `Gate timeout — fail open (${exchangeCount} exchanges, ${learnerWordCount} words)`,
    topics: [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest session-depth.test.ts --no-coverage`
Expected: PASS — 3 tests pass. The `>= 5 exchanges` test calls `routeAndCall` which needs mocking. Add the mock:

- [ ] **Step 5: Add LLM mock for topic detection test**

Update the test file to mock `routeAndCall`:

```ts
// At the top of session-depth.test.ts, after imports:
jest.mock('../llm', () => ({
  routeAndCall: jest.fn().mockResolvedValue({
    text: JSON.stringify({
      meaningful: true,
      reason: 'Deep session',
      topics: [{ summary: 'Photosynthesis basics', depth: 'substantial' }],
    }),
  }),
}));
```

- [ ] **Step 6: Run tests again**

Run: `cd apps/api && pnpm exec jest session-depth.test.ts --no-coverage`
Expected: PASS — all 3 tests pass.

### 2B: LLM gate + timeout fail-open

- [ ] **Step 7: Write failing test — LLM gate for ambiguous sessions**

Add to the test file:

```ts
import { routeAndCall } from '../llm';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<typeof routeAndCall>;

describe('LLM gate for ambiguous sessions', () => {
  beforeEach(() => {
    mockRouteAndCall.mockReset();
  });

  it('calls LLM for 3-4 exchange sessions and returns its judgment', async () => {
    mockRouteAndCall.mockResolvedValue({
      text: JSON.stringify({
        meaningful: true,
        reason: 'Learner explored the concept with follow-ups',
        topics: [{ summary: 'How fish breathe', depth: 'substantial' }],
      }),
    } as never);

    const transcript = makeTranscript([
      { user: 'How do fish breathe?', ai: 'Fish breathe through gills. Gills extract dissolved oxygen from water as it flows over them...' },
      { user: 'So they can only breathe in water?', ai: 'Most fish can only extract oxygen from water, yes. However, some fish like lungfish have developed...' },
      { user: 'Can a fish drown?', ai: 'Interesting question! A fish can suffocate if there is not enough dissolved oxygen in the water...' },
    ]);
    const result = await evaluateSessionDepth(transcript);
    expect(result.meaningful).toBe(true);
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].summary).toBe('How fish breathe');
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
  });

  it('fails open on LLM timeout', async () => {
    mockRouteAndCall.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ text: '{}' } as never), 5000))
    );

    const transcript = makeTranscript([
      { user: 'Tell me about volcanoes', ai: 'Volcanoes are openings in the Earth crust...' },
      { user: 'Why do they erupt?', ai: 'Eruptions happen when pressure from molten rock builds up...' },
      { user: 'What about supervolcanoes?', ai: 'Supervolcanoes are extremely large volcanic calderas...' },
    ]);
    const result = await evaluateSessionDepth(transcript, { timeoutMs: 100 });
    expect(result.meaningful).toBe(true); // fail-open
    expect(result.reason).toContain('timeout');
  });

  it('fails open on unparseable LLM response', async () => {
    mockRouteAndCall.mockResolvedValue({
      text: 'Sure, I can help with that!',
    } as never);

    const transcript = makeTranscript([
      { user: 'What is gravity?', ai: 'Gravity is a fundamental force...' },
      { user: 'Why does it exist?', ai: 'The theory of general relativity explains...' },
      { user: 'Is gravity a wave?', ai: 'Gravitational waves were predicted by Einstein...' },
    ]);
    const result = await evaluateSessionDepth(transcript, { timeoutMs: 5000 });
    expect(result.meaningful).toBe(true); // fail-open
  });
});
```

- [ ] **Step 8: Run tests**

Run: `cd apps/api && pnpm exec jest session-depth.test.ts --no-coverage`
Expected: PASS — all 6 tests pass.

### 2C: Multi-topic detection

- [ ] **Step 9: Write test — multi-topic detection**

```ts
describe('multi-topic detection', () => {
  it('returns multiple topics when LLM detects them', async () => {
    mockRouteAndCall.mockResolvedValue({
      text: JSON.stringify({
        meaningful: true,
        reason: 'Multiple topics explored',
        topics: [
          { summary: 'How fish breathe underwater', depth: 'substantial' },
          { summary: 'Ocean pollution effects', depth: 'partial' },
          { summary: 'Whale migration', depth: 'introduced' },
        ],
      }),
    } as never);

    const transcript = makeTranscript([
      { user: 'How do fish breathe?', ai: 'Fish breathe through gills...' },
      { user: 'Is ocean pollution hurting fish?', ai: 'Yes, pollution affects marine life...' },
      { user: 'Do whales migrate?', ai: 'Yes, many whale species migrate...' },
      { user: 'Back to pollution — what about microplastics?', ai: 'Microplastics are tiny plastic particles...' },
      { user: 'How do gills filter those out?', ai: 'Fish gills cannot effectively filter microplastics...' },
    ]);
    const result = await evaluateSessionDepth(transcript);
    expect(result.meaningful).toBe(true);
    expect(result.topics).toHaveLength(3);
    // Only substantial + partial should be shown as chips (filtered by mobile)
    const fileable = result.topics.filter((t) => t.depth !== 'introduced');
    expect(fileable).toHaveLength(2);
  });
});
```

- [ ] **Step 10: Run all depth tests**

Run: `cd apps/api && pnpm exec jest session-depth.test.ts --no-coverage`
Expected: PASS — all 7 tests pass.

- [ ] **Step 11: Export from session barrel**

Add to `apps/api/src/services/session/index.ts`:

```ts
// Depth evaluation
export { evaluateSessionDepth } from './session-depth';
```

- [ ] **Step 12: Commit**

```
feat(api): session depth evaluation service — heuristics + LLM gate [FR-ASK-3]
```

---

## Task 3: Evaluate-Depth API Endpoint

Exposes the depth evaluation to the mobile client via `POST /sessions/:sessionId/evaluate-depth`.

**Files:**
- Modify: `apps/api/src/routes/sessions.ts`
- Test: Run existing route tests

**Read first:** `apps/api/src/routes/sessions.ts` (route structure), `apps/api/src/services/session/session-crud.ts` (`getSessionTranscript` export)

- [ ] **Step 1: Add evaluate-depth endpoint**

Add the following route to `apps/api/src/routes/sessions.ts`, after the existing `/sessions/:sessionId/transcript` route (around line 148). Chain it onto the existing `sessionRoutes` Hono app:

```ts
  // FR-ASK-3: Evaluate session depth for meaningful-exchange gate
  .post('/sessions/:sessionId/evaluate-depth', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const sessionId = c.req.param('sessionId');

    const transcript = await getSessionTranscript(db, profileId, sessionId);
    if (!transcript) return notFound(c, 'Session not found');

    const { evaluateSessionDepth } = await import('../services/session');
    const result = await evaluateSessionDepth(transcript);
    return c.json(result);
  })
```

Add `getSessionTranscript` to the existing imports from `'../services/session'` if not already imported:

```ts
import {
  // ... existing imports ...
  getSessionTranscript,
} from '../services/session';
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```
feat(api): POST /sessions/:id/evaluate-depth endpoint [FR-ASK-3]
```

---

## Task 4: Silent Background Classification

After exchange 2 in a freeform session, fire-and-forget `classifySubject()` and store the result in session metadata. Subsequent exchanges read the cached result to inject pedagogy hints. Language regex pre-classifier provides instant Four Strands injection for obvious language questions.

**Files:**
- Modify: `apps/api/src/services/session/session-exchange.ts`
- Create (or extend): `apps/api/src/services/session/session-exchange.test.ts` (add new tests)

**Read first:** `apps/api/src/services/session/session-exchange.ts:148-645` (full `prepareExchangeContext`), `apps/api/src/services/subject-classify.ts` (classifySubject signature)

### 4A: Language regex pre-classifier

- [ ] **Step 1: Write failing test — language regex detection**

Add a test file or extend the existing exchange tests:

```ts
// apps/api/src/services/session/session-exchange.test.ts
// (or add to existing test file)
import { LANGUAGE_REGEX } from './session-depth.config';

describe('language pre-classifier regex', () => {
  it.each([
    'How do you say hello in French?',
    'Translate this to Spanish',
    'What is "dog" in German?',
    "What's butterfly in Czech?",
    'how do I say thank you in Japanese',
  ])('matches language intent: "%s"', (input) => {
    expect(LANGUAGE_REGEX.test(input)).toBe(true);
  });

  it.each([
    'Tell me about photosynthesis',
    'What is the capital of France?',
    'I want to practice French',
    'How does gravity work?',
  ])('does not match non-language intent: "%s"', (input) => {
    expect(LANGUAGE_REGEX.test(input)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd apps/api && pnpm exec jest session-exchange.test --no-coverage`
Expected: PASS

### 4B: Silent classification + pedagogy injection

- [ ] **Step 3: Add silent classification logic to prepareExchangeContext**

In `apps/api/src/services/session/session-exchange.ts`, add the following imports at the top:

```ts
import { classifySubject } from '../subject-classify';
import {
  SILENT_CLASSIFY_CONFIDENCE_THRESHOLD,
  LANGUAGE_REGEX,
} from './session-depth.config';
```

Then, in `prepareExchangeContext`, after the exchange history is built (after line ~393 where `exchangeHistory` is constructed) and before the context object is assembled (before line ~590), add:

```ts
  // ---------------------------------------------------------------------------
  // FR-ASK-2: Silent background classification for freeform sessions
  // ---------------------------------------------------------------------------
  const isFreeform = !session.topicId && !session.subjectId;
  const sessionMeta = (session.metadata ?? {}) as Record<string, unknown>;
  let silentClassification = sessionMeta.silentClassification as
    | { subjectId: string; subjectName: string; confidence: number; pedagogyMode?: string }
    | undefined;

  // Language regex pre-classifier (AD-ASK-2): instant Four Strands for obvious language questions
  let likelyLanguage = false;
  if (isFreeform && session.exchangeCount === 0) {
    likelyLanguage = LANGUAGE_REGEX.test(userMessage);
  }

  // Fire-and-forget classification after exchange 2 (one-shot, never re-runs)
  if (
    isFreeform &&
    session.exchangeCount === 1 && // Will become exchange 2 after this exchange
    !silentClassification
  ) {
    // Concatenate first 2 user messages for better classification signal
    const priorUserMessages = exchangeHistory
      .filter((e) => e.role === 'user')
      .map((e) => e.content)
      .join('\n');
    const classifyInput = `${priorUserMessages}\n${userMessage}`;

    // Fire-and-forget — do NOT await. Store result in session metadata.
    void (async () => {
      try {
        const result = await classifySubject(db, profileId, classifyInput);
        const topCandidate = result.candidates
          .filter((c) => c.confidence >= SILENT_CLASSIFY_CONFIDENCE_THRESHOLD)
          .sort((a, b) => b.confidence - a.confidence)[0];

        if (topCandidate) {
          // Store in session metadata (JSONB) — does NOT update learningSessions.subjectId
          await db
            .update(learningSessions)
            .set({
              metadata: sql`jsonb_set(
                COALESCE(${learningSessions.metadata}, '{}'),
                '{silentClassification}',
                ${JSON.stringify({
                  subjectId: topCandidate.subjectId,
                  subjectName: topCandidate.subjectName,
                  confidence: topCandidate.confidence,
                })}::jsonb
              )`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(learningSessions.id, sessionId),
                eq(learningSessions.profileId, profileId)
              )
            );

          await inngest.send({
            name: 'app/ask.classification_completed',
            data: {
              sessionId,
              subjectId: topCandidate.subjectId,
              subjectName: topCandidate.subjectName,
              confidence: topCandidate.confidence,
              exchangeCount: session.exchangeCount + 1,
            },
          });
        } else {
          const topConfidence = result.candidates[0]?.confidence ?? 0;
          await inngest.send({
            name: 'app/ask.classification_skipped',
            data: {
              sessionId,
              reason: result.candidates.length === 0 ? 'no_match' : 'below_threshold',
              topConfidence,
              exchangeCount: session.exchangeCount + 1,
            },
          });
        }
      } catch (err) {
        logger.warn('[session-exchange] silent classification failed', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        void inngest.send({
          name: 'app/ask.classification_failed',
          data: {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
            exchangeCount: session.exchangeCount + 1,
          },
        });
      }
    })();
  }
```

Add `inngest` import at the top of the file:

```ts
import { inngest } from '../../inngest/client';
```

- [ ] **Step 4: Inject pedagogy hint from silent classification into ExchangeContext**

In the context assembly block (around line ~590), modify the `pedagogyMode` and `subjectName` assignments to use silent classification when available:

```ts
  // FR-ASK-2: Enrich context with silent classification if available
  const effectiveSubjectName = silentClassification?.subjectName ?? subject?.name ?? 'Unknown';
  const effectivePedagogyMode = likelyLanguage
    ? 'four_strands' as const
    : (silentClassification?.pedagogyMode as 'socratic' | 'four_strands' | undefined)
      ?? subject?.pedagogyMode
      ?? 'socratic';
```

Then update the context object to use these:

```ts
  const context: ExchangeContext = {
    // ... existing fields ...
    subjectName: effectiveSubjectName,
    pedagogyMode: effectivePedagogyMode,
    // ... rest unchanged ...
  };
```

Also, if the silent classification found a language subject, load the relevant data:

```ts
  // FR-ASK-2: If silentClassification identified a subject, look up its pedagogyMode
  // for the enrichment. This runs on exchange >= 3 where classification is cached.
  if (silentClassification && !subject) {
    const silentSubjectRows = await db
      .select({ pedagogyMode: subjects.pedagogyMode, languageCode: subjects.languageCode })
      .from(subjects)
      .where(eq(subjects.id, silentClassification.subjectId))
      .limit(1);
    const silentSubject = silentSubjectRows[0];
    if (silentSubject) {
      silentClassification = {
        ...silentClassification,
        pedagogyMode: silentSubject.pedagogyMode ?? undefined,
      };
    }
  }
```

Place this block after the `silentClassification` variable is read from metadata and before the context assembly.

- [ ] **Step 5: Emit language pre-classifier event**

After the `likelyLanguage` detection, emit the event:

```ts
  if (likelyLanguage) {
    void inngest.send({
      name: 'app/ask.language_preclassified',
      data: {
        sessionId,
        matchedPattern: userMessage.match(LANGUAGE_REGEX)?.[0] ?? '',
      },
    });
  }
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 7: Run existing exchange tests**

Run: `cd apps/api && pnpm exec jest session-exchange --no-coverage`
Expected: PASS — existing tests still pass.

- [ ] **Step 8: Commit**

```
feat(api): silent background classification + language pre-classifier [FR-ASK-2][AD-ASK-2]
```

---

## Task 5: Remove Visible Classification from Freeform (Mobile)

Remove the `useSubjectClassification` hook from the freeform path so no disambiguation chips or "create subject?" prompts appear. The hook is still used by non-freeform modes.

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`
- Modify: `apps/mobile/src/app/(app)/session/_helpers/use-session-actions.ts`

**Read first:** `apps/mobile/src/app/(app)/session/index.tsx:808-842` (useSubjectClassification call), `apps/mobile/src/app/(app)/session/_helpers/use-session-actions.ts:35-46` (shouldAutoFile), `apps/mobile/src/app/(app)/session/_helpers/use-session-actions.ts:332-470` (handleEndSession)

### 5A: Bypass classification for freeform

- [ ] **Step 1: Modify session/index.tsx — conditionally use classification**

In `apps/mobile/src/app/(app)/session/index.tsx`, the `useSubjectClassification` hook is called at line ~808. Wrap it so that freeform mode gets a pass-through `handleSend` that skips classification:

Replace the `useSubjectClassification` call block (lines ~808-842) with:

```ts
  // FR-ASK-1: Freeform mode skips visible classification entirely.
  // The hook is still used by non-freeform modes (learning, homework, etc.)
  const classificationHook = useSubjectClassification({
    isStreaming,
    pendingClassification,
    setPendingClassification,
    quotaError,
    pendingSubjectResolution,
    setPendingSubjectResolution,
    classifiedSubject,
    setClassifiedSubject,
    setShowWrongSubjectChip,
    setClassifyError,
    setTopicSwitcherSubjectId,
    messages,
    setMessages,
    setResumedBanner,
    subjectId: subjectId ?? undefined,
    effectiveMode,
    availableSubjects,
    classifySubject,
    resolveSubject,
    createSubject,
    continueWithMessage,
    createLocalMessageId,
    showConfirmation,
    animateResponse,
    userMessageCount,
    sessionExperience,
    animationCleanupRef,
    setIsStreaming,
  });

  // FR-ASK-1: In freeform mode, bypass classification — send directly
  const isFreeformMode = effectiveMode === 'freeform';
  const handleSend = isFreeformMode
    ? async (text: string, opts?: { isAutoSent?: boolean }) => {
        await continueWithMessage(text, {}, opts);
      }
    : classificationHook.handleSend;

  const {
    handleResolveSubject,
    handleCreateResolveSuggestion,
    handleCreateSuggestedSubject,
  } = classificationHook;
```

- [ ] **Step 2: Remove pendingClassification guard from freeform send path**

In the same file, ensure that `pendingClassification` is never set to `true` in freeform mode. Since we bypassed the hook, this is already handled — the `setPendingClassification` is only called inside `useSubjectClassification.handleSend`, which is no longer used for freeform.

No code change needed — verify by reading the flow.

### 5B: Replace shouldAutoFile with depth evaluation in handleEndSession

- [ ] **Step 3: Add depth evaluation state to session screen**

In `apps/mobile/src/app/(app)/session/index.tsx`, add state for the depth evaluation result:

```ts
  import type { DepthEvaluation } from '@eduagent/schemas';

  // FR-ASK-3: Depth evaluation result for freeform filing gate
  const [depthEvaluation, setDepthEvaluation] = useState<DepthEvaluation | null>(null);
  const [depthEvaluating, setDepthEvaluating] = useState(false);
```

Pass these to `useSessionActions` and `SessionFooter`.

- [ ] **Step 4: Modify handleEndSession in use-session-actions.ts**

In `apps/mobile/src/app/(app)/session/_helpers/use-session-actions.ts`, modify the freeform branch of `handleEndSession` (lines ~378-422):

Replace the `shouldAutoFile` / `setShowFilingPrompt` block with:

```ts
              // FR-ASK-3: Freeform sessions — evaluate depth before offering filing
              if (effectiveMode === 'freeform') {
                setDepthEvaluating(true);
                setShowFilingPrompt(true); // Show footer (it will show skeleton)
                try {
                  const depthRes = await client.sessions[':sessionId']['evaluate-depth'].$post({
                    param: { sessionId: activeSessionId },
                  });
                  await assertOk(depthRes);
                  const evaluation = (await depthRes.json()) as DepthEvaluation;
                  setDepthEvaluation(evaluation);
                } catch {
                  // Fail open — show standard filing prompt (same as current behavior)
                  setDepthEvaluation({
                    meaningful: true,
                    reason: 'Gate failed — fail open',
                    topics: [],
                  });
                } finally {
                  setDepthEvaluating(false);
                }
              } else if (effectiveMode === 'homework') {
                // Homework: always show filing prompt (unchanged)
                setShowFilingPrompt(true);
              } else {
```

Add the required imports and props to `useSessionActions`:
- Add `setDepthEvaluation`, `setDepthEvaluating` to the hook's params interface
- Add `client` (from `useApiClient()`) and `assertOk` import
- Import `DepthEvaluation` from `@eduagent/schemas`

- [ ] **Step 5: Remove shouldAutoFile for freeform**

The `shouldAutoFile` function is still used — but only for the freeform auto-file path which is now replaced by depth evaluation. Keep the function (it's exported and tested) but the freeform branch of `handleEndSession` no longer calls it. The existing tests still pass.

- [ ] **Step 6: Pass depth state to SessionFooter**

In `session/index.tsx`, extend the `SessionFooter` props to include:

```ts
  <SessionFooter
    // ... existing props ...
    depthEvaluation={depthEvaluation}
    depthEvaluating={depthEvaluating}
  />
```

- [ ] **Step 7: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: There will be type errors because `SessionFooter` doesn't accept the new props yet — that's expected, handled in Task 6.

- [ ] **Step 8: Commit (may need to defer until Task 6 completes for typecheck)**

```
feat(mobile): remove visible classification from freeform + depth evaluation gate [FR-ASK-1][FR-ASK-3]
```

---

## Task 6: SessionFooter State Machine

Rebuild the SessionFooter component with the state machine from the spec: evaluating → meaningful (single/multi-topic) → not-meaningful → fail-open → filing states.

**Files:**
- Create: `apps/mobile/src/app/(app)/session/_helpers/SessionFooter.test.tsx`
- Modify: `apps/mobile/src/app/(app)/session/_helpers/SessionFooter.tsx`

**Read first:** `apps/mobile/src/app/(app)/session/_helpers/SessionFooter.tsx` (current full component)

### 6A: Tests first

- [ ] **Step 1: Write tests for all footer states**

```tsx
// apps/mobile/src/app/(app)/session/_helpers/SessionFooter.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SessionFooter } from './SessionFooter';
import type { DepthEvaluation } from '@eduagent/schemas';

// Minimal props factory
function makeProps(overrides: Partial<React.ComponentProps<typeof SessionFooter>> = {}) {
  return {
    showFilingPrompt: false,
    filingDismissed: false,
    filing: { isPending: false, mutateAsync: jest.fn() } as never,
    activeSessionId: 'sess-1',
    effectiveMode: 'freeform',
    filingTopicHint: 'How fish breathe',
    setShowFilingPrompt: jest.fn(),
    setFilingDismissed: jest.fn(),
    navigateToSessionSummary: jest.fn(),
    router: { replace: jest.fn() } as never,
    sessionExpired: false,
    notePromptOffered: false,
    showNoteInput: false,
    setShowNoteInput: jest.fn(),
    sessionNoteSavedRef: { current: false },
    topicId: undefined,
    upsertNote: { isPending: false, mutate: jest.fn() } as never,
    colors: { primary: '#00BFA5' } as never,
    userMessageCount: 5,
    showQuestionCount: false,
    showBookLink: false,
    depthEvaluation: null,
    depthEvaluating: false,
    onAskAnother: jest.fn(),
    onFileTopic: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('SessionFooter', () => {
  it('shows skeleton shimmer while depth is evaluating', () => {
    const { getByTestId } = render(
      <SessionFooter {...makeProps({ showFilingPrompt: true, depthEvaluating: true })} />
    );
    expect(getByTestId('depth-evaluating-skeleton')).toBeTruthy();
  });

  it('shows single-topic filing prompt for meaningful session with 1 topic', () => {
    const evaluation: DepthEvaluation = {
      meaningful: true,
      reason: 'Deep session',
      topics: [{ summary: 'How fish breathe', depth: 'substantial' }],
    };
    const { getByText, getByTestId } = render(
      <SessionFooter {...makeProps({ showFilingPrompt: true, depthEvaluation: evaluation })} />
    );
    expect(getByText(/How fish breathe/)).toBeTruthy();
    expect(getByTestId('filing-prompt-accept')).toBeTruthy();
    expect(getByTestId('filing-prompt-dismiss')).toBeTruthy();
  });

  it('shows multi-topic chips for meaningful session with 2+ topics', () => {
    const evaluation: DepthEvaluation = {
      meaningful: true,
      reason: 'Multiple topics',
      topics: [
        { summary: 'Fish breathing', depth: 'substantial' },
        { summary: 'Ocean pollution', depth: 'partial' },
        { summary: 'Whale songs', depth: 'introduced' }, // should be filtered out
      ],
    };
    const { getByText, queryByText, getByTestId } = render(
      <SessionFooter {...makeProps({ showFilingPrompt: true, depthEvaluation: evaluation })} />
    );
    expect(getByText('Fish breathing')).toBeTruthy();
    expect(getByText('Ocean pollution')).toBeTruthy();
    expect(queryByText('Whale songs')).toBeNull(); // 'introduced' filtered out
    expect(getByTestId('filing-dismiss-all')).toBeTruthy();
  });

  it('shows quick close for not-meaningful session', () => {
    const evaluation: DepthEvaluation = {
      meaningful: false,
      reason: 'Quick Q&A',
      topics: [],
    };
    const { getByText, getByTestId } = render(
      <SessionFooter {...makeProps({ showFilingPrompt: true, depthEvaluation: evaluation })} />
    );
    expect(getByText(/Anything else on your mind/)).toBeTruthy();
    expect(getByTestId('ask-another-button')).toBeTruthy();
    expect(getByTestId('done-button')).toBeTruthy();
  });

  it('shows standard filing prompt on fail-open (meaningful=true, no topics)', () => {
    const evaluation: DepthEvaluation = {
      meaningful: true,
      reason: 'Gate timeout — fail open',
      topics: [],
    };
    const { getByTestId } = render(
      <SessionFooter {...makeProps({ showFilingPrompt: true, depthEvaluation: evaluation })} />
    );
    // Fail-open with no topics → standard filing prompt (same as current)
    expect(getByTestId('filing-prompt-accept')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest SessionFooter.test --no-coverage`
Expected: FAIL — component doesn't accept new props yet.

### 6B: Implement the state machine

- [ ] **Step 3: Rewrite SessionFooter.tsx**

Replace the content of `apps/mobile/src/app/(app)/session/_helpers/SessionFooter.tsx`:

```tsx
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { QuestionCounter, LibraryPrompt } from '../../../../components/session';
import { NoteInput } from '../../../../components/library/NoteInput';
import type { useFiling } from '../../../../hooks/use-filing';
import type { useUpsertNote } from '../../../../hooks/use-notes';
import { formatApiError } from '../../../../lib/format-api-error';
import type { Router } from 'expo-router';
import type { useThemeColors } from '../../../../lib/theme';
import type { DepthEvaluation, DetectedTopic } from '@eduagent/schemas';

export interface SessionFooterProps {
  // Filing prompt
  showFilingPrompt: boolean;
  filingDismissed: boolean;
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  effectiveMode: string;
  filingTopicHint?: string;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: () => void;
  router: Router;

  // Depth evaluation (FR-ASK-3)
  depthEvaluation: DepthEvaluation | null;
  depthEvaluating: boolean;
  onAskAnother?: () => void;
  onFileTopic?: (topic: DetectedTopic) => Promise<void>;

  // Session expired
  sessionExpired: boolean;

  // Note prompt
  notePromptOffered: boolean;
  showNoteInput: boolean;
  setShowNoteInput: React.Dispatch<React.SetStateAction<boolean>>;
  sessionNoteSavedRef: React.MutableRefObject<boolean>;
  topicId: string | undefined;
  upsertNote: ReturnType<typeof useUpsertNote>;
  colors: ReturnType<typeof useThemeColors>;

  // Question count and book link
  userMessageCount: number;
  showQuestionCount: boolean;
  showBookLink: boolean;
}

export function SessionFooter({
  showFilingPrompt,
  filingDismissed,
  filing,
  activeSessionId,
  effectiveMode,
  filingTopicHint,
  setShowFilingPrompt,
  setFilingDismissed,
  navigateToSessionSummary,
  router,
  depthEvaluation,
  depthEvaluating,
  onAskAnother,
  onFileTopic,
  sessionExpired,
  notePromptOffered,
  showNoteInput,
  setShowNoteInput,
  sessionNoteSavedRef,
  topicId,
  upsertNote,
  colors,
  userMessageCount,
  showQuestionCount,
  showBookLink,
}: SessionFooterProps) {
  const isFreeform = effectiveMode === 'freeform';

  return (
    <>
      {showFilingPrompt && !filingDismissed && (
        isFreeform ? (
          <FreeformFilingArea
            depthEvaluating={depthEvaluating}
            depthEvaluation={depthEvaluation}
            filing={filing}
            activeSessionId={activeSessionId}
            filingTopicHint={filingTopicHint}
            setShowFilingPrompt={setShowFilingPrompt}
            setFilingDismissed={setFilingDismissed}
            navigateToSessionSummary={navigateToSessionSummary}
            router={router}
            onAskAnother={onAskAnother}
            onFileTopic={onFileTopic}
          />
        ) : (
          <StandardFilingPrompt
            filing={filing}
            activeSessionId={activeSessionId}
            effectiveMode={effectiveMode}
            filingTopicHint={filingTopicHint}
            setShowFilingPrompt={setShowFilingPrompt}
            setFilingDismissed={setFilingDismissed}
            navigateToSessionSummary={navigateToSessionSummary}
            router={router}
          />
        )
      )}
      {sessionExpired && (
        <View className="bg-surface rounded-card p-4 mt-2 mb-4">
          <Text className="text-body font-semibold text-text-primary mb-2">
            Session expired
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            This session is no longer available. Start a new one from home or
            your library.
          </Text>
          <Pressable
            onPress={() => router.replace('/(app)/home' as never)}
            className="bg-primary rounded-button py-3 items-center"
            testID="session-expired-go-home"
            accessibilityRole="button"
            accessibilityLabel="Go home"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Go Home
            </Text>
          </Pressable>
        </View>
      )}
      {notePromptOffered && !showNoteInput && !sessionNoteSavedRef.current && (
        <Pressable
          className="bg-primary/10 rounded-lg px-4 py-3 mx-4 mb-2 flex-row items-center"
          onPress={() => setShowNoteInput(true)}
          testID="session-note-prompt"
          accessibilityRole="button"
          accessibilityLabel="Write a note"
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={colors.primary}
          />
          <Text className="text-body text-primary font-semibold ml-2">
            Write a note
          </Text>
        </Pressable>
      )}
      {showNoteInput && (
        <View className="px-4 mb-2">
          <NoteInput
            onSave={(content) => {
              if (!topicId) {
                Alert.alert(
                  'Cannot save note',
                  'No topic selected for this session.'
                );
                return;
              }
              const separator = !sessionNoteSavedRef.current
                ? `--- ${new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })} ---\n`
                : '';
              upsertNote.mutate(
                {
                  topicId,
                  content: `${separator}${content}`,
                  append: true,
                },
                {
                  onSuccess: () => {
                    sessionNoteSavedRef.current = true;
                    setShowNoteInput(false);
                  },
                  onError: (err) => {
                    Alert.alert("Couldn't save your note", formatApiError(err));
                  },
                }
              );
            }}
            onCancel={() => setShowNoteInput(false)}
            saving={upsertNote.isPending}
          />
        </View>
      )}
      {showQuestionCount && <QuestionCounter count={userMessageCount} />}
      {showBookLink && <LibraryPrompt />}
    </>
  );
}

// ---------------------------------------------------------------------------
// FR-ASK-3/4: Freeform filing area — state machine driven by depth evaluation
// ---------------------------------------------------------------------------

function FreeformFilingArea({
  depthEvaluating,
  depthEvaluation,
  filing,
  activeSessionId,
  filingTopicHint,
  setShowFilingPrompt,
  setFilingDismissed,
  navigateToSessionSummary,
  router,
  onAskAnother,
  onFileTopic,
}: {
  depthEvaluating: boolean;
  depthEvaluation: DepthEvaluation | null;
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  filingTopicHint?: string;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: () => void;
  router: Router;
  onAskAnother?: () => void;
  onFileTopic?: (topic: DetectedTopic) => Promise<void>;
}) {
  // State: Evaluating
  if (depthEvaluating || !depthEvaluation) {
    return (
      <View
        className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
        testID="depth-evaluating-skeleton"
      >
        <View className="h-5 w-48 bg-surface rounded mb-3 animate-pulse" />
        <View className="h-4 w-64 bg-surface rounded mb-4 animate-pulse" />
        <View className="flex-row gap-3">
          <View className="flex-1 h-11 bg-surface rounded-xl animate-pulse" />
          <View className="w-24 h-11 bg-surface rounded-xl animate-pulse" />
        </View>
      </View>
    );
  }

  // State: Not meaningful
  if (!depthEvaluation.meaningful) {
    return (
      <View
        className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
        testID="not-meaningful-close"
      >
        <Text className="text-lg font-semibold text-text-primary mb-2">
          Got it!
        </Text>
        <Text className="text-body-sm text-text-secondary mb-4">
          Anything else on your mind?
        </Text>
        <View className="flex-row gap-3">
          <Pressable
            onPress={onAskAnother}
            className="flex-1 bg-primary rounded-xl py-3 items-center min-h-[44px] justify-center"
            testID="ask-another-button"
            accessibilityRole="button"
            accessibilityLabel="Ask another question"
          >
            <Text className="text-text-inverse font-semibold">
              Ask another question
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setFilingDismissed(true);
              navigateToSessionSummary();
            }}
            className="px-4 py-3 min-h-[44px] justify-center"
            testID="done-button"
            accessibilityRole="button"
            accessibilityLabel="I'm done"
          >
            <Text className="text-text-secondary">I'm done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // State: Meaningful — filter topics to substantial + partial only
  const fileableTopics = depthEvaluation.topics.filter(
    (t) => t.depth === 'substantial' || t.depth === 'partial'
  );

  // Multi-topic (2+ fileable topics)
  if (fileableTopics.length >= 2) {
    return (
      <MultiTopicFiling
        topics={fileableTopics}
        filing={filing}
        activeSessionId={activeSessionId}
        setFilingDismissed={setFilingDismissed}
        navigateToSessionSummary={navigateToSessionSummary}
        router={router}
        onFileTopic={onFileTopic}
      />
    );
  }

  // Single topic or fail-open (meaningful but 0-1 topics)
  const topicSummary = fileableTopics[0]?.summary ?? filingTopicHint;
  return (
    <StandardFilingPrompt
      filing={filing}
      activeSessionId={activeSessionId}
      effectiveMode="freeform"
      filingTopicHint={topicSummary}
      setShowFilingPrompt={setShowFilingPrompt}
      setFilingDismissed={setFilingDismissed}
      navigateToSessionSummary={navigateToSessionSummary}
      router={router}
    />
  );
}

// ---------------------------------------------------------------------------
// Multi-topic filing with selectable chips
// ---------------------------------------------------------------------------

function MultiTopicFiling({
  topics,
  filing,
  activeSessionId,
  setFilingDismissed,
  navigateToSessionSummary,
  router,
  onFileTopic,
}: {
  topics: DetectedTopic[];
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: () => void;
  router: Router;
  onFileTopic?: (topic: DetectedTopic) => Promise<void>;
}) {
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [filingTopics, setFilingTopics] = useState<Set<string>>(new Set());
  const [failedTopics, setFailedTopics] = useState<Set<string>>(new Set());
  const [filedTopics, setFiledTopics] = useState<Set<string>>(new Set());

  const toggleTopic = (summary: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(summary)) next.delete(summary);
      else next.add(summary);
      return next;
    });
  };

  const handleFileSelected = async () => {
    const toFile = topics.filter((t) => selectedTopics.has(t.summary));
    for (const topic of toFile) {
      setFilingTopics((prev) => new Set(prev).add(topic.summary));
      try {
        if (onFileTopic) {
          await onFileTopic(topic);
        } else {
          await filing.mutateAsync({
            sessionId: activeSessionId ?? undefined,
            sessionMode: 'freeform',
            selectedSuggestion: topic.summary,
          });
        }
        setFiledTopics((prev) => new Set(prev).add(topic.summary));
      } catch {
        setFailedTopics((prev) => new Set(prev).add(topic.summary));
      } finally {
        setFilingTopics((prev) => {
          const next = new Set(prev);
          next.delete(topic.summary);
          return next;
        });
      }
    }
    // Navigate after all filed
    navigateToSessionSummary();
  };

  return (
    <View
      className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
      testID="multi-topic-filing"
    >
      <Text className="text-lg font-semibold text-text-primary mb-2">
        You touched on a few things today!
      </Text>
      <Text className="text-body-sm text-text-secondary mb-4">
        Any of these you'd want to explore more?
      </Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {topics.map((topic) => {
          const isFiling = filingTopics.has(topic.summary);
          const isFailed = failedTopics.has(topic.summary);
          const isFiled = filedTopics.has(topic.summary);
          const isSelected = selectedTopics.has(topic.summary);

          return (
            <Pressable
              key={topic.summary}
              onPress={() => {
                if (isFailed) {
                  setFailedTopics((prev) => {
                    const next = new Set(prev);
                    next.delete(topic.summary);
                    return next;
                  });
                }
                if (!isFiling && !isFiled) toggleTopic(topic.summary);
              }}
              disabled={isFiling || isFiled}
              className={`px-3 py-2 rounded-full border min-h-[36px] justify-center ${
                isFiled
                  ? 'bg-primary/10 border-primary'
                  : isFailed
                  ? 'bg-error/10 border-error'
                  : isSelected
                  ? 'bg-primary/20 border-primary'
                  : 'bg-surface border-surface-elevated'
              }`}
              testID={`topic-chip-${topic.summary.replace(/\s+/g, '-').toLowerCase()}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected || isFiled }}
            >
              <View className="flex-row items-center gap-1">
                {isFiling && <ActivityIndicator size="small" />}
                {isFiled && (
                  <Ionicons name="checkmark-circle" size={14} color="#00BFA5" />
                )}
                {isFailed && (
                  <Ionicons name="alert-circle" size={14} color="#FF5252" />
                )}
                <Text
                  className={`text-body-sm ${
                    isSelected || isFiled
                      ? 'text-primary font-semibold'
                      : 'text-text-primary'
                  }`}
                >
                  {topic.summary}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row gap-3">
        {selectedTopics.size > 0 && (
          <Pressable
            onPress={handleFileSelected}
            disabled={filing.isPending}
            className="flex-1 bg-primary rounded-xl py-3 items-center min-h-[44px] justify-center"
            testID="file-selected-topics"
            accessibilityRole="button"
            accessibilityLabel={`Add ${selectedTopics.size} topic${selectedTopics.size > 1 ? 's' : ''} to library`}
          >
            {filing.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-text-inverse font-semibold">
                Add to library
              </Text>
            )}
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            setFilingDismissed(true);
            navigateToSessionSummary();
          }}
          className="px-4 py-3 min-h-[44px] justify-center"
          testID="filing-dismiss-all"
          accessibilityRole="button"
          accessibilityLabel="I'm good, skip filing"
        >
          <Text className="text-text-secondary">I'm good</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Standard filing prompt — unchanged behavior for non-freeform + fallback
// ---------------------------------------------------------------------------

function StandardFilingPrompt({
  filing,
  activeSessionId,
  effectiveMode,
  filingTopicHint,
  setShowFilingPrompt,
  setFilingDismissed,
  navigateToSessionSummary,
  router,
}: {
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  effectiveMode: string;
  filingTopicHint?: string;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: () => void;
  router: Router;
}) {
  return (
    <View
      className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
      testID="filing-prompt"
    >
      <Text className="text-lg font-semibold text-text-primary mb-2">
        Add to your library?
      </Text>
      <Text className="text-body-sm text-text-secondary mb-4">
        {filingTopicHint
          ? `You explored "${filingTopicHint}". Keep it in your library?`
          : 'We can organize what you learned into your library.'}
      </Text>
      <View className="flex-row gap-3">
        <Pressable
          onPress={async () => {
            try {
              const result = await filing.mutateAsync({
                sessionId: activeSessionId ?? undefined,
                sessionMode: effectiveMode as 'freeform' | 'homework',
              });
              setShowFilingPrompt(false);
              router.replace({
                pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
                params: {
                  subjectId: result.shelfId,
                  bookId: result.bookId,
                },
              } as never);
            } catch {
              Alert.alert(
                "Couldn't add to library",
                'Your session is still saved.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setFilingDismissed(true);
                      navigateToSessionSummary();
                    },
                  },
                ]
              );
            }
          }}
          disabled={filing.isPending}
          className="flex-1 bg-primary rounded-xl py-3 items-center min-h-[44px] justify-center"
          testID="filing-prompt-accept"
          accessibilityRole="button"
          accessibilityLabel={
            filing.isPending ? 'Adding to library' : 'Yes, add to library'
          }
        >
          {filing.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-text-inverse font-semibold">
              Yes, add it
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => {
            setFilingDismissed(true);
            navigateToSessionSummary();
          }}
          disabled={filing.isPending}
          className="px-4 py-3 min-h-[44px] justify-center"
          testID="filing-prompt-dismiss"
          accessibilityRole="button"
          accessibilityLabel="No thanks, skip"
        >
          <Text className="text-text-secondary">No thanks</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/mobile && pnpm exec jest SessionFooter.test --no-coverage`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Run typecheck (both mobile + API)**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: There may be type errors in `session/index.tsx` if prop wiring is incomplete. Fix any remaining type mismatches by ensuring all new props are passed through.

- [ ] **Step 6: Commit**

```
feat(mobile): SessionFooter state machine — depth evaluation, multi-topic chips [FR-ASK-3][FR-ASK-4]
```

---

## Task 7: Depth Evaluation Hook + Multi-Topic Filing

Mobile hook for the depth evaluation API call, and extension of `useFiling` for sequential multi-topic filing.

**Files:**
- Create: `apps/mobile/src/hooks/use-depth-evaluation.ts`
- Modify: `apps/mobile/src/hooks/use-filing.ts`

### 7A: Depth evaluation hook

- [ ] **Step 1: Create the hook**

```ts
// apps/mobile/src/hooks/use-depth-evaluation.ts
import { useMutation } from '@tanstack/react-query';
import type { DepthEvaluation } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';

interface DepthEvaluationInput {
  sessionId: string;
}

export function useDepthEvaluation() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: DepthEvaluationInput) => {
      const res = await client.sessions[':sessionId']['evaluate-depth'].$post({
        param: { sessionId: input.sessionId },
      });
      await assertOk(res);
      return (await res.json()) as DepthEvaluation;
    },
  });
}
```

### 7B: Multi-topic filing

- [ ] **Step 2: Add useMultiTopicFiling to use-filing.ts**

Add to `apps/mobile/src/hooks/use-filing.ts`:

```ts
import type { DetectedTopic } from '@eduagent/schemas';

// ... existing useFiling() stays unchanged ...

/**
 * Files multiple topics sequentially. Each topic gets its own
 * fileToLibrary call so library state stays consistent (AD-ASK-4).
 */
export function useMultiTopicFiling() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      topics: DetectedTopic[];
    }) => {
      const results: FilingResult[] = [];
      for (const topic of input.topics) {
        const res = await client.filing.$post({
          json: {
            sessionId: input.sessionId,
            sessionMode: 'freeform',
            selectedSuggestion: topic.summary,
          },
        });
        await assertOk(res);
        results.push((await res.json()) as FilingResult);
      }
      return results;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
      void queryClient.invalidateQueries({ queryKey: ['books'] });
      void queryClient.invalidateQueries({ queryKey: ['book-suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['topic-suggestions'] });
    },
  });
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```
feat(mobile): depth evaluation hook + multi-topic filing [FR-ASK-3][FR-ASK-4]
```

---

## Task 8: Session Completed Pipeline Update

Modify the Inngest `session-completed` function to gate the filing wait on depth evaluation for freeform sessions. If the session was auto-closed (abandoned), skip filing entirely per FR-ASK-5.

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts`

**Read first:** `apps/api/src/inngest/functions/session-completed.ts:106-160` (existing filing wait logic)

- [ ] **Step 1: Add depth evaluation to freeform filing gate**

In `apps/api/src/inngest/functions/session-completed.ts`, modify the filing wait logic (lines ~127-133). The current code waits for filing for all sessions without a topicId. In the new flow, abandoned sessions (auto-closed) should skip filing entirely.

After the existing `sessionType`/`topicId` check and before the `waitForEvent`:

```ts
    // FR-ASK-5: Abandoned sessions (auto-closed) skip filing entirely.
    // The summaryStatus from the event tells us how the session ended.
    const isAbandoned = summaryStatus === 'auto_closed';

    if ((sessionType === 'homework' || !topicId) && !isAbandoned) {
      await step.waitForEvent('wait-for-filing', {
        event: 'app/filing.completed',
        match: 'data.sessionId',
        timeout: '60s',
      });
    }
```

Replace the existing `if (sessionType === 'homework' || !topicId)` block with this updated version.

- [ ] **Step 2: Run session-completed tests**

Run: `cd apps/api && pnpm exec jest session-completed --no-coverage`
Expected: PASS

- [ ] **Step 3: Commit**

```
feat(api): skip filing wait for abandoned freeform sessions [FR-ASK-5]
```

---

## Task 9: Resume Nudge on Home Screen

When the kid opens the app and has a recent auto-closed meaningful freeform session (>= 5 exchanges), show a dismissable "Pick up where you left off?" nudge card.

**Files:**
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx`
- Modify: `apps/api/src/routes/sessions.ts` (new lightweight endpoint)

**Read first:** `apps/mobile/src/components/home/LearnerScreen.tsx:126-263` (intent cards logic), `apps/mobile/src/lib/session-recovery.ts` (existing recovery marker pattern)

### 9A: API endpoint for abandoned session check

- [ ] **Step 1: Add endpoint to sessions route**

Add to `apps/api/src/routes/sessions.ts`:

```ts
  // FR-ASK-5: Check for most recent auto-closed freeform session eligible for resume nudge
  .get('/sessions/resume-nudge', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    // Find the most recent auto-closed freeform session with >= 5 exchanges
    const [candidate] = await db
      .select({
        id: learningSessions.id,
        rawInput: learningSessions.rawInput,
        exchangeCount: learningSessions.exchangeCount,
        createdAt: learningSessions.createdAt,
      })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, profileId),
          eq(learningSessions.status, 'closed'),
          sql`${learningSessions.metadata}->>'effectiveMode' = 'freeform'
              OR ${learningSessions.topicId} IS NULL`,
          gte(learningSessions.exchangeCount, 5),
          // Must have been auto-closed
          sql`EXISTS (
            SELECT 1 FROM ${sessionSummaries}
            WHERE ${sessionSummaries.sessionId} = ${learningSessions.id}
              AND ${sessionSummaries.status} = 'auto_closed'
          )`,
          // Only within last 7 days
          gte(learningSessions.createdAt, sql`NOW() - INTERVAL '7 days'`),
        )
      )
      .orderBy(desc(learningSessions.createdAt))
      .limit(1);

    if (!candidate) {
      return c.json({ nudge: null });
    }

    // Get the dominant topic from the first user message
    const [firstMessage] = await db
      .select({ content: sessionEvents.content })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.sessionId, candidate.id),
          eq(sessionEvents.profileId, profileId),
          eq(sessionEvents.eventType, 'user_message')
        )
      )
      .orderBy(asc(sessionEvents.createdAt))
      .limit(1);

    return c.json({
      nudge: {
        sessionId: candidate.id,
        topicHint: firstMessage?.content?.slice(0, 80) ?? 'your last session',
        exchangeCount: candidate.exchangeCount,
        createdAt: candidate.createdAt,
      },
    });
  })
```

Add the required DB imports at the top of the file:

```ts
import { sessionSummaries } from '@eduagent/database';
import { gte } from 'drizzle-orm';
```

Note: This endpoint uses `learningSessions` which must also be imported from `@eduagent/database`. Check that the import exists or add it.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

### 9B: Mobile resume nudge card

- [ ] **Step 3: Add useResumeNudge hook**

Create a simple hook or inline the query in LearnerScreen. Given the existing pattern uses `useContinueSuggestion`, follow the same pattern:

Add to `apps/mobile/src/hooks/use-progress.ts` (or create a new hook file):

```ts
export function useResumeNudge() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['resume-nudge'],
    queryFn: async () => {
      const res = await client.sessions['resume-nudge'].$get();
      await assertOk(res);
      return (await res.json()) as {
        nudge: {
          sessionId: string;
          topicHint: string;
          exchangeCount: number;
          createdAt: string;
        } | null;
      };
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}
```

- [ ] **Step 4: Add nudge card to LearnerScreen intent cards**

In `apps/mobile/src/components/home/LearnerScreen.tsx`, add the resume nudge card logic inside the `useMemo` that builds `cards` (around line ~126):

Import the hook and add state:

```ts
import { useResumeNudge } from '../../hooks/use-progress';
// ...
const { data: resumeNudge } = useResumeNudge();
const [dismissedNudgeSessionId, setDismissedNudgeSessionId] = useState<string | null>(null);
```

Then, inside the cards builder `useMemo`, after the `recoveryMarker` and `continueSuggestion` blocks but before the other intent cards, add:

```ts
    // FR-ASK-5: Resume nudge for abandoned meaningful freeform sessions
    if (
      resumeNudge?.nudge &&
      resumeNudge.nudge.sessionId !== dismissedNudgeSessionId &&
      !recoveryMarker &&
      !continueSuggestion
    ) {
      cards.push({
        testID: 'intent-resume-nudge',
        title: 'Pick up where you left off?',
        subtitle: `You were exploring "${resumeNudge.nudge.topicHint}"`,
        icon: 'refresh-outline',
        variant: 'highlight',
        onPress: () => {
          router.push({
            pathname: '/(app)/session',
            params: {
              mode: 'freeform',
              rawInput: resumeNudge.nudge!.topicHint,
            },
          } as never);
        },
        onDismiss: () => {
          setDismissedNudgeSessionId(resumeNudge.nudge!.sessionId);
        },
      });
    }
```

Add `resumeNudge` and `dismissedNudgeSessionId` to the `useMemo` dependency array.

- [ ] **Step 5: Write test**

```tsx
// In LearnerScreen.test.tsx (add to existing test file)
it('shows resume nudge for abandoned meaningful session', () => {
  // Mock useResumeNudge to return a nudge
  // Verify the nudge card renders with correct text
  // Verify dismiss works
});
```

- [ ] **Step 6: Run tests**

Run: `cd apps/mobile && pnpm exec jest LearnerScreen.test --no-coverage`
Expected: PASS

- [ ] **Step 7: Commit**

```
feat(mobile,api): resume nudge for abandoned meaningful freeform sessions [FR-ASK-5]
```

---

## Task 10: Observability Events

Add remaining Inngest event emissions for depth gate monitoring. Most classification events are already emitted in Task 4. This task adds the gate decision events.

**Files:**
- Modify: `apps/api/src/services/session/session-depth.ts`
- Modify: `apps/api/src/routes/sessions.ts`

- [ ] **Step 1: Emit gate decision event from evaluate-depth endpoint**

In `apps/api/src/routes/sessions.ts`, in the evaluate-depth handler, after calling `evaluateSessionDepth`, emit the event:

```ts
    // Observability: emit gate decision event
    void inngest.send({
      name: 'app/ask.gate_decision',
      data: {
        sessionId,
        meaningful: result.meaningful,
        reason: result.reason,
        exchangeCount: transcript.exchanges.length,
        learnerWordCount: transcript.exchanges.reduce(
          (sum, e) => sum + e.userMessage.split(/\s+/).filter(Boolean).length,
          0
        ),
        topicCount: result.topics.length,
        method: result.reason.includes('timeout') ? 'heuristic' : (
          transcript.exchanges.length < 3 ? 'heuristic' :
          transcript.exchanges.length >= 5 ? 'heuristic' : 'llm'
        ),
      },
    });
```

Import `inngest` if not already imported:

```ts
import { inngest } from '../inngest/client';
```

- [ ] **Step 2: Add gate timeout event to session-depth.ts**

In the `failOpen` function in `session-depth.ts`, the timeout event should be emitted by the caller (the route handler), not the service itself (to keep the service pure). Add the event emission in the route handler's catch block instead.

Update the evaluate-depth route handler to detect fail-open:

```ts
    const isFailOpen = result.reason.includes('timeout') || result.reason.includes('fail open');
    if (isFailOpen) {
      void inngest.send({
        name: 'app/ask.gate_timeout',
        data: {
          sessionId,
          exchangeCount: transcript.exchanges.length,
        },
      });
    }
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```
feat(api): observability events for ask flow gate + classification [FR-ASK-2][FR-ASK-3]
```

---

## Integration Verification

After all tasks are complete, run the full validation suite.

- [ ] **Step 1: API typecheck + lint + tests**

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:lint
pnpm exec nx run api:test
```

- [ ] **Step 2: Mobile typecheck + lint + tests**

```bash
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --no-coverage
```

- [ ] **Step 3: Schemas build**

```bash
cd packages/schemas && pnpm exec tsc --noEmit
```

- [ ] **Step 4: Final commit (if any remaining changes)**

```
chore: integration fixes for ask flow redesign
```

---

## Spec Coverage Verification

| Spec Requirement | Task |
|---|---|
| FR-ASK-1: No visible classification in freeform | Task 5 |
| FR-ASK-2: Silent background classification after exchange 2 | Task 4 |
| FR-ASK-3: Meaningful-exchange gate (heuristics + LLM, 2s cap) | Task 2 + Task 3 |
| FR-ASK-4: Post-session filing with topic selection | Task 6 + Task 7 |
| FR-ASK-5: Abandoned session handling + resume nudge | Task 8 + Task 9 |
| AD-ASK-1: Classification enriches prompts, not DB records | Task 4 (metadata JSONB, not subjectId) |
| AD-ASK-2: Pedagogy adaptation via pedagogy hint | Task 4 (language regex + enrichment) |
| AD-ASK-3: Heuristics first, LLM second | Task 2 |
| AD-ASK-4: Multi-topic filing as independent calls | Task 7 |
| SessionFooter state machine (all 7 states) | Task 6 |
| Resume nudge stacking policy | Task 9 (most recent only, dismissable) |
| Observability events (6 event types) | Task 4 + Task 10 |
| Failure modes table | Task 2 (fail-open), Task 6 (filing-failed state), Task 8 (abandoned skip) |
