# PARENT-06: Parent Monthly Report Empty State — Tests & Verification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive tests for the already-implemented PARENT-06 empty state feature, covering the pure `getNextReportInfo()` function and all screen states (loading, error, empty, loaded).

**Architecture:** The reports screen (`reports.tsx`) already exports `getNextReportInfo()` as a pure function — tests for it use `jest.useFakeTimers()` with `jest.setSystemTime()`. The screen-level tests mock `expo-router`, `use-dashboard`, `use-progress`, and `react-native-safe-area-context`, following the codebase's established pattern of module-level `jest.fn()` variables with per-test `.mockReturnValue()`.

**Tech Stack:** Jest, @testing-library/react-native, jest fake timers

---

### Task 1: Unit tests for `getNextReportInfo()`

**Files:**
- Create: `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx`

This task tests the exported pure function in isolation — no React rendering needed yet.

- [ ] **Step 1: Create test file with `getNextReportInfo` unit tests**

```tsx
import { getNextReportInfo } from './reports';

describe('getNextReportInfo', () => {
  it('returns "should be ready later today" on the 1st before 10:00 UTC', () => {
    const jan1_8am = new Date(Date.UTC(2026, 0, 1, 8, 0, 0));
    const result = getNextReportInfo(jan1_8am);
    expect(result.date).toBe('');
    expect(result.timeContext).toBe('should be ready later today');
  });

  it('returns next month date on the 1st after 10:00 UTC', () => {
    const jan1_11am = new Date(Date.UTC(2026, 0, 1, 11, 0, 0));
    const result = getNextReportInfo(jan1_11am);
    expect(result.timeContext).toMatch(/arrives in about \d+ days/);
    expect(result.date).toContain('February');
  });

  it('returns "arrives in a few days" when 3 or fewer days remain', () => {
    // Dec 30 — 2 days until Jan 1
    const dec30 = new Date(Date.UTC(2025, 11, 30, 12, 0, 0));
    const result = getNextReportInfo(dec30);
    expect(result.timeContext).toBe('arrives in a few days');
    expect(result.date).toContain('January');
  });

  it('returns "arrives in about N days" when more than 3 days remain', () => {
    // Jan 15 — ~17 days until Feb 1
    const jan15 = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const result = getNextReportInfo(jan15);
    expect(result.timeContext).toMatch(/arrives in about \d+ days/);
    expect(result.date).toContain('February');
  });

  it('handles month boundary correctly for short months', () => {
    // Feb 15 — next report is March 1
    const feb15 = new Date(Date.UTC(2026, 1, 15, 12, 0, 0));
    const result = getNextReportInfo(feb15);
    expect(result.date).toContain('March');
  });

  it('handles year boundary (December → January)', () => {
    const dec15 = new Date(Date.UTC(2025, 11, 15, 12, 0, 0));
    const result = getNextReportInfo(dec15);
    expect(result.date).toContain('January');
    expect(result.date).toContain('2026');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/child/\[profileId\]/reports.tsx --no-coverage`
Expected: 6 passing tests

- [ ] **Step 3: Commit**

Use `/commit` skill.

---

### Task 2: Screen-level tests — loading, error, empty, and loaded states

**Files:**
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx`

This task adds screen-level rendering tests for all four visual states of the reports screen. Follows the codebase pattern: `jest.mock` at module level, `jest.fn()` mock variables, `require()` for the component under test.

- [ ] **Step 1: Add mock setup and screen rendering tests**

Append to the existing test file, below the `getNextReportInfo` describe block:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

// --- Mock setup ---

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockGoBackOrReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
  useLocalSearchParams: () => ({ profileId: 'child-1' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseChildDetail = jest.fn();
jest.mock('../../../../hooks/use-dashboard', () => ({
  useChildDetail: () => mockUseChildDetail(),
}));

const mockUseChildReports = jest.fn();
jest.mock('../../../../hooks/use-progress', () => ({
  useChildReports: () => mockUseChildReports(),
}));

jest.mock('../../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

// Must require after mocks are set up
const ChildReportsScreen =
  require('./reports').default as React.ComponentType;

const mockRefetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseChildDetail.mockReturnValue({
    data: { displayName: 'Emma' },
  });
  mockUseChildReports.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
  });
});

describe('ChildReportsScreen', () => {
  describe('loading state', () => {
    it('shows loading text when reports are loading', () => {
      mockUseChildReports.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: mockRefetch,
      });
      render(<ChildReportsScreen />);
      expect(screen.getByText('Loading reports...')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows error card with retry and back buttons', () => {
      mockUseChildReports.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mockRefetch,
      });
      render(<ChildReportsScreen />);
      expect(screen.getByTestId('child-reports-error')).toBeTruthy();
      expect(
        screen.getByText("We couldn't load the reports")
      ).toBeTruthy();
    });

    it('calls refetch when retry is pressed', () => {
      mockUseChildReports.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mockRefetch,
      });
      render(<ChildReportsScreen />);
      fireEvent.press(screen.getByTestId('child-reports-error-retry'));
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('navigates back when error back button is pressed', () => {
      mockUseChildReports.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mockRefetch,
      });
      render(<ChildReportsScreen />);
      fireEvent.press(screen.getByTestId('child-reports-error-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('renders the empty state card with correct heading', () => {
      render(<ChildReportsScreen />);
      expect(screen.getByTestId('child-reports-empty')).toBeTruthy();
      expect(
        screen.getByText('Your first report is on its way')
      ).toBeTruthy();
    });

    it('shows child name in the progress button', () => {
      render(<ChildReportsScreen />);
      expect(
        screen.getByText("See Emma's progress now")
      ).toBeTruthy();
    });

    it('shows push notification subtext', () => {
      render(<ChildReportsScreen />);
      expect(
        screen.getByText(
          "You'll get a push notification when the report is ready."
        )
      ).toBeTruthy();
    });

    it('shows time context text', () => {
      render(<ChildReportsScreen />);
      expect(
        screen.getByTestId('child-reports-empty-time-context')
      ).toBeTruthy();
    });

    it('navigates to child detail when progress button is pressed', () => {
      render(<ChildReportsScreen />);
      fireEvent.press(
        screen.getByTestId('child-reports-empty-progress')
      );
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/child/child-1'
      );
    });

    it('falls back to "Your child" when child name is unavailable', () => {
      mockUseChildDetail.mockReturnValue({ data: undefined });
      render(<ChildReportsScreen />);
      expect(
        screen.getByText("See Your child's progress now")
      ).toBeTruthy();
    });
  });

  describe('loaded state with reports', () => {
    const mockReports = [
      {
        id: 'r-1',
        reportMonth: '2026-03',
        viewedAt: null,
        createdAt: '2026-04-01T10:00:00Z',
        headlineStat: {
          label: 'Topics mastered',
          value: 12,
          comparison: '+4 from last month',
        },
      },
      {
        id: 'r-2',
        reportMonth: '2026-02',
        viewedAt: '2026-03-05T14:00:00Z',
        createdAt: '2026-03-01T10:00:00Z',
        headlineStat: {
          label: 'Topics mastered',
          value: 8,
          comparison: 'First month',
        },
      },
    ];

    it('renders report cards for each report', () => {
      mockUseChildReports.mockReturnValue({
        data: mockReports,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      });
      render(<ChildReportsScreen />);
      expect(screen.getByTestId('report-card-r-1')).toBeTruthy();
      expect(screen.getByTestId('report-card-r-2')).toBeTruthy();
    });

    it('shows "New" badge for unviewed reports', () => {
      mockUseChildReports.mockReturnValue({
        data: mockReports,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      });
      render(<ChildReportsScreen />);
      expect(screen.getByText('New')).toBeTruthy();
    });

    it('navigates to report detail on press', () => {
      mockUseChildReports.mockReturnValue({
        data: mockReports,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      });
      render(<ChildReportsScreen />);
      fireEvent.press(screen.getByTestId('report-card-r-1'));
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: '/(app)/child/[profileId]/report/[reportId]',
        params: { profileId: 'child-1', reportId: 'r-1' },
      });
    });

    it('does not show the empty state when reports exist', () => {
      mockUseChildReports.mockReturnValue({
        data: mockReports,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      });
      render(<ChildReportsScreen />);
      expect(
        screen.queryByTestId('child-reports-empty')
      ).toBeNull();
    });
  });

  describe('back button', () => {
    it('navigates back via goBackOrReplace', () => {
      render(<ChildReportsScreen />);
      fireEvent.press(screen.getByTestId('child-reports-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run all tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/child/\[profileId\]/reports.tsx --no-coverage`
Expected: All tests pass (6 unit + ~14 screen-level)

- [ ] **Step 3: Commit**

Use `/commit` skill.

---

### Task 3: Verify spec compliance — child detail reports button

**Files:**
- None to modify — verification only

The spec requires the reports button on the child detail screen (`index.tsx`) to always be visible (no `child?.progress` guard) and show count only when reports exist. This is already implemented at `index.tsx:366-390`.

- [ ] **Step 1: Verify no progress guard exists on the reports button**

Run: `cd apps/mobile && grep -n "child?.progress" src/app/\(app\)/child/\[profileId\]/index.tsx`
Expected: The only match (if any) is the progress snapshot card, NOT the reports button. The reports card section (lines ~366-390) should have no guard.

- [ ] **Step 2: Verify conditional count logic**

Run: `cd apps/mobile && grep -A2 "Monthly reports" src/app/\(app\)/child/\[profileId\]/index.tsx`
Expected: Shows `reports && reports.length > 0 ? \` (\${reports.length})\` : ''` — count shown only when reports exist.

- [ ] **Step 3: Run typecheck for touched files**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No type errors
