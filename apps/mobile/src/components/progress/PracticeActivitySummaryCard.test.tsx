import { render, screen } from '@testing-library/react-native';

import { PracticeActivitySummaryCard } from './PracticeActivitySummaryCard';

describe('PracticeActivitySummaryCard', () => {
  it('renders totals, activity type, subject, and comparison detail', () => {
    render(
      <PracticeActivitySummaryCard
        summary={{
          quizzesCompleted: 2,
          reviewsCompleted: 1,
          totals: {
            activitiesCompleted: 3,
            reviewsCompleted: 1,
            pointsEarned: 20,
            celebrations: 2,
            distinctActivityTypes: 2,
          },
          scores: {
            scoredActivities: 2,
            score: 9,
            total: 12,
            accuracy: 0.75,
          },
          byType: [
            {
              activityType: 'quiz',
              activitySubtype: 'capitals',
              count: 2,
              pointsEarned: 12,
              scoredActivities: 2,
              score: 9,
              total: 12,
            },
            {
              activityType: 'review',
              activitySubtype: 'vocabulary',
              count: 1,
              pointsEarned: 8,
              scoredActivities: 0,
              score: 0,
              total: 0,
            },
          ],
          bySubject: [
            {
              subjectId: '550e8400-e29b-41d4-a716-446655440000',
              subjectName: 'Math',
              count: 3,
              pointsEarned: 20,
              byType: [
                {
                  activityType: 'quiz',
                  activitySubtype: 'capitals',
                  count: 2,
                  pointsEarned: 12,
                  scoredActivities: 2,
                  score: 9,
                  total: 12,
                },
                {
                  activityType: 'review',
                  activitySubtype: 'vocabulary',
                  count: 1,
                  pointsEarned: 8,
                  scoredActivities: 0,
                  score: 0,
                  total: 0,
                },
              ],
            },
          ],
          comparison: {
            previous: {
              activitiesCompleted: 1,
              reviewsCompleted: 0,
              pointsEarned: 5,
              celebrations: 0,
              distinctActivityTypes: 1,
            },
            delta: {
              activitiesCompleted: 2,
              reviewsCompleted: 1,
              pointsEarned: 15,
              celebrations: 2,
              distinctActivityTypes: 1,
            },
          },
        }}
        testID="practice-summary"
      />,
    );

    screen.getByTestId('practice-summary');
    screen.getByText('Test detail');
    screen.getByText('3 tests finished, including 1 reviews');
    screen.getByText('+2 tests · +15 points · +2 celebrations');
    screen.getByText('Capitals');
    screen.getByText('2 finished · 12 points · 75%');
    screen.getByText('Vocabulary');
    screen.getByText('1 finished · 8 points');
    screen.getByText('Math');
    screen.getByText('3 tests · 20 points · Capitals 2 · Vocabulary 1');
  });

  it('does not render when the report has no test activity', () => {
    const { queryByTestId } = render(
      <PracticeActivitySummaryCard
        summary={{
          quizzesCompleted: 0,
          reviewsCompleted: 0,
          totals: {
            activitiesCompleted: 0,
            reviewsCompleted: 0,
            pointsEarned: 0,
            celebrations: 0,
            distinctActivityTypes: 0,
          },
          scores: {
            scoredActivities: 0,
            score: 0,
            total: 0,
            accuracy: null,
          },
          byType: [],
          bySubject: [],
        }}
        testID="practice-summary"
      />,
    );

    expect(queryByTestId('practice-summary')).toBeNull();
  });

  it('hides comparison detail when the delta is zero', () => {
    render(
      <PracticeActivitySummaryCard
        summary={{
          quizzesCompleted: 1,
          reviewsCompleted: 0,
          totals: {
            activitiesCompleted: 1,
            reviewsCompleted: 0,
            pointsEarned: 5,
            celebrations: 0,
            distinctActivityTypes: 1,
          },
          scores: {
            scoredActivities: 1,
            score: 1,
            total: 1,
            accuracy: 1,
          },
          byType: [],
          bySubject: [],
          comparison: {
            previous: {
              activitiesCompleted: 1,
              reviewsCompleted: 0,
              pointsEarned: 5,
              celebrations: 0,
              distinctActivityTypes: 1,
            },
            delta: {
              activitiesCompleted: 0,
              reviewsCompleted: 0,
              pointsEarned: 0,
              celebrations: 0,
              distinctActivityTypes: 0,
            },
          },
        }}
        testID="practice-summary"
      />,
    );

    expect(
      screen.queryByText('0 tests · 0 points · 0 celebrations'),
    ).toBeNull();
  });
});
