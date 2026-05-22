import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { GuessWhoQuestion } from './GuessWhoQuestion';
import { ThemeContext } from '../../lib/theme';

const question = {
  type: 'guess_who' as const,
  clues: ['Clue one', 'Clue two', 'Clue three'],
  mcFallbackOptions: ['Ada Lovelace', 'Grace Hopper', 'Alan Turing'],
  funFact: 'Fact',
  isLibraryItem: true,
};

function renderQuestion(
  props: Omit<React.ComponentProps<typeof GuessWhoQuestion>, 'question'>,
) {
  return render(
    <ThemeContext.Provider
      value={{
        colorScheme: 'light',
        setColorScheme: jest.fn(),
        accentPresetId: null,
        setAccentPresetId: jest.fn(),
      }}
    >
      <GuessWhoQuestion question={question} {...props} />
    </ThemeContext.Provider>,
  );
}

describe('GuessWhoQuestion', () => {
  it('[BREAK/WI-163] sends wrong intermediate free-text guesses as non-final probes', async () => {
    const onCheckAnswer = jest.fn().mockResolvedValue(false);
    const onResolved = jest.fn();
    renderQuestion({
      onCheckAnswer,
      onResolved,
    });

    fireEvent.changeText(screen.getByTestId('guess-who-input'), 'Ada');
    fireEvent.press(screen.getByTestId('guess-who-submit'));

    await waitFor(() => {
      expect(onCheckAnswer).toHaveBeenCalledWith('Ada', {
        answerMode: 'free_text',
        finalAttempt: false,
        cluesUsed: 1,
      });
    });
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('[BREAK/WI-163] records final skipped Guess Who outcomes before resolving', async () => {
    const onCheckAnswer = jest.fn().mockResolvedValue(false);
    const onResolved = jest.fn();
    renderQuestion({
      onCheckAnswer,
      onResolved,
    });

    fireEvent.press(screen.getByTestId('guess-who-next-clue'));
    fireEvent.press(screen.getByTestId('guess-who-next-clue'));
    fireEvent.press(screen.getByTestId('guess-who-next-clue'));

    await waitFor(() => {
      expect(onCheckAnswer).toHaveBeenLastCalledWith('[skipped]', {
        answerMode: 'free_text',
        finalAttempt: true,
        cluesUsed: 3,
      });
      expect(onResolved).toHaveBeenCalledWith({
        correct: false,
        answerGiven: '[skipped]',
        cluesUsed: 3,
        answerMode: 'free_text',
      });
    });
  });

  it('[BREAK/WI-163] records fallback choices as final multiple-choice attempts', async () => {
    const onCheckAnswer = jest.fn().mockResolvedValue(true);
    const onResolved = jest.fn();
    renderQuestion({
      onCheckAnswer,
      onResolved,
    });

    fireEvent.press(screen.getByTestId('guess-who-next-clue'));
    fireEvent.press(screen.getByTestId('guess-who-next-clue'));
    fireEvent.press(screen.getByText('Ada Lovelace'));

    await waitFor(() => {
      expect(onCheckAnswer).toHaveBeenCalledWith('Ada Lovelace', {
        answerMode: 'multiple_choice',
        finalAttempt: true,
        cluesUsed: 3,
      });
    });
  });
});
