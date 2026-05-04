import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === 'object') {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    },
  }),
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGoBackOrReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: jest.fn(() => true),
    replace: mockReplace,
    push: mockPush,
  }),
  useLocalSearchParams: () => ({
    profileId: 'child-001',
    weeklyReportId: 'wr-001',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

jest.mock('../../../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

jest.mock('../../../../../lib/format-api-error', () => ({
  classifyApiError: (e: unknown) => ({
    message: (e as Error)?.message ?? 'error',
  }),
}));

jest.mock('../../../../../components/common', () => ({
  ErrorFallback: () => null,
}));

const mockUseChildWeeklyReportDetail = jest.fn();
const mockMarkViewedMutateAsync = jest.fn();

jest.mock('../../../../../hooks/use-progress', () => ({
  useChildWeeklyReportDetail: (...args: unknown[]) =>
    mockUseChildWeeklyReportDetail(...args),
  useMarkWeeklyReportViewed: () => ({
    mutateAsync: mockMarkViewedMutateAsync,
  }),
}));

const ChildWeeklyReportDetailScreen = require('./[weeklyReportId]')
  .default as React.ComponentType;

function makeReport(
  overrides?: Partial<{
    childName: string;
    weekStart: string;
    thisWeek: {
      totalSessions: number;
      totalActiveMinutes: number;
      topicsMastered: number;
      vocabularyTotal: number;
    };
    headlineStat: { label: string; value: number; comparison: string };
  }>
) {
  return {
    id: 'wr-001',
    profileId: 'parent-001',
    childProfileId: 'child-001',
    reportWeek: '2026-04-27',
    viewedAt: null,
    createdAt: '2026-04-27T00:00:00Z',
    reportData: {
      childName: overrides?.childName ?? 'Emma',
      weekStart: overrides?.weekStart ?? '2026-04-27',
      thisWeek: overrides?.thisWeek ?? {
        totalSessions: 3,
        totalActiveMinutes: 25,
        topicsMastered: 2,
        vocabularyTotal: 12,
        topicsExplored: 1,
        streakBest: 4,
      },
      headlineStat: overrides?.headlineStat ?? {
        label: 'Topics mastered',
        value: 2,
        comparison: 'up from 1 last week',
      },
    },
  };
}

describe('ChildWeeklyReportDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkViewedMutateAsync.mockResolvedValue({});
  });

  it('renders headline + metrics for a normal week', () => {
    mockUseChildWeeklyReportDetail.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildWeeklyReportDetailScreen />);

    screen.getByTestId('child-weekly-report-hero');
    expect(
      screen.getByTestId('child-weekly-report-metric-sessions')
    ).toBeTruthy();
    expect(
      screen.getByTestId('child-weekly-report-metric-minutes')
    ).toBeTruthy();
    expect(
      screen.getByTestId('child-weekly-report-metric-topics')
    ).toBeTruthy();
    expect(
      screen.getByTestId('child-weekly-report-metric-vocabulary')
    ).toBeTruthy();
  });

  // BUG-903 (c): Heading must show the full date range, not just weekStart.
  it('[BUG-903] header shows the full week date range (start – end)', () => {
    mockUseChildWeeklyReportDetail.mockReturnValue({
      data: makeReport({ weekStart: '2026-04-27' }),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildWeeklyReportDetailScreen />);

    // 7-day window (inclusive): Apr 27 -> May 3, 2026.
    // Locale order/separator/punctuation vary across CI runners, so just
    // assert both endpoints + the year + a dash separator are present.
    screen.getByText(/27\s*Apr|Apr\s*27/);
    screen.getByText(/3\s*May|May\s*3/);
    screen.getByText(/2026/);
    screen.getByText(/[–-]/);
  });

  // BUG-903 (b): Every report must have at least one CTA. The "Open child"
  // CTA reroutes a parent who sees zeros so they never hit a dead end.
  it('[BUG-903] always renders at least one CTA', () => {
    mockUseChildWeeklyReportDetail.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildWeeklyReportDetailScreen />);

    screen.getByTestId('child-weekly-report-ctas');
    screen.getByTestId('child-weekly-report-open-child');
  });

  // BUG-903 (d): Empty week shows friendly empty-state copy AND nudge CTA,
  // not "0 / 0 / 0 / 0" cards alone.
  it('[BUG-903] empty week shows nudge CTA and empty-state copy', () => {
    mockUseChildWeeklyReportDetail.mockReturnValue({
      data: makeReport({
        thisWeek: {
          totalSessions: 0,
          totalActiveMinutes: 0,
          topicsMastered: 0,
          vocabularyTotal: 0,
        },
        headlineStat: {
          label: 'Topics mastered',
          value: 0,
          comparison: "No activity this week — that's OK. A nudge can help.",
        },
      }),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildWeeklyReportDetailScreen />);

    screen.getByTestId('child-weekly-report-empty-note');
    screen.getByText('parentView.weeklyReport.sendNudge:{"name":"Emma"}');
  });

  // BUG-903 (b): "Open child" CTA navigates to /(app)/child/[id].
  it('[BUG-903] CTA navigates to the child profile detail', () => {
    mockUseChildWeeklyReportDetail.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildWeeklyReportDetailScreen />);

    fireEvent.press(screen.getByTestId('child-weekly-report-open-child'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/child/child-001');
  });
});
