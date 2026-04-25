import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import QuizRoundDetailScreen from './[roundId]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ roundId: 'round-1' }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

const mockUseRoundDetail = jest.fn();
jest.mock('../../../hooks/use-quiz', () => ({
  useRoundDetail: (...args: unknown[]) => mockUseRoundDetail(...args),
}));

function buildGuessWhoRound() {
  return {
    id: 'round-1',
    activityType: 'guess_who',
    activityLabel: 'Guess Who',
    theme: 'Pioneers in Technology',
    status: 'completed',
    score: 1,
    total: 2,
    xpEarned: 10,
    questions: [
      {
        type: 'guess_who',
        clues: [
          'Born in Croatia in 1856.',
          'Worked briefly for Edison.',
          'Pioneered alternating current.',
          'A unit of magnetic flux density bears his name.',
          'His first name is Nikola.',
        ],
        mcFallbackOptions: ['Tesla', 'Edison', 'Bell', 'Eastman'],
        funFact: 'He could speak eight languages.',
        isLibraryItem: false,
        correctAnswer: 'Nikola Tesla',
        acceptedAliases: ['Tesla'],
      },
      {
        type: 'guess_who',
        clues: ['c1', 'c2', 'c3', 'c4', 'c5'],
        mcFallbackOptions: ['A', 'B', 'C', 'D'],
        funFact: 'Trivia.',
        isLibraryItem: false,
        correctAnswer: 'George Eastman',
        acceptedAliases: [],
      },
    ],
    results: [
      {
        questionIndex: 0,
        correct: true,
        answerGiven: 'Nikola Tesla',
        timeMs: 5000,
        cluesUsed: 3,
      },
      {
        questionIndex: 1,
        correct: true,
        answerGiven: 'George Eastman',
        timeMs: 4000,
        cluesUsed: 5,
      },
    ],
  };
}

describe('QuizRoundDetailScreen — hint reveal', () => {
  beforeEach(() => {
    mockUseRoundDetail.mockReset();
  });

  it('starts collapsed and reveals clues + fun fact when the question is tapped', () => {
    mockUseRoundDetail.mockReturnValue({
      data: buildGuessWhoRound(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);

    expect(screen.queryByTestId('round-detail-question-0-hints')).toBeNull();

    fireEvent.press(screen.getByTestId('round-detail-question-0'));

    expect(screen.getByTestId('round-detail-question-0-hints')).toBeTruthy();
    expect(screen.getByText('Born in Croatia in 1856.')).toBeTruthy();
    expect(screen.getByText('He could speak eight languages.')).toBeTruthy();
  });

  it('marks clues beyond cluesUsed as "not needed"', () => {
    mockUseRoundDetail.mockReturnValue({
      data: buildGuessWhoRound(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);
    fireEvent.press(screen.getByTestId('round-detail-question-0'));

    // cluesUsed = 3 → indices 0,1,2 shown, 3 and 4 marked "not needed"
    expect(screen.getByTestId('round-detail-question-0-clue-3')).toBeTruthy();
    expect(screen.getAllByText(/not needed/)).toHaveLength(2);
  });

  it('toggles back to collapsed on a second tap', () => {
    mockUseRoundDetail.mockReturnValue({
      data: buildGuessWhoRound(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<QuizRoundDetailScreen />);

    const card = screen.getByTestId('round-detail-question-0');
    fireEvent.press(card);
    expect(screen.getByTestId('round-detail-question-0-hints')).toBeTruthy();
    fireEvent.press(card);
    expect(screen.queryByTestId('round-detail-question-0-hints')).toBeNull();
  });
});
