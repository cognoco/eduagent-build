# Home & Session UX Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four targeted UX improvements that eliminate blank-page paralysis on subject creation, wire up an existing hook into the home card subtitle, upgrade quota-exceeded feedback from a plain error bubble to a structured card, and correct parent routing.

**Architecture:** Changes are confined to existing component and screen files plus one new shared component (`QuotaExceededCard`). No schema changes, no API changes, no new routes.

**Tech Stack:** React Native / Expo Router, NativeWind, @testing-library/react-native, `@eduagent/schemas` (`QuotaExceededDetails`), `QuotaExceededError` from `apps/mobile/src/lib/api-client.ts`

---

## Failure Modes Table

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| `useContinueSuggestion` loading | Network slow on home screen | "Start learning" with no subtitle until resolved — acceptable | None needed (subtitle is optional) |
| `useContinueSuggestion` error | API down | "Start learning" with no subtitle (graceful silent fallback) | None needed — card still tappable |
| `useContinueSuggestion` returns null | No progress yet | "Start learning" with no subtitle | None needed — first-time-user state |
| QuotaExceededCard shown mid-session | 402 from SSE stream | Structured card with upgrade/parent CTA | "Upgrade" → subscription screen; "Ask your parent" → parent notification |
| QuotaExceededCard shown, child profile | 402, `isOwner=false` | "Ask your parent to upgrade" card | Parent-notify flow (existing or deeplink) |
| Quota exceeded, input already disabled | User tries to type after quota | Input stays disabled, reason shown in `disabledReason` banner | None — they cannot send |
| Subject chip tapped on poor network | `create-subject` route push fails | Router error surfaces via Expo Router error boundary | User is on create-subject screen |
| Parent routing, `/learn` is unavailable | Route doesn't match | Should never happen — `/learn` is always available | Expo Router 404 fallback |

---

## PART 1 — Subject Creation Starter Chips

**Problem:** `create-subject.tsx` has a blank text input with only a placeholder. Users who don't know what to type have no visual prompts — they stare at an empty field.

**Solution:** Add a horizontal `ScrollView` of static suggestion chips below the text input. Tapping a chip pre-fills the name field and immediately triggers `resolveInput` (the same path as typing and submitting). Zero network calls beyond what the normal submit already makes.

### Chip labels (exact)

```
Math · Science · English · History · Geography · Art · Music · Programming · Biology · Physics · Chemistry · Spanish · French · Economics
```

Show them in a single horizontal scrollable row, after the text input and before the error/suggestion area.

### Files to modify

- `apps/mobile/src/app/create-subject.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/app/create-subject.test.tsx` (inside `describe('CreateSubjectScreen')`, before other tests):

```typescript
it('renders starter chips and fills the input on tap', () => {
  render(<CreateSubjectScreen />);

  // Chips container is visible
  expect(screen.getByTestId('starter-chips')).toBeTruthy();

  // "Math" chip is present and tappable
  const mathChip = screen.getByTestId('starter-chip-Math');
  expect(mathChip).toBeTruthy();

  // Tapping fills the name input
  fireEvent.press(mathChip);
  expect(screen.getByTestId('create-subject-name').props.value).toBe('Math');
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/create-subject.tsx --no-coverage 2>&1 | tail -30
```

Expected: FAIL — `starter-chips` testID not found.

- [ ] **Step 3: Add the chips constant and render them**

In `apps/mobile/src/app/create-subject.tsx`, directly after the existing `const SCREEN_HEIGHT = ...` block, add:

```typescript
const STARTER_CHIPS = [
  'Math',
  'Science',
  'English',
  'History',
  'Geography',
  'Art',
  'Music',
  'Programming',
  'Biology',
  'Physics',
  'Chemistry',
  'Spanish',
  'French',
  'Economics',
] as const;
```

- [ ] **Step 4: Add chip tap handler**

Inside `CreateSubjectScreen`, after the existing `onNameChange` callback, add:

```typescript
const onChipPress = useCallback(
  async (chip: string) => {
    setName(chip);
    setError('');
    setResolveState({ phase: 'idle' });
    setResolveRounds(0);
    // Re-use the same resolve path as a normal submit
    await resolveInput(chip);
  },
  [resolveInput]
);
```

- [ ] **Step 5: Render chips in JSX**

In `create-subject.tsx`, locate the block that begins with `<View onLayout={onFieldLayout('name')}>` (the text input section). Directly **after** the closing `</View>` of that block (i.e. after the `</TextInput>` and its wrapping `</View>`), insert:

```tsx
{/* Starter chips — shown while idle, hidden during resolve/suggestion to avoid confusion */}
{resolveState.phase === 'idle' && !isBusy && (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
    testID="starter-chips"
    accessibilityLabel="Suggested subjects"
  >
    {STARTER_CHIPS.map((chip) => (
      <Pressable
        key={chip}
        onPress={() => void onChipPress(chip)}
        className="rounded-full bg-surface-elevated px-4 py-2 min-h-[36px] items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={`Choose ${chip}`}
        testID={`starter-chip-${chip}`}
      >
        <Text className="text-body-sm font-medium text-text-secondary">
          {chip}
        </Text>
      </Pressable>
    ))}
  </ScrollView>
)}
```

`ScrollView` is already imported in this file.

- [ ] **Step 6: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/create-subject.tsx --no-coverage 2>&1 | tail -30
```

Expected: PASS.

- [ ] **Step 7: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors.

---

## PART 2 — Wire `useContinueSuggestion` into Learner Home Card

**Problem:** The "Start learning" `IntentCard` on `LearnerScreen` has no subtitle. The `useContinueSuggestion` hook (in `apps/mobile/src/hooks/use-progress.ts`) calls `GET /progress/continue` and returns `{ suggestion: { topicName, subjectName } | null }`. The hook exists and is tested but is never used in the home screen.

**Solution:** Import and call `useContinueSuggestion` in `LearnerScreen`. When a suggestion is available, use `"Continue with {topicName} in {subjectName}"` as the subtitle for the "Start learning" card.

### Return shape of the hook

`useContinueSuggestion().data` is `{ topicName: string; subjectName: string } | null | undefined`.

- `undefined` — still loading
- `null` — no suggestion (first-time user)
- `{ topicName, subjectName }` — suggestion available

### Files to modify

- `apps/mobile/src/components/home/LearnerScreen.tsx`
- `apps/mobile/src/components/home/LearnerScreen.test.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

Add to `LearnerScreen.test.tsx` inside the existing `describe('LearnerScreen')` block:

```typescript
it('shows continue suggestion as Start learning subtitle when available', async () => {
  // Mock hook to return a suggestion
  mockUseContinueSuggestion.mockReturnValue({
    data: { topicName: 'Fractions', subjectName: 'Math' },
  });

  render(<LearnerScreen {...defaultProps} />);

  await waitFor(() => {
    expect(
      screen.getByText('Continue with Fractions in Math')
    ).toBeTruthy();
  });
});

it('shows no subtitle on Start learning when suggestion is null', () => {
  mockUseContinueSuggestion.mockReturnValue({ data: null });

  render(<LearnerScreen {...defaultProps} />);

  // The card renders without subtitle — no crash
  expect(screen.getByTestId('intent-learn-new')).toBeTruthy();
});
```

- [ ] **Step 2: Add mock to the test file**

In `LearnerScreen.test.tsx`, find the existing mock block for `../../hooks/use-progress` and update it:

```typescript
const mockUseContinueSuggestion = jest.fn();

jest.mock('../../hooks/use-progress', () => ({
  useReviewSummary: () => mockUseReviewSummary(),
  useContinueSuggestion: () => mockUseContinueSuggestion(),
}));
```

Also add to `beforeEach`:

```typescript
mockUseContinueSuggestion.mockReturnValue({ data: undefined });
```

- [ ] **Step 3: Run to confirm it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.tsx --no-coverage 2>&1 | tail -30
```

Expected: FAIL — "Continue with Fractions in Math" not found.

- [ ] **Step 4: Import and call the hook**

In `LearnerScreen.tsx`, update the import line from `use-progress`:

```typescript
import { useReviewSummary, useContinueSuggestion } from '../../hooks/use-progress';
```

Inside the `LearnerScreen` function body, after the existing `const { data: reviewSummary } = useReviewSummary();` line, add:

```typescript
const { data: continueSuggestion } = useContinueSuggestion();
const continueSubtitle =
  continueSuggestion
    ? `Continue with ${continueSuggestion.topicName} in ${continueSuggestion.subjectName}`
    : undefined;
```

- [ ] **Step 5: Wire subtitle into the primary card**

In `LearnerScreen.tsx`, inside `useMemo`, update `primaryCard` to include the subtitle:

```typescript
const primaryCard = {
  title: 'Start learning',
  subtitle: continueSubtitle,
  onPress: () => router.push('/learn-new' as never),
  testID: 'intent-learn-new',
};
```

Also add `continueSubtitle` to the `useMemo` dependency array:

```typescript
}, [
  continueSubtitle,     // <-- add
  hasLibraryContent,
  recoveryMarker,
  reviewDueCount,
  reviewSubtitle,
  router,
]);
```

- [ ] **Step 6: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.tsx --no-coverage 2>&1 | tail -30
```

Expected: PASS.

- [ ] **Step 7: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors.

---

## PART 3 — QuotaExceededCard + Disable Chat Input

**Problem (3a):** When a session stream returns a 402 `QuotaExceededError`, the error falls into `continueWithMessage`'s catch block in `session/index.tsx`. The error is formatted with `formatApiError` and inserted as a plain text bubble — the user sees a flat error string with no action path.

**Problem (3b):** After quota is exceeded the `inputDisabled` prop passed to `ChatShell` is not updated — the user can keep typing into a dead session.

**Solution:** 
- Build a new shared `QuotaExceededCard` component in `apps/mobile/src/components/session/QuotaExceededCard.tsx` that renders an owner-variant (Upgrade / Top-up CTAs) and a child-variant ("Ask your parent") based on `isOwner`.
- In `session/index.tsx`, detect `err instanceof QuotaExceededError` in the catch block, store the details in state, render the `QuotaExceededCard` as a `kind: 'quota_exceeded'` message action, and set `inputDisabled` when quota is exceeded.

### `QuotaExceededDetails` shape (from `@eduagent/schemas`)

```typescript
{
  tier: SubscriptionTier;
  reason: 'monthly' | 'daily';
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
  topUpCreditsRemaining: number;
  upgradeOptions: Array<{ tier: 'plus' | 'family' | 'pro'; monthlyQuota: number; priceMonthly: number }>;
}
```

`QuotaExceededError` is imported from `apps/mobile/src/lib/api-client.ts`. It is already thrown by both the regular fetch middleware (for non-streaming calls) and the SSE XHR handler.

### Files to create

- `apps/mobile/src/components/session/QuotaExceededCard.tsx`
- `apps/mobile/src/components/session/QuotaExceededCard.test.tsx`

### Files to modify

- `apps/mobile/src/components/session/index.ts` (barrel export)
- `apps/mobile/src/app/(app)/session/index.tsx`

### Steps

- [ ] **Step 1: Write the failing test for the component**

Create `apps/mobile/src/components/session/QuotaExceededCard.test.tsx`:

```typescript
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const { QuotaExceededCard } = require('./QuotaExceededCard');

const ownerDetails = {
  tier: 'free' as const,
  reason: 'monthly' as const,
  monthlyLimit: 100,
  usedThisMonth: 100,
  dailyLimit: 10,
  usedToday: 10,
  topUpCreditsRemaining: 0,
  upgradeOptions: [
    { tier: 'plus' as const, monthlyQuota: 700, priceMonthly: 9.99 },
  ],
};

describe('QuotaExceededCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('owner view: shows usage and upgrade button', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={true} />);

    expect(screen.getByTestId('quota-exceeded-card')).toBeTruthy();
    expect(screen.getByText(/used 100 of 100/i)).toBeTruthy();
    expect(screen.getByTestId('quota-upgrade-btn')).toBeTruthy();
  });

  it('owner view: upgrade button navigates to subscription screen', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={true} />);
    fireEvent.press(screen.getByTestId('quota-upgrade-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');
  });

  it('child view: shows ask-your-parent message', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);

    expect(screen.getByTestId('quota-exceeded-card')).toBeTruthy();
    expect(screen.getByText(/ask your parent/i)).toBeTruthy();
    expect(screen.queryByTestId('quota-upgrade-btn')).toBeNull();
  });

  it('daily limit variant: shows daily message', () => {
    const dailyDetails = { ...ownerDetails, reason: 'daily' as const };
    render(<QuotaExceededCard details={dailyDetails} isOwner={true} />);

    expect(screen.getByText(/today's limit/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/QuotaExceededCard.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the `QuotaExceededCard` component**

Create `apps/mobile/src/components/session/QuotaExceededCard.tsx`:

```typescript
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { QuotaExceededDetails } from '../../lib/api-client';

export interface QuotaExceededCardProps {
  details: QuotaExceededDetails;
  isOwner: boolean;
}

/**
 * Shown in-chat when the API returns a 402 QuotaExceededError.
 *
 * - Account owners see their usage, a primary "Upgrade" button, and a
 *   secondary "Top up" button if topUpCreditsRemaining > 0.
 * - Child profiles see a soft "Ask your parent to upgrade" message.
 *
 * Persona-unaware: uses semantic tokens only. The `isOwner` prop controls
 * which variant is shown — no persona checks.
 */
export function QuotaExceededCard({
  details,
  isOwner,
}: QuotaExceededCardProps): React.ReactElement {
  const router = useRouter();

  const isDailyLimit = details.reason === 'daily';
  const limitLabel = isDailyLimit ? "today's limit" : 'this month\'s limit';

  return (
    <View
      className="bg-surface rounded-card p-4 mt-2"
      testID="quota-exceeded-card"
      accessibilityRole="alert"
    >
      <Text className="text-body font-semibold text-text-primary mb-1">
        {isDailyLimit ? 'Daily limit reached' : 'Monthly limit reached'}
      </Text>

      {isOwner ? (
        <>
          <Text className="text-body-sm text-text-secondary mb-3">
            {isDailyLimit
              ? `Used ${details.usedToday} of ${details.dailyLimit ?? details.monthlyLimit} today. Your daily limit resets at midnight.`
              : `Used ${details.usedThisMonth} of ${details.monthlyLimit} this month.`}{' '}
            Upgrade for more learning time.
          </Text>

          <Pressable
            onPress={() => router.push('/(app)/subscription' as never)}
            className="bg-primary rounded-button py-3 items-center min-h-[44px] justify-center mb-2"
            accessibilityRole="button"
            accessibilityLabel="Upgrade plan"
            testID="quota-upgrade-btn"
          >
            <Text className="text-body-sm font-semibold text-text-inverse">
              Upgrade plan
            </Text>
          </Pressable>

          {details.topUpCreditsRemaining > 0 && (
            <Pressable
              onPress={() => router.push('/(app)/subscription' as never)}
              className="bg-surface-elevated rounded-button py-3 items-center min-h-[44px] justify-center"
              accessibilityRole="button"
              accessibilityLabel="Top up credits"
              testID="quota-topup-btn"
            >
              <Text className="text-body-sm font-semibold text-text-secondary">
                Top up credits ({details.topUpCreditsRemaining} remaining)
              </Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <Text className="text-body-sm text-text-secondary mb-3">
            You've reached {limitLabel} for learning sessions. Ask your parent
            to upgrade so you can keep going.
          </Text>

          <View
            className="bg-surface-elevated rounded-button py-3 px-4 items-center"
            testID="quota-ask-parent"
          >
            <Text className="text-body-sm text-text-secondary">
              Ask your parent to upgrade
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Export from session barrel**

In `apps/mobile/src/components/session/index.ts`, add:

```typescript
export { QuotaExceededCard } from './QuotaExceededCard';
export type { QuotaExceededCardProps } from './QuotaExceededCard';
```

- [ ] **Step 5: Run component tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/QuotaExceededCard.tsx --no-coverage 2>&1 | tail -30
```

Expected: PASS.

- [ ] **Step 6: Write failing integration test for session screen**

In `apps/mobile/src/app/(app)/session/index.test.tsx`, add a test that mocks `useStreamMessage` to throw a `QuotaExceededError` and asserts that (a) the `quota-exceeded-card` testID appears in the chat and (b) `input-disabled-banner` is visible.

Locate the existing mock for `useStreamMessage` / `use-sessions` and add:

```typescript
const { QuotaExceededError } = require('../../../lib/api-client');

it('shows QuotaExceededCard and disables input when stream returns 402', async () => {
  const details = {
    tier: 'free',
    reason: 'monthly',
    monthlyLimit: 100,
    usedThisMonth: 100,
    dailyLimit: null,
    usedToday: 0,
    topUpCreditsRemaining: 0,
    upgradeOptions: [],
  };
  mockStream.mockRejectedValueOnce(
    new QuotaExceededError('Quota exceeded', details)
  );

  render(<SessionScreen />, { ...testParams });

  // Send a message to trigger the stream
  await userEvent.type(screen.getByTestId('chat-input'), 'What is photosynthesis?');
  fireEvent.press(screen.getByTestId('chat-send-button'));

  await waitFor(() => {
    expect(screen.getByTestId('quota-exceeded-card')).toBeTruthy();
    expect(screen.getByTestId('input-disabled-banner')).toBeTruthy();
  });
});
```

Note: adapt mock variable names to match what already exists in that test file.

- [ ] **Step 7: Add `quotaError` state and wiring in `session/index.tsx`**

**3b.1 — Add state:**

In `session/index.tsx`, after the existing `const [showFilingPrompt, setShowFilingPrompt] = useState(false);` line, add:

```typescript
const [quotaError, setQuotaError] = useState<import('../../../lib/api-client').QuotaExceededDetails | null>(null);
```

Also add `QuotaExceededError` to the import from `api-client`:

```typescript
import {
  useApiClient,
  QuotaExceededError,
} from '../../../lib/api-client';
```

**3b.2 — Detect quota in `continueWithMessage` catch block:**

In the catch block of `continueWithMessage` (around line 1149), before the `isReconnectableSessionError` call, add quota detection:

```typescript
} catch (err: unknown) {
  // [QUOTA] Detect before reconnect classification — QuotaExceededError is
  // never reconnectable and needs its own structured card, not a text bubble.
  if (err instanceof QuotaExceededError) {
    setIsStreaming(false);
    setQuotaError(err.details);
    // Add a placeholder AI message that renderMessageActions will decorate
    // with the QuotaExceededCard — keep content empty so no duplicate text.
    if (streamId) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === streamId
            ? {
                ...message,
                content: '',
                streaming: false,
                kind: 'quota_exceeded' as const,
                isSystemPrompt: true,
              }
            : message
        )
      );
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: createLocalMessageId('ai'),
          role: 'assistant',
          content: '',
          isSystemPrompt: true,
          kind: 'quota_exceeded' as const,
        },
      ]);
    }
    return;
  }

  const reconnectable = isReconnectableSessionError(err);
  // ... rest of existing catch block unchanged
```

**3b.3 — Add `'quota_exceeded'` to `ChatMessage` kind union:**

Locate the `ChatMessage` type definition (in `apps/mobile/src/components/session/ChatShell.tsx` or wherever `kind` is defined). Add `'quota_exceeded'` to the `kind` union:

```typescript
kind?: 'reconnect_prompt' | 'session_expired' | 'quota_exceeded';
```

**3b.4 — Reset quota state on focus:**

In the `useFocusEffect` callback (around line 483), add:

```typescript
setQuotaError(null);
```

**3b.5 — Wire into `inputDisabled`:**

Update the `inputDisabled` prop passed to `ChatShell`:

```tsx
inputDisabled={
  isOffline ||
  pendingClassification ||
  !!pendingSubjectResolution ||
  sessionExpired ||
  !!quotaError          // <-- add
}
disabledReason={
  isOffline
    ? "You're offline — input will return when you reconnect"
    : sessionExpired
    ? 'This session has ended'
    : quotaError
    ? 'Your session limit has been reached'
    : undefined
}
```

**3b.6 — Render `QuotaExceededCard` in `renderMessageActions`:**

In `renderMessageActions`, after the existing `if (message.kind === 'reconnect_prompt')` block, add:

```typescript
if (message.kind === 'quota_exceeded' && quotaError) {
  return (
    <QuotaExceededCard
      details={quotaError}
      isOwner={activeProfile?.isOwner === true}
    />
  );
}
```

Import `QuotaExceededCard` from the session components barrel:

```typescript
import {
  ChatShell,
  animateResponse,
  getModeConfig,
  getOpeningMessage,
  SessionTimer,
  QuestionCounter,
  LibraryPrompt,
  SessionInputModeToggle,
  QuotaExceededCard,           // <-- add
  type ChatMessage,
} from '../../../components/session';
```

- [ ] **Step 8: Run session tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/session/index.tsx --no-coverage 2>&1 | tail -40
```

Expected: PASS (including new quota test).

- [ ] **Step 9: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors.

---

## PART 4 — Parent Routing to `/learn`

**Problem:** `ParentGateway` routes parents to `/learn-new` for the "Learn something" intent card. `/learn-new` (`learn-new.tsx`) is a standalone screen with subject-picker and freeform shortcuts. But the spec intends parents to reach `/learn` (`learn.tsx`), which renders `LearnerScreen` — giving them the full intent stack including the "Help with assignment?" homework card.

**Solution:** Change the `onPress` of the `gateway-learn` `IntentCard` in `ParentGateway.tsx` from `/learn-new` to `/learn`.

### Files to modify

- `apps/mobile/src/components/home/ParentGateway.tsx`
- `apps/mobile/src/components/home/ParentGateway.test.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

In `ParentGateway.test.tsx`, add:

```typescript
it('gateway-learn card routes to /learn, not /learn-new', () => {
  render(<ParentGateway {...defaultProps} />);

  const learnCard = screen.getByTestId('gateway-learn');
  fireEvent.press(learnCard);

  expect(mockPush).toHaveBeenCalledWith('/learn');
  expect(mockPush).not.toHaveBeenCalledWith('/learn-new');
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/ParentGateway.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `mockPush` called with `/learn-new`, not `/learn`.

- [ ] **Step 3: Update `ParentGateway.tsx`**

In `apps/mobile/src/components/home/ParentGateway.tsx`, find:

```typescript
<IntentCard
  title="Learn something"
  onPress={() => router.push('/learn-new' as never)}
  testID="gateway-learn"
/>
```

Change to:

```typescript
<IntentCard
  title="Learn something"
  onPress={() => router.push('/learn' as never)}
  testID="gateway-learn"
/>
```

- [ ] **Step 4: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/ParentGateway.tsx --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors.

---

## Combined Verification

Run all four areas together before committing:

```bash
cd apps/mobile && pnpm exec jest \
  --findRelatedTests \
  src/app/create-subject.tsx \
  src/components/home/LearnerScreen.tsx \
  src/components/session/QuotaExceededCard.tsx \
  src/app/(app)/session/index.tsx \
  src/components/home/ParentGateway.tsx \
  --no-coverage 2>&1 | tail -40
```

Then typecheck:

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | tail -20
```

Then API lint (no API files changed in this plan, but confirm):

```bash
pnpm exec nx run api:typecheck 2>&1 | tail -20
```

---

## Fix Summary

| # | Finding | File(s) | Verified By |
|---|---------|---------|-------------|
| 1 | Blank-page paralysis on subject creation | `create-subject.tsx` | `test: create-subject.test.tsx:"renders starter chips and fills the input on tap"` |
| 2 | "Start learning" card has no subtitle | `LearnerScreen.tsx` | `test: LearnerScreen.test.tsx:"shows continue suggestion as Start learning subtitle"` |
| 3a | Quota exceeded shown as plain text bubble | `session/index.tsx`, `QuotaExceededCard.tsx` | `test: session/index.test.tsx:"shows QuotaExceededCard and disables input when stream returns 402"` |
| 3b | Chat input stays enabled after quota exceeded | `session/index.tsx` | Same test as 3a — `input-disabled-banner` assertion |
| 4 | Parents routed to wrong `/learn-new` entry point | `ParentGateway.tsx` | `test: ParentGateway.test.tsx:"gateway-learn card routes to /learn, not /learn-new"` |

---

## Notes for Implementors

- `QuotaExceededCard` must remain persona-unaware per the shared-component rules. The `isOwner` boolean is a data-layer fact, not a persona check.
- The `kind: 'quota_exceeded'` message does not need visible `content` text — the `QuotaExceededCard` is rendered by `renderMessageActions`, not from `message.content`. Keep `content: ''` to avoid a duplicate text bubble.
- Do not clear `quotaError` state when the user reads the card. It should persist until the session is re-focused (i.e., until `useFocusEffect` fires again on next visit to the screen).
- The `/learn` route (`learn.tsx`) already accepts an `onBack` prop wired to `goBackOrReplace(router, '/(app)/home')`, so parents pressing back from `LearnerScreen` return cleanly to the home screen.
- Commit each part separately following the project convention: `fix(mobile): add subject starter chips [HOME-01]`, `fix(mobile): wire useContinueSuggestion into home card [HOME-02]`, `fix(mobile): QuotaExceededCard + disable chat input [HOME-03]`, `fix(mobile): route ParentGateway to /learn [HOME-04]`.
