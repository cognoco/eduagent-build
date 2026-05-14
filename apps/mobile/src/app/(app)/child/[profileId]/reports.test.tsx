import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  createTestProfile,
} from '../../../../../test-utils/screen-render-harness';

// ── Route-level mock fns (captured at module scope so assertions can inspect them) ──
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();

const mockFetch = createRoutedMockFetch({
  'dashboard/children/child-1': {
    child: { displayName: 'Emma', profileId: 'child-1' },
  },
  'dashboard/children/child-1/reports': { reports: [] },
  'dashboard/children/child-1/weekly-reports': { reports: [] },
});

jest.mock('../../../../lib/api-client', () => // gc1-allow: transport-boundary — mocks fetch layer only; real hooks + QueryClient run
  require('../../../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

jest.mock('expo-router', () => // gc1-allow: native-boundary — expo-router requires native runtime
  require('../../../../test-utils/native-shims').expoRouterShim(
    {
      push: mockRouterPush,
      replace: mockRouterReplace,
      canGoBack: jest.fn(() => false),
    },
    { profileId: 'child-1' },
  ),
);

jest.mock('react-native-safe-area-context', () => // gc1-allow: native-boundary — safe-area-context requires native runtime
  require('../../../../test-utils/native-shims').safeAreaShim(),
);

const { default: ChildReportsScreen, getNextReportInfo } =
  require('./reports') as {
    default: React.ComponentType;
    getNextReportInfo: (now?: Date) => { date: string; timeContext: string };
  };

const parentProfile = createTestProfile({
  id: 'parent-1',
  displayName: 'Maria',
  isOwner: true,
  birthYear: 1985,
});

function makeWrapper() {
  return createScreenWrapper({
    activeProfile: parentProfile,
    profiles: [parentProfile],
  }).wrapper;
}

describe('ChildReportsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.setRoute('dashboard/children/child-1', {
      child: { displayName: 'Emma', profileId: 'child-1' },
    });
    mockFetch.setRoute('dashboard/children/child-1/reports', { reports: [] });
    mockFetch.setRoute('dashboard/children/child-1/weekly-reports', {
      reports: [],
    });
  });

  describe('empty state', () => {
    it('renders the condensed empty-state body with child name', async () => {
      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() => screen.getByTestId('child-reports-empty'));
      screen.getByTestId('child-reports-empty-time-context');
      expect(screen.queryByText('Your first report is on its way')).toBeNull();
    });

    it('shows action button with child name that navigates to child detail', async () => {
      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() =>
        screen.getByTestId('child-reports-empty-progress'),
      );
      const button = screen.getByTestId('child-reports-empty-progress');
      expect(button).toBeTruthy();
      screen.getByText('parentView.reports.seeProgressNow:{"name":"Emma"}');

      fireEvent.press(button);
      // goBackOrReplace calls router.replace when canGoBack returns false
      expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/child/child-1');
    });

    // [BUG-904] The empty state previously stacked four near-duplicate
    // copies of "first report coming soon". Collapse to one heading + one
    // body line + one CTA. The push-notification claim was removed because
    // it isn't accurate when push notifications are disabled in More.
    it('renders a single condensed empty state — no duplicate copy [BUG-904]', async () => {
      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() => screen.getByTestId('child-reports-empty'));

      // Push-notification claim removed
      expect(
        screen.queryByText(
          "You'll get a push notification when the report is ready.",
        ),
      ).toBeNull();
      // Long "Reports are generated on the 1st…" preamble removed
      expect(
        screen.queryByText(/Reports are generated on the 1st of each month/),
      ).toBeNull();
      // Single body sentence remains — testID survives so other tests can find it
      expect(
        screen.getByTestId('child-reports-empty-time-context'),
      ).toBeTruthy();
    });

    it('shows time context element', async () => {
      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() =>
        expect(
          screen.getByTestId('child-reports-empty-time-context'),
        ).toBeTruthy(),
      );
    });

    it('falls back to "Your child" when child detail is not loaded', async () => {
      mockFetch.setRoute(
        'dashboard/children/child-1',
        new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 }),
      );

      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() => screen.getByTestId('child-reports-empty'));
      screen.getByText(
        'parentView.reports.seeProgressNow:{"name":"parentView.index.yourChild"}',
      );
    });
  });

  describe('loading state', () => {
    it('renders loading text while reports are fetching', async () => {
      // Return a never-resolving promise so the query stays in-flight
      mockFetch.setRoute(
        'dashboard/children/child-1/reports',
        () => new Promise<never>(() => {}),
      );

      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() =>
        screen.getByText('parentView.reports.loadingReports'),
      );
    });
  });

  describe('error state', () => {
    it('renders error card with retry and back buttons', async () => {
      mockFetch.setRoute(
        'dashboard/children/child-1/reports',
        new Response(JSON.stringify({ error: 'Server Error' }), {
          status: 500,
        }),
      );

      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() => screen.getByTestId('child-reports-error'));
      screen.getByText('parentView.reports.couldNotLoadReports');

      // Retry re-triggers both queries
      fireEvent.press(screen.getByTestId('child-reports-error-retry'));

      fireEvent.press(screen.getByTestId('child-reports-error-back'));
      // goBackOrReplace calls router.replace when canGoBack returns false
      expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/child/child-1');
    });

    // [CCR finding, 2026-05-14] Break test for the weekly-only failure case:
    // before the fix, monthly success + weekly failure hid the weekly error
    // entirely (no banner, no retry). Now combinedError = (isError || weeklyError)
    // when there's no data from either source.
    it('renders error card when weekly fails and monthly returns empty', async () => {
      mockFetch.setRoute(
        'dashboard/children/child-1/weekly-reports',
        new Response(JSON.stringify({ error: 'Server Error' }), {
          status: 500,
        }),
      );
      mockFetch.setRoute('dashboard/children/child-1/reports', { reports: [] });

      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() => screen.getByTestId('child-reports-error'));

      // The retry handler kicks off BOTH refetches — both queries are real, so
      // pressing retry triggers real re-fetch attempts through the mock fetch.
      fireEvent.press(screen.getByTestId('child-reports-error-retry'));
    });
  });

  describe('reports list', () => {
    it('renders reports header summary from latest weekly report', async () => {
      mockFetch.setRoute('dashboard/children/child-1/weekly-reports', {
        reports: [
          {
            id: 'wr-1',
            reportWeek: '2026-05-05',
            viewedAt: null,
            createdAt: '2026-05-12T03:00:00Z',
            headlineStat: {
              label: 'Topics mastered',
              value: '4',
              comparison: '+2 vs last week',
            },
            thisWeek: {
              totalSessions: 5,
              totalActiveMinutes: 120,
              topicsMastered: 4,
              topicsExplored: 8,
              vocabularyTotal: 50,
              streakBest: 3,
            },
          },
        ],
      });

      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() => screen.getByTestId('reports-header-summary'));
      expect(screen.getAllByText('Topics mastered: 4').length).toBeGreaterThan(0);
      expect(screen.getAllByText('+2 vs last week').length).toBeGreaterThan(0);
    });

    it('renders report cards when reports exist', async () => {
      mockFetch.setRoute('dashboard/children/child-1/reports', {
        reports: [
          {
            id: 'report-001',
            reportMonth: '2026-03',
            viewedAt: null,
            createdAt: '2026-04-01T10:00:00Z',
            headlineStat: {
              label: 'Sessions',
              value: '12',
              comparison: 'Up from 8 last month',
            },
          },
        ],
      });

      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() => screen.getByTestId('report-card-report-001'));
      screen.getByText('parentView.reports.newBadge');
      screen.getByText('Sessions: 12');
    });

    it('navigates to report detail when pressed', async () => {
      mockFetch.setRoute('dashboard/children/child-1/reports', {
        reports: [
          {
            id: 'report-001',
            reportMonth: '2026-03',
            viewedAt: null,
            createdAt: '2026-04-01T10:00:00Z',
            headlineStat: {
              label: 'Sessions',
              value: '12',
              comparison: 'Up from 8 last month',
            },
          },
        ],
      });

      render(<ChildReportsScreen />, { wrapper: makeWrapper() });
      await waitFor(() => screen.getByTestId('report-card-report-001'));
      fireEvent.press(screen.getByTestId('report-card-report-001'));
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: '/(app)/child/[profileId]/report/[reportId]',
        params: { profileId: 'child-1', reportId: 'report-001' },
      });
    });

    it('does not show empty state when reports exist', async () => {
      mockFetch.setRoute('dashboard/children/child-1/reports', {
        reports: [
          {
            id: 'report-001',
            reportMonth: '2026-03',
            viewedAt: '2026-04-02T12:00:00Z',
            createdAt: '2026-04-01T10:00:00Z',
            headlineStat: {
              label: 'Sessions',
              value: '12',
              comparison: 'Up from 8 last month',
            },
          },
        ],
      });

      render(<ChildReportsScreen />, { wrapper: makeWrapper() });
      await waitFor(() => screen.getByTestId('report-card-report-001'));
      expect(screen.queryByTestId('child-reports-empty')).toBeNull();
    });

    it('does not show "New" badge for viewed reports', async () => {
      mockFetch.setRoute('dashboard/children/child-1/reports', {
        reports: [
          {
            id: 'report-002',
            reportMonth: '2026-02',
            viewedAt: '2026-03-05T14:00:00Z',
            createdAt: '2026-03-01T10:00:00Z',
            headlineStat: {
              label: 'Sessions',
              value: '8',
              comparison: 'First month',
            },
          },
        ],
      });

      render(<ChildReportsScreen />, { wrapper: makeWrapper() });
      await waitFor(() => screen.getByTestId('report-card-report-002'));
      expect(screen.queryByText('parentView.reports.newBadge')).toBeNull();
    });
  });

  describe('back button', () => {
    it('navigates back via goBackOrReplace', async () => {
      render(<ChildReportsScreen />, { wrapper: makeWrapper() });

      await waitFor(() => screen.getByTestId('child-reports-back'));
      fireEvent.press(screen.getByTestId('child-reports-back'));
      // goBackOrReplace calls router.replace when canGoBack returns false
      expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/child/child-1');
    });
  });
});

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
