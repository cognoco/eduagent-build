import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
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
// the real goBackOrReplace helper — defaulted to false so the fallback
// branch (router.replace) is the one exercised when completionResult is
// briefly null during the seed step.
//
// [BUG-925] Stable mock references so tests can assert the exact router
// calls made by handlePlayAgain / handleDone / the safety useEffect.
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();
let mockCanGoBack = false;
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    back: mockRouterBack,
    canGoBack: () => mockCanGoBack,
  }),
}));

let mockFetchRoundData: QuizRoundResponse | null = null;

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
  useFetchRound: () => ({ data: mockFetchRoundData, isLoading: false }),
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
    </QuizFlowProvider>,
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

    screen.getByTestId('quiz-results-missed-section');
    screen.getByText('What you missed');

    // Wrong answers surfaced as "You said: X"
    screen.getByText('You said: Munich');
    screen.getByText('You said: Barcelona');

    // Correct answers shown
    screen.getByText('Berlin');
    screen.getByText('Madrid');

    // Fun facts shown ONLY for missed questions
    screen.getByText('Berlin has bridges.');
    screen.getByText('Madrid is in the center.');
    expect(screen.queryByText('Vienna has coffee houses.')).toBeNull();
    expect(screen.queryByText('Paris has the Eiffel Tower.')).toBeNull();

    // Question prompts use real questionPrompt() logic
    screen.getByText('Capital of Germany');
    screen.getByText('Capital of Spain');
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
      </QuizFlowProvider>,
    );

    // Both missed-card prompts must still resolve — even though indexes 2
    // and 3 are now out of range on the live `newRound` in context. This
    // proves the screen reads from the pinned round, not the live one.
    screen.getByText('Capital of Germany');
    screen.getByText('Capital of Spain');
    // And the 'Question' fallback string never leaked.
    expect(screen.queryByText('Question')).toBeNull();
  });

  // [BUG-925] On web, expo-router navigation is async. handlePlayAgain calls
  // router.replace then setCompletionResult(null); without the navigatingAwayRef
  // lock the safety useEffect would fire on the re-render, see completionResult
  // is null, and call goBackOrReplace — overriding the user's intent. Native
  // is unaffected because the screen unmounts during navigation.
  it('Play Again navigates to /quiz/play and the safety useEffect does not override (BUG-925)', () => {
    mockCanGoBack = true; // simulate web with browser history available
    const round = buildCapitalsRound();
    mockFetchRoundData = round; // prefetch hook returns hydrated data

    renderWithFlow({
      round,
      completionResult: {
        score: 4,
        total: 4,
        xpEarned: 50,
        celebrationTier: 'perfect',
        droppedResults: 0,
        questionResults: round.questions.map((q, i) => {
          const opts = 'options' in q ? q.options : q.mcFallbackOptions;
          return {
            questionIndex: i,
            correct: true,
            correctAnswer: opts[0]!,
            answerGiven: opts[0]!,
          };
        }),
      },
    });

    // The Seed component sets state during render, which causes a brief
    // render with completionResult=null where the safety useEffect commits
    // its bookkeeping call. That call is unrelated to BUG-925 — the bug is
    // about the safety useEffect firing AFTER the user's intentional
    // navigation, overriding it. Clear here so we measure only post-press.
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
    mockRouterBack.mockClear();

    fireEvent.press(screen.getByTestId('quiz-results-play-again'));

    // The user's intent: replace to /quiz/play. Exactly once.
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/quiz/play');
    // The safety useEffect must NOT race in and call back/replace to /practice.
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalledWith('/(app)/practice');

    mockFetchRoundData = null;
    mockCanGoBack = false;
  });

  it('Done navigates once to /practice and the safety useEffect does not double-call (BUG-925)', () => {
    // After the BUG-925 architectural fix, Done unconditionally calls
    // router.replace('/(app)/practice'); canGoBack is irrelevant. This test
    // is preserved as a regression guard — the assertion still holds.
    mockCanGoBack = false;
    const round = buildCapitalsRound();

    renderWithFlow({
      round,
      completionResult: {
        score: 1,
        total: 4,
        xpEarned: 5,
        celebrationTier: 'nice',
        droppedResults: 0,
        questionResults: round.questions.map((q, i) => {
          const opts = 'options' in q ? q.options : q.mcFallbackOptions;
          return {
            questionIndex: i,
            correct: i === 0,
            correctAnswer: opts[0]!,
            answerGiven: i === 0 ? opts[0]! : opts[1]!,
          };
        }),
      },
    });

    // Reset after the seed-render bookkeeping; we only care about the
    // post-press router-call accounting.
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
    mockRouterBack.mockClear();

    fireEvent.press(screen.getByTestId('quiz-results-done'));

    // Exactly one navigation to /practice. clear() sets completionResult=null,
    // which would have triggered the safety useEffect and produced a SECOND
    // router.replace call before the navigatingAwayRef lock was added.
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/practice');
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  // [BUG-925 regression] Break test: with canGoBack=true (the common case
  // after a normal quiz flow on web), the previous goBackOrReplace would
  // call router.back() and land on /quiz/play, which would then redirect
  // again because the round had been clear()'d. To the user this looked
  // like Done did nothing. The fix is to always router.replace('/practice')
  // regardless of canGoBack.
  it('Done replaces to /practice even when canGoBack is true (does not call router.back)', () => {
    mockCanGoBack = true;
    const round = buildCapitalsRound();

    renderWithFlow({
      round,
      completionResult: {
        score: 4,
        total: 4,
        xpEarned: 50,
        celebrationTier: 'perfect',
        droppedResults: 0,
        questionResults: round.questions.map((q, i) => {
          const opts = 'options' in q ? q.options : q.mcFallbackOptions;
          return {
            questionIndex: i,
            correct: true,
            correctAnswer: opts[0]!,
            answerGiven: opts[0]!,
          };
        }),
      },
    });

    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
    mockRouterBack.mockClear();

    fireEvent.press(screen.getByTestId('quiz-results-done'));

    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/practice');
    expect(mockRouterBack).not.toHaveBeenCalled();

    mockCanGoBack = false;
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
    screen.getByTestId('quiz-results-missed-section');
    // But the card body is skipped — no "You said: Munich" leaked without
    // a correct answer to contrast against.
    expect(screen.queryByText('You said: Munich')).toBeNull();
  });
});
