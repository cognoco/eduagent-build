import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { LearningRewardMoment } from './LearningRewardMoment';

describe('LearningRewardMoment', () => {
  it('renders a contained reward receipt with motif, answer, and reinforcement', () => {
    render(
      <LearningRewardMoment
        activityLabel="Vocabulary"
        headline="You discovered it!"
        answer="The bird"
        fallbackAnswerLabel="Correct"
        reinforcement="Locked in. Nice find."
        motif={<Text testID="reward-motif">star</Text>}
        testID="learning-reward"
        answerTestID="learning-reward-answer"
      />,
    );

    screen.getByTestId('learning-reward');
    screen.getByTestId('reward-motif');
    screen.getByText('Vocabulary');
    screen.getByText('You discovered it!');
    expect(screen.getByTestId('learning-reward-answer').props.children).toBe(
      'The bird',
    );
    screen.getByText('Locked in. Nice find.');
  });

  it('falls back safely when the answer cannot be revealed', () => {
    render(
      <LearningRewardMoment
        activityLabel="Capitals"
        headline="You discovered it!"
        fallbackAnswerLabel="Correct"
        reinforcement="Locked in. Nice find."
        testID="learning-reward"
        answerTestID="learning-reward-answer"
      />,
    );

    expect(screen.getByTestId('learning-reward-answer').props.children).toBe(
      'Correct',
    );
  });
});
