import { fireEvent, render, screen } from '@testing-library/react-native';
import { WeeklyReportCard } from './WeeklyReportCard';
import { useProfileWeeklyReports } from '../../hooks/use-progress';

jest.mock(
  '../../hooks/use-progress' /* gc1-allow: query-hook stub at unit-test boundary; real useProfileWeeklyReports needs QueryClientProvider + API client */,
  () => ({
    useProfileWeeklyReports: jest.fn(),
  }),
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'progress.weeklyReport.thisWeekSoFar')
        return 'This week so far';
      if (key === 'progress.weeklyReport.chips.time')
        return `${opts?.time ?? ''} spent`;
      if (key === 'progress.weeklyReport.chips.topics')
        return `${opts?.count ?? 0} topics started`;
      if (key === 'progress.weeklyReport.chips.streak')
        return `${opts?.count ?? 0}-day streak`;
      if (key === 'progress.weeklyReport.practiceTitle')
        return 'Practice highlights';
      if (key === 'progress.weeklyReport.practice.tests') return 'tests';
      if (key === 'progress.weeklyReport.practice.points') return 'points';
      if (key === 'progress.weeklyReport.mini.sessions')
        return `${opts?.count ?? 0} sessions`;
      if (key === 'progress.weeklyReport.mini.words')
        return `${opts?.count ?? 0} words`;
      if (key === 'progress.weeklyReport.mini.topics')
        return `${opts?.count ?? 0} topics touched`;
      if (key === 'progress.weeklyReport.empty.child')
        return 'Your first weekly summary is on its way.';
      if (key === 'progress.weeklyReport.empty.adult')
        return 'Your first weekly summary lands after a full week of learning.';
      return key;
    },
  }),
}));

function mockWeeklyReports(data: unknown[]) {
  (useProfileWeeklyReports as jest.Mock).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  });
}

describe('WeeklyReportCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the latest weekly headline when available', () => {
    mockWeeklyReports([
      {
        id: 'weekly-1',
        reportWeek: '2026-05-04',
        createdAt: '2026-05-11T00:00:00.000Z',
        viewedAt: null,
        headlineStat: {
          value: 3,
          label: 'Topics explored',
          comparison: '3 new this week',
        },
        thisWeek: {
          totalSessions: 2,
          totalActiveMinutes: 45,
          topicsMastered: 0,
          topicsExplored: 3,
          vocabularyTotal: 0,
          streakBest: 8,
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

    render(<WeeklyReportCard profileId="profile-1" />);

    screen.getByText('3 Topics explored');
    screen.getByText('3 new this week');
    screen.getByTestId('weekly-report-chip-time');
    screen.getByText('3 topics started');
    screen.getByText('8-day streak');
    screen.getByText('Practice highlights');
    screen.getByTestId('weekly-report-tests');
    screen.getByText('8');
    screen.getByText('tests');
    screen.getByTestId('weekly-report-points');
    screen.getByText('24');
    screen.getByText('points');
  });

  it('uses the live mini-summary when no weekly report exists', () => {
    mockWeeklyReports([]);

    render(
      <WeeklyReportCard
        profileId="profile-1"
        thisWeekMini={{ sessions: 2, wordsLearned: 4, topicsTouched: 1 }}
      />,
    );

    screen.getByText('This week so far');
    screen.getByText('2 sessions');
    screen.getByText('4 words');
    screen.getByText('1 topics touched');
  });

  it('falls back to register-aware copy when mini-summary is empty', () => {
    mockWeeklyReports([]);

    render(
      <WeeklyReportCard
        profileId="profile-1"
        register="child"
        thisWeekMini={{ sessions: 0, wordsLearned: 0, topicsTouched: 0 }}
      />,
    );

    screen.getByText('Your first weekly summary is on its way.');
  });

  it('shows a retry button on error that calls refetch', () => {
    const refetch = jest.fn();
    (useProfileWeeklyReports as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<WeeklyReportCard profileId="profile-1" />);

    screen.getByTestId('weekly-report-error');
    const retryButton = screen.getByTestId('weekly-report-retry');
    fireEvent.press(retryButton);
    expect(refetch).toHaveBeenCalled();
  });
});
