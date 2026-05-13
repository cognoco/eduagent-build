import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReportsListCard } from './ReportsListCard';
import {
  useProfileReports,
  useProfileWeeklyReports,
} from '../../hooks/use-progress';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../hooks/use-progress' /* gc1-allow: query-hook stub at unit-test boundary */,
  () => ({
    useProfileReports: jest.fn(),
    useProfileWeeklyReports: jest.fn(),
  }),
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'progress.previousReports.title') return 'Previous reports';
      if (key === 'progress.previousReports.viewAll') return 'View all reports';
      if (key === 'parentView.reports.weekOf') return 'Week of';
      return key;
    },
  }),
}));

function mockReports(): void {
  (useProfileWeeklyReports as jest.Mock).mockReturnValue({
    data: [
      {
        id: 'weekly-1',
        reportWeek: '2026-05-04',
        createdAt: '2026-05-11T00:00:00.000Z',
        viewedAt: null,
        headlineStat: {
          value: 2,
          label: 'Sessions',
          comparison: 'steady week',
        },
      },
    ],
    isLoading: false,
    isError: false,
  });
  (useProfileReports as jest.Mock).mockReturnValue({
    data: [
      {
        id: 'monthly-1',
        reportMonth: '2026-05',
        createdAt: '2026-06-01T00:00:00.000Z',
        viewedAt: null,
        headlineStat: {
          value: 8,
          label: 'Sessions',
          comparison: 'active month',
        },
      },
    ],
    isLoading: false,
    isError: false,
  });
}

describe('ReportsListCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReports();
  });

  it('renders weekly and monthly report rows together', () => {
    render(<ReportsListCard profileId="profile-1" />);

    screen.getByText('Previous reports');
    screen.getByText(/Week of/);
    screen.getByText('May 2026');
  });

  it('routes self-view weekly rows to progress weekly-report path', () => {
    render(<ReportsListCard profileId="profile-1" interactive selfView />);

    fireEvent.press(screen.getByTestId('weekly-report-card-weekly-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
      params: { weeklyReportId: 'weekly-1' },
    });
  });

  it('routes self-view monthly rows to progress reports path', () => {
    render(<ReportsListCard profileId="profile-1" interactive selfView />);

    fireEvent.press(screen.getByTestId('report-card-monthly-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/progress/reports/[reportId]',
      params: { reportId: 'monthly-1' },
    });
  });

  it('uses self-view reports link copy and testID', () => {
    render(<ReportsListCard profileId="profile-1" interactive selfView />);

    expect(screen.getByTestId('progress-reports-link')).toHaveTextContent(
      'View all reports',
    );
    expect(screen.queryByTestId('child-reports-link')).toBeNull();
  });
});
