import { render, screen, fireEvent } from '@testing-library/react-native';

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
jest.mock('../../../../hooks/use-progress', () => ({
  useChildReports: (...args: unknown[]) => mockUseChildReports(...args),
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

    it('renders the spec heading and body with child name', () => {
      render(<ChildReportsScreen />);

      expect(screen.getByText('Your first report is on its way')).toBeTruthy();
      expect(screen.getByTestId('child-reports-empty')).toBeTruthy();
      // Body includes child name
      expect(screen.getByText(/Emma's first report/)).toBeTruthy();
    });

    it('shows action button with child name that navigates to child detail', () => {
      render(<ChildReportsScreen />);

      const button = screen.getByTestId('child-reports-empty-progress');
      expect(button).toBeTruthy();
      expect(screen.getByText("See Emma's progress now")).toBeTruthy();

      fireEvent.press(button);
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/child/child-001'
      );
    });

    it('shows push notification subtext', () => {
      render(<ChildReportsScreen />);

      expect(
        screen.getByText(
          "You'll get a push notification when the report is ready."
        )
      ).toBeTruthy();
    });

    it('shows time context element', () => {
      render(<ChildReportsScreen />);

      expect(
        screen.getByTestId('child-reports-empty-time-context')
      ).toBeTruthy();
    });

    it('falls back to "Your child" when child detail is not loaded', () => {
      mockUseChildDetail.mockReturnValue({ data: null });

      render(<ChildReportsScreen />);

      expect(screen.getByText("See Your child's progress now")).toBeTruthy();
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

      expect(screen.getByText('Loading reports...')).toBeTruthy();
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

      expect(screen.getByTestId('child-reports-error')).toBeTruthy();
      expect(screen.getByText("We couldn't load the reports")).toBeTruthy();

      fireEvent.press(screen.getByTestId('child-reports-error-retry'));
      expect(refetch).toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('child-reports-error-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/child/child-001'
      );
    });
  });

  describe('reports list', () => {
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

      expect(screen.getByTestId('report-card-report-001')).toBeTruthy();
      expect(screen.getByText('New')).toBeTruthy();
      expect(screen.getByText('Sessions: 12')).toBeTruthy();
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
      expect(screen.getByTestId('report-card-report-002')).toBeTruthy();
      expect(screen.queryByText('New')).toBeNull();
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
        '/(app)/child/child-001'
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
