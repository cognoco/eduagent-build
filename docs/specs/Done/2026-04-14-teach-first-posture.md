# Teach-First Posture + Guided Curriculum Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LLM's passive Socratic default with a teach-first posture that explains concepts and checks understanding, add a "Build my learning path" entry-point on the book screen, and silently auto-file freeform sessions on close.

**Architecture:** Five coordinated changes: (1-2) rewrite the system prompt role identity + session-type guidance + add a first-exchange teaching opener conditional, (3) update client-side greeting strings, (4) add a curriculum entry-point button on the book detail screen, (5) auto-file freeform sessions at close with a non-blocking confirmation toast. No new API routes, no schema migrations.

**Tech Stack:** Hono API (system prompt assembly), React Native / Expo Router (mobile UI), Jest (unit + integration tests)

**Spec:** `docs/superpowers/specs/2026-04-14-teach-first-posture-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/services/exchanges.ts` | Modify | Role identity (line 197-201), session-type LEARNING (line 703-710), first-exchange opener conditional |
| `apps/api/src/services/exchanges.test.ts` | Modify | Tests for prompt text changes and exchange-count gating |
| `apps/api/src/services/session/session-exchange.ts` | Modify | Plumb `exchangeCount` into `ExchangeContext` (line 536) |
| `apps/mobile/src/components/session/sessionModeConfig.ts` | Modify | `FIRST_SESSION.learning` (line 61), `getOpeningMessage` topic branch (line 123-124) |
| `apps/mobile/src/components/session/sessionModeConfig.test.ts` | Modify | Tests for updated greeting text |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` | Modify | Empty-state "Build my learning path" button (line 744-766), floating-bar secondary link (line 788-823) |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx` | Modify or Create | Tests for button visibility conditions |
| `apps/mobile/src/app/(app)/session/use-session-actions.ts` | Modify | Auto-filing branch in `handleEndSession` (line 296-300) |
| `apps/mobile/src/app/(app)/session/use-session-actions.test.ts` | Create | Tests for auto-filing trigger conditions |

---

## Task 1: Plumb `exchangeCount` into `ExchangeContext`

**Files:**
- Modify: `apps/api/src/services/exchanges.ts:31-89` (interface)
- Modify: `apps/api/src/services/session/session-exchange.ts:536-581` (context assembly)
- Test: `apps/api/src/services/exchanges.test.ts`

**Why:** `buildSystemPrompt` currently has no way to know whether this is the first exchange or the 10th. The spec's Change 2 ("Just Start Teaching" opener) gates on `exchangeCount === 0`. We add it to the shared `ExchangeContext` interface and populate it from `session.exchangeCount` in `prepareExchangeContext`.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/services/exchanges.test.ts`, add a test that passes `exchangeCount` in the context and verifies `buildSystemPrompt` accepts it without error:

```typescript
it('accepts exchangeCount in the context', () => {
  const prompt = buildSystemPrompt({ ...baseContext, exchangeCount: 0 });
  expect(prompt).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest --testPathPattern exchanges.test.ts --no-coverage -t "accepts exchangeCount"`
Expected: TypeScript compilation error — `exchangeCount` does not exist on `ExchangeContext`.

- [ ] **Step 3: Add `exchangeCount` to `ExchangeContext` interface**

In `apps/api/src/services/exchanges.ts`, add after line 88 (`inputMode?: InputMode;`), before the closing `}`:

```typescript
  /** Number of completed exchanges in this session — 0 means the LLM's first turn */
  exchangeCount?: number;
```

- [ ] **Step 4: Populate `exchangeCount` in `prepareExchangeContext`**

In `apps/api/src/services/session/session-exchange.ts`, inside the context object literal (after line 580, `inputMode: session.inputMode,`), add:

```typescript
    // Teach-first: expose exchange count so buildSystemPrompt can gate first-exchange behaviour
    exchangeCount: session.exchangeCount,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest --testPathPattern exchanges.test.ts --no-coverage -t "accepts exchangeCount"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/exchanges.ts apps/api/src/services/session/session-exchange.ts apps/api/src/services/exchanges.test.ts
git commit -m "feat(api): plumb exchangeCount into ExchangeContext [TF-1]"
```

---

## Task 2: Teach-First Role Identity

**Files:**
- Modify: `apps/api/src/services/exchanges.ts:197-201`
- Test: `apps/api/src/services/exchanges.test.ts`

**Why:** The current role identity says "a mate asks the right question at the right time so the learner discovers the answer themselves." This creates a passive Socratic posture. The spec replaces it with a teach-then-verify identity.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/services/exchanges.test.ts`, add:

```typescript
it('uses teach-first role identity (not Socratic)', () => {
  const prompt = buildSystemPrompt(baseContext);
  // New identity should be present
  expect(prompt).toContain('teaches clearly and checks understanding');
  // Old Socratic identity should be gone
  expect(prompt).not.toContain('asks the right question at the right time');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest --testPathPattern exchanges.test.ts --no-coverage -t "teach-first role identity"`
Expected: FAIL — prompt still contains old text.

- [ ] **Step 3: Replace role identity text**

In `apps/api/src/services/exchanges.ts`, replace lines 197-201:

Old:
```typescript
    sections.push(
      'You are MentoMate, a personalised learning mate. ' +
        'A mate does not lecture — a mate asks the right question at the right time so the learner discovers the answer themselves. ' +
        'Example: instead of "The mitochondria is the powerhouse of the cell," ask "What part of the cell do you think handles energy production, and why?"'
    );
```

New:
```typescript
    sections.push(
      'You are MentoMate, a personalised learning mate. ' +
        'A mate teaches clearly and checks understanding. Explain concepts using concrete examples, then ask a focused question to verify the learner understood. ' +
        'Draw out what the learner already knows before adding new material — but never withhold an explanation in the name of "discovery". ' +
        'If they get it, move to the next concept. If they don\'t, teach it differently — don\'t interrogate. ' +
        'Adapt your language complexity, examples, and tone to the learner\'s age (provided via the age-voice section below). ' +
        'A 9-year-old needs short sentences and everyday analogies. A 16-year-old needs precision and real-world context. An adult needs efficiency and respect for existing knowledge.'
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest --testPathPattern exchanges.test.ts --no-coverage -t "teach-first role identity"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/exchanges.ts apps/api/src/services/exchanges.test.ts
git commit -m "feat(api): teach-first role identity in system prompt [TF-2]"
```

---

## Task 3: Teach-First LEARNING Session Type Guidance

**Files:**
- Modify: `apps/api/src/services/exchanges.ts:703-710` (inside `getSessionTypeGuidance`)
- Test: `apps/api/src/services/exchanges.test.ts`

**Why:** The session-type LEARNING block currently says "Default to asking a question before explaining" — directly contradicting the teach-first posture. The spec replaces it with an explicit explain→verify→next cycle.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/services/exchanges.test.ts`, add:

```typescript
it('LEARNING session type uses explain-verify-next cycle', () => {
  const prompt = buildSystemPrompt({ ...baseContext, sessionType: 'learning' });
  expect(prompt).toContain('Teach the concept clearly using a concrete example');
  expect(prompt).toContain('explain → verify → next concept');
  // Old guidance should be gone
  expect(prompt).not.toContain('Default to asking a question before explaining');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest --testPathPattern exchanges.test.ts --no-coverage -t "explain-verify-next cycle"`
Expected: FAIL — prompt still contains old session-type text.

- [ ] **Step 3: Replace LEARNING session type guidance**

In `apps/api/src/services/exchanges.ts`, replace lines 703-710 inside `getSessionTypeGuidance`:

Old:
```typescript
  return (
    'Session type: LEARNING\n' +
    'Help the learner understand concepts deeply.\n' +
    'You may explain concepts, use examples, and teach new material — but guide first.\n' +
    'Default to asking a question before explaining. If the learner already has partial understanding, draw it out rather than overwriting it.\n' +
    'Only provide a direct explanation when the learner has clearly exhausted their own reasoning or explicitly asks "just tell me."\n' +
    'Balance explanation with questions to verify understanding.'
  );
```

New:
```typescript
  return (
    'Session type: LEARNING\n' +
    'Teach the concept clearly using a concrete example, then ask one question to verify understanding.\n' +
    'If the learner\'s response shows they already know it, acknowledge and move to the next concept.\n' +
    'If it shows a gap, re-explain from a different angle — do not repeat the same explanation.\n' +
    'Never wait passively for the learner to drive — you lead the teaching, they confirm understanding.\n' +
    'The cycle is: explain → verify → next concept.'
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest --testPathPattern exchanges.test.ts --no-coverage -t "explain-verify-next cycle"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/exchanges.ts apps/api/src/services/exchanges.test.ts
git commit -m "feat(api): teach-first LEARNING session type guidance [TF-3]"
```

---

## Task 4: First-Exchange Teaching Opener

**Files:**
- Modify: `apps/api/src/services/exchanges.ts` (inside `buildSystemPrompt`, after rawInput section ~line 254)
- Test: `apps/api/src/services/exchanges.test.ts`

**Why:** When a learner picks a topic and lands in a learning session, the LLM should not ask "What do you want to learn?" — the learner already answered that by choosing the topic. This conditional injects a "start teaching immediately" instruction on the first exchange only.

- [ ] **Step 1: Write failing tests for all three branches**

In `apps/api/src/services/exchanges.test.ts`, add:

```typescript
describe('first-exchange teaching opener', () => {
  it('injects "begin teaching immediately" when exchangeCount=0 and topicTitle present', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      exchangeCount: 0,
      topicTitle: 'Quadratic Equations',
      sessionType: 'learning',
    });
    expect(prompt).toContain('Begin teaching it immediately');
    expect(prompt).toContain('Do not ask what they want to learn');
  });

  it('injects rawInput anchor when exchangeCount=0 and only rawInput present', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      exchangeCount: 0,
      topicTitle: undefined,
      rawInput: 'How do volcanoes work?',
      sessionType: 'learning',
    });
    expect(prompt).toContain('Anchor your teaching to their stated intent and begin immediately');
  });

  it('does NOT inject opener when exchangeCount > 0', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      exchangeCount: 3,
      topicTitle: 'Quadratic Equations',
      sessionType: 'learning',
    });
    expect(prompt).not.toContain('Begin teaching it immediately');
  });

  it('does NOT inject opener for non-learning sessions', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      exchangeCount: 0,
      topicTitle: 'Quadratic Equations',
      sessionType: 'homework',
      homeworkMode: 'help_me',
    });
    expect(prompt).not.toContain('Begin teaching it immediately');
  });

  it('does NOT inject opener for freeform (no topic, no rawInput)', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      exchangeCount: 0,
      topicTitle: undefined,
      rawInput: undefined,
      sessionType: 'learning',
    });
    expect(prompt).not.toContain('Begin teaching it immediately');
    expect(prompt).not.toContain('Anchor your teaching');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest --testPathPattern exchanges.test.ts --no-coverage -t "first-exchange teaching opener"`
Expected: FAIL — no opener text injected yet.

- [ ] **Step 3: Add first-exchange conditional in `buildSystemPrompt`**

In `apps/api/src/services/exchanges.ts`, add after the rawInput section (after line 254, before the `// Session type` comment at line 256).

Note: `isLanguageMode` is declared at line 189 (`const isLanguageMode = context.pedagogyMode === 'four_strands'`) — well before this insertion point, so it's safely in scope.

```typescript
  // First-exchange teaching opener — tell the LLM to start teaching, not ask
  if (
    context.exchangeCount === 0 &&
    context.sessionType === 'learning' &&
    !isLanguageMode
  ) {
    if (context.topicTitle) {
      sections.push(
        'The learner chose this topic. Begin teaching it immediately. ' +
          'Do not ask what they want to learn — they already told you by choosing the topic. ' +
          'If prior session history exists for this topic, pick up where the previous session left off.'
      );
    } else if (context.rawInput) {
      sections.push(
        'The learner expressed interest in the above topic. ' +
          'Anchor your teaching to their stated intent and begin immediately.'
      );
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --testPathPattern exchanges.test.ts --no-coverage -t "first-exchange teaching opener"`
Expected: All 5 tests PASS.

- [ ] **Step 5: Run full exchanges test suite to check for regressions**

Run: `cd apps/api && pnpm exec jest --testPathPattern exchanges.test.ts --no-coverage`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/exchanges.ts apps/api/src/services/exchanges.test.ts
git commit -m "feat(api): first-exchange teaching opener conditional [TF-4]"
```

---

## Task 5: Client-Side Greeting Updates

**Files:**
- Modify: `apps/mobile/src/components/session/sessionModeConfig.ts:61-62` (`FIRST_SESSION.learning`)
- Modify: `apps/mobile/src/components/session/sessionModeConfig.ts:123-124` (`getOpeningMessage` topic branch)
- Test: `apps/mobile/src/components/session/sessionModeConfig.test.ts`

**Why:** The client-side greeting bubble appears before the LLM responds. Updating it to match the teach-first tone ("I'll teach you stuff and check if it sticks") sets expectations before the first LLM message arrives.

- [ ] **Step 1: Update existing tests for new greeting text**

In `apps/mobile/src/components/session/sessionModeConfig.test.ts`, update the first-session test (around line 21-28) to expect the new greeting. The existing `it.each(modes)` test checks for `'Hey there'` or `'Hi!'` — the new learning greeting starts with `"Hi!"` so this test should still pass.

Update the topic-aware test (around line 75-78):

```typescript
it('includes topic name for first session', () => {
  const msg = getOpeningMessage('learning', 0, undefined, 'The Nile River');
  expect(msg).toContain('The Nile River');
  expect(msg).toContain("I'll explain the key ideas");
});
```

Add a new test for the teach-first tone in the first session:

```typescript
it('uses teach-first tone for learning first session', () => {
  const msg = getOpeningMessage('learning', 0);
  expect(msg).toContain("I'll teach you stuff and check if it sticks");
  expect(msg).not.toContain('What topic would you like to explore');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest --testPathPattern sessionModeConfig.test.ts --no-coverage`
Expected: FAIL — old greeting text still present.

- [ ] **Step 3: Update `FIRST_SESSION.learning`**

In `apps/mobile/src/components/session/sessionModeConfig.ts`, replace line 61-62:

Old:
```typescript
  learning:
    "Hey there! I'm excited to learn with you. What topic would you like to explore?",
```

New:
```typescript
  learning:
    "Hi! I'm your learning mate. I'll teach you stuff and check if it sticks — ask me anything along the way. Ready to start?",
```

- [ ] **Step 4: Update `getOpeningMessage` topic + first-session branch**

In `apps/mobile/src/components/session/sessionModeConfig.ts`, replace lines 123-124:

Old:
```typescript
      return `Today we're exploring "${topicName}". I'll walk you through the key ideas — feel free to ask questions anytime!`;
```

New:
```typescript
      return `Today we're starting with "${topicName}". I'll explain the key ideas and check they make sense — jump in anytime if something's unclear.`;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --testPathPattern sessionModeConfig.test.ts --no-coverage`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/session/sessionModeConfig.ts apps/mobile/src/components/session/sessionModeConfig.test.ts
git commit -m "feat(mobile): teach-first client-side greeting text [TF-5]"
```

---

## Task 6: "Build My Learning Path" Button on Book Detail Screen

**Files:**
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx:744-766` (empty state), `788-823` (floating bar)
- Test: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx`

**Why:** Broad-path subjects (Subject → Book → Topic) currently skip the interview + curriculum flow. This gives learners a visible entry-point to generate a personalised learning path without adding new screens — it reuses the existing interview and curriculum-review screens.

- [ ] **Step 1: Add `useCurriculum` import**

In `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`, add to the imports section (after `useSubjects` import around line 28):

```typescript
import { useCurriculum } from '../../../../../hooks/use-curriculum';
```

Note: This codebase has no path aliases configured — deep relative paths (`../../../../../`) are the established convention. All existing imports in this file use the same pattern.

- [ ] **Step 2: Add curriculum query in the component**

Inside the component function, after the existing queries (around line 101, after `const notesQuery = ...`), add:

```typescript
const curriculumQuery = useCurriculum(subjectId);
const hasCurriculum = (curriculumQuery.data?.topics?.length ?? 0) > 0;
```

Note: Check the actual shape of `Curriculum` returned by `useCurriculum`. If it returns `Curriculum | null`, then `hasCurriculum = !!curriculumQuery.data && curriculumQuery.data.topics.length > 0`. Adjust based on the actual type.

- [ ] **Step 3: Add `handleBuildLearningPath` navigation handler**

After the existing `handleStartLearning` handler (around line 342), add:

```typescript
const handleBuildLearningPath = useCallback(() => {
  router.push({
    pathname: '/(app)/onboarding/interview',
    params: {
      subjectId,
      bookId,
      bookTitle: book?.title ?? '',
    },
  } as never);
}, [router, subjectId, bookId, book?.title]);
```

- [ ] **Step 4: Enhance the empty-state section**

Replace the empty-state block at lines 744-766:

Old:
```tsx
{sessions.length === 0 &&
  !sessionsQuery.isError &&
  !needsGeneration &&
  topics.length > 0 &&
  completedTopicCount === 0 && (
    <View
      className="px-5 py-8 items-center"
      testID="book-empty-sessions"
    >
      <Ionicons
        name="book-outline"
        size={40}
        color={themeColors.textSecondary}
      />
      <Text className="text-body text-text-secondary text-center mt-3 mb-1">
        No sessions yet
      </Text>
      <Text className="text-body-sm text-text-secondary text-center mb-4">
        Pick a topic above to start learning
      </Text>
    </View>
  )}
```

New:
```tsx
{sessions.length === 0 &&
  !sessionsQuery.isError &&
  !needsGeneration &&
  topics.length > 0 &&
  completedTopicCount === 0 && (
    <View
      className="px-5 py-8 items-center"
      testID="book-empty-sessions"
    >
      <Ionicons
        name="book-outline"
        size={40}
        color={themeColors.textSecondary}
      />
      <Text className="text-body text-text-secondary text-center mt-3 mb-1">
        No sessions yet
      </Text>
      <Text className="text-body-sm text-text-secondary text-center mb-4">
        Pick a topic above to dive in, or let me build a personalised learning path for you.
      </Text>
      {!hasCurriculum && (
        <Pressable
          onPress={handleBuildLearningPath}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          testID="book-build-learning-path"
          accessibilityLabel="Build my learning path"
        >
          <Text className="text-text-primary text-body font-semibold">
            Build my learning path
          </Text>
        </Pressable>
      )}
    </View>
  )}
```

- [ ] **Step 5: Add secondary link below the floating "Start learning" button**

In the floating bar section (after the closing `</Pressable>` of the "Start learning" button, around line 818, before the closing `</View>` of the floating bar container), add:

```tsx
          {!hasCurriculum && !isReadOnly && (
            <Pressable
              onPress={handleBuildLearningPath}
              className="mt-2 py-2 items-center"
              testID="book-build-path-link"
              accessibilityLabel="Build a learning path"
            >
              <Text className="text-body-sm text-text-secondary underline">
                Build a learning path
              </Text>
            </Pressable>
          )}
```

- [ ] **Step 6: Write tests for button visibility**

In `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx` (create if it doesn't exist — check first), add tests for the new button's visibility conditions. If a test file already exists, add to it:

```typescript
describe('Build my learning path button', () => {
  it('shows in empty state when no curriculum exists', () => {
    // Render with: sessions=[], topics=[{...}], completedTopicCount=0, curriculum=null
    // Assert: testID "book-build-learning-path" is present
  });

  it('hides in empty state when curriculum already exists', () => {
    // Render with: sessions=[], topics=[{...}], completedTopicCount=0, curriculum={topics: [...]}
    // Assert: testID "book-build-learning-path" is NOT present
  });

  it('shows floating bar link when no curriculum exists', () => {
    // Render with: topics=[{...}], sessions=[{...}], curriculum=null
    // Assert: testID "book-build-path-link" is present
  });

  it('hides floating bar link in read-only mode', () => {
    // Render with: topics=[{...}], readOnly=true, curriculum=null
    // Assert: testID "book-build-path-link" is NOT present
  });

  it('hides floating bar link when curriculum exists', () => {
    // Render with: topics=[{...}], curriculum={topics: [...]}
    // Assert: testID "book-build-path-link" is NOT present
  });
});
```

Note: These tests depend on the component's existing mock setup. Use the same mock patterns already established in the book detail test file (or in similar shelf screen tests). The hook mocks should cover `useBookWithTopics`, `useBookSessions`, and `useCurriculum`.

- [ ] **Step 7: Run tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/shelf/\\[subjectId\\]/book/\\[bookId\\].tsx --no-coverage`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].tsx apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].test.tsx
git commit -m "feat(mobile): 'Build my learning path' button on book detail [TF-6]"
```

---

## Task 7: Auto-Filing for Freeform Chat on Session End

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/use-session-actions.ts:296-300`
- Test: `apps/mobile/src/app/(app)/session/use-session-actions.test.ts`

**Why:** Currently, freeform sessions show a filing prompt card at session end, requiring the learner to decide whether to save their exploration. For kids, this is decision fatigue. Auto-filing with a quiet non-blocking toast removes the decision entirely — no modal, no button, no interruption.

### Conditions for auto-filing (all must be true):
1. `effectiveMode === 'freeform'`
2. `effectiveSubjectId` is truthy (subject classified via CFLF)
3. `exchangeCount >= 5` (meaningful conversation, not a false start)
4. `topicId` is falsy (not already filed)

- [ ] **Step 1: Write failing tests for auto-file trigger conditions**

Create `apps/mobile/src/app/(app)/session/use-session-actions.test.ts`:

```typescript
import { shouldAutoFile } from './use-session-actions';

describe('shouldAutoFile', () => {
  it('returns true when all conditions met', () => {
    expect(
      shouldAutoFile({
        effectiveMode: 'freeform',
        effectiveSubjectId: 'sub-1',
        exchangeCount: 5,
        topicId: undefined,
      })
    ).toBe(true);
  });

  it('returns false for non-freeform mode', () => {
    expect(
      shouldAutoFile({
        effectiveMode: 'learning',
        effectiveSubjectId: 'sub-1',
        exchangeCount: 5,
        topicId: undefined,
      })
    ).toBe(false);
  });

  it('returns false when subject not classified', () => {
    expect(
      shouldAutoFile({
        effectiveMode: 'freeform',
        effectiveSubjectId: null,
        exchangeCount: 5,
        topicId: undefined,
      })
    ).toBe(false);
  });

  it('returns false when fewer than 5 exchanges', () => {
    expect(
      shouldAutoFile({
        effectiveMode: 'freeform',
        effectiveSubjectId: 'sub-1',
        exchangeCount: 4,
        topicId: undefined,
      })
    ).toBe(false);
  });

  it('returns false when topic already filed', () => {
    expect(
      shouldAutoFile({
        effectiveMode: 'freeform',
        effectiveSubjectId: 'sub-1',
        exchangeCount: 5,
        topicId: 'topic-1',
      })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest --testPathPattern use-session-actions.test.ts --no-coverage`
Expected: FAIL — `shouldAutoFile` does not exist.

- [ ] **Step 3: Extract and export `shouldAutoFile` helper**

In `apps/mobile/src/app/(app)/session/use-session-actions.ts`, add before the `UseSessionActionsOptions` interface (around line 33):

```typescript
/** Conditions for silent auto-filing of freeform sessions at close */
export function shouldAutoFile(params: {
  effectiveMode: string;
  effectiveSubjectId: string | null | undefined;
  exchangeCount: number;
  topicId: string | undefined;
}): boolean {
  return (
    params.effectiveMode === 'freeform' &&
    !!params.effectiveSubjectId &&
    params.exchangeCount >= 5 &&
    !params.topicId
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --testPathPattern use-session-actions.test.ts --no-coverage`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit the helper and tests**

```bash
git add apps/mobile/src/app/\(app\)/session/use-session-actions.ts apps/mobile/src/app/\(app\)/session/use-session-actions.test.ts
git commit -m "feat(mobile): shouldAutoFile helper with tests [TF-7a]"
```

- [ ] **Step 6: Wire auto-filing into `handleEndSession`**

In `apps/mobile/src/app/(app)/session/use-session-actions.ts`, modify the freeform/homework branch inside `handleEndSession` (lines 296-316).

**6a. Add new options to `UseSessionActionsOptions`:**

```typescript
  // Filing mutation for auto-filing freeform sessions
  filing?: { mutateAsync: (input: { sessionId: string; sessionMode: 'freeform' }) => Promise<{ shelfId: string; bookId: string }> };
  // Non-blocking confirmation toast (reuses session screen's confirmationToast pattern)
  showConfirmation?: (message: string) => void;
```

**6b. Extract a `navigateToSummary` helper** inside `useSessionActions` (before `handleEndSession`), to eliminate the duplicated `router.replace` block:

```typescript
  const navigateToSummary = useCallback(
    (sessionId: string, wallClockSeconds: number, fastCelebrations: PendingCelebration[]) => {
      router.replace({
        pathname: `/session-summary/${sessionId}`,
        params: {
          subjectName: effectiveSubjectName ?? '',
          exchangeCount: String(exchangeCount),
          escalationRung: String(escalationRung),
          subjectId: effectiveSubjectId ?? '',
          topicId: topicId ?? '',
          wallClockSeconds: String(wallClockSeconds),
          milestones: serializeMilestones(milestonesReached),
          fastCelebrations: serializeCelebrations(fastCelebrations),
          sessionType: effectiveMode,
        },
      } as never);
    },
    [router, effectiveSubjectName, exchangeCount, escalationRung, effectiveSubjectId, topicId, milestonesReached, effectiveMode]
  );
```

**6c. Replace the freeform/homework branch** in `handleEndSession`:

Old:
```typescript
              // Freeform/homework: show filing prompt before navigating
              if (
                effectiveMode === 'freeform' ||
                effectiveMode === 'homework'
              ) {
                setShowFilingPrompt(true);
              } else {
                router.replace({
                  pathname: `/session-summary/${activeSessionId}`,
                  params: {
                    subjectName: effectiveSubjectName ?? '',
                    exchangeCount: String(exchangeCount),
                    escalationRung: String(escalationRung),
                    subjectId: effectiveSubjectId ?? '',
                    topicId: topicId ?? '',
                    wallClockSeconds: String(result.wallClockSeconds),
                    milestones: serializeMilestones(milestonesReached),
                    fastCelebrations: serializeCelebrations(fastCelebrations),
                    sessionType: 'learning',
                  },
                } as never);
              }
```

New:
```typescript
              // Freeform: auto-file silently if conditions met, else show prompt
              // Homework: always show filing prompt
              if (
                effectiveMode === 'freeform' ||
                effectiveMode === 'homework'
              ) {
                if (
                  shouldAutoFile({
                    effectiveMode,
                    effectiveSubjectId,
                    exchangeCount,
                    topicId,
                  }) &&
                  filing
                ) {
                  // Auto-file silently — no modal, no decision for the kid
                  try {
                    await filing.mutateAsync({
                      sessionId: activeSessionId,
                      sessionMode: 'freeform',
                    });
                    showConfirmation?.(
                      `Saved to your ${effectiveSubjectName ?? 'library'} shelf`
                    );
                  } catch {
                    showConfirmation?.("Couldn't save — we'll try next time");
                  }
                  navigateToSummary(activeSessionId, result.wallClockSeconds, fastCelebrations);
                } else {
                  setShowFilingPrompt(true);
                }
              } else {
                navigateToSummary(activeSessionId, result.wallClockSeconds, fastCelebrations);
              }
```

Note: The existing `else` branch (learning/practice → navigate to summary) now also uses `navigateToSummary` to eliminate that third copy.

**6d. Update the `handleEndSession` dependency array** (line 348-365) — add `filing`, `showConfirmation`, `navigateToSummary`:

```typescript
  ], [
    activeSessionId,
    isClosing,
    closeSession,
    router,
    effectiveSubjectName,
    effectiveSubjectId,
    topicId,
    exchangeCount,
    escalationRung,
    fetchFastCelebrations,
    activeProfileId,
    milestonesReached,
    effectiveMode,
    setIsClosing,
    setShowFilingPrompt,
    closedSessionRef,
    filing,
    showConfirmation,
    navigateToSummary,
  ]);
```

- [ ] **Step 7: Pass `filing` and `showConfirmation` from the session screen**

In `apps/mobile/src/app/(app)/session/index.tsx`, where `useSessionActions` is called, add both options. The `useFiling` import already exists at line 32. The `showConfirmation` callback already exists at line 389 (it's the existing inline toast mechanism using `setConfirmationToast`):

```typescript
// In the useSessionActions call, add these options:
filing: {
  mutateAsync: (input) => filing.mutateAsync(input),
},
showConfirmation,
```

- [ ] **Step 8: Run related tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/session/use-session-actions.ts --no-coverage`
Expected: All tests PASS.

- [ ] **Step 9: Typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/app/\(app\)/session/use-session-actions.ts apps/mobile/src/app/\(app\)/session/index.tsx
git commit -m "feat(mobile): auto-file freeform sessions at close with toast [TF-7b]"
```

---

## Task 8: Final Validation

**Files:** None (validation only)

- [ ] **Step 1: Run API lint and typecheck**

Run in parallel:
```bash
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
```
Expected: Both PASS with no new errors.

- [ ] **Step 2: Run mobile lint and typecheck**

Run in parallel:
```bash
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
```
Expected: Both PASS with no new errors.

- [ ] **Step 3: Run full API test suite**

Run: `pnpm exec nx run api:test`
Expected: All tests PASS, no regressions.

- [ ] **Step 4: Run full mobile test suite**

Run: `pnpm exec nx run-many -t test --projects=mobile`
Expected: All tests PASS, no regressions.

- [ ] **Step 5: Manual smoke test — UI and flow**

Verify the following scenarios manually:
1. **Freeform:** Start freeform, talk for 5+ exchanges, end session → quiet toast appears ("Saved to your X shelf"), no modal dialog
2. **Freeform < 5 exchanges:** End early → filing prompt card appears (old behaviour)
3. **Book empty state:** Open a book with topics but no sessions → "Build my learning path" button visible
4. **Book with curriculum:** Open a book that already has a curriculum → no "Build a learning path" link
5. **Client greeting:** Start a learning session with `sessionExperience=0` → greeting says "I'll teach you stuff and check if it sticks"

- [ ] **Step 6: Manual smoke test — LLM teach-first posture (THE REAL TEST)**

This is the highest-risk change. Unit tests only verify string containment in the prompt — they cannot tell you whether the LLM actually teaches differently. Run three real sessions and **log the LLM's first response** for each:

1. **Child persona (birthYear ~9yo) + curriculum topic:** Pick a simple Science topic (e.g., "Volcanoes"). Does the LLM open with a concrete explanation? Or does it ask "What do you want to learn about volcanoes?"
2. **Teen persona (birthYear ~15yo) + book topic:** Pick a Maths topic. Does the LLM teach the concept with a real-world example? Or does it open Socratically?
3. **Adult persona + rawInput:** Type "How do black holes form?" in freeform. Does the LLM anchor to the intent and start explaining? Or does it ask a clarifying question?

**Pass criteria:** All three sessions must open with a teaching sentence (explanation or example), NOT a question. If any opens with a question, the prompt needs hardening — add an explicit prohibition: "Do not ask what to teach. Start teaching."

**Fail action:** If the LLM still opens Socratically despite the prompt, add this line to the first-exchange opener section (Task 4): `"IMPORTANT: Your first message MUST be a teaching statement, not a question. Never open with 'What would you like to learn?' or similar."`

---

## Open Questions / Risks

1. **Undo for auto-filing (deferred):** The spec mentions `DELETE /filing/:id` but no delete endpoint exists and the spec says "No new API routes." The auto-file toast is therefore confirmation-only — no undo button. Ship the undo action when a `DELETE /filing/:id` route is added in a follow-up. A button that does nothing is worse than no button.

2. **`useCurriculum` return shape:** Task 6 assumes `curriculumQuery.data?.topics?.length`. Verify the actual `Curriculum` type returned by `useCurriculum` — it may use a different property name (e.g., `items` instead of `topics`).

3. **Prompt regression risk (highest priority):** Changes 1-3 fundamentally alter LLM behaviour. The unit tests only check string containment — they cannot detect whether the model actually teaches differently. Task 8 Step 6 is the real gate: if the LLM still opens Socratically in any of the three test sessions, the prompt needs hardening before deploy. Monitor the first batch of production sessions post-deploy for signs of regression.
