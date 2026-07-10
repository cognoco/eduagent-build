import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  renderScreen,
  NAMED_PROFILES,
  type RenderScreenResult,
} from '../../../../../test-utils/screen-render';
import {
  createRoutedMockFetch,
  type RoutedMockFetch,
} from '../../../../../test-utils/mock-api-routes';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
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

jest.mock(
  '../../../../../lib/navigation' /* gc1-allow: imports expo-router Router type; goBackOrReplace calls router.back which requires native navigation context */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

jest.mock(
  '../../../../../components/common' /* gc1-allow: barrel exports RN components including Reanimated animations — cannot render in JSDOM */,
  () => ({
    ErrorFallback: () => null,
  }),
);

// prettier-ignore
jest.mock('../../../../../components/nudge/NudgeActionSheet', () => ({ // gc1-allow: screen test verifies sheet invocation without native sheet behavior
  NudgeActionSheet: ({ childName }: { childName: string }) => {
    const { Text } = require('react-native');
    return <Text testID="nudge-action-sheet">Nudge {childName}</Text>;
  },
}));

const ChildWeeklyReportDetailScreen = require('./[weeklyReportId]')
  .default as React.ComponentType;

// Guardian (owner) profile so the real useChildWeeklyReportDetail hook's
// `canAccessFamilyChildData` gate (legacyMode !== 'study' && isOwner) opens and
// the routed GET fires. profileId param is child-001 (see expo-router mock).
const guardianProfile = {
  ...NAMED_PROFILES.guardian,
  id: 'parent-001',
  isOwner: true,
  hasFamilyLinks: true,
};

let mockFetch: RoutedMockFetch;

/**
 * Configure the real-hook endpoints. The detail hook reads
 *   GET /dashboard/children/:profileId/weekly-reports/:reportId → { report }
 * and the best-effort mark-viewed mutation fires
 *   POST /dashboard/children/:profileId/weekly-reports/:reportId/view.
 */
function setReport(report: ReturnType<typeof makeReport>): void {
  mockFetch.setRoute(
    '/dashboard/children/child-001/weekly-reports/wr-001',
    (url: string, init?: RequestInit) => {
      if (url.includes('/view')) return { viewed: true };
      if (init?.method && init.method !== 'GET') return { viewed: true };
      return { report };
    },
  );
}

function renderWeeklyReport(): RenderScreenResult {
  return renderScreen(<ChildWeeklyReportDetailScreen />, {
    profile: guardianProfile,
    profiles: [guardianProfile],
    routedFetch: mockFetch,
  });
}

function makeReport(
  overrides?: Partial<{
    childName: string;
    weekStart: string;
    thisWeek: Partial<{
      totalSessions: number;
      totalActiveMinutes: number;
      topicsMastered: number;
      vocabularyTotal: number;
      topicsExplored: number;
      streakBest: number;
    }>;
    headlineStat: { label: string; value: number; comparison: string };
    practiceSummary: typeof PRACTICE_SUMMARY;
  }>,
) {
  const thisWeek = {
    totalSessions: 3,
    totalActiveMinutes: 25,
    topicsMastered: 2,
    vocabularyTotal: 12,
    topicsExplored: 1,
    streakBest: 4,
    ...overrides?.thisWeek,
  };

  return {
    id: '11111111-1111-4111-8111-111111111111',
    profileId: '990e8400-e29b-41d4-a716-446655440004',
    childProfileId: '550e8400-e29b-41d4-a716-446655440001',
    reportWeek: '2026-04-27',
    viewedAt: null,
    createdAt: '2026-04-27T00:00:00Z',
    reportData: {
      childName: overrides?.childName ?? 'Emma',
      weekStart: overrides?.weekStart ?? '2026-04-27',
      thisWeek,
      lastWeek: null,
      headlineStat: overrides?.headlineStat ?? {
        label: 'Topics mastered',
        value: 2,
        comparison: 'up from 1 last week',
      },
      practiceSummary: overrides?.practiceSummary,
    },
  };
}

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

describe('ChildWeeklyReportDetailScreen', () => {
  let active: RenderScreenResult | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = createRoutedMockFetch();
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
  });

  it('renders headline + metrics for a normal week', async () => {
    setReport(makeReport());

    active = renderWeeklyReport();

    await waitFor(() => {
      screen.getByTestId('child-weekly-report-hero');
    });
    expect(
      screen.getByTestId('child-weekly-report-metric-sessions'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('child-weekly-report-metric-minutes'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('child-weekly-report-metric-topics'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('child-weekly-report-metric-vocabulary'),
    ).toBeTruthy();
  });

  it('renders the practice summary card when practice data is present', async () => {
    setReport(makeReport({ practiceSummary: PRACTICE_SUMMARY }));

    active = renderWeeklyReport();

    await waitFor(() => {
      screen.getByTestId('child-weekly-report-practice-summary');
    });
  });

  it('hides the practice summary card when practice data is absent', async () => {
    setReport(makeReport());

    active = renderWeeklyReport();

    await waitFor(() => {
      screen.getByTestId('child-weekly-report-hero');
    });
    expect(
      screen.queryByTestId('child-weekly-report-practice-summary'),
    ).toBeNull();
  });

  // BUG-903 (c): Heading must show the full date range, not just weekStart.
  it('[BUG-903] header shows the full week date range (start – end)', async () => {
    setReport(makeReport({ weekStart: '2026-04-27' }));

    active = renderWeeklyReport();

    // 7-day window (inclusive): Apr 27 -> May 3, 2026.
    // Locale order/separator/punctuation vary across CI runners, so just
    // assert both endpoints + the year + a dash separator are present.
    await waitFor(() => {
      screen.getByText(/27\s*Apr|Apr\s*27/);
    });
    screen.getByText(/3\s*May|May\s*3/);
    screen.getByText(/2026/);
    screen.getByText(/[–-]/);
  });

  // BUG-903 (b): Every report must have at least one CTA. The "Open child"
  // CTA reroutes a parent who sees zeros so they never hit a dead end.
  it('[BUG-903] always renders at least one CTA', async () => {
    setReport(makeReport());

    active = renderWeeklyReport();

    await waitFor(() => {
      screen.getByTestId('child-weekly-report-ctas');
    });
    screen.getByTestId('child-weekly-report-open-child');
  });

  // BUG-903 (d): Empty week shows friendly empty-state copy AND nudge CTA,
  // not "0 / 0 / 0 / 0" cards alone.
  it('[BUG-903] empty week shows nudge CTA and empty-state copy', async () => {
    setReport(
      makeReport({
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
    );

    active = renderWeeklyReport();

    await waitFor(() => {
      screen.getByTestId('child-weekly-report-empty-note');
    });
    screen.getByText('parentView.weeklyReport.sendNudge:{"name":"Emma"}');
  });

  it('[BUG-903] empty week CTA opens the nudge sheet instead of navigating', async () => {
    setReport(
      makeReport({
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
    );

    active = renderWeeklyReport();
    fireEvent.press(
      await waitFor(() => screen.getByTestId('child-weekly-report-open-child')),
    );

    screen.getByTestId('nudge-action-sheet');
    expect(mockPush).not.toHaveBeenCalled();
  });

  // BUG-903 (b): "Open child" CTA navigates to /(app)/child/[id].
  it('[BUG-903] CTA navigates to the child profile detail', async () => {
    setReport(makeReport());

    active = renderWeeklyReport();

    fireEvent.press(
      await waitFor(() => screen.getByTestId('child-weekly-report-open-child')),
    );

    expect(mockPush).toHaveBeenCalledWith('/(app)/child/child-001');
  });
});
