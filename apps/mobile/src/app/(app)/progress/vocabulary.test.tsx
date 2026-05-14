import { screen, waitFor } from '@testing-library/react-native';
import {
  createRoutedMockFetch,
  renderScreen,
} from '../../../../test-utils/screen-render-harness';
import VocabularyBrowserScreen from './vocabulary';

jest.mock('react-i18next', () => ({ // gc1-allow: external-boundary i18n framework
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'progress.vocabulary.pageTitle': 'Your Vocabulary',
        'progress.vocabulary.totalWords': `${
          opts?.count ?? ''
        } words across all subjects`,
        'progress.vocabulary.errorTitle': "We couldn't load your vocabulary",
        'progress.vocabulary.errorMessage':
          'Check your connection and try again.',
        'progress.vocabulary.noLanguageMessage':
          'Vocabulary tracking is available for language subjects.',
        'progress.vocabulary.newLearnerTitle': 'Your vocabulary will grow here',
        'progress.vocabulary.newLearnerSubtitle':
          'Keep learning and the words you discover will appear here.',
        'progress.vocabulary.emptyTitle': 'No vocabulary yet',
        'progress.vocabulary.emptyBackLabel': 'Go back to Journey',
        'progress.vocabulary.emptyMessageOne': `Practice ${
          opts?.subject ?? ''
        } to start building your word list.`,
        'progress.vocabulary.emptyMessageMany':
          'Practice a language subject to start building your word list.',
        'progress.vocabulary.emptyMessageNone':
          'Start a language subject and the words you learn will appear here.',
        'progress.vocabulary.viewSubjectLabel': `View ${
          opts?.subject ?? ''
        } vocabulary`,
        'progress.vocabulary.viewAllLink': 'View all →',
        'progress.vocabulary.wordsSummary': `${opts?.total ?? ''} words — ${
          opts?.mastered ?? ''
        } mastered`,
        'progress.vocabulary.learningAppend': `, ${opts?.count ?? ''} learning`,
        'progress.subject.wordCount': `${opts?.count ?? ''} words`,
        'common.tryAgain': 'Try again',
        'common.goBack': 'Go back',
      };
      if (key in map) return map[key]!;
      return key;
    },
  }),
}));

jest.mock('expo-router', () => require('../../../test-utils/native-shims').expoRouterShim()); // gc1-allow: native-boundary expo-router
jest.mock('react-native-safe-area-context', () => require('../../../test-utils/native-shims').safeAreaShim()); // gc1-allow: native-boundary safe-area

const mockFetch = createRoutedMockFetch();

jest.mock('../../../lib/api-client', () => // gc1-allow: transport-boundary api client fetch layer
  require('../../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

const mockInventory = {
  profileId: 'p1',
  snapshotDate: '2026-04-13',
  global: {
    topicsAttempted: 5,
    topicsMastered: 3,
    vocabularyTotal: 12,
    vocabularyMastered: 8,
    totalSessions: 10,
    totalActiveMinutes: 120,
    currentStreak: 3,
    longestStreak: 5,
  },
  subjects: [
    {
      subjectId: 's1',
      subjectName: 'Spanish',
      pedagogyMode: 'four_strands',
      topics: {
        total: 10,
        explored: 5,
        mastered: 3,
        inProgress: 2,
        notStarted: 5,
      },
      vocabulary: {
        total: 12,
        mastered: 8,
        learning: 3,
        new: 1,
        byCefrLevel: { A1: 6, A2: 4, B1: 2 },
      },
      estimatedProficiency: 'A2',
      estimatedProficiencyLabel: 'Elementary',
      lastSessionAt: null,
      activeMinutes: 60,
      sessionsCount: 5,
    },
  ],
};

describe('VocabularyBrowserScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.setRoute('/progress/inventory', mockInventory);
  });

  it('renders subject section and CEFR breakdown', async () => {
    renderScreen(<VocabularyBrowserScreen />);
    await waitFor(() => screen.getByText('Spanish'));
    screen.getByText('A1');
    screen.getByText('6 words');
    screen.getByTestId('vocab-browser-back');
  });

  it('shows empty state when no vocabulary but has language subject', async () => {
    mockFetch.setRoute('/progress/inventory', {
      ...mockInventory,
      global: { ...mockInventory.global, vocabularyTotal: 0 },
      subjects: [
        {
          ...mockInventory.subjects[0],
          vocabulary: {
            total: 0,
            mastered: 0,
            learning: 0,
            new: 0,
            byCefrLevel: {},
          },
        },
      ],
    });
    renderScreen(<VocabularyBrowserScreen />);
    await waitFor(() => screen.getByTestId('vocab-browser-empty'));
  });

  it('shows no-language gate when no language subjects', async () => {
    mockFetch.setRoute('/progress/inventory', {
      ...mockInventory,
      global: { ...mockInventory.global, vocabularyTotal: 0 },
      subjects: [],
    });
    renderScreen(<VocabularyBrowserScreen />);
    await waitFor(() => screen.getByTestId('vocab-browser-no-language'));
  });

  it('shows error state with retry and back buttons', async () => {
    mockFetch.setRoute(
      '/progress/inventory',
      new Response(JSON.stringify({ error: 'Network error' }), { status: 500 }),
    );
    renderScreen(<VocabularyBrowserScreen />);
    await waitFor(() => screen.getByTestId('vocab-browser-error'));
  });

  it('shows new learner empty state when no vocab and < 4 sessions', async () => {
    mockFetch.setRoute('/progress/inventory', {
      ...mockInventory,
      global: {
        ...mockInventory.global,
        vocabularyTotal: 0,
        totalSessions: 2,
      },
      subjects: [
        {
          ...mockInventory.subjects[0],
          vocabulary: {
            total: 0,
            mastered: 0,
            learning: 0,
            new: 0,
            byCefrLevel: {},
          },
        },
      ],
    });
    renderScreen(<VocabularyBrowserScreen />);
    await waitFor(() => screen.getByTestId('vocab-browser-new-learner'));
    screen.getByText('Your vocabulary will grow here');
  });

  it('shows standard empty state when no vocab and >= 4 sessions', async () => {
    mockFetch.setRoute('/progress/inventory', {
      ...mockInventory,
      global: {
        ...mockInventory.global,
        vocabularyTotal: 0,
        totalSessions: 10,
      },
      subjects: [
        {
          ...mockInventory.subjects[0],
          vocabulary: {
            total: 0,
            mastered: 0,
            learning: 0,
            new: 0,
            byCefrLevel: {},
          },
        },
      ],
    });
    renderScreen(<VocabularyBrowserScreen />);
    await waitFor(() => screen.getByTestId('vocab-browser-empty'));
    expect(screen.queryByTestId('vocab-browser-new-learner')).toBeNull();
  });
});
