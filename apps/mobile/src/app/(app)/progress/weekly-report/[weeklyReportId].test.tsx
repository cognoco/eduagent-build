import { fireEvent, render, screen } from '@testing-library/react-native';

const mockGoBackOrReplace = jest.fn();
const mockRefetch = jest.fn();
const mockUseProfileWeeklyReportDetail = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({}),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  '../../../../lib/navigation' /* gc1-allow: navigation stub captures goBackOrReplace calls; real impl requires expo-router Router which is also mocked at this boundary */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

const mockMarkViewed = {
  mutateAsync: jest.fn().mockResolvedValue({ viewed: true }),
};
jest.mock(
  '../../../../hooks/use-progress' /* gc1-allow: query-hook stub at unit-test boundary; real useProfileWeeklyReportDetail needs QueryClientProvider + API client */,
  () => ({
    useProfileWeeklyReportDetail: () => mockUseProfileWeeklyReportDetail(),
    useMarkProfileWeeklyReportViewed: () => mockMarkViewed,
  }),
);

jest.mock(
  '../../../../lib/format-api-error' /* gc1-allow: classifyApiError is error-classification boundary; unit test stubs classified output, not implementation detail */,
  () => ({
    classifyApiError: () => ({
      message: 'Something went wrong',
      category: 'unknown',
      recovery: 'retry',
    }),
  }),
);

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'common.goBack': 'Go back',
        'common.tryAgain': 'Try again',
        'parentView.weeklyReport.weeklyReport': 'Weekly report',
        'parentView.weeklyReport.subtitle':
          "A snapshot of this week's learning.",
        'parentView.weeklyReport.loadingReport': 'Loading report...',
        'parentView.weeklyReport.backToReports': 'Back to reports',
        'parentView.weeklyReport.sessionsThisWeek': 'Sessions this week',
        'parentView.weeklyReport.timeOnApp': 'Time on app',
        'parentView.weeklyReport.reportGoneTitle':
          'This report is no longer available',
        'parentView.weeklyReport.reportGoneBody':
          'It may have been archived or removed. All your other reports are still safe.',
        'errorBoundary.title': 'Something went wrong',
        'errors.generic': 'Please try again.',
      };
      return map[key] ?? key;
    },
  }),
}));

const ProgressWeeklyReportDetail = require('./[weeklyReportId]').default;

const WEEKLY_REPORT = {
  id: 'weekly-uuid-1',
  profileId: 'profile-uuid-1',
  childProfileId: 'child-uuid-1',
  reportWeek: '2026-05-04',
  reportData: {
    childName: 'Alex',
    weekStart: '2026-05-04',
    thisWeek: {
      totalSessions: 5,
      totalActiveMinutes: 75,
      topicsMastered: 2,
      topicsExplored: 4,
      vocabularyTotal: 30,
      streakBest: 6,
    },
    lastWeek: null,
    headlineStat: {
      value: 2,
      label: 'Topics mastered',
      comparison: '2 new this week',
    },
  },
  viewedAt: null,
  createdAt: '2026-05-11T00:00:00.000Z',
};

const PRACTICE_SUMMARY = {
  quizzesCompleted: 2,
  reviewsCompleted: 1,
  totals: {
    activitiesCompleted: 3,
    reviewsCompleted: 1,
    pointsEarned: 20,
    celebrations: 1,
    distinctActivityTypes: 2,
  },
  scores: {
    scoredActivities: 0,
    score: 0,
    total: 0,
    accuracy: null,
  },
  byType: [],
  bySubject: [],
};

describe('ProgressWeeklyReportDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { weeklyReportId: 'weekly-uuid-1' };
  });

  it('shows loading text while the report is loading', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    screen.getByText('Loading report...');
  });

  it('shows ErrorFallback with retry and back actions when the query errors', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network failure'),
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    screen.getByTestId('progress-weekly-report-error');
    screen.getByTestId('progress-weekly-report-error-retry');
    screen.getByTestId('progress-weekly-report-error-back');
  });

  it('pressing the retry button calls refetch', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network failure'),
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    fireEvent.press(screen.getByTestId('progress-weekly-report-error-retry'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('pressing the error back button fires goBackOrReplace to the reports list', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network failure'),
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    fireEvent.press(screen.getByTestId('progress-weekly-report-error-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/progress/reports',
    );
  });

  it('renders the headline stat value, label, and comparison when data loads', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: WEEKLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    screen.getByText('2 topics mastered');
    screen.getByText('2 new this week');
  });

  it('renders MetricCard values for sessions this week and time on app', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: WEEKLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    screen.getByText('Sessions this week');
    screen.getByText('5');
    screen.getByText('Time on app');
    screen.getByText('1h 15m');
    screen.getByTestId('progress-weekly-report-metric-sessions');
    screen.getByTestId('progress-weekly-report-metric-minutes');
    screen.getByTestId('progress-weekly-report-metric-tests');
    screen.getByTestId('progress-weekly-report-metric-test-points');
  });

  it('renders the practice summary card when practice data is present', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: {
        ...WEEKLY_REPORT,
        reportData: {
          ...WEEKLY_REPORT.reportData,
          practiceSummary: PRACTICE_SUMMARY,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    screen.getByTestId('progress-weekly-report-practice-summary');
  });

  it('hides the practice summary card when practice data is absent', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: WEEKLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    expect(
      screen.queryByTestId('progress-weekly-report-practice-summary'),
    ).toBeNull();
  });

  it('shows the reportGone state when data is null and there is no loading or error', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    screen.getByText('This report is no longer available');
    screen.getByText(
      'It may have been archived or removed. All your other reports are still safe.',
    );
  });

  it('fires goBackOrReplace to the reports list when the back button is pressed', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: WEEKLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    fireEvent.press(screen.getByTestId('progress-weekly-report-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/progress/reports',
    );
  });

  it('formats the week date range as the screen title when data is loaded', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: WEEKLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    // formatWeeklyReportRange('2026-05-04') produces a locale-dependent string
    // that covers Mon 4 May → Sun 10 May 2026. The string always contains the
    // year and the "-" separator regardless of locale short-date order.
    screen.getByText(/2026/);
  });

  it('falls back to the i18n weekly report label for the title when data is absent', () => {
    mockUseProfileWeeklyReportDetail.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressWeeklyReportDetail />);

    screen.getByText('Weekly report');
  });
});
