import { fireEvent, render, screen } from '@testing-library/react-native';
import { JOURNAL_HREF } from '../../../../lib/navigation';

const mockGoBackOrReplace = jest.fn();
const mockReplace = jest.fn();
const mockRefetch = jest.fn();
const mockUseProfileReportDetail = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../../lib/navigation', () => {
  const actual = jest.requireActual(
    '../../../../lib/navigation',
  ) as typeof import('../../../../lib/navigation');
  return {
    ...actual,
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  };
});

const mockMarkViewed = {
  mutateAsync: jest.fn().mockResolvedValue({ viewed: true }),
};
jest.mock(
  '../../../../hooks/use-progress' /* gc1-allow: query-hook stub at unit-test boundary; real useProfileReportDetail needs QueryClientProvider + API client */,
  () => ({
    useProfileReportDetail: () => mockUseProfileReportDetail(),
    useMarkProfileReportViewed: () => mockMarkViewed,
  }),
);

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

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

jest.mock('react-i18next', () => ({
  // Screen now transitively imports the auto-initializing @/i18n barrel, which
  // calls i18next.use(initReactI18next); the boundary must export it.
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'common.goBack': 'Go back',
        'common.tryAgain': 'Try again',
        'parentView.report.monthlyReport': 'Monthly report',
        'parentView.report.subtitle':
          "A summary of your child's learning this month",
        'parentView.report.loadingReport': 'Loading report…',
        'parentView.report.backToReports': 'Back to reports',
        'parentView.report.sessions': 'Sessions',
        'parentView.report.timeOnApp': 'Time on app',
        'parentView.report.highlights': 'Highlights',
        'parentView.report.reportGoneTitle': 'Report not found',
        'parentView.report.reportGoneBody':
          'It may have been archived or removed.',
        'errorBoundary.title': 'Something went wrong',
        'errors.generic': 'Please try again.',
      };
      return map[key] ?? key;
    },
  }),
}));

const ProgressMonthlyReportDetail = require('./[reportId]').default;

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
    mockSearchParams = { reportId: 'report-uuid-1' };
  });

  it('shows loading text while the report is loading', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    screen.getByText('Loading report…');
  });

  it('shows ErrorFallback with retry and back actions when the query errors', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network failure'),
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    screen.getByTestId('progress-report-error');
    screen.getByTestId('progress-report-error-retry');
    screen.getByTestId('progress-report-error-back');
  });

  it('pressing the retry button calls refetch', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network failure'),
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    fireEvent.press(screen.getByTestId('progress-report-error-retry'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('pressing the error back button fires goBackOrReplace to the reports list', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network failure'),
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    screen.getByText('Back to reports');
    expect(screen.queryByText('Go back')).toBeNull();
    fireEvent.press(screen.getByTestId('progress-report-error-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/progress/reports',
    );
  });

  it('labels and routes Journal error recovery to the exact Journal caller', () => {
    mockSearchParams = { reportId: 'report-uuid-1', returnTo: 'journal' };
    mockUseProfileReportDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network failure'),
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    const backAction = screen.getByTestId('progress-report-error-back');
    screen.getByText('Go back');
    expect(screen.queryByText('Back to reports')).toBeNull();
    fireEvent.press(backAction);
    expect(mockReplace).toHaveBeenCalledWith(JOURNAL_HREF);
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();
  });

  it('renders the headline stat value, label, and comparison when data loads', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: MONTHLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    expect(screen.getByTestId('progress-report-title')).toHaveTextContent(
      'April 2026',
    );
    screen.getByText('3 topics mastered');
    screen.getByText('up from 1 last month');
  });

  it('renders MetricCard values for sessions and time on app', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: MONTHLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    screen.getByText('Sessions');
    screen.getByText('8');
    screen.getByText('Time on app');
    screen.getByText('2h');
    screen.getByTestId('progress-report-metric-sessions');
    screen.getByTestId('progress-report-metric-minutes');
    screen.getByTestId('progress-report-metric-tests');
    screen.getByTestId('progress-report-metric-test-points');
  });

  it('renders the practice summary card when practice data is present', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: {
        ...MONTHLY_REPORT,
        reportData: {
          ...MONTHLY_REPORT.reportData,
          practiceSummary: PRACTICE_SUMMARY,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    screen.getByTestId('progress-report-practice-summary');
  });

  it('hides the practice summary card when practice data is absent', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: MONTHLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    expect(screen.queryByTestId('progress-report-practice-summary')).toBeNull();
  });

  it('renders highlights when the report includes them', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: MONTHLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    screen.getByText('Highlights');
    screen.getByText('- Solved fraction problems');
    screen.getByText('- Kept a steady rhythm');
  });

  it('shows the reportGone state when data is null and there is no loading or error', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    screen.getByText('Report not found');
    screen.getByText('It may have been archived or removed.');
  });

  it('fires goBackOrReplace to the reports list when the back button is pressed', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: MONTHLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    fireEvent.press(screen.getByTestId('progress-report-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/progress/reports',
    );
  });

  it('returns the exact Journal caller when the report was opened from Journal', () => {
    mockSearchParams = { reportId: 'report-uuid-1', returnTo: 'journal' };
    mockUseProfileReportDetail.mockReturnValue({
      data: MONTHLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    fireEvent.press(screen.getByTestId('progress-report-back'));
    expect(mockReplace).toHaveBeenCalledWith(JOURNAL_HREF);
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();
  });

  it('uses the month from reportData as the screen title when data is loaded', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: MONTHLY_REPORT,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    screen.getByText('April 2026');
  });

  it('falls back to the i18n monthly report label for the title when data is absent', () => {
    mockUseProfileReportDetail.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ProgressMonthlyReportDetail />);

    screen.getByText('Monthly report');
  });
});
