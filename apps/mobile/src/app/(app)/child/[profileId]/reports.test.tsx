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
const mockGoBackOrReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
    replace: mockReplace,
    push: mockPush,
  }),
  useLocalSearchParams: () => ({ profileId: 'child-001' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseChildDetail = jest.fn();
jest.mock('../../../../hooks/use-dashboard', () => ({
  useChildDetail: (...args: unknown[]) => mockUseChildDetail(...args),
}));

const mockUseChildReports = jest.fn();
const mockUseChildWeeklyReports = jest.fn();
jest.mock('../../../../hooks/use-progress', () => ({
  useChildReports: (...args: unknown[]) => mockUseChildReports(...args),
  useChildWeeklyReports: (...args: unknown[]) =>
    mockUseChildWeeklyReports(...args),
}));

jest.mock('../../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

const { default: ChildReportsScreen, getNextReportInfo } =
  require('./reports') as {
    default: React.ComponentType;
    getNextReportInfo: (now?: Date) => { date: string; timeContext: string };
  };

describe('ChildReportsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChildDetail.mockReturnValue({
      data: { displayName: 'Emma', profileId: 'child-001' },
    });
    mockUseChildWeeklyReports.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  describe('empty state', () => {
    beforeEach(() => {
      mockUseChildReports.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
    });

    it('renders the condensed empty-state body with child name', () => {
      render(<ChildReportsScreen />);

      screen.getByTestId('child-reports-empty');
      screen.getByTestId('child-reports-empty-time-context');
      expect(screen.queryByText('Your first report is on its way')).toBeNull();
    });

    it('shows action button with child name that navigates to child detail', () => {
      render(<ChildReportsScreen />);

      const button = screen.getByTestId('child-reports-empty-progress');
      expect(button).toBeTruthy();
      screen.getByText('parentView.reports.seeProgressNow:{"name":"Emma"}');

      fireEvent.press(button);
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/child/child-001',
      );
    });

    // [BUG-904] The empty state previously stacked four near-duplicate
    // copies of "first report coming soon". Collapse to one heading + one
    // body line + one CTA. The push-notification claim was removed because
    // it isn't accurate when push notifications are disabled in More.
    it('renders a single condensed empty state — no duplicate copy [BUG-904]', () => {
      render(<ChildReportsScreen />);

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

    it('shows time context element', () => {
      render(<ChildReportsScreen />);

      expect(
        screen.getByTestId('child-reports-empty-time-context'),
      ).toBeTruthy();
    });

    it('falls back to "Your child" when child detail is not loaded', () => {
      mockUseChildDetail.mockReturnValue({ data: null });

      render(<ChildReportsScreen />);

      screen.getByText(
        'parentView.reports.seeProgressNow:{"name":"parentView.index.yourChild"}',
      );
    });
  });

  describe('loading state', () => {
    it('renders loading text', () => {
      mockUseChildReports.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: jest.fn(),
      });

      render(<ChildReportsScreen />);

      screen.getByText('parentView.reports.loadingReports');
    });
  });

  describe('error state', () => {
    it('renders error card with retry and back buttons', () => {
      const refetch = jest.fn();
      mockUseChildReports.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch,
      });

      render(<ChildReportsScreen />);

      screen.getByTestId('child-reports-error');
      screen.getByText('parentView.reports.couldNotLoadReports');

      fireEvent.press(screen.getByTestId('child-reports-error-retry'));
      expect(refetch).toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('child-reports-error-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/child/child-001',
      );
    });
  });

  describe('reports list', () => {
    it('renders reports header summary from latest weekly report', () => {
      mockUseChildWeeklyReports.mockReturnValue({
        data: [
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
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      mockUseChildReports.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<ChildReportsScreen />);

      screen.getByTestId('reports-header-summary');
      expect(screen.getAllByText('Topics mastered: 4').length).toBeGreaterThan(
        0,
      );
      expect(screen.getAllByText('+2 vs last week').length).toBeGreaterThan(0);
    });

    it('renders report cards when reports exist', () => {
      mockUseChildReports.mockReturnValue({
        data: [
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
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<ChildReportsScreen />);

      screen.getByTestId('report-card-report-001');
      screen.getByText('parentView.reports.newBadge');
      screen.getByText('Sessions: 12');
    });

    it('navigates to report detail when pressed', () => {
      mockUseChildReports.mockReturnValue({
        data: [
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
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<ChildReportsScreen />);
      fireEvent.press(screen.getByTestId('report-card-report-001'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/child/[profileId]/report/[reportId]',
        params: { profileId: 'child-001', reportId: 'report-001' },
      });
    });

    it('does not show empty state when reports exist', () => {
      mockUseChildReports.mockReturnValue({
        data: [
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
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<ChildReportsScreen />);
      expect(screen.queryByTestId('child-reports-empty')).toBeNull();
    });

    it('does not show "New" badge for viewed reports', () => {
      mockUseChildReports.mockReturnValue({
        data: [
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
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<ChildReportsScreen />);
      screen.getByTestId('report-card-report-002');
      expect(screen.queryByText('parentView.reports.newBadge')).toBeNull();
    });
  });

  describe('back button', () => {
    it('navigates back via goBackOrReplace', () => {
      mockUseChildReports.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<ChildReportsScreen />);
      fireEvent.press(screen.getByTestId('child-reports-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/child/child-001',
      );
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
