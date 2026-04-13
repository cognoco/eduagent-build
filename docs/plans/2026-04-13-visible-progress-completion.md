# Visible Progress Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-04-13
**Branch:** `bugfix2`
**Related spec:** `docs/specs/2026-04-07-epic-15-visible-progress-design.md`

**Goal:** Close four residual gaps from Epic 15 Visible Progress:

1. Vocabulary Browser Screen — cross-subject vocabulary progress view
2. Milestones List Screen — full milestone history with dates
3. Unhide Reports Button for New Accounts — remove `child.progress` gate
4. Field Naming Alignment — `engagementTrend` values to spec names

All four items are code-only changes. No new DB migrations, no new API routes, no schema table changes.

---

## Discovery Summary

### 1. Vocabulary stat — current state

The Journey screen (`apps/mobile/src/app/(app)/progress.tsx`) renders the hero card with a raw `Text` element showing `inventory.global.vocabularyTotal`. The stat chips (`sessions`, `active min`, `streak`) and the vocabulary total in `heroCopy` subtitle are all non-tappable `View`/`Text` nodes. There is no `Pressable` wrapping the vocabulary stat — tapping it does nothing.

The existing per-subject vocabulary view is in `apps/mobile/src/app/(app)/progress/[subjectId].tsx`, which renders vocabulary grouped by CEFR level within one subject. The new screen must show the **same data across all subjects** from `KnowledgeInventory.subjects[].vocabulary`.

Data source: `useProgressInventory()` — already fetched on the Journey screen. The `KnowledgeInventory` type from `@eduagent/schemas` carries `subjects[]` each with `vocabulary.{ total, mastered, learning, new, byCefrLevel }`. No new API endpoint needed.

### 2. Milestones count — current state

The Journey screen shows "Recent milestones" heading, calls `useProgressMilestones(5)` and lists up to 5 `MilestoneCard`s. There is no tappable "See all" link and no section count stat that links anywhere. The full milestones list screen is missing.

Data source: `useProgressMilestones(limit)` — existing hook, existing endpoint `GET /v1/progress/milestones?limit=N` (max 50). No new API endpoint needed.

### 3. Reports button gate — current state

In `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` line 321, the entire "Visible progress" card is wrapped in:
```tsx
{child?.progress ? (
  <View ...>
    ...
    <Pressable onPress={() => router.push(...reports)} ...>
      Monthly reports
    </Pressable>
  </View>
) : null}
```
`child.progress` is `null` when `buildChildProgressSummary` finds no snapshots — i.e., every new account before the first `daily-snapshot` Inngest run. The reports button is invisible until the first snapshot exists, even though the reports route itself handles empty state correctly.

Fix: Always render the reports Pressable. When `child.progress` is null, show a standalone card with the reports button. When `reports.length === 0`, the existing `reports.tsx` screen already shows "No monthly reports yet." We need only an improved empty state there.

### 4. engagementTrend field naming

The spec (`2026-04-07-epic-15-visible-progress-design.md` line 393) declares:
```
engagementTrend: 'increasing' | 'stable' | 'declining'
```

Current implementation uses `'growing' | 'steady' | 'quiet'` throughout:

| File | Line(s) | Usage |
|------|---------|-------|
| `packages/schemas/src/progress.ts` | 132 | `z.enum(['growing', 'steady', 'quiet'])` |
| `apps/api/src/services/dashboard.ts` | 350–355 | `engagementTrend: sessionsThisWeek === 0 ? 'quiet' : ... ? 'growing' : 'steady'` |
| `apps/api/src/services/monthly-report.ts` | 144 | `? 'growing'` |
| `apps/mobile/src/app/(app)/dashboard.tsx` | 70 | type annotation `'growing' \| 'steady' \| 'quiet'` |
| `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx` | 29 | prop type `engagementTrend: 'growing' \| 'steady' \| 'quiet'` |

Note: `monthly-report.ts` uses a _separate_ `trend` field on `subjectMonthlyDetailSchema` which already uses `'growing' | 'stable' | 'declining'` — that field does NOT need renaming (it's a different field, different schema). Only the `engagementTrend` on `dashboardChildProgressSchema` and its consumers change.

---

## Architecture Notes

- New screens go in `apps/mobile/src/app/(app)/progress/vocabulary.tsx` and `apps/mobile/src/app/(app)/progress/milestones.tsx` — Expo Router file-based routing picks them up automatically.
- Default exports only for Expo Router page components (rule).
- Tests co-located: `progress/vocabulary.test.tsx` and `progress/milestones.tsx` test files sit next to their screens.
- Data hooks are already available; no new hooks needed for vocabulary or milestones.
- Navigation from `progress.tsx` uses `router.push({ pathname: '/(app)/progress/vocabulary' })` and `router.push({ pathname: '/(app)/progress/milestones' })`.
- The `progress/` directory already has a `[subjectId].tsx` so there is no `_layout.tsx` — these new pages inherit the root `(app)/_layout.tsx`.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Vocabulary screen — API error | `useProgressInventory` fails | ErrorFallback: "We couldn't load your vocabulary" + Retry + Go back | Tap retry → refetch; tap Go back → router.back |
| Vocabulary screen — empty | Profile has no language subjects | Empty state: "Start a language subject to build your vocabulary" + Go back | Tap Go back |
| Vocabulary screen — loading | First load | Skeleton rows | Auto-resolves |
| Milestones screen — API error | `useProgressMilestones` fails | ErrorFallback: "We couldn't load your milestones" + Retry + Go back | Tap retry → refetch |
| Milestones screen — empty | No milestones yet | Empty state: "Complete sessions and master topics to earn milestones" + Go back | Tap Go back |
| Milestones screen — loading | First load | Skeleton rows | Auto-resolves |
| Reports button on new account | `child.progress` is null | Reports button visible; tap opens reports screen | Reports screen shows "No monthly reports yet" |
| Reports screen — empty new account | No reports | Icon + "First report coming [month]" heading + date | No action needed |

---

## PART 1 — Vocabulary Browser Screen

**Files:**
- Create: `apps/mobile/src/app/(app)/progress/vocabulary.tsx`
- Create: `apps/mobile/src/app/(app)/progress/vocabulary.test.tsx`
- Modify: `apps/mobile/src/app/(app)/progress.tsx` — wrap vocabulary stat chip in Pressable

### Navigation wiring

In `progress.tsx`, the hero card stat chips section (lines 243–260) currently renders bare `View` elements. The vocabulary count chip becomes a `Pressable` that navigates to the new screen. Since `vocabulary.total > 0` gate already guards display in subjectId screen, the tap should only be active when `inventory.global.vocabularyTotal > 0`.

### Screen layout — vocabulary.tsx

The screen fetches `useProgressInventory()`. It groups vocabulary by subject first, then by CEFR level within each subject.

```
VocabularyBrowserScreen
├── Safe-area header row
│   ├── Back arrow Pressable (goBackOrReplace to /(app)/progress)
│   └── Title: "Your Vocabulary"
│   └── Subtitle: "{total} words across all subjects"
├── Loading state → SkeletonList
├── Error state → ErrorFallback (Retry + Go back)
├── Empty state (total === 0) → empty card + Go back
└── ScrollView
    └── For each subject with vocabulary.total > 0:
        ├── Section heading: subjectName  (text-h3)
        ├── Summary: "{total} words — {mastered} mastered, {learning} learning"
        └── CEFR level breakdown rows:
            │   (loop over byCefrLevel entries, sorted A1→C2→null)
            └── Row: "{level}" ... "{count} words"
```

Data used: `KnowledgeInventory.subjects[]` — filter to `subject.vocabulary.total > 0`.

CEFR level sort order: `['A1','A2','B1','B2','C1','C2']` — unknowns/null pushed to end.

### Task 1.1 — Write failing test

- [ ] **Step 1: Write the test**

Add `apps/mobile/src/app/(app)/progress/vocabulary.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react-native';
import { useProgressInventory } from '../../../hooks/use-progress';
import VocabularyBrowserScreen from './vocabulary';

jest.mock('../../../hooks/use-progress');
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

const mockInventory = {
  profileId: 'p1',
  snapshotDate: '2026-04-13',
  global: {
    topicsAttempted: 5,
    topicsMastered: 3,
    vocabularyTotal: 12,
    vocabularyMastered: 8,
    totalSessions: 10,
    totalActiveMinutes: 120,
    currentStreak: 3,
    longestStreak: 5,
  },
  subjects: [
    {
      subjectId: 's1',
      subjectName: 'Spanish',
      pedagogyMode: 'language',
      topics: { total: 10, explored: 5, mastered: 3, inProgress: 2, notStarted: 5 },
      vocabulary: {
        total: 12,
        mastered: 8,
        learning: 3,
        new: 1,
        byCefrLevel: { A1: 6, A2: 4, B1: 2 },
      },
      estimatedProficiency: 'A2',
      estimatedProficiencyLabel: 'Elementary',
      lastSessionAt: null,
      activeMinutes: 60,
      sessionsCount: 5,
    },
  ],
};

describe('VocabularyBrowserScreen', () => {
  beforeEach(() => {
    (useProgressInventory as jest.Mock).mockReturnValue({
      data: mockInventory,
      isLoading: false,
      isError: false,
    });
  });

  it('renders subject section and CEFR breakdown', () => {
    render(<VocabularyBrowserScreen />);
    expect(screen.getByText('Spanish')).toBeTruthy();
    expect(screen.getByText('A1')).toBeTruthy();
    expect(screen.getByText('6 words')).toBeTruthy();
    expect(screen.getByTestId('vocab-browser-back')).toBeTruthy();
  });

  it('shows empty state when no vocabulary', () => {
    (useProgressInventory as jest.Mock).mockReturnValue({
      data: { ...mockInventory, global: { ...mockInventory.global, vocabularyTotal: 0 }, subjects: [] },
      isLoading: false,
      isError: false,
    });
    render(<VocabularyBrowserScreen />);
    expect(screen.getByTestId('vocab-browser-empty')).toBeTruthy();
  });

  it('shows error state with retry and back buttons', () => {
    (useProgressInventory as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: jest.fn(),
    });
    render(<VocabularyBrowserScreen />);
    expect(screen.getByTestId('vocab-browser-error')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Confirm test fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress/vocabulary.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — module not found.

### Task 1.2 — Implement vocabulary.tsx

- [ ] **Step 3: Create `apps/mobile/src/app/(app)/progress/vocabulary.tsx`**

```typescript
import { ScrollView, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorFallback } from '../../../components/common';
import { useProgressInventory } from '../../../hooks/use-progress';
import { goBackOrReplace } from '../../../lib/navigation';
import type { SubjectInventory } from '@eduagent/schemas';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function sortCefrEntries(entries: [string, number][]): [string, number][] {
  return [...entries].sort(([a], [b]) => {
    const ai = CEFR_ORDER.indexOf(a);
    const bi = CEFR_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function SubjectVocabSection({
  subject,
}: {
  subject: SubjectInventory;
}): React.ReactElement {
  const cefrEntries = sortCefrEntries(
    Object.entries(subject.vocabulary.byCefrLevel)
  );

  return (
    <View className="bg-surface rounded-card p-4 mt-4">
      <Text className="text-h3 font-semibold text-text-primary">
        {subject.subjectName}
      </Text>
      <Text className="text-body-sm text-text-secondary mt-1">
        {subject.vocabulary.total} words — {subject.vocabulary.mastered} mastered
        {subject.vocabulary.learning > 0
          ? `, ${subject.vocabulary.learning} learning`
          : ''}
      </Text>
      {cefrEntries.length > 0 ? (
        <View className="mt-3 gap-2">
          {cefrEntries.map(([level, count]) => (
            <View
              key={level}
              className="flex-row items-center justify-between"
            >
              <Text className="text-body-sm text-text-primary">{level}</Text>
              <Text className="text-body-sm text-text-secondary">
                {count} words
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SkeletonRow(): React.ReactElement {
  return (
    <View className="bg-surface rounded-card p-4 mt-4">
      <View className="bg-border rounded h-5 w-1/3 mb-2" />
      <View className="bg-border rounded h-4 w-1/2 mb-3" />
      <View className="bg-border rounded h-4 w-full mb-1" />
      <View className="bg-border rounded h-4 w-3/4" />
    </View>
  );
}

export default function VocabularyBrowserScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: inventory, isLoading, isError, refetch } = useProgressInventory();

  const subjectsWithVocab =
    inventory?.subjects.filter((s) => s.vocabulary.total > 0) ?? [];
  const totalVocab = inventory?.global.vocabularyTotal ?? 0;
  const isEmpty = !isLoading && !isError && totalVocab === 0;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/progress' as const)}
          className="me-3 py-2 pe-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="vocab-browser-back"
        >
          <Text className="text-primary text-body font-semibold">{'\u2190'}</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            Your Vocabulary
          </Text>
          {!isLoading && !isError && totalVocab > 0 ? (
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {totalVocab} words across all subjects
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      >
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : isError ? (
          <View testID="vocab-browser-error">
            <ErrorFallback
              title="We couldn't load your vocabulary"
              message="Check your connection and try again."
              primaryAction={{
                label: 'Try again',
                onPress: () => void refetch(),
                testID: 'vocab-browser-retry',
              }}
              secondaryAction={{
                label: 'Go back',
                onPress: () => goBackOrReplace(router, '/(app)/progress' as const),
                testID: 'vocab-browser-go-back',
              }}
              testID="vocab-browser-error-fallback"
            />
          </View>
        ) : isEmpty ? (
          <View
            className="bg-surface rounded-card p-5 mt-4 items-center"
            testID="vocab-browser-empty"
          >
            <Text className="text-h3 font-semibold text-text-primary text-center">
              No vocabulary yet
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              Start a language subject and the words you learn will appear here.
            </Text>
            <Pressable
              onPress={() => goBackOrReplace(router, '/(app)/progress' as const)}
              className="bg-background rounded-button px-5 py-3 mt-4"
              accessibilityRole="button"
              accessibilityLabel="Go back to Journey"
              testID="vocab-browser-empty-back"
            >
              <Text className="text-body font-semibold text-text-primary">
                Go back
              </Text>
            </Pressable>
          </View>
        ) : (
          subjectsWithVocab.map((subject) => (
            <SubjectVocabSection key={subject.subjectId} subject={subject} />
          ))
        )}
      </ScrollView>
    </View>
  );
}
```

### Task 1.3 — Wire navigation in progress.tsx

- [ ] **Step 4: Make vocabulary stat chip tappable**

In `apps/mobile/src/app/(app)/progress.tsx`, the hero card renders three stat chips in a `flex-row`. The vocabulary count appears in the `heroCopy` subtitle string, not as a standalone chip. Add a dedicated vocabulary chip that is tappable when `vocabularyTotal > 0`.

Replace the stat chips `View` block (lines 243–260, the `flex-row flex-wrap gap-2 mt-4` view) with:

```tsx
{inventory ? (
  <View className="flex-row flex-wrap gap-2 mt-4">
    <View className="bg-background rounded-full px-3 py-1.5">
      <Text className="text-caption font-semibold text-text-primary">
        {inventory.global.totalSessions} sessions
      </Text>
    </View>
    <View className="bg-background rounded-full px-3 py-1.5">
      <Text className="text-caption font-semibold text-text-primary">
        {inventory.global.totalActiveMinutes} active min
      </Text>
    </View>
    <View className="bg-background rounded-full px-3 py-1.5">
      <Text className="text-caption font-semibold text-text-primary">
        {inventory.global.currentStreak}-day streak
      </Text>
    </View>
    {inventory.global.vocabularyTotal > 0 ? (
      <Pressable
        onPress={() => router.push('/(app)/progress/vocabulary' as never)}
        className="bg-background rounded-full px-3 py-1.5"
        accessibilityRole="button"
        accessibilityLabel={`View ${inventory.global.vocabularyTotal} vocabulary words`}
        testID="progress-vocab-stat"
      >
        <Text className="text-caption font-semibold text-primary">
          {inventory.global.vocabularyTotal} words →
        </Text>
      </Pressable>
    ) : null}
  </View>
) : null}
```

- [ ] **Step 5: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress/vocabulary.tsx src/app/\(app\)/progress.tsx --no-coverage 2>&1 | tail -30
```

Expected: vocabulary.test.tsx passes.

---

## PART 2 — Milestones List Screen

**Files:**
- Create: `apps/mobile/src/app/(app)/progress/milestones.tsx`
- Create: `apps/mobile/src/app/(app)/progress/milestones.test.tsx`
- Modify: `apps/mobile/src/app/(app)/progress.tsx` — add "See all" pressable to milestones section

### Navigation wiring

The "Recent milestones" section heading in `progress.tsx` (line 290) gains a "See all" link when `milestonesQuery.data.length >= 5` (i.e., there may be more). The section heading row becomes a flex-row with the heading on the left and "See all →" on the right.

### Screen layout — milestones.tsx

Fetches `useProgressMilestones(50)` (full list, max 50). Reuses `MilestoneCard` component from `components/progress`.

```
MilestonesListScreen
├── Safe-area header row
│   ├── Back arrow Pressable (goBackOrReplace to /(app)/progress)
│   └── Title: "Your Milestones"
│   └── Subtitle: "{total} milestones earned"
├── Loading state → SkeletonList (3 rows)
├── Error state → ErrorFallback (Retry + Go back)
├── Empty state → empty card + Go back
└── ScrollView
    └── MilestoneCard per milestone (desc order — API already returns newest first)
```

### Task 2.1 — Write failing test

- [ ] **Step 1: Write the test**

Add `apps/mobile/src/app/(app)/progress/milestones.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react-native';
import { useProgressMilestones } from '../../../hooks/use-progress';
import MilestonesListScreen from './milestones';

jest.mock('../../../hooks/use-progress');
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

const mockMilestones = [
  {
    id: 'm1',
    profileId: 'p1',
    milestoneType: 'topic_mastered_count' as const,
    threshold: 5,
    subjectId: null,
    bookId: null,
    metadata: null,
    celebratedAt: null,
    createdAt: '2026-04-10T12:00:00Z',
  },
  {
    id: 'm2',
    profileId: 'p1',
    milestoneType: 'session_count' as const,
    threshold: 10,
    subjectId: null,
    bookId: null,
    metadata: null,
    celebratedAt: null,
    createdAt: '2026-04-05T09:00:00Z',
  },
];

describe('MilestonesListScreen', () => {
  beforeEach(() => {
    (useProgressMilestones as jest.Mock).mockReturnValue({
      data: mockMilestones,
      isLoading: false,
      isError: false,
    });
  });

  it('renders milestone cards', () => {
    render(<MilestonesListScreen />);
    expect(screen.getByText('5 topics mastered')).toBeTruthy();
    expect(screen.getByText('10 learning sessions completed')).toBeTruthy();
    expect(screen.getByTestId('milestones-back')).toBeTruthy();
  });

  it('shows empty state when no milestones', () => {
    (useProgressMilestones as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<MilestonesListScreen />);
    expect(screen.getByTestId('milestones-empty')).toBeTruthy();
  });

  it('shows error state with retry button', () => {
    (useProgressMilestones as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: jest.fn(),
    });
    render(<MilestonesListScreen />);
    expect(screen.getByTestId('milestones-error')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Confirm test fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress/milestones.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — module not found.

### Task 2.2 — Implement milestones.tsx

- [ ] **Step 3: Create `apps/mobile/src/app/(app)/progress/milestones.tsx`**

```typescript
import { ScrollView, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorFallback } from '../../../components/common';
import { MilestoneCard } from '../../../components/progress';
import { useProgressMilestones } from '../../../hooks/use-progress';
import { goBackOrReplace } from '../../../lib/navigation';

function SkeletonRow(): React.ReactElement {
  return (
    <View className="bg-surface rounded-card p-4 mt-3 flex-row items-center">
      <View className="bg-border rounded w-8 h-8 me-3" />
      <View className="flex-1">
        <View className="bg-border rounded h-4 w-2/3 mb-2" />
        <View className="bg-border rounded h-3 w-1/4" />
      </View>
    </View>
  );
}

export default function MilestonesListScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    data: milestones,
    isLoading,
    isError,
    refetch,
  } = useProgressMilestones(50);

  const isEmpty = !isLoading && !isError && (milestones?.length ?? 0) === 0;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/progress' as const)}
          className="me-3 py-2 pe-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="milestones-back"
        >
          <Text className="text-primary text-body font-semibold">{'\u2190'}</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            Your Milestones
          </Text>
          {!isLoading && !isError && (milestones?.length ?? 0) > 0 ? (
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {milestones!.length} milestone
              {milestones!.length !== 1 ? 's' : ''} earned
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      >
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : isError ? (
          <View testID="milestones-error">
            <ErrorFallback
              title="We couldn't load your milestones"
              message="Check your connection and try again."
              primaryAction={{
                label: 'Try again',
                onPress: () => void refetch(),
                testID: 'milestones-retry',
              }}
              secondaryAction={{
                label: 'Go back',
                onPress: () =>
                  goBackOrReplace(router, '/(app)/progress' as const),
                testID: 'milestones-go-back',
              }}
              testID="milestones-error-fallback"
            />
          </View>
        ) : isEmpty ? (
          <View
            className="bg-surface rounded-card p-5 mt-4 items-center"
            testID="milestones-empty"
          >
            <Text className="text-2xl mb-3">🎯</Text>
            <Text className="text-h3 font-semibold text-text-primary text-center">
              No milestones yet
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              Complete sessions and master topics to earn your first milestone.
            </Text>
            <Pressable
              onPress={() => goBackOrReplace(router, '/(app)/progress' as const)}
              className="bg-background rounded-button px-5 py-3 mt-4"
              accessibilityRole="button"
              accessibilityLabel="Go back to Journey"
              testID="milestones-empty-back"
            >
              <Text className="text-body font-semibold text-text-primary">
                Go back
              </Text>
            </Pressable>
          </View>
        ) : (
          milestones!.map((milestone) => (
            <View key={milestone.id} className="mt-3">
              <MilestoneCard milestone={milestone} />
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
```

### Task 2.3 — Wire "See all" in progress.tsx

- [ ] **Step 4: Add "See all →" to milestones section heading**

In `apps/mobile/src/app/(app)/progress.tsx`, replace the milestones heading (line 290–291):

```tsx
// Before:
<Text className="text-h3 font-semibold text-text-primary mt-6 mb-2">
  Recent milestones
</Text>

// After:
<View className="flex-row items-center justify-between mt-6 mb-2">
  <Text className="text-h3 font-semibold text-text-primary">
    Recent milestones
  </Text>
  {milestonesQuery.data && milestonesQuery.data.length >= 5 ? (
    <Pressable
      onPress={() => router.push('/(app)/progress/milestones' as never)}
      accessibilityRole="button"
      accessibilityLabel="See all milestones"
      testID="progress-milestones-see-all"
    >
      <Text className="text-body-sm text-primary font-medium">
        See all →
      </Text>
    </Pressable>
  ) : null}
</View>
```

- [ ] **Step 5: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress/milestones.tsx src/app/\(app\)/progress.tsx --no-coverage 2>&1 | tail -30
```

Expected: milestones.test.tsx passes.

---

## PART 3 — Unhide Reports Button for New Accounts

**Files:**
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx`

### Task 3.1 — Remove child.progress gate from reports button

The current structure in `child/[profileId]/index.tsx` (lines 321–373):
```tsx
{child?.progress ? (
  <View className="bg-coaching-card rounded-card p-4 mt-4">
    <Text className="text-h3 ...">Visible progress</Text>
    ...stats...
    <Pressable onPress={() => router.push(reports)}>Monthly reports</Pressable>
  </View>
) : null}
```

Split into two independent cards:
1. **Progress card** — conditional on `child?.progress`, shows snapshot stats (keep existing behavior).
2. **Reports card** — always rendered, shows the "Monthly reports" button unconditionally.

- [ ] **Step 1: Refactor index.tsx**

Replace the entire `{child?.progress ? ... : null}` block (lines 321–373) with:

```tsx
{/* Progress snapshot card — only shown once a snapshot exists */}
{child?.progress ? (
  <View className="bg-coaching-card rounded-card p-4 mt-4">
    <Text className="text-h3 font-semibold text-text-primary">
      Visible progress
    </Text>
    <Text className="text-body-sm text-text-secondary mt-1">
      {child.progress.topicsMastered} topics mastered
      {child.progress.vocabularyTotal > 0
        ? ` • ${child.progress.vocabularyTotal} words known`
        : ''}
    </Text>
    <View className="flex-row flex-wrap gap-2 mt-3">
      {child.progress.weeklyDeltaTopicsMastered != null ? (
        <View className="bg-background rounded-full px-3 py-1.5">
          <Text className="text-caption font-semibold text-text-primary">
            +{child.progress.weeklyDeltaTopicsMastered} topics this week
          </Text>
        </View>
      ) : null}
      {child.progress.weeklyDeltaVocabularyTotal != null &&
      child.progress.vocabularyTotal > 0 ? (
        <View className="bg-background rounded-full px-3 py-1.5">
          <Text className="text-caption font-semibold text-text-primary">
            +{child.progress.weeklyDeltaVocabularyTotal} words
          </Text>
        </View>
      ) : null}
    </View>
    {child.progress.guidance ? (
      <Text className="text-caption text-text-secondary mt-3">
        {child.progress.guidance}
      </Text>
    ) : null}
  </View>
) : null}

{/* Reports card — always visible */}
<View className="bg-surface rounded-card p-4 mt-4">
  <Pressable
    onPress={() => {
      if (!profileId) return;
      router.push({
        pathname: '/(app)/child/[profileId]/reports',
        params: { profileId },
      } as never);
    }}
    accessibilityRole="button"
    accessibilityLabel="Open monthly reports"
    testID="child-reports-link"
  >
    <Text className="text-body font-semibold text-text-primary">
      Monthly reports
      {reports && reports.length > 0 ? ` (${reports.length})` : ''}
    </Text>
    <Text className="text-body-sm text-text-secondary mt-1">
      {reports && reports.length > 0
        ? 'A monthly summary of learning activity.'
        : 'Your first report will appear after the first month of activity.'}
    </Text>
  </Pressable>
</View>
```

### Task 3.2 — Improve empty state in reports.tsx

The current reports screen empty state is a single-line text inside a plain card. Add an icon and a computed next-report date.

- [ ] **Step 2: Update empty state in `child/[profileId]/reports.tsx`**

Add a `getNextReportDate()` helper above the component:

```typescript
function getNextReportDate(): string {
  const now = new Date();
  // Monthly report cron runs 10:00 UTC on the 1st of each month
  const nextRun = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 10, 0, 0)
  );
  return nextRun.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
```

Replace the empty state block (lines 141–147):

```tsx
// Before:
<View className="bg-surface rounded-card p-4 mt-4">
  <Text className="text-body-sm text-text-secondary">
    No monthly reports yet. They will appear here once a month after
    there is enough learning activity to summarize.
  </Text>
</View>

// After:
<View
  className="bg-surface rounded-card p-5 mt-4 items-center"
  testID="child-reports-empty"
>
  <Text className="text-4xl mb-3">📊</Text>
  <Text className="text-h3 font-semibold text-text-primary text-center">
    First report coming soon
  </Text>
  <Text className="text-body-sm text-text-secondary text-center mt-2">
    Reports are generated on the 1st of each month. The first one will
    appear around {getNextReportDate()}.
  </Text>
</View>
```

- [ ] **Step 3: Run related tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/child/[profileId]/index.tsx" "src/app/(app)/child/[profileId]/reports.tsx" --no-coverage 2>&1 | tail -30
```

Expected: all pass.

---

## PART 4 — Field Naming Alignment (engagementTrend)

**Spec says:** `engagementTrend: 'increasing' | 'stable' | 'declining'`
**Current code:** `'growing' | 'steady' | 'quiet'`

**Mapping:**
- `'growing'` → `'increasing'`
- `'steady'` → `'stable'`
- `'quiet'` → `'declining'`

This is a breaking change to the API contract. All consumers must be updated atomically in a single commit.

**Files to change:**

| File | Change |
|------|--------|
| `packages/schemas/src/progress.ts:132` | `z.enum(['increasing', 'stable', 'declining'])` |
| `apps/api/src/services/dashboard.ts:350–355` | Rename the three literal values |
| `apps/api/src/services/monthly-report.ts:144` | Rename `'growing'` → `'increasing'` |
| `apps/mobile/src/app/(app)/dashboard.tsx:70` | Update type annotation |
| `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx:29` | Update prop type |
| `apps/mobile/src/components/coaching/ParentDashboardSummary.test.tsx` | Update any test fixtures using old names |
| `packages/schemas/dist/progress.d.ts` | Rebuild (auto via `pnpm build` in schemas) |

Note: `apps/api/src/services/monthly-report.ts` uses `'growing'` for its own `trend` field on `subjectMonthlyDetailSchema` (line 144 in that file). That field uses `z.enum(['growing', 'stable', 'declining'])` in the snapshots schema — keep that unchanged. Only change the literal string used by `engagementTrend`.

### Task 4.1 — Write failing typecheck first

- [ ] **Step 1: Run typecheck to get a baseline**

```bash
pnpm exec nx run api:typecheck 2>&1 | tail -20
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: clean (or note pre-existing failures only).

### Task 4.2 — Update schema (single source of truth first)

- [ ] **Step 2: Update `packages/schemas/src/progress.ts` line 132**

```typescript
// Before:
engagementTrend: z.enum(['growing', 'steady', 'quiet']),

// After:
engagementTrend: z.enum(['increasing', 'stable', 'declining']),
```

### Task 4.3 — Update API service (dashboard.ts)

- [ ] **Step 3: Update `apps/api/src/services/dashboard.ts` lines 350–355**

```typescript
// Before:
engagementTrend:
  sessionsThisWeek === 0
    ? 'quiet'
    : sessionsThisWeek > sessionsLastWeek
    ? 'growing'
    : 'steady',

// After:
engagementTrend:
  sessionsThisWeek === 0
    ? 'declining'
    : sessionsThisWeek > sessionsLastWeek
    ? 'increasing'
    : 'stable',
```

Note: `'quiet'` → `'declining'` is a semantic judgment call aligned with the spec. A week with zero sessions is a declining engagement signal.

### Task 4.4 — Update API service (monthly-report.ts)

- [ ] **Step 4: Locate and update `apps/api/src/services/monthly-report.ts:144`**

Grep first to confirm context:
```bash
grep -n "growing\|steady\|quiet" apps/api/src/services/monthly-report.ts
```

The line `? 'growing'` is part of the `trend` field on a `subjectMonthlyDetailSchema` entry — **not** `engagementTrend`. Confirm the field name before changing. If the field is `trend` (not `engagementTrend`), leave it unchanged. Run typecheck to confirm there are no remaining references.

### Task 4.5 — Update mobile consumers

- [ ] **Step 5: Update `apps/mobile/src/app/(app)/dashboard.tsx:70`**

```typescript
// Before:
engagementTrend: 'growing' | 'steady' | 'quiet';

// After:
engagementTrend: 'increasing' | 'stable' | 'declining';
```

- [ ] **Step 6: Update `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx:29`**

```typescript
// Before:
engagementTrend: 'growing' | 'steady' | 'quiet';

// After:
engagementTrend: 'increasing' | 'stable' | 'declining';
```

- [ ] **Step 7: Update test fixtures in `ParentDashboardSummary.test.tsx`**

Run:
```bash
grep -n "growing\|steady\|quiet" apps/mobile/src/components/coaching/ParentDashboardSummary.test.tsx
```

Update any fixture objects that set `engagementTrend: 'growing'` etc. to the new names.

### Task 4.6 — Verify no orphaned references

- [ ] **Step 8: Sweep for remaining old names**

```bash
grep -rn "'growing'\|'steady'\|'quiet'" apps/api/src apps/mobile/src packages/schemas/src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "monthly-report\|snapshot\|weekly-progress-push\|request-logger"
```

Expected: no results except the intentionally excluded files (those use `'growing'` for the unrelated `subjectMonthlyDetailSchema.trend` field or log strings).

### Task 4.7 — Typecheck and test

- [ ] **Step 9: Run typecheck**

```bash
pnpm exec nx run api:typecheck 2>&1 | tail -20
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 10: Run related tests**

```bash
pnpm exec nx run api:test 2>&1 | tail -30
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/dashboard.tsx src/components/coaching/ParentDashboardSummary.tsx --no-coverage 2>&1 | tail -20
```

Expected: all pass.

---

## Verification Steps

| Item | Verified by |
|------|------------|
| Vocabulary browser renders per-subject CEFR breakdown | test: `progress/vocabulary.test.tsx:"renders subject section and CEFR breakdown"` |
| Vocabulary browser — empty state has an action | test: `progress/vocabulary.test.tsx:"shows empty state when no vocabulary"` |
| Vocabulary browser — error state has retry + back | test: `progress/vocabulary.test.tsx:"shows error state with retry and back buttons"` |
| Vocabulary stat chip navigates to browser | manual: tap chip on Journey screen with language subject active |
| Milestones list renders all milestones | test: `progress/milestones.test.tsx:"renders milestone cards"` |
| Milestones list — empty state has action | test: `progress/milestones.test.tsx:"shows empty state when no milestones"` |
| Milestones list — error state has retry + back | test: `progress/milestones.test.tsx:"shows error state with retry button"` |
| "See all" link appears when 5 milestones shown | manual: verify progress screen with 5+ milestones shows "See all →" |
| Reports button visible on new account (no progress) | manual: use profile with no snapshots — verify button visible |
| Reports empty state shows next-report date | manual: open reports screen on new account — verify "First report coming" copy with date |
| engagementTrend schema uses new names | test: `pnpm exec nx run api:typecheck` — clean |
| No old `'growing'\|'steady'\|'quiet'` for engagementTrend | manual: grep sweep in Task 4.6 returns no results |
| All API tests pass | test: `pnpm exec nx run api:test` |
| All mobile typechecks pass | test: `cd apps/mobile && pnpm exec tsc --noEmit` |

---

## Commit Strategy

Commit after each part, with finding IDs:

1. `feat(mobile): vocabulary browser screen + tappable stat chip [EP15-VP1]`
2. `feat(mobile): milestones list screen + see-all link [EP15-VP2]`
3. `fix(mobile): unhide reports button on new accounts, improve empty state [EP15-VP3]`
4. `fix(schemas,api,mobile): align engagementTrend to spec names (growing→increasing, steady→stable, quiet→declining) [EP15-VP4]`

Each commit must pass lint + typecheck before pushing.

---

## Out of Scope

- No new API endpoints — all four items use existing endpoints.
- No database migrations — no schema table changes.
- No OTA push — these are code changes only; deploy follows normal CI flow.
- `ParentDashboardSummary` does not currently _display_ `engagementTrend` as user-visible text (it is in the `progress` prop but not rendered as a labelled badge). The rename is still required to keep the type contract consistent with the spec. If a visual indicator is wanted later, that is a separate story.
