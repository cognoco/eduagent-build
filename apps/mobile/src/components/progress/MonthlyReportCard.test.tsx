import { render, screen } from '@testing-library/react-native';
import { MonthlyReportCard } from './MonthlyReportCard';
import { useProfileReports } from '../../hooks/use-progress';

jest.mock(
  '../../hooks/use-progress' /* gc1-allow: query-hook stub at unit-test boundary; real useProfileReports needs QueryClientProvider + API client */,
  () => ({
    useProfileReports: jest.fn(),
  }),
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'progress.monthlyReport.highlightsTitle') return 'Highlights';
      if (key === 'progress.monthlyReport.nextStepsTitle') return "What's next";
      if (key === 'progress.monthlyReport.empty.child')
        return `Your first monthly summary lands at the end of ${opts?.month}.`;
      if (key === 'progress.monthlyReport.empty.adult')
        return `Your first monthly summary lands at the end of ${opts?.month}.`;
      return key;
    },
  }),
}));

function mockReports(data: unknown[]) {
  (useProfileReports as jest.Mock).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  });
}

describe('MonthlyReportCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders highlights and next steps from the latest report', () => {
    mockReports([
      {
        id: 'report-1',
        reportMonth: '2026-05',
        createdAt: '2026-05-31T00:00:00.000Z',
        viewedAt: null,
        headlineStat: {
          value: 4,
          label: 'Topics mastered',
          comparison: 'up from 2 last month',
        },
        highlights: ['Solved fraction problems', 'Kept a steady rhythm'],
        nextSteps: ['Review decimals'],
      },
    ]);

    render(<MonthlyReportCard profileId="profile-1" register="child" />);

    screen.getByText('4 Topics mastered');
    screen.getByText('Highlights');
    screen.getByText('Solved fraction problems');
    screen.getByText('Kept a steady rhythm');
    screen.getByText("What's next");
    screen.getByText('Review decimals');
  });

  it('caps highlights and next steps defensively', () => {
    mockReports([
      {
        id: 'report-1',
        reportMonth: '2026-05',
        createdAt: '2026-05-31T00:00:00.000Z',
        viewedAt: null,
        headlineStat: {
          value: 1,
          label: 'Topic mastered',
          comparison: 'first month',
        },
        highlights: ['One', 'Two', 'Three', 'Four'],
        nextSteps: ['A', 'B', 'C'],
      },
    ]);

    render(<MonthlyReportCard profileId="profile-1" />);

    screen.getByText('One');
    screen.getByText('Three');
    expect(screen.queryByText('Four')).toBeNull();
    screen.getByText('A');
    screen.getByText('B');
    expect(screen.queryByText('C')).toBeNull();
  });

  it('does not render empty section headings for scaffold reports', () => {
    mockReports([
      {
        id: 'report-1',
        reportMonth: '2026-05',
        createdAt: '2026-05-31T00:00:00.000Z',
        viewedAt: null,
        headlineStat: {
          value: 1,
          label: 'Topic mastered',
          comparison: 'first month',
        },
        highlights: [],
        nextSteps: [],
      },
    ]);

    render(<MonthlyReportCard profileId="profile-1" />);

    expect(screen.queryByText('Highlights')).toBeNull();
    expect(screen.queryByText("What's next")).toBeNull();
  });

  it('uses register-aware empty copy when no latest report exists', () => {
    mockReports([]);

    render(<MonthlyReportCard profileId="profile-1" register="child" />);

    screen.getByText(/Your first monthly summary lands at the end of/);
  });
});
