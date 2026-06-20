import { render, screen } from '@testing-library/react-native';

import { SubjectHubProgressSummary } from './SubjectHubProgressSummary';

jest.mock('react-i18next' /* external i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('SubjectHubProgressSummary', () => {
  it('renders compact progress, due reviews, weekly delta, and practice points', () => {
    render(
      <SubjectHubProgressSummary
        aggregate={{
          mastered: 4,
          learning: 2,
          total: 9,
          reviewsDue: 3,
          weeklyMasteredDelta: 2,
          recentPracticePoints: 80,
        }}
      />,
    );

    screen.getByText('subjectHub.progress.threeState');
    screen.getByText('subjectHub.progress.reviewsDue');
    screen.getByText('subjectHub.progress.weeklyDelta');
    screen.getByText('subjectHub.progress.practicePoints');
  });

  it('renders no-variable fallback copy when optional receipts are absent', () => {
    render(
      <SubjectHubProgressSummary
        aggregate={{
          mastered: 0,
          learning: 1,
          total: 3,
          reviewsDue: 0,
          weeklyMasteredDelta: 0,
          recentPracticePoints: null,
        }}
      />,
    );

    screen.getByText('subjectHub.progress.noReviewsDue');
    screen.getByText('subjectHub.progress.noWeeklyDelta');
    screen.getByText('subjectHub.progress.noPracticePoints');
  });
});
