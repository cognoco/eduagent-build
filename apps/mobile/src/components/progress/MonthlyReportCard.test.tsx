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
      if (key === 'progress.monthlyReport.nextStepTitle') return 'Next step';
      if (key === 'progress.monthlyReport.bars.sessions') return 'Sessions';
      if (key === 'progress.monthlyReport.bars.time') return 'Time';
      if (key === 'progress.monthlyReport.bars.quizzes') return 'Quizzes';
      if (key === 'progress.monthlyReport.bars.reviews') return 'Reviews';
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

  it('renders headline, bar block, highlights, and one next step from the latest report', () => {
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
        thisMonth: {
          totalSessions: 4,
          totalActiveMinutes: 80,
          topicsMastered: 2,
          topicsExplored: 3,
          vocabularyTotal: 0,
          streakBest: 5,
        },
        practiceSummary: {
          quizzesCompleted: 3,
          reviewsCompleted: 5,
          totals: {
            activitiesCompleted: 8,
            reviewsCompleted: 5,
            pointsEarned: 24,
            celebrations: 1,
            distinctActivityTypes: 2,
          },
          scores: {
            scoredActivities: 3,
            score: 2,
            total: 3,
            accuracy: 0.67,
          },
          byType: [],
          bySubject: [],
        },
      },
    ]);

    render(<MonthlyReportCard profileId="profile-1" register="child" />);

    screen.getByText('4 Topics mastered');
    screen.getByText('Highlights');
    screen.getByText('Solved fraction problems');
    screen.getByText('Kept a steady rhythm');
    screen.getByTestId('monthly-bars');
    screen.getByText('Quizzes');
    screen.getByText('Reviews');
    screen.getByText('3');
    screen.getByText('5');
    screen.getByText('Next step');
    screen.getByText('Review decimals');
  });

  it('caps highlights and renders only one next step defensively', () => {
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
    expect(screen.queryByText('B')).toBeNull();
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
    expect(screen.queryByText('Next step')).toBeNull();
  });

  it('uses register-aware empty copy when no latest report exists', () => {
    mockReports([]);

    render(<MonthlyReportCard profileId="profile-1" register="child" />);

    screen.getByText(/Your first monthly summary lands at the end of/);
  });
});
