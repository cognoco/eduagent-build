import { waitFor } from '@testing-library/react-native';
import {
  renderScreen,
  cleanupScreen,
  ERROR_RESPONSES,
} from '../../../test-utils/screen-render';
import VocabularyBrowserScreen from './vocabulary';

const mockReplace = jest.fn();
const mockUseNavigationContract = jest.fn(() => ({
  canEnter: jest.fn<boolean, [string]>(() => true),
}));

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
        'progress.vocabulary.viewSubjectLabelNoSubject': 'View vocabulary',
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

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: mockReplace }),
}));
jest.mock(
  '../../../hooks/use-navigation-contract' /* gc1-allow: control surface — test toggles canEnter() to assert the redirect gate; real hook depends on the full app provider tree + native useParentProxy */,
  () => ({
    useNavigationContract: () => mockUseNavigationContract(),
    // The real useProgressInventory (now run unmocked) imports
    // useNavigationDataScopeContract from this same module. Under the test
    // default MODE_NAV_V1_ENABLED=false its return value is never read
    // (the scope falls back to activeProfile.id / legacy mode), so an empty
    // contract is sufficient to satisfy the import.
    useNavigationDataScopeContract: () => ({}),
  }),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

const mockInventory = {
  profileId: '990e8400-e29b-41d4-a716-446655440004',
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
      subjectId: '660e8400-e29b-41d4-a716-446655440001',
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

function inventoryRoute(data: unknown) {
  return { '/progress/inventory': data };
}

describe('VocabularyBrowserScreen', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    mockReplace.mockClear();
    mockUseNavigationContract.mockReturnValue({
      canEnter: jest.fn<boolean, [string]>(() => true),
    });
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('redirects to /(app)/progress when contract.canEnter("progress/vocabulary") is false', () => {
    const canEnterFalse = jest.fn<boolean, [string]>(
      (route) => route !== 'progress/vocabulary',
    );
    mockUseNavigationContract.mockReturnValue({
      canEnter: canEnterFalse,
    });
    active = renderScreen(<VocabularyBrowserScreen />, {
      routes: inventoryRoute(mockInventory),
    });
    expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
  });

  it('renders subject section and CEFR breakdown', async () => {
    active = renderScreen(<VocabularyBrowserScreen />, {
      routes: inventoryRoute(mockInventory),
    });
    await active.result.findByText('Spanish');
    active.result.getByText('A1');
    active.result.getByText('6 words');
    active.result.getByTestId('vocab-browser-back');
  });

  it('uses the no-subject accessibility label when the subject name is blank', async () => {
    active = renderScreen(<VocabularyBrowserScreen />, {
      routes: inventoryRoute({
        ...mockInventory,
        subjects: [{ ...mockInventory.subjects[0], subjectName: '   ' }],
      }),
    });

    await active.result.findByLabelText('View vocabulary');
  });

  it('shows empty state when no vocabulary but has language subject', async () => {
    active = renderScreen(<VocabularyBrowserScreen />, {
      routes: inventoryRoute({
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
      }),
    });
    await active.result.findByTestId('vocab-browser-empty');
  });

  it('shows no-language gate when no language subjects', async () => {
    active = renderScreen(<VocabularyBrowserScreen />, {
      routes: inventoryRoute({
        ...mockInventory,
        global: { ...mockInventory.global, vocabularyTotal: 0 },
        subjects: [],
      }),
    });
    await active.result.findByTestId('vocab-browser-no-language');
  });

  it('shows error state with retry and back buttons', async () => {
    active = renderScreen(<VocabularyBrowserScreen />, {
      routes: {
        '/progress/inventory': () => ERROR_RESPONSES.forbidden('Network error'),
      },
    });
    await waitFor(() => {
      active!.result.getByTestId('vocab-browser-error');
    });
  });

  it('shows new learner empty state when no vocab and < 4 sessions', async () => {
    active = renderScreen(<VocabularyBrowserScreen />, {
      routes: inventoryRoute({
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
      }),
    });
    await active.result.findByTestId('vocab-browser-new-learner');
    active.result.getByText('Your vocabulary will grow here');
  });

  it('shows standard empty state when no vocab and >= 4 sessions', async () => {
    active = renderScreen(<VocabularyBrowserScreen />, {
      routes: inventoryRoute({
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
      }),
    });
    await active.result.findByTestId('vocab-browser-empty');
    expect(active.result.queryByTestId('vocab-browser-new-learner')).toBeNull();
  });
});
