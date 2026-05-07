import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReportsListCard } from './ReportsListCard';

const mockPush = jest.fn();
const mockUseProfileReports = jest.fn();
const mockUseProfileWeeklyReports = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

jest.mock('../../hooks/use-progress', () => ({
  useProfileReports: (...args: unknown[]) => mockUseProfileReports(...args),
  useProfileWeeklyReports: (...args: unknown[]) =>
    mockUseProfileWeeklyReports(...args),
}));

function expectParentPush(profileId = 'child-1'): void {
  expect(mockPush).toHaveBeenNthCalledWith(1, {
    pathname: '/(app)/child/[profileId]',
    params: { profileId },
  });
}

describe('ReportsListCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProfileReports.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseProfileWeeklyReports.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('pushes the child parent route before the reports index', () => {
    render(<ReportsListCard profileId="child-1" interactive />);

    fireEvent.press(screen.getByTestId('child-reports-link'));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expectParentPush();
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/child/[profileId]/reports',
      params: { profileId: 'child-1' },
    });
  });

  it('pushes the child parent route before weekly report details', () => {
    mockUseProfileWeeklyReports.mockReturnValue({
      data: [
        {
          id: 'weekly-1',
          reportWeek: '2026-05-04',
          headlineStat: {
            label: 'Sessions',
            value: '3',
            comparison: 'Up from last week',
          },
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ReportsListCard profileId="child-1" interactive />);

    fireEvent.press(screen.getByTestId('weekly-report-card-weekly-1'));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expectParentPush();
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/child/[profileId]/weekly-report/[weeklyReportId]',
      params: { profileId: 'child-1', weeklyReportId: 'weekly-1' },
    });
  });

  it('pushes the child parent route before monthly report details', () => {
    mockUseProfileReports.mockReturnValue({
      data: [
        {
          id: 'report-1',
          reportMonth: '2026-04',
          headlineStat: {
            label: 'Sessions',
            value: '10',
            comparison: 'Up from last month',
          },
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ReportsListCard profileId="child-1" interactive />);

    fireEvent.press(screen.getByTestId('report-card-report-1'));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expectParentPush();
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/child/[profileId]/report/[reportId]',
      params: { profileId: 'child-1', reportId: 'report-1' },
    });
  });
});
