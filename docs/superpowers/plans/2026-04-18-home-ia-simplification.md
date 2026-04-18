# Home Screen & Navigation IA Simplification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify home screen to 5 intent cards, delete the /learn-new hub, consolidate topic actions, fix onboarding back-navigation, add accommodations to onboarding, and improve practice review empty state.

**Architecture:** Delete the intermediate `/learn-new` navigation hub (net deletion). Rebuild `LearnerScreen` with 5 always-visible cards + 1 conditional Continue card. Merge create-subject picker into a single adaptive list. Collapse topic detail from 6 action buttons to 1 smart primary + expandable secondary. Fix the onboarding flow to chain properly (interview → language-setup/analogy-preference → accommodations → curriculum-review) with step indicator and correct back navigation. Add `nextReviewAt` to the review-summary API for practice empty state.

**Tech Stack:** React Native, Expo Router, NativeWind, React Query, Zod, Ionicons, Hono (API), Drizzle ORM

**Spec:** `docs/superpowers/specs/2026-04-18-home-ia-simplification-design.md`

---

## Onboarding Param Contract

To prevent param loss across the 4-step chain, every forward `router.replace()` MUST carry this shape, and every back fallback MUST pass the same:

```ts
type OnboardingParams = {
  subjectId: string;          // required everywhere
  subjectName?: string;        // required from interview onward for display
  languageCode?: string;       // flags language flow — MUST propagate end-to-end
  languageName?: string;       // display name for language
  step: string;                // "1" | "2" | "3" | "4"
  totalSteps: string;          // always "4"
};
```

Rules:
1. Use `goBackOrReplace(router, { pathname, params })` — NEVER bare `router.back()` — per `feedback_never_switch_branch` + MEMORY `goBackOrReplace mandatory`.
2. Every forward `router.replace({ pathname, params })` passes the full shape (spread prior params). No forward nav may drop `languageCode` / `languageName`.
3. Every screen reads `step`/`totalSteps` with `Number(...) || <default>` to survive deep links.

## Failure Modes (Plan-Level)

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| `useUpdateAccommodationMode` fails in onboarding | API 500, network drop | `Alert.alert('Could not save setting', 'Please try again.')` + button re-enables | Retry or Skip |
| `useReviewSummary` fails on Home | 401/403 auth lapse | Continue card falls back to hidden (no-op) | Other cards still usable |
| Step indicator gets `step > totalSteps` | Malformed deep link | Dots clamp to `totalSteps`; label renders normally | N/A (cosmetic) |
| Accommodations opened without `subjectId` | Deep link / broken nav | "No subject selected" + Go back | Back falls through to Home via `goBackOrReplace` |
| `nextUpcomingReviewAt` is past at render time | React Query cache stale | `formatTimeUntil` returns "soon" | Auto-refetch on focus |
| Practice Review tapped with 0 overdue | Empty state at root | Card renders with `Nothing to review now` subtitle up front — no tap-to-discover | Browse topics link |
| Topic detail `topicProgress` undefined | Load not settled | Primary button disabled until data ready | Spinner state (existing) |

---

## File Structure Overview

### New files
- `apps/mobile/src/components/onboarding/OnboardingStepIndicator.tsx` — step dot indicator
- `apps/mobile/src/components/onboarding/OnboardingStepIndicator.test.tsx`
- `apps/mobile/src/app/(app)/onboarding/accommodations.tsx` — accommodation picker in onboarding
- `apps/mobile/src/app/(app)/onboarding/accommodations.test.tsx`
- `apps/mobile/src/lib/accommodation-options.ts` — shared constant (DRY: currently duplicated in more.tsx + child settings)
- `apps/mobile/src/app/(app)/topic/[topicId].test.tsx` — new tests for action button consolidation

### Deleted files
- `apps/mobile/src/app/(app)/learn-new.tsx`
- `apps/mobile/src/app/(app)/learn-new.test.tsx`
- `apps/mobile/src/app/(app)/learn.tsx` (redirect shim)

### Modified files
- `apps/mobile/src/components/home/IntentCard.tsx` — add `icon` prop
- `apps/mobile/src/components/home/IntentCard.test.tsx` — icon tests
- `apps/mobile/src/components/home/LearnerScreen.tsx` — rebuild with 5 cards
- `apps/mobile/src/components/home/LearnerScreen.test.tsx` — update for new cards
- `apps/mobile/src/components/home/ParentGateway.tsx` — route change
- `apps/mobile/src/components/home/ParentGateway.test.tsx` — route assertion
- `apps/mobile/src/app/(app)/practice.tsx` — back button + review empty state
- `apps/mobile/src/app/create-subject.tsx` — merge lists + route language subjects to interview
- `apps/mobile/src/app/(app)/topic/[topicId].tsx` — smart primary + expandable secondary
- `apps/mobile/src/app/(app)/onboarding/interview.tsx` — forward nav + step indicator
- `apps/mobile/src/app/(app)/onboarding/interview.test.tsx` — nav assertions
- `apps/mobile/src/app/(app)/onboarding/analogy-preference.tsx` — back/forward nav + step indicator
- `apps/mobile/src/app/(app)/onboarding/analogy-preference.test.tsx` — nav assertions
- `apps/mobile/src/app/(app)/onboarding/language-setup.tsx` — forward nav + step indicator
- `apps/mobile/src/app/(app)/onboarding/language-setup.test.tsx` — nav assertions
- `apps/mobile/src/app/(app)/onboarding/curriculum-review.tsx` — back nav + step indicator
- `apps/mobile/src/app/(app)/onboarding/curriculum-review.test.tsx` — nav assertions
- `apps/mobile/src/app/(app)/more.tsx` — use shared accommodation options
- `apps/mobile/src/app/screen-navigation.test.ts` — remove learn.tsx exempt entry
- `apps/mobile/src/hooks/use-progress.ts` — add `nextUpcomingReviewAt` to ReviewSummary
- `apps/api/src/services/retention-data.ts` — add next upcoming review query
- `apps/api/src/routes/progress.ts` — pass through `nextUpcomingReviewAt`

---

## Task 1: Add icon prop to IntentCard

**Files:**
- Modify: `apps/mobile/src/components/home/IntentCard.tsx`
- Modify: `apps/mobile/src/components/home/IntentCard.test.tsx`

- [ ] **Step 1: Write failing tests for icon prop**

Add two tests to `IntentCard.test.tsx`:

```tsx
it('renders icon when provided', () => {
  render(<IntentCard title="Learn" onPress={jest.fn()} icon="book-outline" testID="card" />);
  const icon = screen.getByTestId('card-icon');
  expect(icon).toBeTruthy();
});

it('does not render icon element when omitted', () => {
  render(<IntentCard title="Learn" onPress={jest.fn()} testID="card" />);
  expect(screen.queryByTestId('card-icon')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/IntentCard.tsx --no-coverage`
Expected: 2 new tests FAIL (icon tests), existing tests PASS.

- [ ] **Step 3: Add icon prop to IntentCard**

In `IntentCard.tsx`, add `icon` to the props interface and render it to the left of the title:

```tsx
interface IntentCardProps {
  title: string;
  subtitle?: string;
  badge?: number;
  variant?: 'default' | 'highlight';
  icon?: string;
  onPress: () => void;
  testID?: string;
}

export function IntentCard({ title, subtitle, badge, variant = 'default', icon, onPress, testID }: IntentCardProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className={`rounded-card border-l-4 border-primary ${variant === 'highlight' ? 'bg-primary-soft' : 'bg-surface-elevated'}`}
      style={[{ minHeight: 80, paddingHorizontal: 20, paddingVertical: 16 }, Platform.OS === 'web' ? { cursor: 'pointer' } : undefined]}
    >
      <View className="flex-row items-center flex-1">
        {icon && (
          <Ionicons
            name={icon as any}
            size={28}
            color={colors.primary}
            testID={`${testID}-icon`}
            style={{ marginRight: 14 }}
          />
        )}
        <View className="flex-1 justify-center">
          <View className="flex-row items-center">
            <Text className="text-lg font-bold text-foreground">{title}</Text>
            {badge != null && badge > 0 && (
              <View testID={`${testID}-badge`} className="ml-2 rounded-full bg-primary-soft px-2 py-0.5">
                <Text className="text-xs font-semibold text-primary">{badge}</Text>
              </View>
            )}
          </View>
          {subtitle != null && (
            <Text className="text-sm text-muted mt-1">{subtitle}</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.primary} />
      </View>
    </Pressable>
  );
}
```

Update test assertions for `card-icon` testID pattern: the testID is `{testID}-icon`, so adjust the tests:

```tsx
it('renders icon when provided', () => {
  render(<IntentCard title="Learn" onPress={jest.fn()} icon="book-outline" testID="card" />);
  expect(screen.getByTestId('card-icon')).toBeTruthy();
});

it('does not render icon element when omitted', () => {
  render(<IntentCard title="Learn" onPress={jest.fn()} testID="card" />);
  expect(screen.queryByTestId('card-icon')).toBeNull();
});
```

- [ ] **Step 4: Update existing badge test**

The badge testID changed from `card-badge` to `{testID}-badge`. Update the existing badge test:

```tsx
it('renders badge when provided', () => {
  render(<IntentCard title="Review" onPress={jest.fn()} badge={6} testID="card" />);
  const badge = screen.getByTestId('card-badge');
  expect(badge).toBeTruthy();
  expect(screen.getByText('6')).toBeTruthy();
});
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/IntentCard.tsx --no-coverage`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/home/IntentCard.tsx apps/mobile/src/components/home/IntentCard.test.tsx
git commit -m "feat(mobile): add icon prop to IntentCard component

Supports distinct icons per card for the home screen redesign.
Each card can now render an Ionicons icon to the left of the title."
```

---

## Task 2: Rebuild LearnerScreen with 5 intent cards

**Files:**
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx:40-271`
- Modify: `apps/mobile/src/components/home/LearnerScreen.test.tsx`

**Context:** Current LearnerScreen has 2-4 cards (Continue recovery, Continue suggestion, "Start learning" → `/learn-new`, Homework). New design: 5 always-visible cards + 1 conditional Continue. The "Start learning" card becomes "Learn" → `/create-subject`. New cards: "Ask" → freeform session, "Practice" → `/(app)/practice`.

- [ ] **Step 1: Update test file — new test IDs and navigation targets**

Replace all `intent-learn-new` references with `intent-learn`. Add tests for `intent-ask` and `intent-practice`. Update navigation expectations.

Key test changes in `LearnerScreen.test.tsx`:

```tsx
// Updated navigation test — was '/learn-new', now '/create-subject'
it('navigates to create-subject on the Learn card', () => {
  renderComponent();
  fireEvent.press(screen.getByTestId('intent-learn'));
  expect(mockPush).toHaveBeenCalledWith('/create-subject');
});

// New test for Ask card
it('navigates to freeform session on Ask card', () => {
  renderComponent();
  fireEvent.press(screen.getByTestId('intent-ask'));
  expect(mockPush).toHaveBeenCalledWith('/(app)/session?mode=freeform');
});

// New test for Practice card
it('navigates to practice on Practice card', () => {
  renderComponent();
  fireEvent.press(screen.getByTestId('intent-practice'));
  expect(mockPush).toHaveBeenCalledWith('/(app)/practice');
});

// Updated card order (5 cards, no Continue shown when no data)
it('shows all 4 always-visible cards in correct order', () => {
  renderComponent();
  const stack = screen.getByTestId('learner-intent-stack');
  const cards = stack.children.filter((c: any) => c.props?.testID?.startsWith('intent-'));
  const ids = cards.map((c: any) => c.props.testID);
  expect(ids).toEqual(['intent-learn', 'intent-ask', 'intent-practice', 'intent-homework']);
});

// Continue card with overdue review (new behavior)
it('shows continue card when overdue topics exist', () => {
  mockUseContinueSuggestion.mockReturnValue({ data: null });
  mockUseReviewSummary.mockReturnValue({
    data: { totalOverdue: 3, nextReviewTopic: { topicId: 't1', subjectId: 's1', subjectName: 'Math', topicTitle: 'Algebra' } },
  });
  renderComponent();
  const continueCard = screen.getByTestId('intent-continue');
  expect(continueCard).toBeTruthy();
  expect(screen.getByText(/3 topics to review/)).toBeTruthy();
});
```

Also add mock for `useReviewSummary`:

```tsx
const mockUseReviewSummary = jest.fn().mockReturnValue({ data: null });
// In jest.mock('../../hooks/use-progress', ...):
jest.mock('../../hooks/use-progress', () => ({
  useContinueSuggestion: () => mockUseContinueSuggestion(),
  useReviewSummary: () => mockUseReviewSummary(),
}));
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.tsx --no-coverage`
Expected: New/changed tests FAIL.

- [ ] **Step 3: Rewrite LearnerScreen intent card logic**

In `LearnerScreen.tsx`, add `useReviewSummary` import and rebuild the `intentCards` useMemo:

```tsx
import { useContinueSuggestion, useReviewSummary } from '../../hooks/use-progress';

// Inside component:
const { data: reviewSummary } = useReviewSummary();

const intentCards = useMemo(() => {
  const cards: Array<{
    testID: string;
    title: string;
    subtitle?: string;
    icon: string;
    variant?: 'default' | 'highlight';
    badge?: number;
    onPress: () => void;
  }> = [];

  // 1. Continue card (conditional — first match wins)
  if (recoveryMarker) {
    cards.push({
      testID: 'intent-continue',
      title: 'Continue',
      subtitle: `${recoveryMarker.subjectName ?? 'Session'} \u00B7 resume`,
      icon: 'play-circle-outline',
      variant: 'highlight',
      onPress: () => {
        clearSessionRecoveryMarker(activeProfile?.id);
        router.push({
          pathname: '/(app)/session',
          params: {
            sessionId: recoveryMarker.sessionId,
            subjectId: recoveryMarker.subjectId ?? '',
            subjectName: recoveryMarker.subjectName ?? '',
            mode: recoveryMarker.mode ?? 'learning',
            topicId: recoveryMarker.topicId ?? '',
            topicName: recoveryMarker.topicName ?? '',
          },
        });
      },
    });
  } else if (continueSuggestion) {
    cards.push({
      testID: 'intent-continue',
      title: 'Continue',
      subtitle: `${continueSuggestion.subjectName} \u00B7 ${continueSuggestion.topicTitle}`,
      icon: 'play-circle-outline',
      onPress: () => {
        router.push({
          pathname: '/(app)/session',
          params: {
            lastSessionId: continueSuggestion.lastSessionId ?? '',
            subjectId: continueSuggestion.subjectId,
            subjectName: continueSuggestion.subjectName,
            topicId: continueSuggestion.topicId,
            topicName: continueSuggestion.topicTitle,
            mode: 'learning',
          },
        });
      },
    });
  } else if (reviewSummary && reviewSummary.totalOverdue > 0 && reviewSummary.nextReviewTopic) {
    const { nextReviewTopic, totalOverdue } = reviewSummary;
    cards.push({
      testID: 'intent-continue',
      title: 'Continue',
      subtitle: `${nextReviewTopic.subjectName} \u00B7 ${totalOverdue} topic${totalOverdue === 1 ? '' : 's'} to review`,
      icon: 'play-circle-outline',
      onPress: () => {
        router.push({
          pathname: '/(app)/topic/relearn',
          params: {
            topicId: nextReviewTopic.topicId,
            subjectId: nextReviewTopic.subjectId,
            topicName: nextReviewTopic.topicTitle,
          },
        });
      },
    });
  }
  // If none of the above: Continue card hidden

  // 2. Learn (always)
  cards.push({
    testID: 'intent-learn',
    title: 'Learn',
    subtitle: 'Start a new subject or pick one',
    icon: 'book-outline',
    onPress: () => router.push('/create-subject'),
  });

  // 3. Ask (always)
  cards.push({
    testID: 'intent-ask',
    title: 'Ask',
    subtitle: 'Get answers to any question',
    icon: 'chatbubble-ellipses-outline',
    onPress: () => router.push('/(app)/session?mode=freeform'),
  });

  // 4. Practice (always)
  cards.push({
    testID: 'intent-practice',
    title: 'Practice',
    subtitle: 'Games and reviews to sharpen what you know',
    icon: 'game-controller-outline',
    onPress: () => router.push('/(app)/practice'),
  });

  // 5. Homework (always)
  cards.push({
    testID: 'intent-homework',
    title: 'Homework',
    subtitle: 'Snap a photo, get help',
    icon: 'camera-outline',
    onPress: () => router.push('/(app)/homework/camera'),
  });

  return cards;
}, [recoveryMarker, continueSuggestion, reviewSummary, activeProfile?.id, router]);
```

Update the JSX to pass `icon` to `IntentCard`:

```tsx
{intentCards.map((card) => (
  <IntentCard
    key={card.testID}
    testID={card.testID}
    title={card.title}
    subtitle={card.subtitle}
    icon={card.icon}
    variant={card.variant}
    badge={card.badge}
    onPress={card.onPress}
  />
))}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.tsx --no-coverage`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/home/LearnerScreen.tsx apps/mobile/src/components/home/LearnerScreen.test.tsx
git commit -m "feat(mobile): rebuild LearnerScreen with 5 intent cards

Home screen now shows: Continue (conditional), Learn, Ask, Practice, Homework.
Continue card uses priority: recovery > API suggestion > overdue review > hidden.
Learn navigates to /create-subject (was /learn-new). Ask and Practice are new cards."
```

---

## Task 3: Delete /learn-new, /learn redirect, update references

**Files:**
- Delete: `apps/mobile/src/app/(app)/learn-new.tsx`
- Delete: `apps/mobile/src/app/(app)/learn-new.test.tsx`
- Delete: `apps/mobile/src/app/(app)/learn.tsx`
- Modify: `apps/mobile/src/app/(app)/practice.tsx:14` — back button target
- Modify: `apps/mobile/src/components/home/ParentGateway.tsx:97` — route target
- Modify: `apps/mobile/src/components/home/ParentGateway.test.tsx`
- Modify: `apps/mobile/src/app/screen-navigation.test.ts`

- [ ] **Step 1: Update practice.tsx back button**

In `apps/mobile/src/app/(app)/practice.tsx`, change the back target:

```tsx
// Before:
goBackOrReplace(router, '/(app)/learn-new');
// After:
goBackOrReplace(router, '/(app)/home');
```

- [ ] **Step 2: Update ParentGateway route**

In `apps/mobile/src/components/home/ParentGateway.tsx`, change "Learn something" card navigation:

```tsx
// Before:
onPress={() => router.push('/learn')}
// After:
onPress={() => router.push('/create-subject')}
```

- [ ] **Step 3: Update ParentGateway test**

In `ParentGateway.test.tsx`, update the navigation assertion:

```tsx
// Before:
expect(mockPush).toHaveBeenCalledWith('/learn');
// After:
expect(mockPush).toHaveBeenCalledWith('/create-subject');
```

Remove the `.not.toHaveBeenCalledWith('/learn-new')` assertion (no longer relevant).

- [ ] **Step 4: Update screen-navigation.test.ts**

In `apps/mobile/src/app/screen-navigation.test.ts`, remove `(app)/learn.tsx` from `EXEMPT_SCREENS` since the file is being deleted.

- [ ] **Step 5: Delete the files**

```bash
rm apps/mobile/src/app/\(app\)/learn-new.tsx
rm apps/mobile/src/app/\(app\)/learn-new.test.tsx
rm apps/mobile/src/app/\(app\)/learn.tsx
```

- [ ] **Step 6: Search for any remaining references to learn-new**

Run: `grep -r "learn-new" apps/mobile/src/ --include="*.tsx" --include="*.ts"`
Expected: Zero results. If any remain, update them.

- [ ] **Step 7: Run affected tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/app/\(app\)/practice.tsx \
  src/components/home/ParentGateway.tsx \
  src/app/screen-navigation.test.ts \
  src/components/home/LearnerScreen.tsx \
  --no-coverage
```

Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(mobile): delete /learn-new hub and /learn redirect

Removes the intermediate navigation hub. Practice back button targets home.
ParentGateway 'Learn something' routes to /create-subject.
All /learn-new references eliminated."
```

---

## Task 4: Merge create-subject lists

**Files:**
- Modify: `apps/mobile/src/app/create-subject.tsx:443-504`

**Context:** Currently two separate groups when input is empty: "Or continue with" horizontal pills (existing subjects) and starter chips (new subjects). The "Or continue with" heading is ambiguous — it sits between the input and the starter chips, so users can't tell whether it labels the pills below OR belongs to the chips above. Merging into a single unified list with explicit `Continue {name}` / `Start {name}` prefixes DELETES the ambiguous heading entirely (no divider needed — the prefix carries the semantics). This is a side-benefit of Task 4 and should be verified at Step 3.

- [ ] **Step 1: Identify the two list sections**

Read `create-subject.tsx` lines 443-504. The "Or continue with" section renders horizontal `Pressable` pills for `existingSubjects`. The starter chips section renders `Pressable` chips for filtered starter names.

- [ ] **Step 2: Replace both sections with a unified list**

Replace the two sections with a single `View` containing both existing subjects and starter chips in a unified vertical list:

```tsx
{/* Unified subject list — existing first, then starters */}
{resolveState === 'idle' && !name.trim() && (
  <View className="gap-3 mt-4">
    {/* Existing subjects — sorted by most recent */}
    {existingSubjects.map((subject) => (
      <Pressable
        key={subject.id}
        testID={`subject-continue-${subject.id}`}
        className="rounded-card bg-surface-elevated px-4 py-3 flex-row items-center"
        onPress={() => {
          router.push({
            pathname: '/(app)/session',
            params: { subjectId: subject.id, subjectName: subject.name, mode: 'learning' },
          });
        }}
      >
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">Continue {subject.name}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    ))}

    {/* Starter chips — filtered to exclude existing */}
    {starterChips.map((chipName) => (
      <Pressable
        key={chipName}
        testID={`subject-start-${chipName.toLowerCase()}`}
        className="rounded-card bg-surface-elevated px-4 py-3 flex-row items-center"
        onPress={() => resolveInput(chipName)}
      >
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">Start {chipName}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    ))}
  </View>
)}
```

Where `starterChips` is the already-filtered array of starter names (excluding existing subjects).

- [ ] **Step 2b: Remove the "Or continue with" heading/label**

Search for and DELETE any remaining `"Or continue with"` text — it becomes unnecessary once the lists merge:

```bash
grep -n "Or continue with" apps/mobile/src/app/create-subject.tsx
# Expected: 0 matches after merge. If any remain, remove them.
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run related tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/create-subject.tsx --no-coverage`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/create-subject.tsx
git commit -m "feat(mobile): merge create-subject into unified adaptive list

Existing subjects show 'Continue {name}', starter chips show 'Start {name}'.
Sorted with existing subjects first, then starters. Same visual treatment."
```

---

## Task 5: Consolidate topic detail action buttons

**Files:**
- Modify: `apps/mobile/src/app/(app)/topic/[topicId].tsx:600-750`
- Create: `apps/mobile/src/app/(app)/topic/[topicId].test.tsx`

**Context:** Currently 6 action buttons with overlapping names. Spec: 1 smart primary + expandable "More ways to practice" secondary.

- [ ] **Step 1: Write tests for smart primary button logic**

Create `[topicId].test.tsx` with tests for primary button derivation:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ subjectId: 's1', topicId: 't1' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#00B4D8', muted: '#888', foreground: '#fff',
    retentionWeak: '#f00', retentionFading: '#ff0', retentionStrong: '#0f0',
    surfaceElevated: '#222',
  }),
}));
jest.mock('../../../lib/navigation', () => ({ goBackOrReplace: jest.fn() }));

const mockTopicProgress = jest.fn();
const mockTopicRetention = jest.fn();
const mockEvaluateEligibility = jest.fn();
const mockActiveSession = jest.fn();
const mockParkingLot = jest.fn();
const mockTopicNote = jest.fn();

jest.mock('../../../hooks/use-progress', () => ({
  useTopicProgress: () => mockTopicProgress(),
  useActiveSessionForTopic: () => mockActiveSession(),
}));
jest.mock('../../../hooks/use-retention', () => ({
  useTopicRetention: () => mockTopicRetention(),
  useEvaluateEligibility: () => mockEvaluateEligibility(),
}));
jest.mock('../../../hooks/use-sessions', () => ({
  useTopicParkingLot: () => mockParkingLot(),
}));
jest.mock('../../../hooks/use-notes', () => ({
  useGetTopicNote: () => mockTopicNote(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TopicDetailScreen = require('./[topicId]').default;

function setupDefaults(overrides: {
  completionStatus?: string;
  failureCount?: number;
  struggleStatus?: string;
  evaluateEligible?: boolean;
  repetitions?: number;
  easeFactor?: number;
}) {
  const {
    completionStatus = 'not_started',
    failureCount = 0,
    struggleStatus = 'normal',
    evaluateEligible = false,
    repetitions = 0,
    easeFactor = 2.5,
  } = overrides;

  mockTopicProgress.mockReturnValue({
    data: { completionStatus, struggleStatus, title: 'Algebra', description: '', masteryScore: null, summaryExcerpt: null, xpStatus: null, retentionStatus: null, topicId: 't1' },
    isLoading: false, isError: false, refetch: jest.fn(),
  });
  mockTopicRetention.mockReturnValue({
    data: { card: { failureCount, repetitions, easeFactor, nextReviewAt: null, lastReviewedAt: null, intervalDays: 1, xpStatus: 'pending', topicId: 't1' } },
    isLoading: false, isError: false, refetch: jest.fn(),
  });
  mockEvaluateEligibility.mockReturnValue({ data: { eligible: evaluateEligible, topicId: 't1', topicTitle: 'Algebra', currentRung: 1, easeFactor, repetitions } });
  mockActiveSession.mockReturnValue({ data: null });
  mockParkingLot.mockReturnValue({ data: [], isLoading: false });
  mockTopicNote.mockReturnValue({ data: null });
}

describe('TopicDetailScreen action buttons', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows "Start learning" as primary for not_started topics', () => {
    setupDefaults({ completionStatus: 'not_started' });
    render(<TopicDetailScreen />);
    expect(screen.getByTestId('primary-action-button')).toBeTruthy();
    expect(screen.getByText('Start learning')).toBeTruthy();
  });

  it('shows "Continue learning" as primary for in_progress topics', () => {
    setupDefaults({ completionStatus: 'in_progress' });
    render(<TopicDetailScreen />);
    expect(screen.getByText('Continue learning')).toBeTruthy();
  });

  it('shows "Relearn" as primary when struggling', () => {
    setupDefaults({ completionStatus: 'completed', failureCount: 3, struggleStatus: 'needs_deepening' });
    render(<TopicDetailScreen />);
    expect(screen.getByText('Relearn')).toBeTruthy();
  });

  it('hides secondary section when no secondary actions apply', () => {
    setupDefaults({ completionStatus: 'not_started' });
    render(<TopicDetailScreen />);
    expect(screen.queryByTestId('more-ways-toggle')).toBeNull();
  });

  it('shows expandable secondary section with Recall Check', () => {
    setupDefaults({ completionStatus: 'in_progress' });
    render(<TopicDetailScreen />);
    const toggle = screen.getByTestId('more-ways-toggle');
    fireEvent.press(toggle);
    expect(screen.getByText('Recall Check')).toBeTruthy();
  });

  it('shows Challenge yourself when eligible', () => {
    setupDefaults({ completionStatus: 'completed', evaluateEligible: true });
    render(<TopicDetailScreen />);
    const toggle = screen.getByTestId('more-ways-toggle');
    fireEvent.press(toggle);
    expect(screen.getByText('Challenge yourself')).toBeTruthy();
  });

  it('shows Teach it back when retention qualifies', () => {
    setupDefaults({ completionStatus: 'completed', repetitions: 3, easeFactor: 2.5 });
    render(<TopicDetailScreen />);
    const toggle = screen.getByTestId('more-ways-toggle');
    fireEvent.press(toggle);
    expect(screen.getByText('Teach it back')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd apps/mobile && pnpm exec jest src/app/\(app\)/topic/\\[topicId\\].test.tsx --no-coverage`
Expected: Tests FAIL (current implementation doesn't match new test IDs/structure).

- [ ] **Step 3: Implement smart primary + expandable secondary**

Replace the action buttons section in `[topicId].tsx` (approximately lines 600-750):

```tsx
// Derive primary action from topic state
const primaryAction = useMemo(() => {
  const topicName = topicProgress?.title ?? '';
  const retentionCard = retentionData?.card;
  const isStruggling =
    (retentionCard && retentionCard.failureCount >= 3) ||
    topicProgress?.struggleStatus === 'needs_deepening';

  if (isStruggling) {
    return {
      label: 'Relearn',
      mode: 'relearn' as const,
      testID: 'primary-action-button',
      route: '/(app)/topic/relearn' as const,
      params: { subjectId, topicId, topicName },
    };
  }

  const status = topicProgress?.completionStatus;
  if (status === 'not_started') {
    return {
      label: 'Start learning',
      mode: 'freeform' as const,
      testID: 'primary-action-button',
      route: '/(app)/session' as const,
      params: { subjectId, topicId, topicName, mode: 'freeform' },
    };
  }

  if (status === 'completed' || status === 'verified' || status === 'stable') {
    const isOverdue = retentionCard?.nextReviewAt && new Date(retentionCard.nextReviewAt) < new Date();
    if (isOverdue) {
      return {
        label: 'Review',
        mode: 'practice' as const,
        testID: 'primary-action-button',
        route: '/(app)/session' as const,
        params: { subjectId, topicId, topicName, mode: 'practice' },
      };
    }
  }

  // Default: continue learning (in_progress or completed-not-overdue)
  return {
    label: 'Continue learning',
    mode: 'freeform' as const,
    testID: 'primary-action-button',
    route: '/(app)/session' as const,
    params: {
      subjectId, topicId, topicName, mode: 'freeform',
      ...(activeSession ? { sessionId: activeSession.id } : {}),
    },
  };
}, [topicProgress, retentionData, activeSession, subjectId, topicId]);

// Derive secondary actions
const secondaryActions = useMemo(() => {
  const actions: Array<{ label: string; explanation: string; testID: string; onPress: () => void }> = [];
  const retentionCard = retentionData?.card;

  // Recall Check — always available (except not_started)
  if (topicProgress?.completionStatus !== 'not_started') {
    actions.push({
      label: 'Recall Check',
      explanation: 'Test your memory without hints',
      testID: 'secondary-recall-check',
      onPress: () => router.push({
        pathname: '/(app)/topic/recall-test',
        params: { subjectId, topicId, topicName: topicProgress?.title ?? '' },
      }),
    });
  }

  // Challenge yourself
  if (evaluateEligibility?.eligible) {
    actions.push({
      label: 'Challenge yourself',
      explanation: 'Test yourself with tough questions',
      testID: 'secondary-challenge',
      onPress: () => router.push({
        pathname: '/(app)/session',
        params: { subjectId, topicId, topicName: topicProgress?.title ?? '', verificationType: 'evaluate' },
      }),
    });
  }

  // Teach it back
  if (retentionCard && retentionCard.repetitions > 0 && retentionCard.easeFactor >= 2.3) {
    actions.push({
      label: 'Teach it back',
      explanation: 'Explain this topic in your own words',
      testID: 'secondary-teach-back',
      onPress: () => router.push({
        pathname: '/(app)/session',
        params: { subjectId, topicId, topicName: topicProgress?.title ?? '', verificationType: 'teach_back' },
      }),
    });
  }

  return actions;
}, [topicProgress, retentionData, evaluateEligibility, subjectId, topicId, router]);

// State for expandable secondary section
const [showSecondary, setShowSecondary] = useState(false);
```

And in JSX (footer area):

```tsx
{/* Primary action button */}
<Pressable
  testID={primaryAction.testID}
  className="bg-primary rounded-card py-4 items-center"
  onPress={() => router.push({ pathname: primaryAction.route, params: primaryAction.params })}
>
  <Text className="text-lg font-bold text-on-primary">{primaryAction.label}</Text>
</Pressable>

{/* Expandable secondary actions */}
{secondaryActions.length > 0 && (
  <View className="mt-3">
    <Pressable
      testID="more-ways-toggle"
      className="flex-row items-center justify-center py-2"
      onPress={() => setShowSecondary((prev) => !prev)}
    >
      <Text className="text-sm text-muted mr-1">More ways to practice</Text>
      <Ionicons
        name={showSecondary ? 'chevron-up' : 'chevron-down'}
        size={16}
        color={colors.muted}
      />
    </Pressable>
    {showSecondary && (
      <View className="gap-2 mt-1">
        {secondaryActions.map((action) => (
          <Pressable
            key={action.testID}
            testID={action.testID}
            className="bg-surface-elevated rounded-card px-4 py-3 flex-row items-center"
            onPress={action.onPress}
          >
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">{action.label}</Text>
              <Text className="text-sm text-muted">{action.explanation}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    )}
  </View>
)}
```

Remove the old 6-button section: delete the old `continue-learning-button`, `request-retest-button`, `relearn-button`, `evaluate-challenge-button`, `teach-back-button`, and the unnamed review button markup.

- [ ] **Step 3b: Sweep for old testID references (E2E, other components, docs)**

```bash
# Should be zero matches after deletion — fix any found before commit
grep -rn "continue-learning-button\|request-retest-button\|relearn-button\|evaluate-challenge-button\|teach-back-button" \
  apps/ e2e/ docs/ 2>/dev/null | grep -v node_modules
```

Expected: Zero hits outside the deleted code itself. If E2E specs reference old IDs, update them to `primary-action-button` + `secondary-*` IDs.

- [ ] **Step 4: Run tests**

Run: `cd apps/mobile && pnpm exec jest src/app/\(app\)/topic/\\[topicId\\].test.tsx --no-coverage`
Expected: All PASS.

- [ ] **Step 5: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/src/app/(app)/topic/[topicId].tsx" "apps/mobile/src/app/(app)/topic/[topicId].test.tsx"
git commit -m "feat(mobile): consolidate topic detail to smart primary + expandable secondary

Primary button picks the most appropriate action based on topic state.
Secondary actions (Recall Check, Challenge, Teach it back) collapsed under
'More ways to practice'. Drops 'Review and Re-test' alias — always 'Recall Check'."
```

---

## Task 6: Create OnboardingStepIndicator + fix back navigation

**Files:**
- Create: `apps/mobile/src/components/onboarding/OnboardingStepIndicator.tsx`
- Create: `apps/mobile/src/components/onboarding/OnboardingStepIndicator.test.tsx`
- Modify: `apps/mobile/src/app/create-subject.tsx` — route language subjects to interview first
- Modify: `apps/mobile/src/app/(app)/onboarding/interview.tsx` — forward nav branching + step indicator
- Modify: `apps/mobile/src/app/(app)/onboarding/interview.test.tsx`
- Modify: `apps/mobile/src/app/(app)/onboarding/language-setup.tsx` — back nav + forward nav + step indicator
- Modify: `apps/mobile/src/app/(app)/onboarding/language-setup.test.tsx`
- Modify: `apps/mobile/src/app/(app)/onboarding/analogy-preference.tsx` — back nav + forward nav + step indicator
- Modify: `apps/mobile/src/app/(app)/onboarding/analogy-preference.test.tsx`
- Modify: `apps/mobile/src/app/(app)/onboarding/curriculum-review.tsx` — back nav + step indicator
- Modify: `apps/mobile/src/app/(app)/onboarding/curriculum-review.test.tsx`

**Context:** The onboarding flow currently has no step indicator and all back buttons fall back to Home. The new flow chains screens with correct back navigation:

- Language: `interview(1) → language-setup(2) → accommodations(3) → curriculum-review(4)`
- Non-language: `interview(1) → analogy-preference(2) → accommodations(3) → curriculum-review(4)`

Each screen receives `step` and `totalSteps` as search params.

- [ ] **Step 1: Write tests for OnboardingStepIndicator**

```tsx
// OnboardingStepIndicator.test.tsx
import { render, screen } from '@testing-library/react-native';
import { OnboardingStepIndicator } from './OnboardingStepIndicator';

describe('OnboardingStepIndicator', () => {
  it('renders correct number of dots', () => {
    render(<OnboardingStepIndicator step={2} totalSteps={4} />);
    const dots = screen.getAllByTestId(/^step-dot-/);
    expect(dots).toHaveLength(4);
  });

  it('marks current and past steps as active', () => {
    render(<OnboardingStepIndicator step={2} totalSteps={4} />);
    const dot1 = screen.getByTestId('step-dot-1');
    const dot2 = screen.getByTestId('step-dot-2');
    const dot3 = screen.getByTestId('step-dot-3');
    // Active dots (step 1 and 2) should have the active style
    expect(dot1.props.className).toContain('bg-primary');
    expect(dot2.props.className).toContain('bg-primary');
    // Future dots should have inactive style
    expect(dot3.props.className).toContain('bg-muted');
  });

  it('shows step label text', () => {
    render(<OnboardingStepIndicator step={2} totalSteps={4} />);
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/mobile && pnpm exec jest src/components/onboarding/OnboardingStepIndicator.test.tsx --no-coverage`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 3: Implement OnboardingStepIndicator**

```tsx
// OnboardingStepIndicator.tsx
import { Text, View } from 'react-native';

interface OnboardingStepIndicatorProps {
  step: number;
  totalSteps: number;
}

export function OnboardingStepIndicator({ step, totalSteps }: OnboardingStepIndicatorProps) {
  return (
    <View className="items-center py-3 gap-2">
      <View className="flex-row gap-2">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isActive = stepNum <= step;
          return (
            <View
              key={stepNum}
              testID={`step-dot-${stepNum}`}
              className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-primary' : 'bg-muted'}`}
            />
          );
        })}
      </View>
      <Text className="text-xs text-muted">Step {step} of {totalSteps}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd apps/mobile && pnpm exec jest src/components/onboarding/OnboardingStepIndicator.test.tsx --no-coverage`
Expected: All PASS.

- [ ] **Step 5: Update create-subject.tsx — route language subjects to interview**

In `create-subject.tsx`, change the four_strands routing in `doCreate`:

```tsx
// Before:
if (pedagogyMode === 'four_strands') {
  router.replace({
    pathname: '/(app)/onboarding/language-setup',
    params: { subjectId: created.id, languageCode, languageName: safeLanguageName },
  });
  return;
}

// After:
if (pedagogyMode === 'four_strands') {
  router.replace({
    pathname: '/(app)/onboarding/interview',
    params: {
      subjectId: created.id,
      subjectName: created.name,
      languageCode,
      languageName: safeLanguageName,
      step: '1',
      totalSteps: '4',
    },
  });
  return;
}
```

Non-language routing path must also carry `step`/`totalSteps`:

```tsx
// Non-language forward nav (existing path into interview or curriculum-review)
router.replace({
  pathname: '/(app)/onboarding/interview',
  params: {
    subjectId: created.id,
    subjectName: created.name,
    step: '1',
    totalSteps: '4',
  },
});
```

- [ ] **Step 6: Update interview.tsx — forward nav branching + step indicator**

In `interview.tsx`:

1. Import `OnboardingStepIndicator` and read `languageCode` from search params.
2. Change `goToCurriculum` to branch based on subject type:

```tsx
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';

// In component, read extra params:
const { subjectId, subjectName, bookId, bookTitle, languageCode, languageName } =
  useLocalSearchParams<{
    subjectId: string; subjectName?: string; bookId?: string; bookTitle?: string;
    languageCode?: string; languageName?: string;
  }>();

const totalSteps = 4; // Both flows have 4 steps

const goToNextStep = useCallback(() => {
  // Full onboarding param contract — never drop languageCode/languageName
  const baseParams = {
    subjectId,
    subjectName: subjectName ?? '',
    step: '2',
    totalSteps: String(totalSteps),
  };
  if (languageCode) {
    // Language flow: interview → language-setup
    router.replace({
      pathname: '/(app)/onboarding/language-setup',
      params: { ...baseParams, languageCode, languageName: languageName ?? '' },
    });
  } else {
    // Non-language: interview → analogy-preference
    router.replace({
      pathname: '/(app)/onboarding/analogy-preference',
      params: baseParams,
    });
  }
}, [router, subjectId, subjectName, languageCode, languageName, totalSteps]);
```

Replace the old `goToCurriculum` calls with `goToNextStep`.

Add step indicator to the header area:
```tsx
<OnboardingStepIndicator step={1} totalSteps={totalSteps} />
```

3. Update interview.test.tsx: the forward navigation test should now expect `analogy-preference` (for the default non-language case) instead of `curriculum-review`.

```tsx
// Updated test in interview.test.tsx
it('navigates to analogy-preference after interview completes', async () => {
  // ... setup with [INTERVIEW_COMPLETE] in stream
  fireEvent.press(screen.getByTestId('view-curriculum-button'));
  expect(mockReplace).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/(app)/onboarding/analogy-preference' })
  );
});
```

- [ ] **Step 7: Update language-setup.tsx — back + forward nav + step**

In `language-setup.tsx`:

1. Read `step` and `totalSteps` from search params.
2. Change forward navigation from `curriculum-review` to `accommodations`.
3. Change back fallback from `/(app)/home` to `/(app)/onboarding/interview`.
4. Add step indicator.

```tsx
import { goBackOrReplace } from '../../../lib/navigation';

// Read step params (full contract)
const { subjectId, subjectName, languageName, languageCode, step: stepParam, totalSteps: totalStepsParam } =
  useLocalSearchParams<{
    subjectId: string; subjectName?: string; languageName?: string; languageCode?: string;
    step?: string; totalSteps?: string;
  }>();

const step = Number(stepParam) || 2;
const totalSteps = Number(totalStepsParam) || 4;

// Back — goBackOrReplace with full param shape so interview re-hydrates
const handleBack = useCallback(() => {
  goBackOrReplace(router, {
    pathname: '/(app)/onboarding/interview',
    params: {
      subjectId,
      subjectName: subjectName ?? languageName ?? '',
      languageCode: languageCode ?? '',
      languageName: languageName ?? '',
      step: '1',
      totalSteps: String(totalSteps),
    },
  });
}, [router, subjectId, subjectName, languageCode, languageName, totalSteps]);

// Forward — thread languageCode/languageName/subjectName into accommodations
// In handleContinue success callback:
router.replace({
  pathname: '/(app)/onboarding/accommodations',
  params: {
    subjectId,
    subjectName: subjectName ?? languageName ?? '',
    languageCode: languageCode ?? '',
    languageName: languageName ?? '',
    step: String(step + 1),
    totalSteps: String(totalSteps),
  },
});

// Add step indicator
<OnboardingStepIndicator step={step} totalSteps={totalSteps} />
```

Update `language-setup.test.tsx`:

```tsx
it('navigates to accommodations after successful submit', async () => {
  // ...setup
  fireEvent.press(screen.getByTestId('language-setup-continue'));
  await waitFor(() => {
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/onboarding/accommodations' })
    );
  });
});
```

- [ ] **Step 8: Update analogy-preference.tsx — back + forward nav + step**

In `analogy-preference.tsx`:

1. Read `step` and `totalSteps` from search params.
2. Change back fallback from `/(app)/home` to `/(app)/onboarding/interview`.
3. Change forward navigation from `curriculum-review` to `accommodations`.
4. Add step indicator.

```tsx
import { goBackOrReplace } from '../../../lib/navigation';

const { subjectId, subjectName, step: stepParam, totalSteps: totalStepsParam } =
  useLocalSearchParams<{ subjectId: string; subjectName?: string; step?: string; totalSteps?: string }>();

const step = Number(stepParam) || 2;
const totalSteps = Number(totalStepsParam) || 4;

// Back — use goBackOrReplace, pass subjectName so interview re-hydrates
const handleBack = useCallback(() => {
  goBackOrReplace(router, {
    pathname: '/(app)/onboarding/interview',
    params: {
      subjectId,
      subjectName: subjectName ?? '',
      step: '1',
      totalSteps: String(totalSteps),
    },
  });
}, [router, subjectId, subjectName, totalSteps]);

// Forward: navigateToAccommodations (no languageCode in non-language flow)
const navigateToAccommodations = useCallback(() => {
  router.replace({
    pathname: '/(app)/onboarding/accommodations',
    params: {
      subjectId,
      subjectName: subjectName ?? '',
      step: String(step + 1),
      totalSteps: String(totalSteps),
    },
  });
}, [router, subjectId, subjectName, step, totalSteps]);

// Add step indicator
<OnboardingStepIndicator step={step} totalSteps={totalSteps} />
```

Update `analogy-preference.test.tsx`:

```tsx
it('navigates to accommodations when skip is pressed', () => {
  // ...
  fireEvent.press(screen.getByTestId('analogy-skip-button'));
  expect(mockReplace).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/(app)/onboarding/accommodations' })
  );
});
```

- [ ] **Step 9: Update curriculum-review.tsx — back nav + step**

In `curriculum-review.tsx`:

1. Read `step` and `totalSteps` from search params.
2. Change back fallback from `/(app)/home` to `/(app)/onboarding/accommodations`.
3. Add step indicator.

```tsx
import { goBackOrReplace } from '../../../lib/navigation';

const { subjectId, subjectName, languageCode, languageName, step: stepParam, totalSteps: totalStepsParam } =
  useLocalSearchParams<{
    subjectId: string; subjectName?: string; languageCode?: string; languageName?: string;
    step?: string; totalSteps?: string;
  }>();

const step = Number(stepParam) || 4;
const totalSteps = Number(totalStepsParam) || 4;

// Back — fall back to accommodations with FULL param shape
// (passing subjectId + languageCode so accommodations routes to correct prior screen)
const handleBack = useCallback(() => {
  goBackOrReplace(router, {
    pathname: '/(app)/onboarding/accommodations',
    params: {
      subjectId,
      subjectName: subjectName ?? '',
      languageCode: languageCode ?? '',
      languageName: languageName ?? '',
      step: String(Math.max(step - 1, 3)),
      totalSteps: String(totalSteps),
    },
  });
}, [router, subjectId, subjectName, languageCode, languageName, step, totalSteps]);

// Add step indicator
<OnboardingStepIndicator step={step} totalSteps={totalSteps} />
```

Update `curriculum-review.test.tsx` — the back button test:

```tsx
it('navigates back to accommodations with full params when no history', () => {
  mockCanGoBack.mockReturnValue(false);
  render(<CurriculumReviewScreen />);
  fireEvent.press(screen.getByTestId('curriculum-back'));
  expect(mockReplace).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: '/(app)/onboarding/accommodations',
      params: expect.objectContaining({ subjectId: expect.any(String) }),
    })
  );
});
```

- [ ] **Step 10: Run all onboarding tests**

```bash
cd apps/mobile && pnpm exec jest \
  src/components/onboarding/OnboardingStepIndicator.test.tsx \
  src/app/\(app\)/onboarding/interview.test.tsx \
  src/app/\(app\)/onboarding/language-setup.test.tsx \
  src/app/\(app\)/onboarding/analogy-preference.test.tsx \
  src/app/\(app\)/onboarding/curriculum-review.test.tsx \
  --no-coverage
```

Expected: All PASS.

- [ ] **Step 11: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 12: Commit**

```bash
git add apps/mobile/src/components/onboarding/ apps/mobile/src/app/\(app\)/onboarding/ apps/mobile/src/app/create-subject.tsx
git commit -m "feat(mobile): onboarding step indicator + back navigation fix

Adds step dot indicator to all onboarding screens. Back buttons now
chain properly between steps instead of dropping to Home.
Language subjects now go through interview first.
Flow: interview → language-setup/analogy-preference → accommodations → curriculum-review."
```

---

## Task 7: Create accommodations onboarding screen

**Files:**
- Create: `apps/mobile/src/lib/accommodation-options.ts`
- Create: `apps/mobile/src/app/(app)/onboarding/accommodations.tsx`
- Create: `apps/mobile/src/app/(app)/onboarding/accommodations.test.tsx`
- Modify: `apps/mobile/src/app/(app)/more.tsx:116-142` — import shared options
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:109-135` — import shared options

- [ ] **Step 1: Extract shared accommodation options**

Create `apps/mobile/src/lib/accommodation-options.ts`:

```ts
import type { AccommodationMode } from '@eduagent/schemas';

export interface AccommodationOption {
  mode: AccommodationMode;
  title: string;
  description: string;
}

export const ACCOMMODATION_OPTIONS: AccommodationOption[] = [
  { mode: 'none', title: 'None', description: 'Standard learning experience' },
  { mode: 'short-burst', title: 'Short-Burst', description: 'Shorter explanations and frequent breaks' },
  { mode: 'audio-first', title: 'Audio-First', description: 'Voice-driven learning with less text' },
  { mode: 'predictable', title: 'Predictable', description: 'Consistent structure and clear expectations' },
];
```

- [ ] **Step 2: Update more.tsx and child settings to import shared options**

In `apps/mobile/src/app/(app)/more.tsx`, replace the inline `ACCOMMODATION_OPTIONS` array:

```tsx
// Remove lines 116-142 (inline ACCOMMODATION_OPTIONS)
// Add import:
import { ACCOMMODATION_OPTIONS } from '../../lib/accommodation-options';
```

Similarly in `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`:

```tsx
// Remove lines 109-135 (inline ACCOMMODATION_OPTIONS)
import { ACCOMMODATION_OPTIONS } from '../../../../lib/accommodation-options';
```

- [ ] **Step 3: Run tests for more.tsx to verify nothing breaks**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/more.tsx --no-coverage`
Expected: All PASS.

- [ ] **Step 4: Write tests for accommodations screen**

Create `apps/mobile/src/app/(app)/onboarding/accommodations.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(false);

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }),
  useLocalSearchParams: () => ({ subjectId: 'subject-1', step: '3', totalSteps: '4' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({ primary: '#00B4D8', muted: '#888', foreground: '#fff', surfaceElevated: '#222' }),
}));

const mockMutate = jest.fn();
jest.mock('../../../hooks/use-learner-profile', () => ({
  useUpdateAccommodationMode: () => ({ mutate: mockMutate, isPending: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AccommodationsScreen = require('./accommodations').default;

describe('AccommodationsScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders all 4 accommodation options', () => {
    render(<AccommodationsScreen />);
    expect(screen.getByText('None')).toBeTruthy();
    expect(screen.getByText('Short-Burst')).toBeTruthy();
    expect(screen.getByText('Audio-First')).toBeTruthy();
    expect(screen.getByText('Predictable')).toBeTruthy();
  });

  it('pre-selects None by default', () => {
    render(<AccommodationsScreen />);
    const noneOption = screen.getByTestId('accommodation-none');
    expect(noneOption.props.accessibilityState?.selected).toBe(true);
  });

  it('navigates to curriculum-review on Continue without saving when None is selected', () => {
    render(<AccommodationsScreen />);
    fireEvent.press(screen.getByTestId('accommodation-continue'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/onboarding/curriculum-review' })
    );
  });

  it('saves and navigates when a non-None option is selected', async () => {
    mockMutate.mockImplementation((_mode: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    render(<AccommodationsScreen />);
    fireEvent.press(screen.getByTestId('accommodation-short-burst'));
    fireEvent.press(screen.getByTestId('accommodation-continue'));
    expect(mockMutate).toHaveBeenCalledWith(
      { accommodationMode: 'short-burst' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('shows skip button that navigates without saving', () => {
    render(<AccommodationsScreen />);
    fireEvent.press(screen.getByTestId('accommodation-skip'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/onboarding/curriculum-review' })
    );
  });

  it('renders step indicator', () => {
    render(<AccommodationsScreen />);
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
  });

  it('shows alert when save fails and does not navigate', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockMutate.mockImplementation((_mode: unknown, opts: { onError: () => void }) => opts.onError());
    render(<AccommodationsScreen />);
    fireEvent.press(screen.getByTestId('accommodation-short-burst'));
    fireEvent.press(screen.getByTestId('accommodation-continue'));
    expect(alertSpy).toHaveBeenCalledWith('Could not save setting', 'Please try again.');
    expect(mockReplace).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
```

Add `Alert` to the mock imports at the top of the test file:

```tsx
import { Alert } from 'react-native';
```

- [ ] **Step 5: Run test to verify failure**

Run: `cd apps/mobile && pnpm exec jest src/app/\(app\)/onboarding/accommodations.test.tsx --no-coverage`
Expected: FAIL (file doesn't exist).

- [ ] **Step 6: Implement accommodations screen**

Create `apps/mobile/src/app/(app)/onboarding/accommodations.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { AccommodationMode } from '@eduagent/schemas';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import { ACCOMMODATION_OPTIONS } from '../../../lib/accommodation-options';
import { useUpdateAccommodationMode } from '../../../hooks/use-learner-profile';
import { useThemeColors } from '../../../lib/theme';
import { goBackOrReplace } from '../../../lib/navigation';

export default function AccommodationsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { subjectId, subjectName, languageCode, languageName, step: stepParam, totalSteps: totalStepsParam } =
    useLocalSearchParams<{
      subjectId: string; subjectName?: string; languageCode?: string; languageName?: string;
      step?: string; totalSteps?: string;
    }>();

  const step = Number(stepParam) || 3;
  const totalSteps = Number(totalStepsParam) || 4;

  const [selected, setSelected] = useState<AccommodationMode>('none');
  const updateAccommodation = useUpdateAccommodationMode();

  const navigateToCurriculum = useCallback(() => {
    router.replace({
      pathname: '/(app)/onboarding/curriculum-review',
      params: {
        subjectId,
        subjectName: subjectName ?? '',
        languageCode: languageCode ?? '',
        languageName: languageName ?? '',
        step: String(step + 1),
        totalSteps: String(totalSteps),
      },
    });
  }, [router, subjectId, subjectName, languageCode, languageName, step, totalSteps]);

  const handleContinue = useCallback(() => {
    if (selected === 'none') {
      navigateToCurriculum();
      return;
    }
    updateAccommodation.mutate(
      { accommodationMode: selected },
      {
        onSuccess: navigateToCurriculum,
        onError: () => {
          // Standard pattern — matches more.tsx + child/[profileId]/index.tsx
          Alert.alert('Could not save setting', 'Please try again.');
        },
      }
    );
  }, [selected, updateAccommodation, navigateToCurriculum]);

  const handleBack = useCallback(() => {
    // Choose prior step based on flow: language-setup (language) OR analogy-preference (non-language)
    const backPath: '/(app)/onboarding/language-setup' | '/(app)/onboarding/analogy-preference' =
      languageCode
        ? '/(app)/onboarding/language-setup'
        : '/(app)/onboarding/analogy-preference';
    goBackOrReplace(router, {
      pathname: backPath,
      params: {
        subjectId,
        subjectName: subjectName ?? '',
        languageCode: languageCode ?? '',
        languageName: languageName ?? '',
        step: '2',
        totalSteps: String(totalSteps),
      },
    });
  }, [router, subjectId, subjectName, languageCode, languageName, totalSteps]);

  if (!subjectId) {
    return (
      <View className="flex-1 items-center justify-center bg-background" style={{ paddingTop: insets.top }}>
        <Text className="text-foreground text-lg mb-4">No subject selected</Text>
        <Pressable onPress={handleBack}>
          <Text className="text-primary text-base font-semibold">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="px-5 pt-2">
        <Pressable testID="accommodation-back" onPress={handleBack} className="py-2">
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <OnboardingStepIndicator step={step} totalSteps={totalSteps} />
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-2xl font-bold text-foreground mt-4 mb-2">
          How do you learn best?
        </Text>
        <Text className="text-base text-muted mb-6">
          Some kids learn best with shorter explanations, audio-first, or very predictable steps. Pick what fits, or skip.
        </Text>

        <View className="gap-3">
          {ACCOMMODATION_OPTIONS.map((option) => {
            const isSelected = selected === option.mode;
            return (
              <Pressable
                key={option.mode}
                testID={`accommodation-${option.mode}`}
                accessibilityState={{ selected: isSelected }}
                className={`rounded-card border-2 px-4 py-4 ${isSelected ? 'border-primary bg-primary-soft' : 'border-border bg-surface-elevated'}`}
                onPress={() => setSelected(option.mode)}
              >
                <View className="flex-row items-center">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground">{option.title}</Text>
                    <Text className="text-sm text-muted mt-1">{option.description}</Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={24} color={colors.primary} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="px-5 py-4 gap-3">
        <Pressable
          testID="accommodation-continue"
          className="bg-primary rounded-card py-4 items-center"
          onPress={handleContinue}
          disabled={updateAccommodation.isPending}
        >
          <Text className="text-lg font-bold text-on-primary">Continue</Text>
        </Pressable>
        <Pressable
          testID="accommodation-skip"
          className="py-2 items-center"
          onPress={navigateToCurriculum}
        >
          <Text className="text-base text-muted">Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 6b: Register accommodations screen in screen-navigation test**

Per the project's back-nav audit convention, `screen-navigation.test.ts` enumerates every route and asserts it has a reachable back path. Verify the new route is either auto-enumerated (Expo Router glob) OR added explicitly:

```bash
grep -n "accommodations\|onboarding" apps/mobile/src/app/screen-navigation.test.ts
```

If the test enumerates routes manually, append:
```ts
'(app)/onboarding/accommodations.tsx',
```
to the routes list. Do NOT add to `EXEMPT_SCREENS` — the back button is tested.

- [ ] **Step 7: Run tests to verify pass**

Run: `cd apps/mobile && pnpm exec jest src/app/\(app\)/onboarding/accommodations.test.tsx --no-coverage`
Expected: All PASS.

- [ ] **Step 8: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/lib/accommodation-options.ts \
  apps/mobile/src/app/\(app\)/onboarding/accommodations.tsx \
  apps/mobile/src/app/\(app\)/onboarding/accommodations.test.tsx \
  apps/mobile/src/app/\(app\)/more.tsx \
  apps/mobile/src/app/\(app\)/child/
git commit -m "feat(mobile): add accommodations to onboarding flow

New screen between analogy-preference/language-setup and curriculum-review.
Pre-selects None, allows skip. Saves accommodation mode before first session.
Extracted ACCOMMODATION_OPTIONS to shared lib (was duplicated in 2 files)."
```

---

## Task 8: Practice review empty state + nextReviewAt API

**Files:**
- Modify: `apps/api/src/services/retention-data.ts:251-307` — add `nextUpcomingReviewAt`
- Modify: `apps/api/src/routes/progress.ts:58-67` — pass through field
- Modify: `apps/mobile/src/hooks/use-progress.ts:28-38` — add to interface
- Modify: `apps/mobile/src/app/(app)/practice.tsx:68-90` — add empty state

**Context:** When no overdue topics exist, practice "Review topics" currently dumps users in Library. Spec: show inline empty state with next review time. API needs to return `nextUpcomingReviewAt`.

- [ ] **Step 1: Add nextUpcomingReviewAt to service**

In `apps/api/src/services/retention-data.ts`, modify `getProfileOverdueCount` to also return the next upcoming review time:

```ts
export async function getProfileOverdueCount(
  db: Database,
  profileId: string
): Promise<{
  overdueCount: number;
  topTopicIds: string[];
  nextReviewTopic: NextReviewTopic | null;
  nextUpcomingReviewAt: string | null;
}> {
  // ... existing overdue query ...

  // Find earliest future review (for empty state messaging)
  const now = new Date();
  const [upcomingReview] = await db
    .select({ nextReviewAt: retentionCards.nextReviewAt })
    .from(retentionCards)
    .where(
      and(
        eq(retentionCards.profileId, profileId),
        gt(retentionCards.nextReviewAt, now)
      )
    )
    .orderBy(asc(retentionCards.nextReviewAt))
    .limit(1);

  return {
    overdueCount,
    topTopicIds,
    nextReviewTopic,
    nextUpcomingReviewAt: upcomingReview?.nextReviewAt?.toISOString() ?? null,
  };
}
```

Add necessary imports at the top of the file: `gt`, `asc` from drizzle-orm (verify they're already imported or add them).

- [ ] **Step 2: Update route handler**

In `apps/api/src/routes/progress.ts`, update the review-summary route:

```ts
.get('/progress/review-summary', async (c) => {
  const db = c.get('db');
  const profileId = requireProfileId(c.get('profileId'));

  const { overdueCount, nextReviewTopic, nextUpcomingReviewAt } = await getProfileOverdueCount(
    db,
    profileId
  );
  return c.json({ totalOverdue: overdueCount, nextReviewTopic, nextUpcomingReviewAt });
})
```

- [ ] **Step 3: Update mobile types**

In `apps/mobile/src/hooks/use-progress.ts`, update the `ReviewSummary` interface:

```ts
export interface ReviewSummary {
  totalOverdue: number;
  nextReviewTopic: NextReviewTopic | null;
  nextUpcomingReviewAt: string | null;
}
```

- [ ] **Step 4: Run API tests to verify nothing breaks**

Run: `pnpm exec nx run api:test -- --findRelatedTests apps/api/src/routes/progress.ts --no-coverage`
Expected: All PASS (or update if assertions check exact shape).

- [ ] **Step 5: Implement practice review PROACTIVE empty state**

**Design decision:** No tap-to-discover. When `reviewSummary.totalOverdue === 0`, the Review card itself shows the empty-state subtitle up front, and the inline empty-state block renders automatically below the card (no user interaction required). This satisfies the CLAUDE.md UX Resilience Rule: "Every Screen State Must Have an Action."

In `apps/mobile/src/app/(app)/practice.tsx`:

```tsx
const hasOverdue = (reviewSummary?.totalOverdue ?? 0) > 0;

// Review card — conditional subtitle + onPress
<IntentCard
  testID="practice-review"
  title="Review topics"
  subtitle={
    hasOverdue
      ? `${reviewSummary?.totalOverdue} topic${reviewSummary?.totalOverdue === 1 ? '' : 's'} ready for review`
      : 'Nothing to review right now'
  }
  icon="refresh-outline"
  onPress={() => {
    const next = reviewSummary?.nextReviewTopic ?? null;
    if (next) {
      router.push({
        pathname: '/(app)/topic/relearn',
        params: { topicId: next.topicId, subjectId: next.subjectId, topicName: next.topicTitle },
      });
    }
    // If no next topic, the inline empty-state block below explains — card press is a no-op
  }}
/>

{/* Proactively rendered — no tap required */}
{!hasOverdue && reviewSummary && (
  <View testID="review-empty-state" className="bg-surface-elevated rounded-card px-4 py-4 -mt-1">
    {reviewSummary.nextUpcomingReviewAt ? (
      <>
        <Text className="text-base font-semibold text-foreground">All caught up</Text>
        <Text className="text-sm text-muted mt-1">
          Your next review is in {formatTimeUntil(reviewSummary.nextUpcomingReviewAt)}
        </Text>
      </>
    ) : (
      <Text className="text-base text-muted">Complete some topics first to unlock review</Text>
    )}
    <Pressable
      testID="review-empty-browse"
      className="mt-3"
      onPress={() => router.push('/(app)/library')}
    >
      <Text className="text-sm text-primary font-semibold">Browse your topics</Text>
    </Pressable>
  </View>
)}
```

Add a test in `practice.test.tsx` asserting the proactive render:

```tsx
it('shows empty-state block WITHOUT a tap when totalOverdue is 0', () => {
  mockUseReviewSummary.mockReturnValue({
    data: {
      totalOverdue: 0,
      nextReviewTopic: null,
      nextUpcomingReviewAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    },
  });
  render(<PracticeScreen />);
  // No interaction needed
  expect(screen.getByTestId('review-empty-state')).toBeTruthy();
  expect(screen.getByText(/next review is in 3 hours/)).toBeTruthy();
});
```

Add the `formatTimeUntil` helper at the top of the file (or import from a shared util):

```tsx
function formatTimeUntil(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'less than an hour';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
```

- [ ] **Step 6: Run mobile tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/practice.tsx --no-coverage`
Expected: All PASS.

- [ ] **Step 7: Run typecheck on both API and mobile**

```bash
pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/retention-data.ts apps/api/src/routes/progress.ts \
  apps/mobile/src/hooks/use-progress.ts apps/mobile/src/app/\(app\)/practice.tsx
git commit -m "feat: practice review empty state with next review time

When no overdue topics exist, shows inline empty state instead of
silently routing to Library. Displays time until next review.
API now returns nextUpcomingReviewAt in review-summary endpoint."
```

- [ ] **Step 9: Deploy-order note**

**IMPORTANT — API first, then mobile.** Adding `nextUpcomingReviewAt` to `/progress/review-summary` is backwards-compatible (new field only), so:

1. Merge + deploy API to staging. Verify the field appears in the response.
2. Then deploy mobile OTA.
3. Older mobile builds still in the wild will silently ignore the extra field — no breakage.

Per MEMORY `project_deploy_safety.md`: never let mobile read a schema that API doesn't yet serve.

---

## Final Verification

After all tasks are complete:

- [ ] **Step 1: Run full mobile test suite**

```bash
cd apps/mobile && pnpm exec jest --no-coverage
```

- [ ] **Step 2: Run full API test suite**

```bash
pnpm exec nx run api:test
```

- [ ] **Step 3: Run lint on both packages**

```bash
pnpm exec nx run api:lint && pnpm exec nx lint mobile
```

- [ ] **Step 4: Run typecheck on both packages**

```bash
pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Verify diff is net-negative**

```bash
git diff --stat main..HEAD
```

Expected: More lines removed than added (deletion of learn-new + simplifications).

- [ ] **Step 6: Verify no remaining references to deleted routes**

```bash
grep -r "learn-new\|\/learn\b" apps/mobile/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".test."
```

Expected: Zero matches (except possibly test files that reference the old route in comments).

---

## Related Bug Tracker Items (verify post-implementation)

Per the spec, these bugs may become N/A:

- "Continue {Subject} on /create-subject navigates to /library instead of starting a session" — verify with merged list
- "Cancel button on /create-subject page does not navigate back" — verify cancel still works
- "/learn route renders Home with spurious Go back" — resolved by deletion

Close with reference to this spec if verified.
