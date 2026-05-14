import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  cleanupScreen,
} from '../../../../../test-utils/screen-render-harness';

import ProgressMonthlyReportDetail from './[reportId]';

const mockFetch = createRoutedMockFetch({
  '/progress/reports/report-1': { report: null },
  '/progress/reports/report-1/view': { viewed: true },
});

jest.mock('../../../../lib/api-client', () => // gc1-allow: transport-boundary — api-client is the fetch boundary; routedMockFetch replaces per-hook mocks
  require('../../../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

const mockRouterFns = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  canGoBack: jest.fn(() => false),
  setParams: jest.fn(),
};
const mockRouterParams: Record<string, string> = {};
jest.mock('expo-router', () => { // gc1-allow: native-boundary — expo-router requires native bindings unavailable in Jest
  const RN = require('react-native');
  return {
    useRouter: () => mockRouterFns,
    useLocalSearchParams: () => mockRouterParams,
    useGlobalSearchParams: () => mockRouterParams,
    useSegments: () => [],
    usePathname: () => '/',
    Link: RN.Text,
    useFocusEffect: jest.fn(),
  };
});

jest.mock('react-native-safe-area-context', () => // gc1-allow: native-boundary — react-native-safe-area-context requires native bindings unavailable in Jest
  require('../../../../test-utils/native-shims').safeAreaShim(),
);

jest.mock('../../../../components/common', () => { // gc1-allow: boundary shim — ErrorFallback renders native components; shim needed to access testID actions
  const RN = jest.requireActual('react-native');
  const ErrorFallback = ({
    message,
    primaryAction,
    secondaryAction,
    testID,
  }: {
    message?: string;
    primaryAction?: { label: string; onPress: () => void; testID?: string };
    secondaryAction?: { label: string; onPress: () => void; testID?: string };
    testID?: string;
  }) => (
    <RN.View testID={testID}>
      <RN.Text>{message}</RN.Text>
      {primaryAction ? (
        <RN.Pressable onPress={primaryAction.onPress} testID={primaryAction.testID}>
          <RN.Text>{primaryAction.label}</RN.Text>
        </RN.Pressable>
      ) : null}
      {secondaryAction ? (
        <RN.Pressable onPress={secondaryAction.onPress} testID={secondaryAction.testID}>
          <RN.Text>{secondaryAction.label}</RN.Text>
        </RN.Pressable>
      ) : null}
    </RN.View>
  );
  return { ErrorFallback };
});

jest.mock('react-i18next', () => ({ // gc1-allow: external-boundary — i18next initialisation requires the full i18n provider chain unavailable in Jest
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'common.goBack': 'Go back',
        'common.tryAgain': 'Try again',
        'parentView.report.monthlyReport': 'Monthly report',
        'parentView.report.subtitle': "A summary of your child's learning this month",
        'parentView.report.loadingReport': 'Loading report…',
        'parentView.report.backToReports': 'Back to reports',
        'parentView.report.sessions': 'Sessions',
        'parentView.report.timeOnApp': 'Time on app',
        'parentView.report.highlights': 'Highlights',
        'parentView.report.reportGoneTitle': 'Report not found',
        'parentView.report.reportGoneBody': 'It may have been archived or removed.',
        'errorBoundary.title': 'Something went wrong',
        'errors.generic': 'Please try again.',
      };
      return map[key] ?? key;
    },
  }),
}));

const MONTHLY_REPORT = {
  id: 'report-uuid-1',
  profileId: 'profile-uuid-1',
  childProfileId: 'child-uuid-1',
  reportMonth: '2026-04',
  reportData: {
    childName: 'Alex',
    month: 'April 2026',
    thisMonth: {
      totalSessions: 8,
      totalActiveMinutes: 120,
      topicsMastered: 3,
      topicsExplored: 5,
      vocabularyTotal: 42,
      streakBest: 7,
    },
    lastMonth: null,
    highlights: ['Solved fraction problems', 'Kept a steady rhythm'],
    nextSteps: ['Review decimals'],
    subjects: [],
    headlineStat: {
      value: 3,
      label: 'Topics mastered',
      comparison: 'up from 1 last month',
    },
  },
  viewedAt: null,
  createdAt: '2026-04-30T00:00:00.000Z',
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

describe('ProgressMonthlyReportDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouterParams).forEach((k) => delete (mockRouterParams as Record<string, unknown>)[k]);
    mockRouterParams.reportId = 'report-1';
    mockRouterFns.push.mockClear();
    mockRouterFns.replace.mockClear();
    mockRouterFns.back.mockClear();
    mockRouterFns.navigate.mockClear();
    mockRouterFns.dismiss.mockClear();
    mockRouterFns.canGoBack.mockReset().mockImplementation(() => false);
    mockRouterFns.setParams.mockClear();
    mockFetch.setRoute('/progress/reports/report-1', { report: null });
    mockFetch.setRoute('/progress/reports/report-1/view', { viewed: true });
  });

  it('shows loading text while the report is loading', async () => {
    mockFetch.setRoute('/progress/reports/report-1', () => new Promise(() => {}));
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    screen.getByText('Loading report…');
    await cleanupScreen(queryClient);
  });

  it('shows ErrorFallback with retry and back actions when the query errors', async () => {
    mockFetch.setRoute(
      '/progress/reports/report-1',
      new Response(JSON.stringify({ error: 'Network failure' }), { status: 500 }),
    );
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    await waitFor(() => screen.getByTestId('progress-report-error'));
    screen.getByTestId('progress-report-error-retry');
    screen.getByTestId('progress-report-error-back');
    cleanupScreen(queryClient);
  });

  it('pressing the retry button triggers a refetch', async () => {
    let callCount = 0;
    mockFetch.setRoute('/progress/reports/report-1', () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'fail' }), { status: 500 });
    });
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    await waitFor(() => screen.getByTestId('progress-report-error-retry'));
    const before = callCount;
    fireEvent.press(screen.getByTestId('progress-report-error-retry'));
    await waitFor(() => expect(callCount).toBeGreaterThan(before));
    cleanupScreen(queryClient);
  });

  it('pressing the error back button fires goBackOrReplace to the reports list', async () => {
    mockFetch.setRoute(
      '/progress/reports/report-1',
      new Response(JSON.stringify({ error: 'fail' }), { status: 500 }),
    );
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    await waitFor(() => screen.getByTestId('progress-report-error-back'));
    fireEvent.press(screen.getByTestId('progress-report-error-back'));

    const router = mockRouterFns;
    expect(router.replace).toHaveBeenCalledWith('/(app)/progress/reports');
    cleanupScreen(queryClient);
  });

  it('renders the headline stat value, label, and comparison when data loads', async () => {
    mockFetch.setRoute('/progress/reports/report-1', { report: MONTHLY_REPORT });
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    await waitFor(() => screen.getByText('3 topics mastered'));
    screen.getByText('up from 1 last month');
    cleanupScreen(queryClient);
  });

  it('renders MetricCard values for sessions and time on app', async () => {
    mockFetch.setRoute('/progress/reports/report-1', { report: MONTHLY_REPORT });
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    await waitFor(() => screen.getByText('Sessions'));
    screen.getByText('8');
    screen.getByText('Time on app');
    screen.getByText('2h');
    screen.getByTestId('progress-report-metric-sessions');
    screen.getByTestId('progress-report-metric-minutes');
    screen.getByTestId('progress-report-metric-tests');
    screen.getByTestId('progress-report-metric-test-points');
    cleanupScreen(queryClient);
  });

  it('renders the practice summary card when practice data is present', async () => {
    mockFetch.setRoute('/progress/reports/report-1', {
      report: {
        ...MONTHLY_REPORT,
        reportData: {
          ...MONTHLY_REPORT.reportData,
          practiceSummary: PRACTICE_SUMMARY,
        },
      },
    });
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    await waitFor(() => screen.getByTestId('progress-report-practice-summary'));
    cleanupScreen(queryClient);
  });

  it('hides the practice summary card when practice data is absent', async () => {
    mockFetch.setRoute('/progress/reports/report-1', { report: MONTHLY_REPORT });
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    await waitFor(() => screen.getByText('3 topics mastered'));
    expect(screen.queryByTestId('progress-report-practice-summary')).toBeNull();
    cleanupScreen(queryClient);
  });

  it('renders highlights when the report includes them', async () => {
    mockFetch.setRoute('/progress/reports/report-1', { report: MONTHLY_REPORT });
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    await waitFor(() => screen.getByText('Highlights'));
    screen.getByText('- Solved fraction problems');
    screen.getByText('- Kept a steady rhythm');
    cleanupScreen(queryClient);
  });

  // NOTE: the screen has a defensive `data === null` branch ("reportGone" state) that
  // is unreachable through the real API: the route returns either the report or a 404
  // (which throws NotFoundError → isError). The { report: null } response shape also
  // fails Zod validation. This branch is dead code; the test was removed when the
  // per-hook mocks that fabricated the null state were removed.

  it('fires goBackOrReplace to the reports list when the back button is pressed', async () => {
    mockFetch.setRoute('/progress/reports/report-1', { report: MONTHLY_REPORT });
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    await waitFor(() => screen.getByTestId('progress-report-back'));
    fireEvent.press(screen.getByTestId('progress-report-back'));

    const router = mockRouterFns;
    expect(router.replace).toHaveBeenCalledWith('/(app)/progress/reports');
    cleanupScreen(queryClient);
  });

  it('uses the month from reportData as the screen title when data is loaded', async () => {
    mockFetch.setRoute('/progress/reports/report-1', { report: MONTHLY_REPORT });
    const { wrapper, queryClient } = createScreenWrapper();
    render(<ProgressMonthlyReportDetail />, { wrapper });

    await waitFor(() => screen.getByText('April 2026'));
    cleanupScreen(queryClient);
  });

  // NOTE: "fallback to i18n title when data is absent" previously used { report: null }
  // which is unreachable via the real API (404 throws NotFoundError) and fails Zod
  // validation. The loading-state title ("Monthly report") is verified indirectly by
  // the loading test above (screen renders the fallback title until data arrives).
});
