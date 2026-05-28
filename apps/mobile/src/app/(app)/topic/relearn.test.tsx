import {
  act,
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
let mockLinkedChildren: Array<{ id: string; displayName: string }> = [];

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

jest.mock(
  '../../../hooks/use-progress' /* gc1-allow: wraps api-client fetch boundary — needs network stub in unit tests */,
  () => ({
    useOverdueTopics: () => mockOverdueTopicsReturn,
  }),
);

jest.mock(
  '../../../hooks/use-retention' /* gc1-allow: wraps api-client fetch boundary — needs network stub in unit tests */,
  () => ({
    useStartRelearn: () => ({
      mutate: mockMutate,
      isPending: false,
    }),
    useTeachingPreference: () => mockTeachingPreferenceReturn,
  }),
);

jest.mock(
  '../../../hooks/use-parent-proxy' /* gc1-allow: wraps api-client fetch boundary — needs network stub in unit tests */,
  () => ({
    useParentProxy: () => ({ isParentProxy: mockIsParentProxy }),
  }),
);

jest.mock(
  '../../../hooks/use-navigation-contract' /* gc1-allow: screen test pins route-entry contract without the full app provider tree */,
  () => ({
    useNavigationContract: () => ({
      // V0 fallback in the screen layouts reads `isParentProxy` when
      // MODE_NAV_V1_ENABLED is off — keep it congruent so tests pass under
      // either flag value.
      isParentProxy: mockIsParentProxy,
      canEnter: () => !mockIsParentProxy,
      gates: {},
    }),
  }),
);

jest.mock('../../../lib/profile', () => ({
  ...jest.requireActual('../../../lib/profile'),
  useProfile: () => ({
    activeProfile: { id: 'owner-id', isOwner: true, birthYear: null },
  }),
  useLinkedChildren: () => mockLinkedChildren,
}));

jest.mock(
  '../../../lib/navigation' /* gc1-allow: imports expo-router Router type; goBackOrReplace calls router.back which requires native navigation context */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockBack(...args),
    homeHrefForReturnTo: (returnTo: string | undefined) =>
      returnTo === 'practice' ? '/(app)/practice' : '/(app)/home',
  }),
);

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
    mockLinkedChildren = [{ id: 'child-1', displayName: 'Ada' }];
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

  it('shows the source child name for parent-bridge direct entry', async () => {
    mockSearchParams = {
      topicId: 'topic-1',
      subjectId: 'sub-1',
      topicName: 'Algebra',
      subjectName: 'Math',
      source: 'parent_bridge',
      childProfileId: 'child-1',
    };

    render(<RelearnScreen />);

    await waitFor(() => {
      screen.getByTestId('relearn-method-phase');
    });

    screen.getByTestId('relearn-parent-bridge-header');
    screen.getByText("Added from Ada's learning.");
  });

  it('uses generic source copy when the bridge child is missing locally', async () => {
    mockSearchParams = {
      topicId: 'topic-1',
      subjectId: 'sub-1',
      topicName: 'Algebra',
      subjectName: 'Math',
      source: 'parent_bridge',
      childProfileId: 'deleted-child',
    };

    render(<RelearnScreen />);

    await waitFor(() => {
      screen.getByTestId('relearn-method-phase');
    });

    screen.getByText("Added from a child's learning.");
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

  it('returns to practice when launched from the practice hub', async () => {
    mockSearchParams = { returnTo: 'practice' };

    render(<RelearnScreen />);

    await waitFor(() => {
      screen.getByTestId('relearn-topics-phase');
    });

    fireEvent.press(screen.getByTestId('relearn-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
    expect(mockBack).not.toHaveBeenCalled();
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

  it('does not navigate when Cancel is pressed before relearn start succeeds', async () => {
    mockSearchParams = {
      topicId: 'topic-1',
      subjectId: 'sub-1',
      topicName: 'Algebra',
      subjectName: 'Math',
    };
    let capturedOnSuccess:
      | ((result: { sessionId: string; recap: string | null }) => void)
      | undefined;
    mockMutate.mockImplementation(
      (
        input: unknown,
        callbacks?: {
          onSuccess?: (result: {
            sessionId: string;
            recap: string | null;
          }) => void;
        },
      ) => {
        capturedOnSuccess = callbacks?.onSuccess;
      },
    );

    render(<RelearnScreen />);

    fireEvent.press(screen.getByTestId('relearn-method-visual_diagrams'));
    await waitFor(() => {
      screen.getByTestId('relearn-loading');
      screen.getByTestId('relearn-cancel');
    });

    fireEvent.press(screen.getByTestId('relearn-cancel'));
    screen.getByTestId('relearn-method-phase');

    act(() => {
      capturedOnSuccess?.({ sessionId: 'sess-1', recap: null });
    });

    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/session' }),
    );
    screen.getByTestId('relearn-method-phase');
  });

  it('does not show a stale error when Cancel is pressed before relearn start fails', async () => {
    mockSearchParams = {
      topicId: 'topic-1',
      subjectId: 'sub-1',
      topicName: 'Algebra',
      subjectName: 'Math',
    };
    let capturedOnError: ((err: unknown) => void) | undefined;
    mockMutate.mockImplementation(
      (
        input: unknown,
        callbacks?: {
          onError?: (err: unknown) => void;
        },
      ) => {
        capturedOnError = callbacks?.onError;
      },
    );

    render(<RelearnScreen />);

    fireEvent.press(screen.getByTestId('relearn-method-visual_diagrams'));
    await waitFor(() => {
      screen.getByTestId('relearn-loading');
      screen.getByTestId('relearn-cancel');
    });

    fireEvent.press(screen.getByTestId('relearn-cancel'));
    screen.getByTestId('relearn-method-phase');

    act(() => {
      capturedOnError?.(new Error('network failed after cancel'));
    });

    expect(screen.queryByTestId('relearn-error')).toBeNull();
    screen.getByTestId('relearn-method-phase');
  });

  it('resets cancellation when a new relearn start is attempted after Cancel', async () => {
    mockSearchParams = {
      topicId: 'topic-1',
      subjectId: 'sub-1',
      topicName: 'Algebra',
      subjectName: 'Math',
    };
    const capturedOnSuccesses: Array<
      | ((result: { sessionId: string; recap: string | null }) => void)
      | undefined
    > = [];
    mockMutate.mockImplementation(
      (
        input: unknown,
        callbacks?: {
          onSuccess?: (result: {
            sessionId: string;
            recap: string | null;
          }) => void;
        },
      ) => {
        capturedOnSuccesses.push(callbacks?.onSuccess);
      },
    );

    render(<RelearnScreen />);

    fireEvent.press(screen.getByTestId('relearn-method-visual_diagrams'));
    await waitFor(() => {
      screen.getByTestId('relearn-loading');
      screen.getByTestId('relearn-cancel');
    });

    fireEvent.press(screen.getByTestId('relearn-cancel'));
    screen.getByTestId('relearn-method-phase');

    act(() => {
      capturedOnSuccesses[0]?.({ sessionId: 'stale-sess', recap: null });
    });
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/session' }),
    );

    fireEvent.press(screen.getByTestId('relearn-method-visual_diagrams'));
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(2);
    });

    act(() => {
      capturedOnSuccesses[1]?.({ sessionId: 'sess-2', recap: null });
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        sessionId: 'sess-2',
        subjectId: 'sub-1',
        subjectName: 'Math',
        topicId: 'topic-1',
        topicName: 'Algebra',
        mode: 'relearn',
      },
    });
  });

  it('redirects in parent proxy mode', () => {
    mockIsParentProxy = true;

    render(<RelearnScreen />);

    expect(screen.queryByTestId('relearn-topics-phase')).toBeNull();
    expect(screen.queryByTestId('relearn-method-phase')).toBeNull();
  });
});
