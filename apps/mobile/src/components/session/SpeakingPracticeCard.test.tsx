import { fireEvent, render, screen } from '@testing-library/react-native';

import { SpeakingPracticeCard } from './SpeakingPracticeCard';

describe('SpeakingPracticeCard', () => {
  const targetText = 'I would like a cup of tea.';

  it('renders the target sentence and audio control', () => {
    const onPlayTarget = jest.fn();

    render(
      <SpeakingPracticeCard
        targetText={targetText}
        onPlayTarget={onPlayTarget}
        onRecordPress={jest.fn()}
      />,
    );

    screen.getByTestId('speaking-practice-card');
    screen.getByText(targetText);

    fireEvent.press(screen.getByTestId('speaking-practice-play'));
    expect(onPlayTarget).toHaveBeenCalledTimes(1);
  });

  it('shows transcript comparison when speech text is available', () => {
    render(
      <SpeakingPracticeCard
        targetText={targetText}
        transcript="I would like a cup of tea"
        onPlayTarget={jest.fn()}
        onRecordPress={jest.fn()}
      />,
    );

    screen.getByText('I would like a cup of tea');
    screen.getByText('Matched');
    expect(screen.queryByTestId('speaking-practice-missing')).toBeNull();
  });

  it('displays missing words and a retry prompt', () => {
    const onRetry = jest.fn();

    render(
      <SpeakingPracticeCard
        targetText={targetText}
        transcript="I like cup tea"
        onPlayTarget={jest.fn()}
        onRecordPress={jest.fn()}
        onRetry={onRetry}
      />,
    );

    screen.getByTestId('speaking-practice-missing');
    screen.getByText('Try again: would, a, of');

    fireEvent.press(screen.getByTestId('speaking-practice-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
