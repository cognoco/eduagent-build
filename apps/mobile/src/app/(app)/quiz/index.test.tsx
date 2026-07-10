import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
} from '../../../test-utils/mock-api-routes';

// i18n mock — returns English values for quiz.index namespace so tests can
// assert on the same English strings as before the migration.
// Note: jest.mock factories are hoisted and must be self-contained.
jest.mock('react-i18next', () => {
  const TRANSLATIONS: Record<string, string> = {
    'quiz.index.title': 'Quiz',
    'quiz.index.backLabel': 'Go back',
    'quiz.index.loadError': "Couldn't load quiz data.",
    'quiz.index.tapToRetry': 'Tap to retry.',
    'quiz.index.retryLabel': 'Retry loading quiz data',
    'quiz.index.capitalsTitle': 'Capitals',
    'quiz.index.capitalsDefaultSubtitle': 'Test yourself on world capitals',
    'quiz.index.challengeExplainerTitle': 'Challenge rounds',
    'quiz.index.challengeExplainerBody':
      "When you're on a roll, the mentor may make the next round harder.",
    'quiz.index.guessWhoTitle': 'Guess Who',
    'quiz.index.guessWhoDefaultSubtitle': 'Name the famous person from clues',
    'quiz.index.vocabLockedTitle': 'Vocabulary',
    'quiz.index.vocabLockedSubtitle':
      'Add a language subject to unlock vocabulary quizzes',
    'quiz.index.bestScore': 'Best: {{score}}/{{total}} · Played: {{played}}',
    'quiz.index.played': 'Played: {{played}}',
    'quiz.index.vocabBasicsTitle': '{{language}} basics',
    'quiz.index.vocabBasicsTitleNoLanguage': 'Vocabulary basics',
    'quiz.index.vocabPersonalisedTitle': 'Vocabulary: {{language}}',
    'quiz.index.vocabPersonalisedTitleNoLanguage': 'Vocabulary',
    'quiz.index.vocabStarterSubtitle':
      'Stock starter words — record {{threshold}} of your own to unlock personalised rounds',
    'quiz.index.vocabPlayedSubtitleDefault': 'Practice new words and phrases',
    'common.back': 'Back',
  };
  const t = (key: string, opts?: Record<string, unknown>) => {
    const template = TRANSLATIONS[key] ?? key;
    if (!opts) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
      String(opts[k] ?? `{{${k}}}`),
    );
  };
  return { useTranslation: () => ({ t }) };
});

// [BUG-891] LanguageVocabCard calls useVocabulary(subjectId) so the menu
// can switch the title to "<Lang> basics" when the learner has fewer than
// PERSONAL_VOCAB_QUIZ_THRESHOLD personal entries. Default these tests to a
// "personalised" state (>= 5 entries) so existing BUG-926 / per-language
// stat tests still see the regular "Vocabulary: <lang>" framing; BUG-891-
// specific cases override the vocabulary route to an empty array.

// Default routes: empty stats, empty subjects, 5 vocab entries (personalised).
// Order: most-specific first so /vocabulary matches before /subjects (both appear in
// the vocabulary URL path /subjects/:id/vocabulary).
function vocabularyFixture(index: number) {
  return {
    id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    profileId: '70000000-0000-4000-8000-000000000011',
    subjectId: '70000000-0000-4000-8000-000000000012',
    term: `term-${index}`,
    termNormalized: `term-${index}`,
    translation: `translation-${index}`,
    type: 'word',
    mastered: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const DEFAULT_VOCAB = Array.from({ length: 5 }).map((_, i) =>
  vocabularyFixture(i),
);

const mockFetch = createRoutedMockFetch({
  '/quiz/stats': [],
  '/vocabulary': { vocabulary: DEFAULT_VOCAB },
  '/subjects': { subjects: [] },
});

jest.mock(
  '../../../lib/api-client' /* gc1-allow: external-boundary; typed Hono RPC client wraps fetch through mockApiClientFactory */,
  () =>
    require('../../../test-utils/mock-api-routes').mockApiClientFactory(
      mockFetch,
    ),
);

jest.mock(
  '../../../lib/profile' /* gc1-allow: native-boundary; lib/profile transitively loads native-only i18n/secure-storage modules in JSDOM */,
  () => ({
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
  }),
);

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

jest.mock(
  './_layout' /* gc1-allow: native-boundary; _layout transitively loads native-only router/i18n modules in JSDOM */,
  () => ({
    useQuizFlow: () => ({
      setActivityType: jest.fn(),
      setSubjectId: jest.fn(),
      setLanguageName: jest.fn(),
      setReturnTo: jest.fn(),
      setRound: jest.fn(),
      setCompletionResult: jest.fn(),
    }),
  }),
);

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

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      primary: '#2563eb',
      textPrimary: '#111827',
    }),
  }),
);

const QuizIndexScreen = require('./index').default;

const SUBJECT_PROFILE_ID = '60000000-0000-4000-8000-000000000009';

function languageSubjectFixture(overrides: Record<string, unknown>) {
  return {
    profileId: SUBJECT_PROFILE_ID,
    status: 'active',
    pedagogyMode: 'four_strands',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const ITALIAN_SUBJECT = languageSubjectFixture({
  id: '60000000-0000-4000-8000-000000000001',
  name: 'Italian',
  languageCode: 'it',
});
const SPANISH_SUBJECT = languageSubjectFixture({
  id: '60000000-0000-4000-8000-000000000002',
  name: 'Spanish',
  languageCode: 'es',
});
const FRESH_ITALIAN_SUBJECT = languageSubjectFixture({
  id: '60000000-0000-4000-8000-000000000003',
  name: 'Italian',
  languageCode: 'it',
});

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

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('returns to Practice when opened from the Practice hub', () => {
    mockSearchParams = { returnTo: 'practice' };

    render(<QuizIndexScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('quiz-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('falls back to practice when opened without a return target and no history', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<QuizIndexScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('quiz-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
  });

  it('uses a deterministic Practice fallback instead of browser history', () => {
    mockCanGoBack.mockReturnValue(true);

    render(<QuizIndexScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('quiz-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('preserves learner-home return target when starting a quiz', async () => {
    mockSearchParams = { returnTo: 'learner-home' };

    render(<QuizIndexScreen />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('quiz-capitals'));
    fireEvent.press(screen.getByTestId('quiz-capitals'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz/launch',
      params: { activityType: 'capitals', returnTo: 'learner-home' },
    });
  });

  // [BUG-752] Render coverage: empty / data / error / subject states.
  describe('[BUG-752] render states', () => {
    it('renders Capitals and Guess Who cards with default subtitles when no stats', () => {
      render(<QuizIndexScreen />, { wrapper: Wrapper });
      screen.getByTestId('quiz-challenge-explainer');
      screen.getByText('Challenge rounds');
      screen.getByTestId('quiz-capitals');
      screen.getByTestId('quiz-guess-who');
      screen.getByText(/test yourself on world capitals/i);
      screen.getByText(/name the famous person/i);
    });

    it('renders best-score subtitles when stats include bestScore', async () => {
      mockFetch.setRoute('/quiz/stats', [
        {
          activityType: 'capitals',
          languageCode: null,
          bestScore: 8,
          bestTotal: 10,
          roundsPlayed: 5,
          totalXp: 0,
        },
        {
          activityType: 'guess_who',
          languageCode: null,
          bestScore: 4,
          bestTotal: 5,
          roundsPlayed: 2,
          totalXp: 0,
        },
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
        {
          activityType: 'vocabulary',
          languageCode: 'it',
          bestScore: 2,
          bestTotal: 6,
          roundsPlayed: 1,
          totalXp: 0,
        },
      ]);
      mockFetch.setRoute('/subjects', {
        subjects: [ITALIAN_SUBJECT, SPANISH_SUBJECT],
      });

      render(<QuizIndexScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId(
          'quiz-vocabulary-60000000-0000-4000-8000-000000000001',
        );
        screen.getByTestId(
          'quiz-vocabulary-60000000-0000-4000-8000-000000000002',
        );
        // Italian card shows its specific stats.
        screen.getByText(/Best: 2\/6 · Played: 1/);
        // Spanish card has no stat row — must show neutral fallback, not the Italian stats.
        expect(
          screen.getAllByText(/Practice new words and phrases/).length,
        ).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows neutral fallback on a language card with no matching stat row (BUG-926 fix)', async () => {
      mockFetch.setRoute('/quiz/stats', [
        // Only Spanish stats present.
        {
          activityType: 'vocabulary',
          languageCode: 'es',
          bestScore: 5,
          bestTotal: 6,
          roundsPlayed: 3,
          totalXp: 0,
        },
      ]);
      mockFetch.setRoute('/subjects', {
        subjects: [ITALIAN_SUBJECT, SPANISH_SUBJECT],
      });

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
            /Stock starter words — record 5 of your own to unlock personalised rounds/,
          );
          // The misleading "Vocabulary: Italian" title must NOT appear.
          expect(screen.queryByText('Vocabulary: Italian')).toBeNull();
        });
      });

      it('keeps starter framing when vocab count is below the threshold', async () => {
        mockFetch.setRoute('/vocabulary', {
          vocabulary: [vocabularyFixture(0), vocabularyFixture(1)],
        });
        render(<QuizIndexScreen />, { wrapper: Wrapper });
        await waitFor(() => {
          screen.getByText('Italian basics');
        });
      });

      it('uses the no-language title when the language display name is blank', async () => {
        mockFetch.setRoute('/subjects', {
          subjects: [
            {
              ...FRESH_ITALIAN_SUBJECT,
              name: '   ',
              languageCode: 'x-private',
            },
          ],
        });
        mockFetch.setRoute('/vocabulary', { vocabulary: [] });
        render(<QuizIndexScreen />, { wrapper: Wrapper });
        await waitFor(() => {
          screen.getByText('Vocabulary basics');
          expect(screen.queryByText(' basics')).toBeNull();
        });
      });

      it('switches to personalised framing once vocab >= threshold', async () => {
        mockFetch.setRoute('/vocabulary', {
          vocabulary: Array.from({ length: 5 }).map((_, i) =>
            vocabularyFixture(i),
          ),
        });
        render(<QuizIndexScreen />, { wrapper: Wrapper });
        await waitFor(() => {
          screen.getByText('Vocabulary: Italian');
          expect(screen.queryByText('Italian basics')).toBeNull();
        });
      });

      it('uses the no-language personalised title when vocab is ready but the language name is blank', async () => {
        mockFetch.setRoute('/subjects', {
          subjects: [
            {
              ...FRESH_ITALIAN_SUBJECT,
              name: '   ',
              languageCode: 'x-private',
            },
          ],
        });
        mockFetch.setRoute('/vocabulary', {
          vocabulary: Array.from({ length: 5 }).map((_, i) =>
            vocabularyFixture(i),
          ),
        });
        render(<QuizIndexScreen />, { wrapper: Wrapper });
        await waitFor(() => {
          screen.getByText('Vocabulary');
          expect(screen.queryByText('Vocabulary: ')).toBeNull();
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
        mockFetch.setRoute(
          '/vocabulary',
          () =>
            new Promise(() => {
              /* never resolves */
            }),
        );
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
          languageSubjectFixture({
            id: '60000000-0000-4000-8000-000000000004',
            name: 'French class',
            languageCode: 'fr',
          }),
          languageSubjectFixture({
            id: '60000000-0000-4000-8000-000000000005',
            name: 'Archived Spanish',
            languageCode: 'es',
            status: 'archived',
          }),
          languageSubjectFixture({
            id: '60000000-0000-4000-8000-000000000006',
            name: 'Maths',
            pedagogyMode: 'socratic',
            languageCode: null,
          }),
        ],
      });
      render(<QuizIndexScreen />, { wrapper: Wrapper });
      await waitFor(() => {
        screen.getByTestId(
          'quiz-vocabulary-60000000-0000-4000-8000-000000000004',
        );
        expect(
          screen.queryByTestId(
            'quiz-vocabulary-60000000-0000-4000-8000-000000000005',
          ),
        ).toBeNull();
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
        expect(
          fetchCallsMatching(mockFetch, '/quiz/stats').length,
        ).toBeGreaterThanOrEqual(2);
        expect(
          fetchCallsMatching(mockFetch, '/subjects').length,
        ).toBeGreaterThanOrEqual(2);
        expect(newCalls).toBeGreaterThan(callsBefore);
      });
    });
  });
});
