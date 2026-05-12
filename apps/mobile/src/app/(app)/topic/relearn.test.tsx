import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockMutate = jest.fn();
const mockRefetch = jest.fn();

let mockSearchParams: Record<string, string> = {};
let mockOverdueTopicsReturn: Record<string, unknown> = {};
let mockTeachingPreferenceReturn: Record<string, unknown> = {};
let mockIsParentProxy = false;

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../hooks/use-progress', () => ({
  useOverdueTopics: () => mockOverdueTopicsReturn,
}));

jest.mock('../../../hooks/use-retention', () => ({
  useStartRelearn: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useTeachingPreference: () => mockTeachingPreferenceReturn,
}));

jest.mock('../../../hooks/use-parent-proxy', () => ({
  useParentProxy: () => ({ isParentProxy: mockIsParentProxy }),
}));

jest.mock('../../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'owner-id', isOwner: true, birthYear: null },
  }),
}));

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockBack(...args),
  homeHrefForReturnTo: (returnTo: string | undefined) =>
    returnTo === 'learner-home' ? '/(app)/home' : '/(app)/home',
}));

const RelearnScreen = require('./relearn').default;

function makeOverdueData(totalOverdue = 4) {
  return {
    totalOverdue,
    subjects: [
      {
        subjectId: 'sub-1',
        subjectName: 'Math',
        overdueCount: totalOverdue > 10 ? 6 : 2,
        topics: [
          {
            topicId: 'topic-1',
            topicTitle: 'Algebra',
            overdueDays: 3,
            failureCount: 1,
          },
          {
            topicId: 'topic-2',
            topicTitle: 'Fractions',
            overdueDays: 1,
            failureCount: 0,
          },
        ],
      },
      {
        subjectId: 'sub-2',
        subjectName: 'Science',
        overdueCount: totalOverdue > 10 ? 5 : 2,
        topics: [
          {
            topicId: 'topic-3',
            topicTitle: 'Cells',
            overdueDays: 4,
            failureCount: 2,
          },
          {
            topicId: 'topic-4',
            topicTitle: 'Atoms',
            overdueDays: 2,
            failureCount: 0,
          },
        ],
      },
    ],
  };
}

describe('RelearnScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockIsParentProxy = false;
    mockOverdueTopicsReturn = {
      data: makeOverdueData(),
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    mockTeachingPreferenceReturn = {
      data: {
        subjectId: 'sub-1',
        method: 'visual_diagrams',
        analogyDomain: null,
        nativeLanguage: null,
      },
    };
  });

  it('renders a subject picker when more than 10 topics are overdue across subjects', async () => {
    mockOverdueTopicsReturn = {
      data: makeOverdueData(11),
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };

    render(<RelearnScreen />);

    await waitFor(() => {
      screen.getByTestId('relearn-subjects-phase');
    });

    screen.getByTestId('relearn-subject-sub-1');
    screen.getByTestId('relearn-subject-sub-2');
  });

  it('renders a flat grouped topic list when 10 or fewer topics are overdue', async () => {
    render(<RelearnScreen />);

    await waitFor(() => {
      screen.getByTestId('relearn-topics-phase');
    });

    screen.getByTestId('relearn-topic-topic-1');
    screen.getByTestId('relearn-topic-topic-3');
  });

  it('skips straight to the method phase for direct topic entry', async () => {
    mockSearchParams = {
      topicId: 'topic-1',
      subjectId: 'sub-1',
      topicName: 'Algebra',
      subjectName: 'Math',
    };

    render(<RelearnScreen />);

    await waitFor(() => {
      screen.getByTestId('relearn-method-phase');
    });

    screen.getByTestId('relearn-method-visual_diagrams');
    screen.getByText('Usual method');
  });

  it('moves from the topic phase to the method phase when a topic is selected', async () => {
    render(<RelearnScreen />);

    await waitFor(() => {
      screen.getByTestId('relearn-topics-phase');
    });

    fireEvent.press(screen.getByTestId('relearn-topic-topic-1'));

    await waitFor(() => {
      screen.getByTestId('relearn-method-phase');
    });
  });

  it('starts relearn and navigates to session with recap', async () => {
    mockSearchParams = {
      topicId: 'topic-1',
      subjectId: 'sub-1',
      topicName: 'Algebra',
      subjectName: 'Math',
      returnTo: 'learner-home',
    };
    mockMutate.mockImplementation(
      (
        input: unknown,
        callbacks?: {
          onSuccess?: (result: {
            sessionId: string;
            recap: string | null;
          }) => void;
          onSettled?: () => void;
        },
      ) => {
        callbacks?.onSuccess?.({
          sessionId: 'sess-1',
          recap: 'You reviewed variables and equations.',
        });
        callbacks?.onSettled?.();
      },
    );

    render(<RelearnScreen />);

    fireEvent.press(screen.getByTestId('relearn-method-visual_diagrams'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { topicId: 'topic-1', method: 'same' },
        expect.any(Object),
      );
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          sessionId: 'sess-1',
          subjectId: 'sub-1',
          subjectName: 'Math',
          topicId: 'topic-1',
          topicName: 'Algebra',
          mode: 'relearn',
          recap: 'You reviewed variables and equations.',
          returnTo: 'learner-home',
        },
      });
    });
  });

  it('goes back from method phase to topics phase', async () => {
    render(<RelearnScreen />);

    await waitFor(() => {
      screen.getByTestId('relearn-topics-phase');
    });

    fireEvent.press(screen.getByTestId('relearn-topic-topic-1'));
    await waitFor(() => {
      screen.getByTestId('relearn-method-phase');
    });

    fireEvent.press(screen.getByTestId('relearn-back'));

    await waitFor(() => {
      screen.getByTestId('relearn-topics-phase');
    });
  });

  it('goes back from topics phase to subjects phase when the subject picker was used', async () => {
    mockOverdueTopicsReturn = {
      data: makeOverdueData(11),
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };

    render(<RelearnScreen />);

    await waitFor(() => {
      screen.getByTestId('relearn-subjects-phase');
    });

    fireEvent.press(screen.getByTestId('relearn-subject-sub-1'));
    await waitFor(() => {
      screen.getByTestId('relearn-topics-phase');
    });

    fireEvent.press(screen.getByTestId('relearn-back'));

    await waitFor(() => {
      screen.getByTestId('relearn-subjects-phase');
    });
  });

  it('renders a fetch error state and retries', async () => {
    mockOverdueTopicsReturn = {
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    };

    render(<RelearnScreen />);

    screen.getByTestId('relearn-overdue-error');
    fireEvent.press(screen.getByTestId('relearn-overdue-retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('renders an empty state when there are no overdue topics', async () => {
    mockOverdueTopicsReturn = {
      data: { totalOverdue: 0, subjects: [] },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };

    render(<RelearnScreen />);

    await waitFor(() => {
      screen.getByTestId('relearn-empty-state');
    });
  });

  it('redirects in parent proxy mode', () => {
    mockIsParentProxy = true;

    render(<RelearnScreen />);

    expect(screen.queryByTestId('relearn-topics-phase')).toBeNull();
    expect(screen.queryByTestId('relearn-method-phase')).toBeNull();
  });
});
