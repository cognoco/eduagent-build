# Conversation-Stage-Aware Session Chips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate quick-action chips, feedback buttons, and bottom-bar controls behind a derived conversation stage so they only appear once there's something meaningful to act on.

**Architecture:** A pure `getConversationStage()` function derives `'greeting' | 'orienting' | 'teaching'` from `userMessageCount`, `hasSubject`, and `effectiveMode`. UI components receive the computed stage as a prop and hide their action rows when not in `'teaching'`. Freeform greeting messages are intercepted client-side before any API call, preserving quota and preventing the silent auto-subject-pick bug.

**Tech Stack:** React Native, TypeScript, Jest, Expo Router

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/app/(app)/session/session-types.ts` | Add `ConversationStage` type, `getConversationStage()`, `isGreeting()` |
| `apps/mobile/src/app/(app)/session/session-types.test.ts` | **New.** Unit tests for `getConversationStage` and `isGreeting` |
| `apps/mobile/src/app/(app)/session/SessionMessageActions.tsx` | Add `stage` prop, gate chips + feedback on `stage === 'teaching'` |
| `apps/mobile/src/app/(app)/session/SessionMessageActions.test.tsx` | **New.** Unit tests for visibility gating |
| `apps/mobile/src/app/(app)/session/SessionAccessories.tsx` | Add `stage` prop to `SessionToolAccessory`, gate render on `stage === 'teaching'` |
| `apps/mobile/src/app/(app)/session/SessionAccessories.test.tsx` | **New.** Unit tests for `SessionToolAccessory` visibility gating |
| `apps/mobile/src/app/(app)/session/use-subject-classification.ts` | Add greeting guard in `handleSend`, change classification re-trigger guard |
| `apps/mobile/src/app/(app)/session/use-subject-classification.test.ts` | **New.** Unit tests for greeting guard and re-trigger logic |
| `apps/mobile/src/app/(app)/session/index.tsx` | Compute `conversationStage`, pass to child components |

---

## Task 1: `getConversationStage` pure function + tests

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/session-types.ts` (bottom of file)
- Create: `apps/mobile/src/app/(app)/session/session-types.test.ts`

- [ ] **Step 1: Write the failing tests for `getConversationStage`**

Create `apps/mobile/src/app/(app)/session/session-types.test.ts`:

```typescript
import { getConversationStage, isGreeting } from './session-types';

describe('getConversationStage', () => {
  it('returns teaching for practice mode regardless of other inputs', () => {
    expect(getConversationStage(0, false, 'practice')).toBe('teaching');
  });

  it('returns teaching for review mode', () => {
    expect(getConversationStage(0, false, 'review')).toBe('teaching');
  });

  it('returns teaching for relearn mode', () => {
    expect(getConversationStage(0, false, 'relearn')).toBe('teaching');
  });

  it('returns teaching for homework mode', () => {
    expect(getConversationStage(0, false, 'homework')).toBe('teaching');
  });

  it('returns teaching when userMessageCount >= 2', () => {
    expect(getConversationStage(2, false, 'freeform')).toBe('teaching');
    expect(getConversationStage(3, true, 'learning')).toBe('teaching');
  });

  it('returns orienting when subject is known but userMessageCount < 2', () => {
    // Learning mode with subject pre-set via route params
    expect(getConversationStage(0, true, 'learning')).toBe('orienting');
    // Freeform with substantive first message (classification set subject, count still 1)
    expect(getConversationStage(1, true, 'freeform')).toBe('orienting');
  });

  it('returns greeting when no subject and userMessageCount < 2', () => {
    expect(getConversationStage(0, false, 'freeform')).toBe('greeting');
    expect(getConversationStage(1, false, 'freeform')).toBe('greeting');
  });

  it('returns greeting for learning mode with no subject and 0 messages', () => {
    expect(getConversationStage(0, false, 'learning')).toBe('greeting');
  });

  it('prioritises userMessageCount >= 2 over hasSubject === false', () => {
    // In freeform: greeting → teaching, skipping orienting
    expect(getConversationStage(2, false, 'freeform')).toBe('teaching');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest session-types.test.ts --no-coverage`

Expected: FAIL — `getConversationStage` is not exported from `session-types.ts`.

- [ ] **Step 3: Implement `getConversationStage` in `session-types.ts`**

Add at the bottom of `apps/mobile/src/app/(app)/session/session-types.ts`:

```typescript
// ─── Conversation Stage ─────────────────────────────────────────────────────

export type ConversationStage = 'greeting' | 'orienting' | 'teaching';

/**
 * Derives the current conversation stage from existing state.
 * Pure function — no mutable state, survives recovery resume.
 */
export function getConversationStage(
  userMessageCount: number,
  hasSubject: boolean,
  effectiveMode: string
): ConversationStage {
  // Practice, review, relearn, and homework already present assessable content
  // on the first AI response. Skip warmup stages.
  if (['practice', 'review', 'relearn', 'homework'].includes(effectiveMode)) {
    return 'teaching';
  }

  // User has sent at least 2 messages — first was greeting/subject selection,
  // second is real engagement. This check runs BEFORE hasSubject intentionally:
  // in freeform flows the progression is greeting → teaching, skipping orienting.
  if (userMessageCount >= 2) return 'teaching';

  // Subject is known but conversation hasn't warmed up yet.
  // Reachable in two cases:
  // 1. Learning mode with subject pre-set via route params (most common).
  // 2. Freeform when the first message is substantive (not a greeting) —
  //    classification sets the subject immediately, but userMessageCount is still 1.
  if (hasSubject) return 'orienting';

  // No subject, no engagement.
  return 'greeting';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest session-types.test.ts --no-coverage`

Expected: All `getConversationStage` tests PASS.

- [ ] **Step 5: Commit**

```
feat(mobile): add getConversationStage pure function with tests
```

---

## Task 2: `isGreeting` function + tests

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/session-types.ts` (below `getConversationStage`)
- Modify: `apps/mobile/src/app/(app)/session/session-types.test.ts`

- [ ] **Step 1: Add failing tests for `isGreeting`**

Append to the existing `session-types.test.ts`:

```typescript
describe('isGreeting', () => {
  it.each([
    'hi',
    'Hi!',
    'hey',
    'heyyy',
    'hello',
    'yo',
    'sup',
    "what's up",
    'hola',
    'hei',
    'hej',
    'ciao',
    'salut',
    'bonjour',
    'hallo',
    'hei hei',
    'Hi!  ',
    '  hello  ',
  ])('matches pure greeting: "%s"', (text) => {
    expect(isGreeting(text)).toBe(true);
  });

  it.each([
    'hi can you help me with fractions',
    'hello I need to study for my test',
    'hey what are volcanoes',
    'help me with math',
    'tell me about history',
    'yo explain photosynthesis',
    '',
    '   ',
    '👋',
    'hii there',
  ])('rejects non-greeting: "%s"', (text) => {
    expect(isGreeting(text)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify the `isGreeting` tests fail**

Run: `cd apps/mobile && pnpm exec jest session-types.test.ts --no-coverage`

Expected: FAIL — `isGreeting` is not exported.

- [ ] **Step 3: Implement `isGreeting` in `session-types.ts`**

Add below `getConversationStage` in the same file:

```typescript
// Anchored with ^...$ so "hi can you help me with fractions" does NOT match.
// Only pure social greetings are caught. Do not remove the anchors.
const GREETING_PATTERN =
  /^(h(i+|e+y+|ello|ola|ei|ej)|yo|sup|what'?s up|hva skjer|hei hei|ciao|salut|bonjour|hallo)\b[!?.\s]*$/i;

export function isGreeting(text: string): boolean {
  return GREETING_PATTERN.test(text.trim());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest session-types.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```
feat(mobile): add isGreeting regex detector with tests
```

---

## Task 3: Gate `SessionMessageActions` chips + feedback behind stage prop

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/SessionMessageActions.tsx`
- Create: `apps/mobile/src/app/(app)/session/SessionMessageActions.test.tsx`

- [ ] **Step 1: Write failing tests for the stage gating**

Create `apps/mobile/src/app/(app)/session/SessionMessageActions.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { SessionMessageActions } from './SessionMessageActions';
import type { SessionMessageActionsProps } from './SessionMessageActions';
import type { ChatMessage } from '../../../components/session';

const baseMessage: ChatMessage = {
  id: 'ai-1',
  role: 'assistant',
  content: 'Here is a question for you?',
  eventId: 'evt-1',
};

const defaultProps: SessionMessageActionsProps = {
  message: baseMessage,
  isStreaming: false,
  latestAiMessageId: 'ai-1',
  consumedQuickChipMessageId: null,
  userMessageCount: 3,
  showWrongSubjectChip: false,
  messageFeedback: {},
  quotaError: null,
  isOwner: true,
  stage: 'teaching',
  handleQuickChip: jest.fn(),
  handleMessageFeedback: jest.fn(),
  handleReconnect: jest.fn(),
};

describe('SessionMessageActions stage gating', () => {
  it('renders chips and feedback when stage is teaching', () => {
    const { queryByTestId } = render(
      <SessionMessageActions {...defaultProps} stage="teaching" />
    );
    // Quick chips render for a question-like message
    expect(queryByTestId('quick-chip-too_hard')).toBeTruthy();
    // Feedback buttons render when eventId is present
    expect(queryByTestId(`message-feedback-helpful-evt-1`)).toBeTruthy();
  });

  it('hides chips and feedback when stage is greeting', () => {
    const { queryByTestId } = render(
      <SessionMessageActions {...defaultProps} stage="greeting" />
    );
    expect(queryByTestId('quick-chip-too_hard')).toBeNull();
    expect(queryByTestId('message-feedback-helpful-evt-1')).toBeNull();
  });

  it('hides chips and feedback when stage is orienting', () => {
    const { queryByTestId } = render(
      <SessionMessageActions {...defaultProps} stage="orienting" />
    );
    expect(queryByTestId('quick-chip-too_hard')).toBeNull();
    expect(queryByTestId('message-feedback-helpful-evt-1')).toBeNull();
  });

  it('still renders reconnect button regardless of stage', () => {
    const reconnectMessage: ChatMessage = {
      id: 'reconnect-1',
      role: 'user',
      content: 'Lost connection',
      kind: 'reconnect_prompt',
    };
    const { queryByTestId } = render(
      <SessionMessageActions
        {...defaultProps}
        message={reconnectMessage}
        stage="greeting"
      />
    );
    expect(queryByTestId('session-reconnect-reconnect-1')).toBeTruthy();
  });

  it('still renders quota exceeded card regardless of stage', () => {
    const quotaMessage: ChatMessage = {
      id: 'quota-1',
      role: 'user',
      content: 'Quota exceeded',
      kind: 'quota_exceeded',
    };
    const { queryByTestId } = render(
      <SessionMessageActions
        {...defaultProps}
        message={quotaMessage}
        stage="greeting"
        quotaError={{ type: 'daily', limit: 10, resetAt: '2026-01-01' } as any}
      />
    );
    // QuotaExceededCard renders — we check it's not null (component has testID internally)
    expect(queryByTestId('quota-exceeded-card')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest SessionMessageActions.test --no-coverage`

Expected: FAIL — `stage` prop doesn't exist on `SessionMessageActionsProps` yet.

- [ ] **Step 3: Add `stage` prop and gate chips + feedback**

In `apps/mobile/src/app/(app)/session/SessionMessageActions.tsx`:

1. Import `ConversationStage` and add `stage` to props:

```typescript
import {
  getContextualQuickChips,
  QUICK_CHIP_CONFIG,
  type QuickChipId,
  type MessageFeedbackState,
  type ConversationStage,
} from './session-types';
```

Add to `SessionMessageActionsProps`:

```typescript
  stage: ConversationStage;
```

2. Gate the chips + feedback section. After the early-return checks for non-assistant / streaming / system messages (the existing block ending at line 70) and after the `if (isStreaming)` return at line 74, add a stage guard:

Right after `if (isStreaming) { return null; }` (line 72-74), insert:

```typescript
  // Conversation-stage gating: only show action buttons during teaching.
  // Message content (reconnect, quota) renders unconditionally above this point.
  if (stage !== 'teaching') {
    return null;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest SessionMessageActions.test --no-coverage`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```
feat(mobile): gate SessionMessageActions chips+feedback behind conversation stage
```

---

## Task 4: Gate `SessionToolAccessory` behind stage prop

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/SessionAccessories.tsx`
- Create: `apps/mobile/src/app/(app)/session/SessionAccessories.test.tsx`

- [ ] **Step 1: Write failing tests for the stage gating**

Create `apps/mobile/src/app/(app)/session/SessionAccessories.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { SessionToolAccessory } from './SessionAccessories';

describe('SessionToolAccessory stage gating', () => {
  const handleQuickChip = jest.fn();

  it('renders Switch topic and Park it when stage is teaching', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="teaching"
      />
    );
    expect(queryByTestId('quick-chip-switch_topic')).toBeTruthy();
    expect(queryByTestId('quick-chip-park')).toBeTruthy();
  });

  it('renders nothing when stage is greeting', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="greeting"
      />
    );
    expect(queryByTestId('quick-chip-switch_topic')).toBeNull();
    expect(queryByTestId('quick-chip-park')).toBeNull();
  });

  it('renders nothing when stage is orienting', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="orienting"
      />
    );
    expect(queryByTestId('quick-chip-switch_topic')).toBeNull();
    expect(queryByTestId('quick-chip-park')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest SessionAccessories.test --no-coverage`

Expected: FAIL — `stage` prop doesn't exist on `SessionToolAccessoryProps`.

- [ ] **Step 3: Add `stage` prop and gate the component**

In `apps/mobile/src/app/(app)/session/SessionAccessories.tsx`:

1. Import `ConversationStage`:

```typescript
import {
  type QuickChipId,
  type PendingSubjectResolution,
  type ConversationStage,
} from './session-types';
```

2. Add `stage` to `SessionToolAccessoryProps`:

```typescript
export interface SessionToolAccessoryProps {
  isStreaming: boolean;
  handleQuickChip: (chip: QuickChipId) => Promise<void>;
  stage: ConversationStage;
}
```

3. Destructure and add early return at top of `SessionToolAccessory`:

```typescript
export function SessionToolAccessory({
  isStreaming,
  handleQuickChip,
  stage,
}: SessionToolAccessoryProps) {
  if (stage !== 'teaching') return null;

  return (
    // ... existing JSX unchanged
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest SessionAccessories.test --no-coverage`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```
feat(mobile): gate SessionToolAccessory behind conversation stage
```

---

## Task 5: Freeform greeting guard in `use-subject-classification.ts`

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/use-subject-classification.ts`
- Create: `apps/mobile/src/app/(app)/session/use-subject-classification.test.ts`

- [ ] **Step 1: Write failing tests for the greeting guard and re-trigger**

Create `apps/mobile/src/app/(app)/session/use-subject-classification.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useSubjectClassification } from './use-subject-classification';
import type { UseSubjectClassificationOptions } from './use-subject-classification';

// Minimal mock for animateResponse — we just need to verify it's called
jest.mock('../../../components/session', () => ({
  animateResponse: jest.fn(() => jest.fn()),
}));

import { animateResponse } from '../../../components/session';

function createMockOpts(
  overrides: Partial<UseSubjectClassificationOptions> = {}
): UseSubjectClassificationOptions {
  return {
    isStreaming: false,
    pendingClassification: false,
    setPendingClassification: jest.fn(),
    quotaError: null,
    pendingSubjectResolution: null,
    setPendingSubjectResolution: jest.fn(),
    classifiedSubject: null,
    setClassifiedSubject: jest.fn(),
    setShowWrongSubjectChip: jest.fn(),
    setClassifyError: jest.fn(),
    setTopicSwitcherSubjectId: jest.fn(),
    messages: [{ id: 'opening', role: 'assistant', content: 'Hello!' }],
    setMessages: jest.fn(),
    setResumedBanner: jest.fn(),
    subjectId: undefined,
    effectiveMode: 'freeform',
    availableSubjects: [{ id: 's1', name: 'Math' }],
    classifySubject: { mutateAsync: jest.fn() } as any,
    resolveSubject: { mutateAsync: jest.fn() } as any,
    createSubject: { mutateAsync: jest.fn(), isPending: false } as any,
    continueWithMessage: jest.fn(),
    createLocalMessageId: jest.fn((prefix: string) => `${prefix}-1`),
    showConfirmation: jest.fn(),
    animateResponse: animateResponse as any,
    userMessageCount: 0,
    sessionExperience: 0,
    animationCleanupRef: { current: null },
    ...overrides,
  };
}

describe('useSubjectClassification greeting guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('intercepts a pure greeting in freeform mode and calls animateResponse', async () => {
    const opts = createMockOpts();
    const { result } = renderHook(() => useSubjectClassification(opts));

    await act(async () => {
      await result.current.handleSend('hi');
    });

    // Should NOT call classifySubject
    expect(opts.classifySubject.mutateAsync).not.toHaveBeenCalled();
    // Should NOT call continueWithMessage (no session created)
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
    // Should call animateResponse with a greeting response
    expect(animateResponse).toHaveBeenCalled();
  });

  it('does NOT intercept a substantive message', async () => {
    const opts = createMockOpts();
    opts.classifySubject.mutateAsync = jest.fn().mockResolvedValue({
      needsConfirmation: false,
      candidates: [{ subjectId: 's1', subjectName: 'Math' }],
    });
    const { result } = renderHook(() => useSubjectClassification(opts));

    await act(async () => {
      await result.current.handleSend('help me with fractions');
    });

    expect(opts.classifySubject.mutateAsync).toHaveBeenCalled();
  });

  it('does NOT intercept a greeting when subject is already set', async () => {
    const opts = createMockOpts({ subjectId: 's1' });
    const { result } = renderHook(() => useSubjectClassification(opts));

    await act(async () => {
      await result.current.handleSend('hi');
    });

    // Subject already known — proceed normally, no greeting interception
    expect(opts.continueWithMessage).toHaveBeenCalled();
  });

  it('does NOT intercept a greeting in learning mode', async () => {
    const opts = createMockOpts({ effectiveMode: 'learning', subjectId: 's1' });
    const { result } = renderHook(() => useSubjectClassification(opts));

    await act(async () => {
      await result.current.handleSend('hi');
    });

    expect(opts.continueWithMessage).toHaveBeenCalled();
  });
});

describe('useSubjectClassification re-trigger guard', () => {
  it('re-triggers classification on 2nd message after greeting', async () => {
    // Simulate: greeting was handled, now user sends a substantive message
    const opts = createMockOpts({
      userMessageCount: 1,
      messages: [
        { id: 'opening', role: 'assistant', content: 'Hello!' },
        { id: 'user-1', role: 'user', content: 'hi' },
        { id: 'ai-1', role: 'assistant', content: "What's on your mind?" },
      ],
    });
    opts.classifySubject.mutateAsync = jest.fn().mockResolvedValue({
      needsConfirmation: false,
      candidates: [{ subjectId: 's1', subjectName: 'Math' }],
    });
    const { result } = renderHook(() => useSubjectClassification(opts));

    await act(async () => {
      await result.current.handleSend('tell me about volcanoes');
    });

    expect(opts.classifySubject.mutateAsync).toHaveBeenCalledWith({
      text: 'tell me about volcanoes',
    });
  });

  it('does NOT re-trigger classification after userMessageCount > 2', async () => {
    const opts = createMockOpts({
      userMessageCount: 3,
      messages: [
        { id: 'opening', role: 'assistant', content: 'Hello!' },
        { id: 'user-1', role: 'user', content: 'hi' },
        { id: 'ai-1', role: 'assistant', content: "What's on your mind?" },
        { id: 'user-2', role: 'user', content: 'volcanoes' },
        { id: 'ai-2', role: 'assistant', content: 'Volcanoes are...' },
        { id: 'user-3', role: 'user', content: 'more' },
      ],
    });
    const { result } = renderHook(() => useSubjectClassification(opts));

    await act(async () => {
      await result.current.handleSend('another question');
    });

    // No classification — userMessageCount > 2 prevents retry loop
    expect(opts.classifySubject.mutateAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest use-subject-classification.test --no-coverage`

Expected: FAIL — greeting guard and new options don't exist yet.

- [ ] **Step 3: Implement the greeting guard and re-trigger guard**

In `apps/mobile/src/app/(app)/session/use-subject-classification.ts`:

**3a. Add new options to `UseSubjectClassificationOptions`:**

Add these fields to the interface:

```typescript
  // Greeting guard dependencies
  animateResponse: (
    response: string,
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
    setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
    onDone?: () => void
  ) => () => void;
  userMessageCount: number;
  sessionExperience: number;
  animationCleanupRef: React.MutableRefObject<(() => void) | null>;
```

**3b. Import `isGreeting`:**

```typescript
import { type PendingSubjectResolution, isGreeting } from './session-types';
```

**3c. Destructure the new options** in `useSubjectClassification()`:

Add to the destructuring block:

```typescript
    animateResponse,
    userMessageCount,
    sessionExperience,
    animationCleanupRef,
```

**3d. Add the greeting guard** inside `handleSend`, right after the user message is appended to `setMessages` and `setResumedBanner(false)` (after line 282), and BEFORE the classification block:

```typescript
      // Greeting guard: intercept pure greetings in freeform mode before
      // any classification or session creation. Saves quota, prevents
      // the silent auto-subject-pick bug.
      if (
        effectiveMode === 'freeform' &&
        isGreeting(text) &&
        !subjectId &&
        !classifiedSubject
      ) {
        const greetingResponse =
          sessionExperience === 0
            ? 'Hey! What would you like to learn about? You can ask me anything.'
            : "Hey! What's on your mind today?";
        animationCleanupRef.current = animateResponse(
          greetingResponse,
          setMessages,
          setIsStreaming
        );
        return;
      }
```

**3e. Change the classification re-trigger guard** (currently at line 288):

Change from:

```typescript
      if (!subjectId && !classifiedSubject && messages.length <= 1) {
```

To:

```typescript
      if (!subjectId && !classifiedSubject && userMessageCount <= 2) {
```

**3f. Update the dependency array** of `handleSend`'s `useCallback`:

Add `animateResponse`, `userMessageCount`, `sessionExperience`, `animationCleanupRef` to the deps. Remove `messages.length` (replaced by `userMessageCount`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest use-subject-classification.test --no-coverage`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```
feat(mobile): add freeform greeting guard and classification re-trigger cap
```

---

## Task 6: Wire stage computation through `index.tsx`

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`

- [ ] **Step 1: Import `getConversationStage` and `animateResponse`**

At the top of `apps/mobile/src/app/(app)/session/index.tsx`, add to the existing `session-types` import:

```typescript
import {
  getInputModeKey,
  errorHasStatus,
  getConversationStage,
  type MessageFeedbackState,
  type PendingSubjectResolution,
} from './session-types';
```

And verify `animateResponse` is already imported from the session barrel (it's used by `use-session-streaming`). Add to the barrel import if not present:

```typescript
import {
  ChatShell,
  getModeConfig,
  getOpeningMessage,
  SessionTimer,
  FluencyDrillStrip,
  animateResponse,
  type ChatMessage,
} from '../../../components/session';
```

- [ ] **Step 2: Compute `conversationStage`**

Add right after the `userMessageCount` useMemo (around line 708), before `latestAiMessageId`:

```typescript
  const hasSubject = !!(classifiedSubject?.subjectId || subjectId);
  const conversationStage = getConversationStage(
    userMessageCount,
    hasSubject,
    effectiveMode
  );
```

- [ ] **Step 3: Pass `stage` to `SessionMessageActions`**

In the `renderMessageActions` callback (around line 814), add the `stage` prop:

```tsx
  const renderMessageActions = (message: ChatMessage): React.ReactNode => (
    <SessionMessageActions
      message={message}
      isStreaming={isStreaming}
      latestAiMessageId={latestAiMessageId}
      consumedQuickChipMessageId={consumedQuickChipMessageId}
      userMessageCount={userMessageCount}
      showWrongSubjectChip={showWrongSubjectChip}
      messageFeedback={messageFeedback}
      quotaError={quotaError}
      isOwner={activeProfile?.isOwner === true}
      stage={conversationStage}
      handleQuickChip={handleQuickChip}
      handleMessageFeedback={handleMessageFeedback}
      handleReconnect={handleReconnect}
    />
  );
```

- [ ] **Step 4: Pass `stage` to `SessionToolAccessory`**

Update the `sessionToolAccessory` JSX (around line 778):

```tsx
  const sessionToolAccessory = (
    <SessionToolAccessory
      isStreaming={isStreaming}
      handleQuickChip={handleQuickChip}
      stage={conversationStage}
    />
  );
```

- [ ] **Step 5: Pass greeting guard dependencies to `useSubjectClassification`**

Add the new options to the `useSubjectClassification` call (around line 591):

```typescript
  const {
    handleResolveSubject,
    handleCreateResolveSuggestion,
    handleCreateSuggestedSubject,
    handleSend,
  } = useSubjectClassification({
    // ... existing options unchanged ...
    continueWithMessage,
    createLocalMessageId,
    showConfirmation,
    // Greeting guard dependencies
    animateResponse,
    userMessageCount,
    sessionExperience,
    animationCleanupRef,
  });
```

- [ ] **Step 6: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: No type errors.

- [ ] **Step 7: Run all related tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/session/index.tsx src/app/\(app\)/session/session-types.ts src/app/\(app\)/session/SessionMessageActions.tsx src/app/\(app\)/session/SessionAccessories.tsx src/app/\(app\)/session/use-subject-classification.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```
feat(mobile): wire conversationStage to session screen and child components
```

---

## Task 7: Final lint + typecheck validation

**Files:** None modified — validation only.

- [ ] **Step 1: Run mobile lint**

Run: `pnpm exec nx lint mobile`

Expected: PASS — no lint errors.

- [ ] **Step 2: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS — no type errors.

- [ ] **Step 3: Run all session tests**

Run: `cd apps/mobile && pnpm exec jest --testPathPattern="session" --no-coverage`

Expected: All tests PASS.

- [ ] **Step 4: Commit if any lint/type fixes were needed**

```
fix(mobile): lint/type fixes for conversation-stage-chips
```
