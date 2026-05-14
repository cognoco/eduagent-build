import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  createTestProfile,
} from '../../../../../../test-utils/screen-render-harness';

const mockFetch = createRoutedMockFetch({});

jest.mock('../../../../../lib/api-client', () =>
  require('../../../../../test-utils/mock-api-routes').mockApiClientFactory(
    mockFetch,
  ),
);

jest.mock('expo-router', () => // gc1-allow: native-boundary, no Expo native runtime in Jest
  require('../../../../../test-utils/native-shims').expoRouterShim(
    {},
    { profileId: 'c-1', reportId: 'r-1' },
  ),
);

jest.mock('react-native-safe-area-context', () => // gc1-allow: native-boundary, no safe-area native module in Jest
  require('../../../../../test-utils/native-shims').safeAreaShim(),
);

jest.mock(
  '../../../../../lib/navigation', // gc1-allow: screen test isolates navigation side effects
  () => ({
    FAMILY_HOME_PATH: '/(app)/family',
    goBackOrReplace: jest.fn(),
  }),
);

jest.mock(
  '../../../../../lib/format-api-error', // gc1-allow: screen test needs deterministic error copy
  () => ({
    classifyApiError: (e: unknown) => ({
      message: (e as Error)?.message ?? 'error',
    }),
  }),
);

jest.mock(
  '../../../../../components/common', // gc1-allow: screen test does not exercise shared fallback UI
  () => ({
    ErrorFallback: () => null,
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
    id: 'r-1',
    profileId: 'parent-001',
    childProfileId: 'c-1',
    reportMonth: '2026-04',
    viewedAt: '2026-05-01T00:00:00.000Z',
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
  const owner = createTestProfile({
    id: 'owner-1',
    displayName: 'Maria',
    isOwner: true,
    birthYear: 1990,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the practice summary card when practice data is present', async () => {
    mockFetch.setRoute(
      'dashboard/children/c-1/reports/r-1',
      { report: makeReport(PRACTICE_SUMMARY) },
    );
    mockFetch.setRoute(
      'dashboard/children/c-1/reports/r-1/view',
      { viewed: true },
    );

    const { wrapper } = createScreenWrapper({
      activeProfile: owner,
      profiles: [owner],
    });

    render(<ChildReportDetailScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('child-report-practice-summary');
    });
  });

  it('hides the practice summary card when practice data is absent', async () => {
    mockFetch.setRoute(
      'dashboard/children/c-1/reports/r-1',
      { report: makeReport() },
    );
    mockFetch.setRoute(
      'dashboard/children/c-1/reports/r-1/view',
      { viewed: true },
    );

    const { wrapper } = createScreenWrapper({
      activeProfile: owner,
      profiles: [owner],
    });

    render(<ChildReportDetailScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('child-report-hero');
    });

    expect(screen.queryByTestId('child-report-practice-summary')).toBeNull();
  });
});
