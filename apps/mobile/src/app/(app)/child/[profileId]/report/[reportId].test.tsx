import { render, screen } from '@testing-library/react-native';

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

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useLocalSearchParams: () => ({
    profileId: 'child-001',
    reportId: 'report-001',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

jest.mock(
  '../../../../../lib/navigation' /* gc1-allow: screen test isolates navigation side effects */,
  () => ({
    FAMILY_HOME_PATH: '/(app)/family',
    goBackOrReplace: jest.fn(),
  }),
);

jest.mock(
  '../../../../../lib/format-api-error' /* gc1-allow: screen test needs deterministic error copy */,
  () => ({
    classifyApiError: (e: unknown) => ({
      message: (e as Error)?.message ?? 'error',
    }),
  }),
);

jest.mock(
  '../../../../../components/common' /* gc1-allow: screen test does not exercise shared fallback UI */,
  () => ({
    ErrorFallback: () => null,
  }),
);

const mockUseChildReportDetail = jest.fn();
const mockMarkViewedMutateAsync = jest.fn();

jest.mock(
  '../../../../../hooks/use-progress' /* gc1-allow: screen test controls progress hook states */,
  () => ({
    useChildReportDetail: (...args: unknown[]) =>
      mockUseChildReportDetail(...args),
    useMarkChildReportViewed: () => ({
      mutateAsync: mockMarkViewedMutateAsync,
    }),
  }),
);

const ChildReportDetailScreen = require('./[reportId]')
  .default as React.ComponentType;

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

function makeReport(practiceSummary?: typeof PRACTICE_SUMMARY) {
  return {
    id: 'report-001',
    profileId: 'parent-001',
    childProfileId: 'child-001',
    reportMonth: '2026-04',
    viewedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    reportData: {
      childName: 'Emma',
      month: 'April 2026',
      thisMonth: {
        totalSessions: 5,
        totalActiveMinutes: 60,
        topicsMastered: 2,
        topicsExplored: 3,
        vocabularyTotal: 12,
        streakBest: 4,
      },
      lastMonth: null,
      headlineStat: {
        label: 'Topics mastered',
        value: 2,
        comparison: 'up from 1 last month',
      },
      highlights: [],
      nextSteps: [],
      subjects: [],
      practiceSummary,
    },
  };
}

describe('ChildReportDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkViewedMutateAsync.mockResolvedValue({});
  });

  it('renders the practice summary card when practice data is present', () => {
    mockUseChildReportDetail.mockReturnValue({
      data: makeReport(PRACTICE_SUMMARY),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildReportDetailScreen />);

    screen.getByTestId('child-report-practice-summary');
  });

  it('hides the practice summary card when practice data is absent', () => {
    mockUseChildReportDetail.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ChildReportDetailScreen />);

    expect(screen.queryByTestId('child-report-practice-summary')).toBeNull();
  });
});
