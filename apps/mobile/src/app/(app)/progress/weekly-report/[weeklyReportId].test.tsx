import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  cleanupScreen,
  errorResponses,
} from '../../../../../test-utils/screen-render-harness';
import {
  expoRouterShim,
  safeAreaShim,
} from '../../../../test-utils/native-shims';

const mockFetch = createRoutedMockFetch();

jest.mock('../../../../lib/api-client', () => // gc1-allow: transport-boundary — api-client is the fetch boundary; routedMockFetch replaces per-hook mocks
  require('../../../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

let routerMock: ReturnType<typeof expoRouterShim>;
jest.mock('expo-router', () => routerMock); // gc1-allow: native-boundary — Expo Router requires native bindings unavailable in Jest

jest.mock('react-native-safe-area-context', () => safeAreaShim()); // gc1-allow: native-boundary — safe-area context requires native bindings unavailable in Jest

jest.mock('react-i18next', () => ({ // gc1-allow: external-boundary — i18next initialisation requires the full i18n provider chain unavailable in Jest
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

const WEEKLY_REPORT_RESPONSE = {
  report: {
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
  },
};

const WEEKLY_REPORT_WITH_PRACTICE = {
  report: {
    ...WEEKLY_REPORT_RESPONSE.report,
    reportData: {
      ...WEEKLY_REPORT_RESPONSE.report.reportData,
      practiceSummary: {
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
      },
    },
  },
};

describe('ProgressWeeklyReportDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routerMock = expoRouterShim({}, { weeklyReportId: 'w-1' });
    mockFetch.setRoute('/progress/weekly-reports/w-1', WEEKLY_REPORT_RESPONSE);
  });

  it('shows loading text while the report is loading', () => {
    // Suspend the fetch so React Query stays in loading state
    mockFetch.setRoute('/progress/weekly-reports/w-1', () => new Promise(() => {}));
    const { wrapper } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    screen.getByText('Loading report...');
  });

  it('shows ErrorFallback with retry and back actions when the query errors', async () => {
    mockFetch.setRoute('/progress/weekly-reports/w-1', errorResponses.serverError());
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('progress-weekly-report-error');
    });
    screen.getByTestId('progress-weekly-report-error-retry');
    screen.getByTestId('progress-weekly-report-error-back');
    cleanupScreen(queryClient);
  });

  it('pressing the retry button triggers a refetch', async () => {
    mockFetch.setRoute('/progress/weekly-reports/w-1', errorResponses.serverError());
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => screen.getByTestId('progress-weekly-report-error-retry'));

    const callsBefore = mockFetch.mock.calls.length;
    fireEvent.press(screen.getByTestId('progress-weekly-report-error-retry'));

    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    cleanupScreen(queryClient);
  });

  it('pressing the error back button calls router.replace to the reports list', async () => {
    mockFetch.setRoute('/progress/weekly-reports/w-1', errorResponses.serverError());
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => screen.getByTestId('progress-weekly-report-error-back'));
    fireEvent.press(screen.getByTestId('progress-weekly-report-error-back'));

    // expoRouterShim sets canGoBack() → false by default, so goBackOrReplace calls replace
    expect(routerMock.useRouter().replace).toHaveBeenCalledWith(
      '/(app)/progress/reports',
    );
    cleanupScreen(queryClient);
  });

  it('renders the headline stat value, label, and comparison when data loads', async () => {
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => {
      screen.getByText('2 topics mastered');
    });
    screen.getByText('2 new this week');
    cleanupScreen(queryClient);
  });

  it('renders MetricCard values for sessions this week and time on app', async () => {
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => {
      screen.getByText('Sessions this week');
    });
    screen.getByText('5');
    screen.getByText('Time on app');
    screen.getByText('1h 15m');
    screen.getByTestId('progress-weekly-report-metric-sessions');
    screen.getByTestId('progress-weekly-report-metric-minutes');
    screen.getByTestId('progress-weekly-report-metric-tests');
    screen.getByTestId('progress-weekly-report-metric-test-points');
    cleanupScreen(queryClient);
  });

  it('renders the practice summary card when practice data is present', async () => {
    mockFetch.setRoute('/progress/weekly-reports/w-1', WEEKLY_REPORT_WITH_PRACTICE);
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('progress-weekly-report-practice-summary');
    });
    cleanupScreen(queryClient);
  });

  it('hides the practice summary card when practice data is absent', async () => {
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => {
      screen.getByText('Sessions this week');
    });
    expect(
      screen.queryByTestId('progress-weekly-report-practice-summary'),
    ).toBeNull();
    cleanupScreen(queryClient);
  });

  it('shows the reportGone state when the API returns null for the report', async () => {
    mockFetch.setRoute('/progress/weekly-reports/w-1', { report: null });
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => {
      screen.getByText('This report is no longer available');
    });
    screen.getByText(
      'It may have been archived or removed. All your other reports are still safe.',
    );
    cleanupScreen(queryClient);
  });

  it('fires router.replace to the reports list when the back button is pressed', async () => {
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => screen.getByTestId('progress-weekly-report-back'));
    fireEvent.press(screen.getByTestId('progress-weekly-report-back'));

    // expoRouterShim sets canGoBack() → false by default, so goBackOrReplace calls replace
    expect(routerMock.useRouter().replace).toHaveBeenCalledWith(
      '/(app)/progress/reports',
    );
    cleanupScreen(queryClient);
  });

  it('formats the week date range as the screen title when data is loaded', async () => {
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => {
      screen.getByText(/2026/);
    });
    cleanupScreen(queryClient);
  });

  it('falls back to the i18n weekly report label for the title when data is null', async () => {
    mockFetch.setRoute('/progress/weekly-reports/w-1', { report: null });
    const { wrapper, queryClient } = createScreenWrapper();

    render(<ProgressWeeklyReportDetail />, { wrapper });

    await waitFor(() => {
      screen.getByText('Weekly report');
    });
    cleanupScreen(queryClient);
  });
});
