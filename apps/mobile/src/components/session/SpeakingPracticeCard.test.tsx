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

  // WI-1777 Phase-4 finding M1: without server feedback, the card must show
  // ONLY the raw transcript — no verdict, no missing/extra words — even when
  // the transcript happens to match the target word-for-word. Rendering a
  // client-computed verdict here is exactly the divergent-two-scorer bug the
  // single-scorer design exists to prevent (see SpeakingPracticeActivity,
  // which only ever supplies these props from the server's response).
  it('shows the raw transcript with no verdict when no server feedback is supplied (interim/recording state)', () => {
    render(
      <SpeakingPracticeCard
        targetText={targetText}
        transcript="I would like a cup of tea"
        onPlayTarget={jest.fn()}
        onRecordPress={jest.fn()}
      />,
    );

    screen.getByText('I would like a cup of tea');
    expect(screen.queryByText('Matched')).toBeNull();
    expect(screen.queryByTestId('speaking-practice-missing')).toBeNull();
    expect(screen.queryByTestId('speaking-practice-extra')).toBeNull();
  });

  it('shows no verdict even when the transcript is empty or partial and no server feedback exists', () => {
    render(
      <SpeakingPracticeCard
        targetText={targetText}
        transcript="I like cup tea"
        onPlayTarget={jest.fn()}
        onRecordPress={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('speaking-practice-missing')).toBeNull();
    expect(screen.queryByText('Matched')).toBeNull();
  });

  // WI-1777: server-authoritative feedback is the ONLY source of verdict
  // rendering — single scorer, so the render always matches what was
  // persisted.
  it('renders server-supplied missing/extra words', () => {
    render(
      <SpeakingPracticeCard
        targetText={targetText}
        transcript="I like cup tea and coffee"
        onPlayTarget={jest.fn()}
        onRecordPress={jest.fn()}
        missingWords={['would']}
        extraWords={['coffee']}
        isComplete={false}
      />,
    );

    screen.getByText('Try again: would');
    screen.getByText('Extra: coffee');
    expect(screen.queryByText('Matched')).toBeNull();
  });

  it('shows matched when server feedback reports isComplete with no missing/extra words', () => {
    render(
      <SpeakingPracticeCard
        targetText={targetText}
        transcript="I would like a cup of tea"
        onPlayTarget={jest.fn()}
        onRecordPress={jest.fn()}
        missingWords={[]}
        extraWords={[]}
        isComplete={true}
      />,
    );

    screen.getByText('Matched');
    expect(screen.queryByTestId('speaking-practice-missing')).toBeNull();
    expect(screen.queryByTestId('speaking-practice-extra')).toBeNull();
  });

  it('displays server-supplied missing words with a retry prompt', () => {
    const onRetry = jest.fn();

    render(
      <SpeakingPracticeCard
        targetText={targetText}
        transcript="I like cup tea"
        onPlayTarget={jest.fn()}
        onRecordPress={jest.fn()}
        onRetry={onRetry}
        missingWords={['would', 'a', 'of']}
        extraWords={[]}
        isComplete={false}
      />,
    );

    screen.getByTestId('speaking-practice-missing');
    screen.getByText('Try again: would, a, of');

    fireEvent.press(screen.getByTestId('speaking-practice-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
