import { render, screen } from '@testing-library/react-native';
import { WeeklyReportCard } from './WeeklyReportCard';
import { useProfileWeeklyReports } from '../../hooks/use-progress';

jest.mock('../../hooks/use-progress', () => ({
  // gc1-allow: query-hook stub at unit-test boundary; real useProfileWeeklyReports requires QueryClientProvider + API client wiring
  useProfileWeeklyReports: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'progress.weeklyReport.thisWeekSoFar')
        return 'This week so far';
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
      },
    ]);

    render(<WeeklyReportCard profileId="profile-1" />);

    screen.getByText('3 Topics explored');
    screen.getByText('3 new this week');
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
});
