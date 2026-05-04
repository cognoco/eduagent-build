import { render, screen } from '@testing-library/react-native';
import { useProgressInventory } from '../../../hooks/use-progress';
import VocabularyBrowserScreen from './vocabulary';

jest.mock('react-i18next', () => ({
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

jest.mock('../../../hooks/use-progress');
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

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
    (useProgressInventory as jest.Mock).mockReturnValue({
      data: mockInventory,
      isLoading: false,
      isError: false,
    });
  });

  it('renders subject section and CEFR breakdown', () => {
    render(<VocabularyBrowserScreen />);
    screen.getByText('Spanish');
    screen.getByText('A1');
    screen.getByText('6 words');
    screen.getByTestId('vocab-browser-back');
  });

  it('shows empty state when no vocabulary but has language subject', () => {
    (useProgressInventory as jest.Mock).mockReturnValue({
      data: {
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
      },
      isLoading: false,
      isError: false,
    });
    render(<VocabularyBrowserScreen />);
    screen.getByTestId('vocab-browser-empty');
  });

  it('shows no-language gate when no language subjects', () => {
    (useProgressInventory as jest.Mock).mockReturnValue({
      data: {
        ...mockInventory,
        global: { ...mockInventory.global, vocabularyTotal: 0 },
        subjects: [],
      },
      isLoading: false,
      isError: false,
    });
    render(<VocabularyBrowserScreen />);
    screen.getByTestId('vocab-browser-no-language');
  });

  it('shows error state with retry and back buttons', () => {
    (useProgressInventory as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: jest.fn(),
    });
    render(<VocabularyBrowserScreen />);
    screen.getByTestId('vocab-browser-error');
  });

  it('shows new learner empty state when no vocab and < 4 sessions', () => {
    (useProgressInventory as jest.Mock).mockReturnValue({
      data: {
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
      },
      isLoading: false,
      isError: false,
    });
    render(<VocabularyBrowserScreen />);
    screen.getByTestId('vocab-browser-new-learner');
    screen.getByText('Your vocabulary will grow here');
  });

  it('shows standard empty state when no vocab and >= 4 sessions', () => {
    (useProgressInventory as jest.Mock).mockReturnValue({
      data: {
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
      },
      isLoading: false,
      isError: false,
    });
    render(<VocabularyBrowserScreen />);
    screen.getByTestId('vocab-browser-empty');
    expect(screen.queryByTestId('vocab-browser-new-learner')).toBeNull();
  });
});
