import { render } from '@testing-library/react-native';

import { RewardReceiptCard, type RewardReceipt } from './RewardReceiptCard';

describe('RewardReceiptCard', () => {
  it.each<RewardReceipt>([
    { kind: 'practice_points', amount: 12, topicTitle: 'Fractions' },
    { kind: 'reflection_bonus', multiplier: 1.5, totalXp: 18 },
    { kind: 'quiz_personal_best', game: 'capitals', score: 9 },
    { kind: 'quiz_personal_best', game: 'guess_who', score: 7 },
    { kind: 'mastery_delta', mastered: 2, weeklyDelta: 1 },
  ])('renders a private earned receipt for %s', (receipt) => {
    const { getByTestId, queryByText } = render(
      <RewardReceiptCard receipt={receipt} />,
    );

    expect(getByTestId('mentor-reward-receipt')).toBeTruthy();
    expect(getByTestId('mentor-reward-value').props.children).toBeTruthy();
    expect(
      queryByText(/leaderboard|rank|public|paywall|upgrade|loss/i),
    ).toBeNull();
  });
});
