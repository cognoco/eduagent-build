import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type {
  CompleteRoundResponse,
  QuizRoundResponse,
} from '@eduagent/schemas';

// Import the real provider + screen. No './_layout' mock.
import { QuizFlowProvider, useQuizFlow } from './_layout';
import QuizResultsScreen from './results';

// External-boundary stubs only. We're not mocking any of our own state
// logic (QuizFlowProvider, useThemeColors, goBackOrReplace, questionPrompt,
// tierConfig) — those run for real so the test exercises the actual
// rendering path the app uses.

// expo-router: native-only, jest can't load it. canGoBack is consulted by
// the real goBackOrReplace helper — stubbed to false so the fallback
// branch (router.replace) is the one exercised when completionResult is
// briefly null during the seed step.
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

// safe-area-context: native-only.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// BrandCelebration uses reanimated — skip it to keep the test environment
// lean. Not under test here.
jest.mock('../../../components/common/BrandCelebration', () => ({
  BrandCelebration: () => null,
}));

// useFetchRound is the external-network boundary (wraps TanStack Query +
// fetch). Stubbing it here is equivalent to stubbing the server response —
// the component logic we care about (missed-section rendering) doesn't
// read from this hook.
jest.mock('../../../hooks/use-quiz', () => ({
  useFetchRound: () => ({ data: null, isLoading: false }),
}));

interface SeedInput {
  round: QuizRoundResponse;
  completionResult: CompleteRoundResponse;
}

function Seed({ round, completionResult }: SeedInput): null {
  const { setRound, setActivityType, setCompletionResult } = useQuizFlow();
  const seeded = React.useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    setActivityType(round.activityType);
    setRound(round);
    setCompletionResult(completionResult);
  }
  return null;
}

function renderWithFlow(input: SeedInput): void {
  render(
    <QuizFlowProvider>
      <Seed {...input} />
      <QuizResultsScreen />
    </QuizFlowProvider>
  );
}

function buildCapitalsRound(): QuizRoundResponse {
  return {
    id: 'round-test',
    activityType: 'capitals',
    theme: 'European Capitals',
    total: 4,
    questions: [
      {
        type: 'capitals',
        country: 'Austria',
        options: ['Vienna', 'Graz', 'Salzburg', 'Innsbruck'],
        funFact: 'Vienna has coffee houses.',
        isLibraryItem: false,
        freeTextEligible: false,
      },
      {
        type: 'capitals',
        country: 'Germany',
        options: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt'],
        funFact: 'Berlin has bridges.',
        isLibraryItem: false,
        freeTextEligible: false,
      },
      {
        type: 'capitals',
        country: 'France',
        options: ['Paris', 'Lyon', 'Nice', 'Marseille'],
        funFact: 'Paris has the Eiffel Tower.',
        isLibraryItem: false,
        freeTextEligible: false,
      },
      {
        type: 'capitals',
        country: 'Spain',
        options: ['Madrid', 'Barcelona', 'Seville', 'Valencia'],
        funFact: 'Madrid is in the center.',
        isLibraryItem: false,
        freeTextEligible: false,
      },
    ],
  };
}

describe('QuizResultsScreen — [F-040] missed-question cards', () => {
  it('renders the missed-section with answerGiven, correctAnswer, and funFact when at least one wrong', () => {
    renderWithFlow({
      round: buildCapitalsRound(),
      completionResult: {
        score: 2,
        total: 4,
        xpEarned: 20,
        celebrationTier: 'nice',
        droppedResults: 0,
        questionResults: [
          {
            questionIndex: 0,
            correct: true,
            correctAnswer: 'Vienna',
            answerGiven: 'Vienna',
          },
          {
            questionIndex: 1,
            correct: false,
            correctAnswer: 'Berlin',
            answerGiven: 'Munich',
          },
          {
            questionIndex: 2,
            correct: true,
            correctAnswer: 'Paris',
            answerGiven: 'Paris',
          },
          {
            questionIndex: 3,
            correct: false,
            correctAnswer: 'Madrid',
            answerGiven: 'Barcelona',
          },
        ],
      },
    });

    expect(screen.getByTestId('quiz-results-missed-section')).toBeTruthy();
    expect(screen.getByText('What you missed')).toBeTruthy();

    // Wrong answers surfaced as "You said: X"
    expect(screen.getByText('You said: Munich')).toBeTruthy();
    expect(screen.getByText('You said: Barcelona')).toBeTruthy();

    // Correct answers shown
    expect(screen.getByText('Berlin')).toBeTruthy();
    expect(screen.getByText('Madrid')).toBeTruthy();

    // Fun facts shown ONLY for missed questions
    expect(screen.getByText('Berlin has bridges.')).toBeTruthy();
    expect(screen.getByText('Madrid is in the center.')).toBeTruthy();
    expect(screen.queryByText('Vienna has coffee houses.')).toBeNull();
    expect(screen.queryByText('Paris has the Eiffel Tower.')).toBeNull();

    // Question prompts use real questionPrompt() logic
    expect(screen.getByText('Capital of Germany')).toBeTruthy();
    expect(screen.getByText('Capital of Spain')).toBeTruthy();
  });

  it('does not render the missed-section on a perfect round', () => {
    renderWithFlow({
      round: buildCapitalsRound(),
      completionResult: {
        score: 4,
        total: 4,
        xpEarned: 50,
        celebrationTier: 'perfect',
        droppedResults: 0,
        questionResults: [
          {
            questionIndex: 0,
            correct: true,
            correctAnswer: 'Vienna',
            answerGiven: 'Vienna',
          },
          {
            questionIndex: 1,
            correct: true,
            correctAnswer: 'Berlin',
            answerGiven: 'Berlin',
          },
          {
            questionIndex: 2,
            correct: true,
            correctAnswer: 'Paris',
            answerGiven: 'Paris',
          },
          {
            questionIndex: 3,
            correct: true,
            correctAnswer: 'Madrid',
            answerGiven: 'Madrid',
          },
        ],
      },
    });

    expect(screen.queryByTestId('quiz-results-missed-section')).toBeNull();
    expect(screen.queryByText('What you missed')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // [BUG-777 / M-15] Break test — Play Again must not flash 'Question' fallback
  // -------------------------------------------------------------------------
  it('[BUG-777] keeps the original round pinned when context.round changes mid-screen', () => {
    // Reproduces the Play Again transition: while the results screen is still
    // mounted, a new round is pushed into context. Pre-fix, questionPrompt
    // would dereference the NEW round with OLD indexes, so a 4-question old
    // round + 2-question new round would show 'Question' fallback for two
    // missed cards. Post-fix, stableRound is pinned to the round in scope at
    // mount, so the prompts still resolve.
    const oldRound = buildCapitalsRound();
    // A "next" round with fewer questions — simulates Play Again loading a
    // shorter prefetched round before the screen unmounts.
    const newRound: QuizRoundResponse = {
      ...buildCapitalsRound(),
      id: 'round-next',
      total: 2,
      questions: oldRound.questions.slice(0, 2),
    };

    function MountThenSwap(): null {
      const { setRound, setActivityType, setCompletionResult } = useQuizFlow();
      const phase = React.useRef(0);
      // First render: seed the OLD round + completion result.
      // Second render: swap to the NEW round (still mounted).
      React.useEffect(() => {
        if (phase.current === 0) {
          phase.current = 1;
          setActivityType(oldRound.activityType);
          setRound(oldRound);
          setCompletionResult({
            score: 2,
            total: 4,
            xpEarned: 20,
            celebrationTier: 'nice',
            droppedResults: 0,
            questionResults: [
              {
                questionIndex: 0,
                correct: true,
                correctAnswer: 'Vienna',
                answerGiven: 'Vienna',
              },
              {
                questionIndex: 1,
                correct: false,
                correctAnswer: 'Berlin',
                answerGiven: 'Munich',
              },
              {
                questionIndex: 2,
                correct: true,
                correctAnswer: 'Paris',
                answerGiven: 'Paris',
              },
              {
                questionIndex: 3,
                correct: false,
                correctAnswer: 'Madrid',
                answerGiven: 'Barcelona',
              },
            ],
          });
        } else if (phase.current === 1) {
          phase.current = 2;
          // Swap the round but leave completionResult intact — the exact
          // window the bug describes.
          setRound(newRound);
        }
      });
      return null;
    }

    render(
      <QuizFlowProvider>
        <MountThenSwap />
        <QuizResultsScreen />
      </QuizFlowProvider>
    );

    // Both missed-card prompts must still resolve — even though indexes 2
    // and 3 are now out of range on the live `newRound` in context. This
    // proves the screen reads from the pinned round, not the live one.
    expect(screen.getByText('Capital of Germany')).toBeTruthy();
    expect(screen.getByText('Capital of Spain')).toBeTruthy();
    // And the 'Question' fallback string never leaked.
    expect(screen.queryByText('Question')).toBeNull();
  });

  it('skips cards with missing correctAnswer rather than crashing', () => {
    renderWithFlow({
      round: buildCapitalsRound(),
      completionResult: {
        score: 1,
        total: 2,
        xpEarned: 10,
        celebrationTier: 'nice',
        droppedResults: 0,
        questionResults: [
          {
            questionIndex: 0,
            correct: true,
            correctAnswer: 'Vienna',
            answerGiven: 'Vienna',
          },
          // A defensive edge case: completion result with empty correctAnswer
          {
            questionIndex: 1,
            correct: false,
            correctAnswer: '',
            answerGiven: 'Munich',
          },
        ],
      },
    });

    // Section still renders (there IS a missed entry)
    expect(screen.getByTestId('quiz-results-missed-section')).toBeTruthy();
    // But the card body is skipped — no "You said: Munich" leaked without
    // a correct answer to contrast against.
    expect(screen.queryByText('You said: Munich')).toBeNull();
  });
});
