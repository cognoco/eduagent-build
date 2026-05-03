import { render, screen } from '@testing-library/react-native';
import { useProgressInventory } from '../../../hooks/use-progress';
import VocabularyBrowserScreen from './vocabulary';

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
