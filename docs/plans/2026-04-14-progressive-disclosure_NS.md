# Progressive Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide progress complexity (retention signals, CEFR labels, growth charts, milestones, mentor memory) for new users with fewer than 4 completed sessions, revealing it progressively as data becomes meaningful.

**Architecture:** Client-side gating using existing `totalSessions` from `GET /progress/inventory` (learner) and a new `totalSessions` field on `GET /dashboard` (parent). One shared constant defines the threshold. One small API addition — the dashboard response gains `totalSessions` per child, sourced from the same snapshot pipeline that the inventory already uses.

**Tech Stack:** React Native, Expo Router, TanStack Query, Hono API, Drizzle ORM, Zod schemas, Jest + React Native Testing Library.

**Spec:** `docs/specs/2026-04-14-progressive-disclosure-design.md`

---

### Task 1: Add threshold constant and helper

**Files:**
- Create: `apps/mobile/src/lib/progressive-disclosure.ts`
- Test: `apps/mobile/src/lib/progressive-disclosure.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// apps/mobile/src/lib/progressive-disclosure.test.ts
import {
  PROGRESSIVE_DISCLOSURE_THRESHOLD,
  isNewLearner,
  sessionsUntilFullProgress,
} from './progressive-disclosure';

describe('progressive-disclosure', () => {
  it('threshold is 4', () => {
    expect(PROGRESSIVE_DISCLOSURE_THRESHOLD).toBe(4);
  });

  it('isNewLearner returns true when below threshold', () => {
    expect(isNewLearner(0)).toBe(true);
    expect(isNewLearner(3)).toBe(true);
  });

  it('isNewLearner returns false at threshold', () => {
    expect(isNewLearner(4)).toBe(false);
  });

  it('isNewLearner returns false above threshold', () => {
    expect(isNewLearner(10)).toBe(false);
  });

  it('isNewLearner treats undefined as not-new (backwards compat)', () => {
    // undefined means the API hasn't shipped totalSessions yet,
    // or the query hasn't loaded — don't gate, show everything.
    expect(isNewLearner(undefined)).toBe(false);
  });

  it('sessionsUntilFullProgress returns correct remaining count', () => {
    expect(sessionsUntilFullProgress(0)).toBe(4);
    expect(sessionsUntilFullProgress(1)).toBe(3);
    expect(sessionsUntilFullProgress(3)).toBe(1);
  });

  it('sessionsUntilFullProgress returns 0 when at or above threshold', () => {
    expect(sessionsUntilFullProgress(4)).toBe(0);
    expect(sessionsUntilFullProgress(10)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/progressive-disclosure.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// apps/mobile/src/lib/progressive-disclosure.ts

/**
 * Threshold for progressive disclosure of progress complexity.
 * Users with fewer than this many completed sessions see a simplified
 * experience. See docs/specs/2026-04-14-progressive-disclosure-design.md.
 */
export const PROGRESSIVE_DISCLOSURE_THRESHOLD = 4;

/**
 * Returns true when a learner has not yet reached the session count
 * needed to see the full progress experience.
 *
 * When totalSessions is undefined (API hasn't shipped this field yet,
 * or the query hasn't loaded), returns false — unknown means don't gate.
 * This prevents the parent dashboard from hiding signals when talking
 * to an older API version that doesn't include totalSessions.
 *
 * SYNC: "completed session" means status !== 'active' — must match
 * the definition in snapshot-aggregation.ts computeProgressMetrics().
 */
export function isNewLearner(totalSessions: number | undefined): boolean {
  if (totalSessions === undefined) return false;
  return totalSessions < PROGRESSIVE_DISCLOSURE_THRESHOLD;
}

/**
 * How many more sessions until the full progress experience unlocks.
 * Returns 0 when already at or past the threshold.
 */
export function sessionsUntilFullProgress(
  totalSessions: number | undefined
): number {
  return Math.max(0, PROGRESSIVE_DISCLOSURE_THRESHOLD - (totalSessions ?? 0));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/progressive-disclosure.ts --no-coverage`
Expected: PASS — all 7 tests

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/progressive-disclosure.ts apps/mobile/src/lib/progressive-disclosure.test.ts
git commit -m "feat(mobile): add progressive disclosure threshold constant and helpers [PD-1]"
```

---

### Task 2: Add `totalSessions` to dashboard schema and API

**Files:**
- Modify: `packages/schemas/src/progress.ts` (line ~139, `dashboardChildSchema`)
- Modify: `apps/api/src/services/dashboard.ts` (lines ~302-363, `buildChildProgressSummary`; lines ~562-593, `getChildrenForParent` return mapping)
- Modify: `apps/mobile/src/app/(app)/dashboard.tsx` (line ~52-73, `renderChildCards` type; line ~77-96, prop passing)

- [ ] **Step 1: Add `totalSessions` to the Zod schema**

In `packages/schemas/src/progress.ts`, add `totalSessions` to `dashboardChildSchema`:

```ts
// In dashboardChildSchema, after the retentionTrend field (line ~159):
export const dashboardChildSchema = z.object({
  profileId: z.string().uuid(),
  displayName: z.string(),
  summary: z.string(),
  sessionsThisWeek: z.number().int(),
  sessionsLastWeek: z.number().int(),
  totalTimeThisWeek: z.number().int(),
  totalTimeLastWeek: z.number().int(),
  exchangesThisWeek: z.number().int(),
  exchangesLastWeek: z.number().int(),
  totalSessions: z.number().int(),  // NEW — all-time completed session count
  trend: z.enum(['up', 'down', 'stable']),
  subjects: z.array(
    z.object({
      subjectId: z.string().uuid().optional(),
      name: z.string(),
      retentionStatus: z.enum(['strong', 'fading', 'weak', 'forgotten']),
      rawInput: z.string().nullable().optional(),
    })
  ),
  guidedVsImmediateRatio: z.number().min(0).max(1),
  retentionTrend: z.enum(['improving', 'declining', 'stable']),
  progress: dashboardChildProgressSchema.nullable().optional(),
});
```

- [ ] **Step 2: Modify `buildChildProgressSummary` to also return `totalSessions`**

The function at `apps/api/src/services/dashboard.ts:302` already calls `getLatestSnapshot()`. Change the return type to include `totalSessions` and return it alongside the existing `progress` object.

Change the function signature and return:

```ts
// Change the function to return both progress and totalSessions
async function buildChildProgressSummary(
  db: Database,
  childProfileId: string,
  childName: string,
  sessionsThisWeek: number,
  sessionsLastWeek: number,
  totalTimeThisWeekMinutes: number,
  subjectNames: string[]
): Promise<{
  progress: DashboardChild['progress'];
  // SYNC: totalSessions must match the definition in snapshot-aggregation.ts
  // (status !== 'active'). See progressive-disclosure-design.md.
  totalSessions: number;
}> {
  const latestSnapshot = await getLatestSnapshot(db, childProfileId);
  if (!latestSnapshot) {
    return { progress: null, totalSessions: 0 };
  }

  const previousSnapshot = await getLatestSnapshotOnOrBefore(
    db,
    childProfileId,
    isoDate(
      subtractDays(new Date(`${latestSnapshot.snapshotDate}T00:00:00Z`), 7)
    )
  );

  const previousMetrics = previousSnapshot?.metrics ?? null;
  const currentMetrics = latestSnapshot.metrics;

  return {
    totalSessions: currentMetrics.totalSessions,
    progress: {
      snapshotDate: latestSnapshot.snapshotDate,
      topicsMastered: currentMetrics.topicsMastered,
      vocabularyTotal: currentMetrics.vocabularyTotal,
      minutesThisWeek: totalTimeThisWeekMinutes,
      weeklyDeltaTopicsMastered: previousMetrics
        ? Math.max(
            0,
            currentMetrics.topicsMastered - previousMetrics.topicsMastered
          )
        : null,
      weeklyDeltaVocabularyTotal: previousMetrics
        ? Math.max(
            0,
            currentMetrics.vocabularyTotal - previousMetrics.vocabularyTotal
          )
        : null,
      weeklyDeltaTopicsExplored: previousMetrics
        ? Math.max(
            0,
            sumTopicsExplored(currentMetrics) - sumTopicsExplored(previousMetrics)
          )
        : null,
      engagementTrend:
        sessionsThisWeek === 0
          ? 'declining'
          : sessionsThisWeek > sessionsLastWeek
          ? 'increasing'
          : 'stable',
      guidance: buildProgressGuidance(
        childName,
        subjectNames,
        sessionsThisWeek,
        sessionsLastWeek
      ),
    },
  };
}
```

- [ ] **Step 3: Update `getChildrenForParent` to consume the new return shape**

In the same file, update the `prepared.map` section (~line 562) that builds the `DashboardChild[]` array:

```ts
  const children: DashboardChild[] = prepared.map((p, i) => {
    const summary = generateChildSummary(p.dashboardInput);
    const trend = calculateTrend(p.sessionsThisWeek, p.sessionsLastWeek);
    const retentionTrend = calculateRetentionTrend(
      p.dashboardInput.subjectRetentionData
    );
    const { progress, totalSessions } = progressSummaries[i]!;

    return {
      profileId: p.childProfileId,
      displayName: p.displayName,
      summary,
      sessionsThisWeek: p.sessionsThisWeek,
      sessionsLastWeek: p.sessionsLastWeek,
      totalTimeThisWeek: p.dashboardInput.totalTimeThisWeekMinutes,
      totalTimeLastWeek: p.dashboardInput.totalTimeLastWeekMinutes,
      exchangesThisWeek: p.dashboardInput.exchangesThisWeek,
      exchangesLastWeek: p.dashboardInput.exchangesLastWeek,
      totalSessions,
      trend,
      subjects: p.progress.subjects.map((s) => ({
        subjectId: s.subjectId,
        name: s.name,
        retentionStatus: s.retentionStatus,
        rawInput: p.rawInputMap.get(s.subjectId) ?? null,
      })),
      guidedVsImmediateRatio: calculateGuidedRatio(
        p.guidedMetrics.guidedCount,
        p.guidedMetrics.totalProblemCount
      ),
      retentionTrend,
      progress,
    };
  });
```

- [ ] **Step 4: Update `renderChildCards` in `dashboard.tsx`**

The `renderChildCards` function has an inline type for `children`. Add `totalSessions` to it and pass it to the component:

In `apps/mobile/src/app/(app)/dashboard.tsx`, add `totalSessions: number;` to the `children` parameter type (after `totalTimeLastWeek: number;` at ~line 60), and pass it as a prop:

```ts
      totalSessions={child.totalSessions}
```

- [ ] **Step 5: Update the demo fixture**

In `apps/api/src/routes/dashboard.ts`, the `/dashboard/demo` endpoint (line ~164) returns fixture data. Add `totalSessions: 12` and `totalSessions: 8` to the two demo children respectively, so the demo banner shows the full (established) experience.

- [ ] **Step 6: Run typecheck to verify schema alignment**

Run: `pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS — no type errors

- [ ] **Step 7: Run existing dashboard tests**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/routes/dashboard.ts --no-coverage`
Expected: PASS (or update test fixtures to include `totalSessions`)

- [ ] **Step 8: Commit**

```bash
git add packages/schemas/src/progress.ts apps/api/src/services/dashboard.ts apps/api/src/routes/dashboard.ts apps/mobile/src/app/\(app\)/dashboard.tsx
git commit -m "feat(api): add totalSessions to dashboard child response [PD-2]"
```

---

### Task 3: Gate the progress screen for new learners

**Files:**
- Modify: `apps/mobile/src/app/(app)/progress.tsx`
- Create: `apps/mobile/src/app/(app)/progress.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// apps/mobile/src/app/(app)/progress.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

// Mock expo-router
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock hooks
const mockInventory = jest.fn();
const mockHistory = jest.fn();
const mockMilestones = jest.fn();
const mockRefresh = jest.fn();

jest.mock('../../hooks/use-progress', () => ({
  useProgressInventory: () => mockInventory(),
  useProgressHistory: () => mockHistory(),
  useProgressMilestones: () => mockMilestones(),
  useRefreshProgressSnapshot: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

import ProgressScreen from './progress';

function setupEstablished(totalSessions = 10) {
  mockInventory.mockReturnValue({
    data: {
      global: {
        totalSessions,
        topicsMastered: 5,
        vocabularyTotal: 30,
        totalActiveMinutes: 120,
        currentStreak: 3,
      },
      subjects: [
        {
          subjectId: 'sub-1',
          subjectName: 'Math',
          topics: { mastered: 3, inProgress: 1, notStarted: 2, total: 6, explored: 4 },
          activeMinutes: 60,
          sessionsCount: 5,
          vocabulary: { total: 0, mastered: 0, learning: 0, new: 0, byCefrLevel: {} },
        },
      ],
    },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
    error: null,
  });
  mockHistory.mockReturnValue({
    data: { dataPoints: [] },
    isRefetching: false,
    refetch: jest.fn(),
  });
  mockMilestones.mockReturnValue({
    data: [],
    refetch: jest.fn(),
  });
}

function setupNewLearner(totalSessions = 2) {
  mockInventory.mockReturnValue({
    data: {
      global: {
        totalSessions,
        topicsMastered: 1,
        vocabularyTotal: 5,
        totalActiveMinutes: 15,
        currentStreak: 1,
      },
      subjects: [
        {
          subjectId: 'sub-1',
          subjectName: 'Math',
          topics: { mastered: 1, inProgress: 0, notStarted: 0, total: null, explored: 1 },
          activeMinutes: 15,
          sessionsCount: 2,
          vocabulary: { total: 5, mastered: 2, learning: 3, new: 0, byCefrLevel: {} },
        },
      ],
    },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
    error: null,
  });
  mockHistory.mockReturnValue({
    data: { dataPoints: [] },
    isRefetching: false,
    refetch: jest.fn(),
  });
  mockMilestones.mockReturnValue({
    data: [],
    refetch: jest.fn(),
  });
}

describe('ProgressScreen — progressive disclosure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows teaser message for new learner (totalSessions < 4)', () => {
    setupNewLearner(2);
    render(<ProgressScreen />);

    expect(screen.getByTestId('progress-new-learner-teaser')).toBeTruthy();
    expect(screen.getByText(/2 more sessions/)).toBeTruthy();
  });

  it('hides stat pills for new learner', () => {
    setupNewLearner(1);
    render(<ProgressScreen />);

    expect(screen.queryByText(/sessions$/)).toBeNull();
    expect(screen.queryByText(/active min$/)).toBeNull();
    expect(screen.queryByText(/day streak$/)).toBeNull();
  });

  it('hides subject cards for new learner', () => {
    setupNewLearner(2);
    render(<ProgressScreen />);

    expect(screen.queryByText('Your subjects')).toBeNull();
  });

  it('hides growth chart for new learner', () => {
    setupNewLearner(2);
    render(<ProgressScreen />);

    expect(screen.queryByText('Your growth')).toBeNull();
  });

  it('hides milestones section for new learner', () => {
    setupNewLearner(2);
    render(<ProgressScreen />);

    expect(screen.queryByText('Recent milestones')).toBeNull();
  });

  it('shows full experience for established learner (totalSessions >= 4)', () => {
    setupEstablished(4);
    render(<ProgressScreen />);

    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
    expect(screen.getByText('Your subjects')).toBeTruthy();
    expect(screen.getByText('Recent milestones')).toBeTruthy();
  });

  it('shows full experience at exactly threshold', () => {
    setupEstablished(4);
    render(<ProgressScreen />);

    expect(screen.getByText(/4 sessions/)).toBeTruthy();
    expect(screen.getByText('Your subjects')).toBeTruthy();
  });

  it('teaser has a start-learning CTA', () => {
    setupNewLearner(3);
    render(<ProgressScreen />);

    const cta = screen.getByTestId('progress-new-learner-start');
    expect(cta).toBeTruthy();
    fireEvent.press(cta);
    expect(mockPush).toHaveBeenCalledWith('/(app)/home');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress.test.tsx --no-coverage`
Expected: FAIL — testIDs and text not found

- [ ] **Step 3: Modify `progress.tsx` to gate content**

Import the helpers at the top of `apps/mobile/src/app/(app)/progress.tsx`:

```ts
import {
  isNewLearner,
  sessionsUntilFullProgress,
} from '../../lib/progressive-disclosure';
```

After the existing `isEmpty` derivation (line ~163), add:

```ts
  const newLearner = !isEmpty && isNewLearner(inventory?.global.totalSessions);
  const remaining = sessionsUntilFullProgress(
    inventory?.global.totalSessions
  );
```

Then in the render tree, after the `isEmpty` ternary branch (line ~233 `} : (`), add a new branch for `newLearner`:

Replace the `: (` on line 233 with:

```tsx
        ) : newLearner ? (
          <View
            className="bg-coaching-card rounded-card p-5"
            testID="progress-new-learner-teaser"
          >
            <Text className="text-h2 font-bold text-text-primary">
              Your journey is just beginning
            </Text>
            <Text className="text-body text-text-secondary mt-2">
              Complete {remaining} more {remaining === 1 ? 'session' : 'sessions'} to see your full learning journey!
            </Text>
            <Pressable
              onPress={() => router.push('/(app)/home' as never)}
              className="bg-primary rounded-button px-4 py-3 mt-4 items-center"
              accessibilityRole="button"
              accessibilityLabel="Start learning"
              testID="progress-new-learner-start"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Start learning
              </Text>
            </Pressable>
          </View>
        ) : (
```

The rest of the existing render tree (stat pills, subjects, growth chart, milestones) stays unchanged inside the final branch.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/\(app\)/progress.tsx apps/mobile/src/app/\(app\)/progress.test.tsx
git commit -m "feat(mobile): gate progress screen for new learners [PD-3]"
```

---

### Task 4: Gate retention signals in `ParentDashboardSummary`

**Files:**
- Modify: `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx`
- Modify: `apps/mobile/src/components/coaching/ParentDashboardSummary.test.tsx`

- [ ] **Step 1: Add new tests for progressive disclosure**

Append to the existing test file `apps/mobile/src/components/coaching/ParentDashboardSummary.test.tsx`:

```tsx
  // --- Progressive disclosure tests ---

  describe('progressive disclosure', () => {
    it('hides aggregate signal when totalSessions < 4', () => {
      render(
        <ParentDashboardSummary {...defaultProps} totalSessions={2} />
      );

      expect(screen.queryByTestId('aggregate-signal')).toBeNull();
      expect(screen.queryByTestId('aggregate-signal-empty')).toBeNull();
      expect(screen.getByTestId('parent-dashboard-teaser')).toBeTruthy();
    });

    it('hides retention trend badge when totalSessions < 4', () => {
      render(
        <ParentDashboardSummary
          {...defaultProps}
          totalSessions={3}
          retentionTrend="improving"
        />
      );

      expect(screen.queryByTestId('retention-trend-badge')).toBeNull();
    });

    it('hides per-subject retention pills when totalSessions < 4', () => {
      render(
        <ParentDashboardSummary {...defaultProps} totalSessions={1} />
      );

      expect(screen.queryByText('Thriving')).toBeNull();
      expect(screen.queryByText('Warming up')).toBeNull();
    });

    it('shows teaser with concrete remaining count', () => {
      render(
        <ParentDashboardSummary {...defaultProps} totalSessions={1} />
      );

      expect(screen.getByText(/3 more sessions/)).toBeTruthy();
    });

    it('shows full signals when totalSessions >= 4', () => {
      render(
        <ParentDashboardSummary
          {...defaultProps}
          totalSessions={5}
          retentionTrend="improving"
        />
      );

      expect(screen.getByTestId('aggregate-signal')).toBeTruthy();
      expect(screen.getByTestId('retention-trend-badge')).toBeTruthy();
      expect(screen.getByText('Thriving')).toBeTruthy();
    });

    it('shows full signals when totalSessions is undefined (backwards compat)', () => {
      render(
        <ParentDashboardSummary
          {...defaultProps}
          retentionTrend="stable"
        />
      );

      // Without totalSessions prop, existing behavior preserved —
      // isNewLearner(undefined) returns false, so nothing is gated.
      expect(screen.getByTestId('aggregate-signal')).toBeTruthy();
    });

    it('handles mixed children — one new, one established', () => {
      const { unmount } = render(
        <ParentDashboardSummary
          {...defaultProps}
          childName="Alex"
          totalSessions={2}
        />
      );

      // New child shows teaser
      expect(screen.getByTestId('parent-dashboard-teaser')).toBeTruthy();
      expect(screen.queryByTestId('aggregate-signal')).toBeNull();

      unmount();

      render(
        <ParentDashboardSummary
          {...defaultProps}
          childName="Sam"
          totalSessions={8}
          retentionTrend="improving"
        />
      );

      // Established child shows full signals
      expect(screen.queryByTestId('parent-dashboard-teaser')).toBeNull();
      expect(screen.getByTestId('aggregate-signal')).toBeTruthy();
      expect(screen.getByTestId('retention-trend-badge')).toBeTruthy();
    });
  });
```

- [ ] **Step 2: Run the tests to verify new tests fail**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/coaching/ParentDashboardSummary.tsx --no-coverage`
Expected: FAIL — `totalSessions` prop not recognized, testID `parent-dashboard-teaser` not found

- [ ] **Step 3: Modify `ParentDashboardSummary.tsx`**

Add the import at the top:

```ts
import {
  isNewLearner,
  sessionsUntilFullProgress,
} from '../../lib/progressive-disclosure';
```

Add `totalSessions` to the props interface:

```ts
interface ParentDashboardSummaryProps {
  childName: string;
  summary: string;
  subjects: SubjectInfo[];
  trend: 'up' | 'down' | 'stable';
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  totalTimeThisWeek: number;
  totalTimeLastWeek: number;
  totalSessions?: number;  // NEW — for progressive disclosure gating
  retentionTrend?: 'improving' | 'declining' | 'stable';
  progress?: { /* ... existing ... */ } | null;
  onDrillDown: () => void;
  isLoading?: boolean;
}
```

In the component function, destructure `totalSessions` and derive gating:

```ts
export function ParentDashboardSummary({
  childName,
  summary,
  subjects,
  trend,
  sessionsThisWeek,
  sessionsLastWeek,
  totalTimeThisWeek,
  totalTimeLastWeek,
  totalSessions,
  retentionTrend,
  progress,
  onDrillDown,
  isLoading,
}: ParentDashboardSummaryProps): ReactNode {
  const colors = useThemeColors();
  const showFullSignals = !isNewLearner(totalSessions);
  const remaining = sessionsUntilFullProgress(totalSessions);
  const aggregateSignal = deriveAggregateSignal(subjects);
  // ... rest unchanged
```

Replace the `metadata` JSX block. Wrap aggregate signal, retention trend, and subject retention pills in `showFullSignals` guards. Add a teaser when `!showFullSignals`:

```tsx
  const metadata = (
    <>
      {showFullSignals ? (
        <>
          {aggregateSignal ? (
            <View
              className="flex-row items-center mt-1"
              testID="aggregate-signal"
              accessibilityLabel={`Overall status: ${AGGREGATE_SIGNAL_CONFIG[aggregateSignal].label}`}
            >
              <Ionicons
                name={AGGREGATE_SIGNAL_CONFIG[aggregateSignal].icon}
                size={16}
                color={colors[AGGREGATE_SIGNAL_CONFIG[aggregateSignal].colorKey]}
                style={{ marginRight: 8 }}
              />
              <Text
                className={`text-body-sm font-semibold ${AGGREGATE_SIGNAL_CONFIG[aggregateSignal].textColor}`}
              >
                {AGGREGATE_SIGNAL_CONFIG[aggregateSignal].label}
              </Text>
            </View>
          ) : (
            <Text
              className="text-caption text-text-secondary mt-1"
              testID="aggregate-signal-empty"
            >
              No data yet
            </Text>
          )}
        </>
      ) : null}
      <Text
        className="text-caption text-text-secondary mt-1"
        accessibilityLabel={`Trend: ${trendText}`}
      >
        {trendText}
      </Text>
      {showFullSignals ? (
        retentionTrend ? (
          <View
            className="flex-row items-center mt-1.5"
            testID="retention-trend-badge"
            accessibilityLabel={`Retention: ${retentionTrend}`}
          >
            <Text className="text-caption text-text-secondary">Retention: </Text>
            <Text
              className={`text-caption font-semibold ${RETENTION_TREND_CONFIG[retentionTrend].className}`}
            >
              {RETENTION_TREND_CONFIG[retentionTrend].arrow}{' '}
              {RETENTION_TREND_CONFIG[retentionTrend].label}
            </Text>
          </View>
        ) : (
          <Text
            className="text-caption text-text-secondary mt-1.5"
            testID="retention-trend-empty"
          >
            No data yet
          </Text>
        )
      ) : null}
      {showFullSignals && progress ? (
        <View className="mt-3 gap-2">
          <View className="flex-row flex-wrap gap-2">
            <View className="bg-background rounded-full px-3 py-1.5">
              <Text className="text-caption font-semibold text-text-primary">
                {progress.topicsMastered} topics
                {progress.weeklyDeltaTopicsMastered != null
                  ? ` • +${progress.weeklyDeltaTopicsMastered} this week`
                  : ''}
              </Text>
            </View>
            {progress.vocabularyTotal > 0 ? (
              <View className="bg-background rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  {progress.vocabularyTotal} words
                  {progress.weeklyDeltaVocabularyTotal != null
                    ? ` • +${progress.weeklyDeltaVocabularyTotal}`
                    : ''}
                </Text>
              </View>
            ) : null}
            {progress.weeklyDeltaTopicsExplored != null &&
            progress.weeklyDeltaTopicsExplored > 0 ? (
              <View className="bg-background rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  +{progress.weeklyDeltaTopicsExplored} explored
                </Text>
              </View>
            ) : null}
          </View>
          {progress.guidance ? (
            <Text className="text-caption text-text-secondary">
              {progress.guidance}
            </Text>
          ) : null}
        </View>
      ) : null}
      {showFullSignals && subjects.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 mt-2">
          {subjects.map((subject) => (
            <View
              key={subject.name}
              className="flex-row items-center bg-background rounded-full px-3 py-1.5"
            >
              <Text className="text-caption text-text-primary me-2">
                {subject.name}
              </Text>
              <RetentionSignal status={subject.retentionStatus} />
            </View>
          ))}
        </View>
      ) : null}
      {!showFullSignals ? (
        <Text
          className="text-caption text-text-secondary mt-2"
          testID="parent-dashboard-teaser"
        >
          After {remaining} more {remaining === 1 ? 'session' : 'sessions'}, you'll see {childName}'s retention trends and detailed progress here.
        </Text>
      ) : null}
    </>
  );
```

Note: The `trendText` (sessions this week, time comparison) always shows — it's basic engagement data, not complex analytics.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/coaching/ParentDashboardSummary.tsx --no-coverage`
Expected: PASS — all existing + new tests

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/coaching/ParentDashboardSummary.tsx apps/mobile/src/components/coaching/ParentDashboardSummary.test.tsx
git commit -m "feat(mobile): gate parent dashboard retention signals behind session threshold [PD-4]"
```

---

### Task 5: Hide "What My Mentor Knows" on the More screen

**Files:**
- Modify: `apps/mobile/src/app/(app)/more.tsx`

This task uses `queryClient.getQueryData` to peek at the already-cached progress inventory instead of firing a new `useProgressInventory()` fetch. The More screen should not make a network request just to decide whether to show one menu item. If there's no cached data (user hasn't visited the progress screen yet), the row stays visible — `isNewLearner(undefined)` returns `false`.

- [ ] **Step 1: Add the imports**

At the top of `apps/mobile/src/app/(app)/more.tsx`, add:

```ts
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '../../hooks/use-profile';
import { isNewLearner } from '../../lib/progressive-disclosure';
import type { KnowledgeInventory } from '@eduagent/schemas';
```

Note: check whether `useProfile` is already imported in this file — it likely is since the More screen shows the profile name. If so, skip the duplicate import.

- [ ] **Step 2: Read cached inventory, derive gating boolean**

Inside the component function (early, alongside other hooks), add:

```ts
  const queryClient = useQueryClient();
  const cachedInventory = queryClient.getQueryData<KnowledgeInventory>(
    ['progress', 'inventory', activeProfile?.id]
  );
  const hideMentorMemory = isNewLearner(cachedInventory?.global.totalSessions);
```

The `activeProfile` variable should already be available in the component. If it's named differently (e.g., destructured from `useProfile()`), use whatever the existing name is.

- [ ] **Step 3: Wrap the Mentor Memory SettingsRow**

Replace the unconditional `SettingsRow` at line ~458-461:

```tsx
        {!hideMentorMemory && (
          <SettingsRow
            label="What My Mentor Knows"
            onPress={() => router.push('/(app)/mentor-memory')}
          />
        )}
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/\(app\)/more.tsx
git commit -m "feat(mobile): hide mentor memory link for new learners [PD-5]"
```

---

### Task 6: Lightweight "not enough data" states on detail screens

**Files:**
- Modify: `apps/mobile/src/app/(app)/progress/vocabulary.tsx`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx`

Note: `apps/mobile/src/app/(app)/progress/[subjectId].tsx` was considered but does not need changes — when a subject exists, the screen always renders topic counts, session counts, and CTAs. It never shows a hollow empty state.

These screens already have empty states. We refine them for new learners to show a forward-looking message instead of a generic "nothing here" when the data is thin because they haven't reached the threshold yet.

- [ ] **Step 1: Update vocabulary browser empty state**

In `apps/mobile/src/app/(app)/progress/vocabulary.tsx`, add imports:

```ts
import { isNewLearner } from '../../../lib/progressive-disclosure';
```

After the existing `isEmpty` derivation (line ~83), add:

```ts
  const newLearner = isNewLearner(inventory?.global.totalSessions);
```

In the render tree, update the `isEmpty` branch (line ~139) to check `newLearner`:

```tsx
        ) : isEmpty && newLearner ? (
          <View
            className="bg-surface rounded-card p-5 mt-4 items-center"
            testID="vocab-browser-new-learner"
          >
            <Text className="text-h3 font-semibold text-text-primary text-center">
              Your vocabulary will grow here
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              As you learn, the words you pick up will appear here with their levels.
            </Text>
            <Pressable
              onPress={() =>
                goBackOrReplace(router, '/(app)/progress' as const)
              }
              className="bg-background rounded-button px-5 py-3 mt-4"
              accessibilityRole="button"
              accessibilityLabel="Go back to Journey"
              testID="vocab-browser-new-learner-back"
            >
              <Text className="text-body font-semibold text-text-primary">
                Go back
              </Text>
            </Pressable>
          </View>
        ) : isEmpty ? (
```

The existing `isEmpty` branch below becomes the fallback for established learners with zero vocabulary (e.g., they only study non-language subjects).

- [ ] **Step 2: Update child subject topics empty state**

In `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx`, add import:

```ts
import { isNewLearner } from '../../../../../lib/progressive-disclosure';
```

The screen fetches `useChildInventory(profileId)` already (line ~55). After that, derive:

```ts
  const childTotalSessions = inventory?.global.totalSessions;
  const childIsNew = isNewLearner(childTotalSessions);
```

Update the empty topics branch (line ~221, `topics.length === 0`):

```tsx
        ) : topics.length === 0 && childIsNew ? (
          <View className="py-8 items-center" testID="topics-new-learner">
            <Text className="text-body text-text-secondary text-center">
              Topics will appear here as {'\n'}your child explores this subject.
            </Text>
          </View>
        ) : topics.length === 0 ? (
          <View className="py-8 items-center" testID="topics-empty">
            <Text className="text-body text-text-secondary">
              No topics yet — start a learning session to explore this subject.
            </Text>
          </View>
```

Note: `useChildInventory` calls `GET /dashboard/children/:profileId/inventory` which returns a `KnowledgeInventory` from `buildKnowledgeInventory()`. That type already has `global.totalSessions`.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/\(app\)/progress/vocabulary.tsx apps/mobile/src/app/\(app\)/child/\[profileId\]/subjects/\[subjectId\].tsx
git commit -m "feat(mobile): add new-learner empty states on detail screens [PD-6]"
```

---

### Task 7: Final validation and lint

**Files:** None new — validation only.

- [ ] **Step 1: Run full mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run mobile lint**

Run: `pnpm exec nx lint mobile`
Expected: PASS

- [ ] **Step 3: Run API typecheck and lint**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:lint`
Expected: PASS

- [ ] **Step 4: Run all related tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/progressive-disclosure.ts src/app/\(app\)/progress.tsx src/components/coaching/ParentDashboardSummary.tsx --no-coverage`
Expected: PASS

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/services/dashboard.ts src/routes/dashboard.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Verify no hardcoded threshold values**

Run: `grep -rn "< 4\|>= 4\|=== 4" apps/mobile/src/ --include="*.tsx" --include="*.ts" | grep -i "session\|learner\|disclosure\|threshold"`
Expected: No results — all gating uses `isNewLearner()` or `PROGRESSIVE_DISCLOSURE_THRESHOLD`

- [ ] **Step 6: Final commit (if any lint fixes needed)**

```bash
git add -A
git commit -m "chore(mobile): lint and typecheck fixes [PD-7]"
```
