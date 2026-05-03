import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
} from '../../../test-utils/mock-api-routes';

// [BUG-891] LanguageVocabCard calls useVocabulary(subjectId) so the menu
// can switch the title to "<Lang> basics" when the learner has fewer than
// PERSONAL_VOCAB_QUIZ_THRESHOLD personal entries. Default these tests to a
// "personalised" state (>= 5 entries) so existing BUG-926 / per-language
// stat tests still see the regular "Vocabulary: <lang>" framing; BUG-891-
// specific cases override the vocabulary route to an empty array.

// Default routes: empty stats, empty subjects, 5 vocab entries (personalised).
// Order: most-specific first so /vocabulary matches before /subjects (both appear in
// the vocabulary URL path /subjects/:id/vocabulary).
const DEFAULT_VOCAB = Array.from({ length: 5 }).map((_, i) => ({ id: `v-${i}` }));

const mockFetch = createRoutedMockFetch({
  '/quiz/stats': [],
  '/vocabulary': { vocabulary: DEFAULT_VOCAB },
  '/subjects': { subjects: [] },
});

jest.mock('../../../lib/api-client', () =>
  require('../../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch)
);

jest.mock('../../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: {
      id: 'test-profile-id',
      accountId: 'test-account-id',
      displayName: 'Test Learner',
      isOwner: true,
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      pronouns: null,
      consentStatus: null,
    },
  }),
  ProfileContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...rest }: { name: string }) => (
      <Text {...rest}>{name}</Text>
    ),
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#2563eb',
    textPrimary: '#111827',
  }),
}));

jest.mock('./_layout', () => ({
  useQuizFlow: () => ({
    setActivityType: jest.fn(),
    setSubjectId: jest.fn(),
    setLanguageName: jest.fn(),
    setRound: jest.fn(),
    setPrefetchedRoundId: jest.fn(),
    setCompletionResult: jest.fn(),
  }),
}));

const QuizIndexScreen = require('./index').default;

const ITALIAN_SUBJECT = {
  id: 'sub-it',
  name: 'Italian',
  pedagogyMode: 'four_strands',
  languageCode: 'it',
  status: 'active',
};
const SPANISH_SUBJECT = {
  id: 'sub-es',
  name: 'Spanish',
  pedagogyMode: 'four_strands',
  languageCode: 'es',
  status: 'active',
};
const FRESH_ITALIAN_SUBJECT = {
  id: 'sub-it-fresh',
  name: 'Italian',
  pedagogyMode: 'four_strands',
  languageCode: 'it',
  status: 'active',
};

describe('QuizIndexScreen', () => {
  let Wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockCanGoBack.mockReturnValue(true);
    // Reset routes to defaults: empty stats, 5-entry vocab (personalised), empty subjects.
    // Vocabulary before subjects — /vocabulary is more specific than /subjects.
    mockFetch.setRoute('/quiz/stats', []);
    mockFetch.setRoute('/vocabulary', { vocabulary: DEFAULT_VOCAB });
    mockFetch.setRoute('/subjects', { subjects: [] });
    Wrapper = createWrapper();
  });

  it('returns to the learner home view when opened from learner home', () => {
    mockSearchParams = { returnTo: 'learner-home' };

    render(<QuizIndexScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('quiz-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home?view=learner');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('falls back to practice when opened without a return target and no history', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<QuizIndexScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('quiz-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
  });

  // [BUG-752] Render coverage: empty / data / error / subject states.
  describe('[BUG-752] render states', () => {
    it('renders Capitals and Guess Who cards with default subtitles when no stats', () => {
      render(<QuizIndexScreen />, { wrapper: Wrapper });
      screen.getByTestId('quiz-capitals');
      screen.getByTestId('quiz-guess-who');
      screen.getByText(/test yourself on world capitals/i);
      screen.getByText(/name the famous person/i);
    });

    it('renders best-score subtitles when stats include bestScore', async () => {
      mockFetch.setRoute('/quiz/stats', [
        { activityType: 'capitals', bestScore: 8, bestTotal: 10, roundsPlayed: 5 },
        { activityType: 'guess_who', bestScore: 4, bestTotal: 5, roundsPlayed: 2 },
      ]);
      render(<QuizIndexScreen />, { wrapper: Wrapper });
      await waitFor(() => {
        screen.getByText(/Best: 8\/10 · Played: 5/);
        screen.getByText(/Best: 4\/5 · Played: 2/);
      });
    });

    it('shows the locked Vocabulary card when there are no four_strands subjects', () => {
      render(<QuizIndexScreen />, { wrapper: Wrapper });
      screen.getByTestId('quiz-vocab-locked');
    });

    // [BUG-926] Per-language stats: stat rows now include languageCode so each
    // vocabulary card only shows stats for rounds played in that language.
    it('shows per-language stats on the matching card only (BUG-926 fix)', async () => {
      mockFetch.setRoute('/quiz/stats', [
        // Italian stat row — only the Italian card should show this.
        { activityType: 'vocabulary', languageCode: 'it', bestScore: 2, bestTotal: 6, roundsPlayed: 1 },
      ]);
      mockFetch.setRoute('/subjects', { subjects: [ITALIAN_SUBJECT, SPANISH_SUBJECT] });

      render(<QuizIndexScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('quiz-vocabulary-sub-it');
        screen.getByTestId('quiz-vocabulary-sub-es');
        // Italian card shows its specific stats.
        screen.getByText(/Best: 2\/6 · Played: 1/);
        // Spanish card has no stat row — must show neutral fallback, not the Italian stats.
        expect(
          screen.getAllByText(/Practice new words and phrases/).length
        ).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows neutral fallback on a language card with no matching stat row (BUG-926 fix)', async () => {
      mockFetch.setRoute('/quiz/stats', [
        // Only Spanish stats present.
        { activityType: 'vocabulary', languageCode: 'es', bestScore: 5, bestTotal: 6, roundsPlayed: 3 },
      ]);
      mockFetch.setRoute('/subjects', { subjects: [ITALIAN_SUBJECT, SPANISH_SUBJECT] });

      render(<QuizIndexScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        // Spanish card shows its stats.
        screen.getByText(/Best: 5\/6 · Played: 3/);
        // Italian card has no stat row — neutral fallback must appear.
        screen.getByText(/Practice new words and phrases/);
        // Spanish stats must NOT bleed onto Italian card — there should be
        // exactly one "Best: 5/6" text node (on the Spanish card only).
        expect(screen.getAllByText(/Best: 5\/6 · Played: 3/).length).toBe(1);
      });
    });

    // [BUG-891] When a language subject has no personal vocabulary entries
    // recorded, the quiz pulls from a stock seed list. The card must say so
    // ("<Lang> basics" / "Stock starter words…") instead of pretending it is
    // personalised practice — the exact misframing the bug reproduced on a
    // fresh Italian subject with empty curriculum.
    describe('vocab-aware card framing (BUG-891)', () => {
      beforeEach(() => {
        mockFetch.setRoute('/subjects', { subjects: [FRESH_ITALIAN_SUBJECT] });
        Wrapper = createWrapper();
      });

      it('uses "<Lang> basics" title and starter-words subtitle when vocab is empty', async () => {
        mockFetch.setRoute('/vocabulary', { vocabulary: [] });
        render(<QuizIndexScreen />, { wrapper: Wrapper });
        await waitFor(() => {
          screen.getByText('Italian basics');
          screen.getByText(
            /Stock starter words — record 5 of your own to unlock personalised rounds/
          );
          // The misleading "Vocabulary: Italian" title must NOT appear.
          expect(screen.queryByText('Vocabulary: Italian')).toBeNull();
        });
      });

      it('keeps starter framing when vocab count is below the threshold', async () => {
        mockFetch.setRoute('/vocabulary', { vocabulary: [{ id: 'v-1' }, { id: 'v-2' }] });
        render(<QuizIndexScreen />, { wrapper: Wrapper });
        await waitFor(() => {
          screen.getByText('Italian basics');
        });
      });

      it('switches to personalised framing once vocab >= threshold', async () => {
        mockFetch.setRoute('/vocabulary', {
          vocabulary: Array.from({ length: 5 }).map((_, i) => ({ id: `v-${i}` })),
        });
        render(<QuizIndexScreen />, { wrapper: Wrapper });
        await waitFor(() => {
          screen.getByText('Vocabulary: Italian');
          expect(screen.queryByText('Italian basics')).toBeNull();
        });
      });

      it('treats loading state as starter (does not lie about personalisation)', async () => {
        // While the count is loading we cannot claim the round is
        // personalised — defaulting to starter framing matches the actual
        // round that fires for a fresh subject. This is a break test for
        // BUG-891 specifically: the original code surfaced "Vocabulary:
        // <Lang>" unconditionally, which is what made the bug reproducible
        // across empty subjects.
        // Simulate loading by making the vocabulary fetch never resolve.
        mockFetch.setRoute('/vocabulary', () => new Promise(() => { /* never resolves */ }));
        render(<QuizIndexScreen />, { wrapper: Wrapper });
        // The card must appear immediately in starter framing — before vocab resolves.
        await waitFor(() => {
          screen.getByText('Italian basics');
        });
      });
    });

    it('renders a Vocabulary card per active four_strands language subject', async () => {
      mockFetch.setRoute('/subjects', {
        subjects: [
          {
            id: 'sub-fr',
            name: 'French class',
            pedagogyMode: 'four_strands',
            languageCode: 'fr',
            status: 'active',
          },
          {
            id: 'sub-archived',
            name: 'Archived Spanish',
            pedagogyMode: 'four_strands',
            languageCode: 'es',
            status: 'archived',
          },
          {
            id: 'sub-non-language',
            name: 'Maths',
            pedagogyMode: 'standard',
            languageCode: null,
            status: 'active',
          },
        ],
      });
      render(<QuizIndexScreen />, { wrapper: Wrapper });
      await waitFor(() => {
        screen.getByTestId('quiz-vocabulary-sub-fr');
        expect(screen.queryByTestId('quiz-vocabulary-sub-archived')).toBeNull();
        expect(screen.queryByTestId('quiz-vocab-locked')).toBeNull();
      });
    });

    it('shows the error state with retry + go-back when stats fail to load', async () => {
      mockFetch.setRoute('/quiz/stats', new Response('{}', { status: 500 }));
      render(<QuizIndexScreen />, { wrapper: Wrapper });
      await waitFor(() => {
        screen.getByTestId('quiz-load-retry');
        screen.getByTestId('quiz-error-back');
        // Activity cards must be hidden in error state.
        expect(screen.queryByTestId('quiz-capitals')).toBeNull();
        expect(screen.queryByTestId('quiz-guess-who')).toBeNull();
      });
    });

    it('error retry button refetches both queries', async () => {
      mockFetch.setRoute('/subjects', new Response('{}', { status: 500 }));
      render(<QuizIndexScreen />, { wrapper: Wrapper });
      await waitFor(() => {
        screen.getByTestId('quiz-load-retry');
      });
      const callsBefore = mockFetch.mock.calls.length;
      fireEvent.press(screen.getByTestId('quiz-load-retry'));
      await waitFor(() => {
        const newCalls = mockFetch.mock.calls.length;
        // Both stats and subjects queries should have been refetched.
        expect(fetchCallsMatching(mockFetch, '/quiz/stats').length).toBeGreaterThanOrEqual(2);
        expect(fetchCallsMatching(mockFetch, '/subjects').length).toBeGreaterThanOrEqual(2);
        expect(newCalls).toBeGreaterThan(callsBefore);
      });
    });
  });
});
