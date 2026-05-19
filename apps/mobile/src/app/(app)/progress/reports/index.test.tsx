/**
 * Regression tests for PR-6 (reports dedup) plus loading/error/success/nav coverage.
 *
 * Guard: each report screen must call useProfileReports and
 * useProfileWeeklyReports exactly ONCE per render.  Without this guard the
 * duplicate-fetch pattern this PR removes can silently regress.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  useProfileReports,
  useProfileWeeklyReports,
} from '../../../../hooks/use-progress';
import { goBackOrReplace } from '../../../../lib/navigation';

import ProgressReportsScreen from './index';

// ── External-boundary mocks (gc1-allow applies at the module level) ──────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'progress.previousReports.title': 'Previous reports',
        'progress.previousReports.subtitle': 'Monthly and weekly summaries',
        'common.goBack': 'Go back',
        'common.tryAgain': 'Try again',
        'parentView.reports.loadingReports': 'Loading reports…',
        'parentView.reports.checkConnectionRetry':
          'Check your connection and try again.',
      };
      return map[key] ?? key;
    },
  }),
}));

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock(
  '../../../../hooks/use-progress' /* gc1-allow: query-hook stub at unit-test boundary; real hooks need QueryClientProvider + API client */,
  () => ({
    useProfileReports: jest.fn(),
    useProfileWeeklyReports: jest.fn(),
  }),
);

jest.mock(
  '../../../../lib/profile' /* gc1-allow: ProfileProvider uses SecureStore (native) */,
  () => ({
    useProfile: () => ({
      activeProfile: { id: 'test-profile-id' },
    }),
  }),
);

jest.mock(
  '../../../../lib/navigation' /* gc1-allow: expo-router native side effects */,
  () => ({
    goBackOrReplace: jest.fn(),
  }),
);

jest.mock(
  '../../../../components/common' /* gc1-allow: barrel pulls native nativewind/react-native components */,
  () => {
    const RN = jest.requireActual('react-native');
    return {
      ErrorFallback: ({
        message,
        primaryAction,
        secondaryAction,
        testID,
      }: {
        message?: string;
        primaryAction?: { label: string; onPress: () => void; testID?: string };
        secondaryAction?: {
          label: string;
          onPress: () => void;
          testID?: string;
        };
        testID?: string;
      }) => (
        <RN.View testID={testID}>
          {message ? <RN.Text>{message}</RN.Text> : null}
          {primaryAction ? (
            <RN.Pressable
              onPress={primaryAction.onPress}
              testID={primaryAction.testID}
            >
              <RN.Text>{primaryAction.label}</RN.Text>
            </RN.Pressable>
          ) : null}
          {secondaryAction ? (
            <RN.Pressable
              onPress={secondaryAction.onPress}
              testID={secondaryAction.testID}
            >
              <RN.Text>{secondaryAction.label}</RN.Text>
            </RN.Pressable>
          ) : null}
        </RN.View>
      ),
    };
  },
);

// ── Fixtures ─────────────────────────────────────────────────────────────────
// MonthlyReportSummary and WeeklyReportSummary are flat (no reportData wrapper).
// headlineStat is required and must be a non-null object with label+value+comparison.

const MONTHLY_REPORT_SUMMARY = {
  id: '11111111-1111-1111-1111-111111111111',
  reportMonth: '2026-04',
  viewedAt: null,
  createdAt: '2026-04-30T00:00:00.000Z',
  headlineStat: {
    label: 'Topics mastered',
    value: 3,
    comparison: 'up from 1 last month',
  },
  highlights: [],
  nextSteps: [],
};

const WEEKLY_REPORT_SUMMARY = {
  id: '22222222-2222-2222-2222-222222222222',
  reportWeek: '2026-05-04',
  viewedAt: null,
  createdAt: '2026-05-11T00:00:00.000Z',
  headlineStat: {
    label: 'Topics mastered',
    value: 2,
    comparison: '2 new this week',
  },
};

const emptyQueryResult = {
  data: [],
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};

// ── Helper ────────────────────────────────────────────────────────────────────

function mockHooks({
  monthlyData = [] as (typeof MONTHLY_REPORT_SUMMARY)[],
  weeklyData = [] as (typeof WEEKLY_REPORT_SUMMARY)[],
  isLoading = false,
  monthlyIsError = false,
  weeklyIsError = false,
  monthlyRefetch = jest.fn(),
  weeklyRefetch = jest.fn(),
} = {}) {
  (useProfileReports as jest.Mock).mockReturnValue({
    data: isLoading ? undefined : monthlyData,
    isLoading,
    isError: monthlyIsError,
    refetch: monthlyRefetch,
  });

  (useProfileWeeklyReports as jest.Mock).mockReturnValue({
    data: isLoading ? undefined : weeklyData,
    isLoading,
    isError: weeklyIsError,
    refetch: weeklyRefetch,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProgressReportsScreen — fetch-once regression guard (PR-6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useProfileReports as jest.Mock).mockReturnValue(emptyQueryResult);
    (useProfileWeeklyReports as jest.Mock).mockReturnValue(emptyQueryResult);
  });

  it('calls useProfileReports exactly once per render', () => {
    render(<ProgressReportsScreen />);
    expect(useProfileReports).toHaveBeenCalledTimes(1);
  });

  it('calls useProfileWeeklyReports exactly once per render', () => {
    render(<ProgressReportsScreen />);
    expect(useProfileWeeklyReports).toHaveBeenCalledTimes(1);
  });

  it('renders the list correctly with empty data', () => {
    const { getByTestId } = render(<ProgressReportsScreen />);
    getByTestId('progress-reports-list');
  });
});

describe('ProgressReportsScreen — loading state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHooks({ isLoading: true });
  });

  it('shows loading text when either query is loading', () => {
    render(<ProgressReportsScreen />);
    screen.getByText('Loading reports…');
  });

  it('does not show the reports list while loading', () => {
    render(<ProgressReportsScreen />);
    expect(screen.queryByTestId('progress-reports-list')).toBeNull();
  });

  it('shows the page title and subtitle while loading', () => {
    render(<ProgressReportsScreen />);
    screen.getByText('Previous reports');
    screen.getByText('Monthly and weekly summaries');
  });
});

describe('ProgressReportsScreen — error state (no data)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHooks({ monthlyIsError: true, weeklyIsError: true });
  });

  it('shows ErrorFallback with the correct testID', () => {
    render(<ProgressReportsScreen />);
    screen.getByTestId('progress-reports-error');
  });

  it('shows error message', () => {
    render(<ProgressReportsScreen />);
    screen.getByText('Check your connection and try again.');
  });

  it('retry button calls refetch on both queries', () => {
    const monthlyRefetch = jest.fn();
    const weeklyRefetch = jest.fn();
    mockHooks({
      monthlyIsError: true,
      weeklyIsError: true,
      monthlyRefetch,
      weeklyRefetch,
    });
    render(<ProgressReportsScreen />);
    fireEvent.press(screen.getByTestId('progress-reports-retry'));
    expect(monthlyRefetch).toHaveBeenCalled();
    expect(weeklyRefetch).toHaveBeenCalled();
  });

  it('secondary back button fires goBackOrReplace to progress route', () => {
    render(<ProgressReportsScreen />);
    fireEvent.press(screen.getByTestId('progress-reports-back-secondary'));
    expect(goBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/progress',
    );
  });
});

describe('ProgressReportsScreen — error grace (one query has data, one errors)', () => {
  it('shows list when monthly data exists even if weekly errors', () => {
    jest.clearAllMocks();
    mockHooks({
      monthlyData: [MONTHLY_REPORT_SUMMARY],
      weeklyIsError: true,
    });
    render(<ProgressReportsScreen />);
    // hasData = true → should not show error, should show list
    screen.getByTestId('progress-reports-list');
    expect(screen.queryByTestId('progress-reports-error')).toBeNull();
  });

  it('shows list when weekly data exists even if monthly errors', () => {
    jest.clearAllMocks();
    mockHooks({
      weeklyData: [WEEKLY_REPORT_SUMMARY],
      monthlyIsError: true,
    });
    render(<ProgressReportsScreen />);
    screen.getByTestId('progress-reports-list');
    expect(screen.queryByTestId('progress-reports-error')).toBeNull();
  });
});

describe('ProgressReportsScreen — success with data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHooks({
      monthlyData: [MONTHLY_REPORT_SUMMARY],
      weeklyData: [WEEKLY_REPORT_SUMMARY],
    });
  });

  it('shows the reports list container', () => {
    render(<ProgressReportsScreen />);
    screen.getByTestId('progress-reports-list');
  });

  it('does not show loading text when data is present', () => {
    render(<ProgressReportsScreen />);
    expect(screen.queryByText('Loading reports…')).toBeNull();
  });

  it('does not show error fallback when data is present', () => {
    render(<ProgressReportsScreen />);
    expect(screen.queryByTestId('progress-reports-error')).toBeNull();
  });
});

describe('ProgressReportsScreen — back navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHooks();
  });

  it('back button calls goBackOrReplace with progress route', () => {
    render(<ProgressReportsScreen />);
    fireEvent.press(screen.getByTestId('progress-reports-back'));
    expect(goBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/progress',
    );
  });
});
