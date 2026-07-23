import { render, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockBack = jest.fn();
let mockReturnTo: string | undefined;
let mockPracticeReturnTo: string | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const ReactReq = jest.requireActual<typeof import('react')>('react');
    ReactReq.useEffect(() => callback(), [callback]);
  },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    dismissTo: mockDismissTo,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({
    returnTo: mockReturnTo,
    practiceReturnTo: mockPracticeReturnTo,
  }),
}));

const mockGenerateMutateAsync = jest.fn();
const mockGenerateReset = jest.fn();
let mockGenerateIsPending = false;

jest.mock('../../../hooks/use-dictation-api', () => ({
  ...jest.requireActual('../../../hooks/use-dictation-api'),
  useGenerateDictation: () => ({
    mutateAsync: mockGenerateMutateAsync,
    isPending: mockGenerateIsPending,
    reset: mockGenerateReset,
  }),
  usePrepareHomework: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
    reset: jest.fn(),
  }),
}));

const mockSetData = jest.fn();

jest.mock(
  './_layout' /* gc1-allow: native-boundary; _layout transitively loads expo-router Stack and native theme — cannot render in JSDOM */,
  () => ({
    ...jest.requireActual('./_layout'),
    useDictationData: () => ({
      data: null,
      setData: mockSetData,
      clear: jest.fn(),
    }),
  }),
);

const mockGoBackOrReplace = jest.fn();
jest.mock(
  '../../../lib/navigation' /* gc1-allow: imports expo-router Router type; goBackOrReplace calls router.back which requires native navigation context */,
  () => ({
    ...jest.requireActual('../../../lib/navigation'),
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
    PRACTICE_HREF: '/(app)/practice',
  }),
);

jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: wraps RN Alert.alert and Platform.OS — requires native Alert shim unavailable in JSDOM */,
  () => ({
    ...jest.requireActual('../../../lib/platform-alert'),
    platformAlert: jest.fn(),
  }),
);

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      textPrimary: '#fff',
      primary: '#2563eb',
      accent: '#00bfa5',
    }),
  }),
);

jest.mock('../../../components/home/IntentCard', () => ({
  ...jest.requireActual('../../../components/home/IntentCard'),
  IntentCard: ({
    title,
    onPress,
    testID,
  }: {
    title: string;
    onPress: () => void;
    testID?: string;
  }) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return (
      <Pressable onPress={onPress} testID={testID ?? `intent-${title}`}>
        <Text>{title}</Text>
      </Pressable>
    );
  },
}));

const DictationChoiceScreen = require('./index').default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DictationChoiceScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateMutateAsync.mockReset();
    mockGenerateReset.mockReset();
    jest.useFakeTimers();
    mockGenerateIsPending = false;
    mockReturnTo = undefined;
    mockPracticeReturnTo = undefined;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('renders choice cards', () => {
    const { getByTestId } = render(<DictationChoiceScreen />);
    getByTestId('dictation-homework');
    getByTestId('dictation-surprise');
  });

  it('uses the native back stack when no explicit return destination is present', () => {
    const { getByTestId } = render(<DictationChoiceScreen />);

    fireEvent.press(getByTestId('dictation-choice-back'));

    // goBackOrReplace pops the dictation entry when canGoBack, preserving the
    // practice screen's existing params (returnTo, etc.) — the prior
    // router.replace(PRACTICE_HREF) regressed cross-tab back chain by
    // remounting practice without params.
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/practice',
    );
  });

  it('[WI-1864] navigates to the sibling Practice tab when opened from the Practice hub', () => {
    mockReturnTo = 'practice';
    mockCanGoBack.mockReturnValue(true);
    const { getByTestId } = render(<DictationChoiceScreen />);

    fireEvent.press(getByTestId('dictation-choice-back'));

    expect(mockNavigate).toHaveBeenCalledWith('/(app)/practice');
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();
  });

  it('[WI-1864] restores the Practice tab upstream return destination', () => {
    mockReturnTo = 'practice';
    mockPracticeReturnTo = 'journal';
    const { getByTestId } = render(<DictationChoiceScreen />);

    fireEvent.press(getByTestId('dictation-choice-back'));

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/(app)/practice',
      params: { returnTo: 'journal' },
    });
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it('[WI-1864] consumes Android hardware Back and navigates to the sibling Practice tab', () => {
    const { BackHandler } = jest.requireActual(
      'react-native',
    ) as typeof import('react-native');
    const listenerSpy = jest.spyOn(BackHandler, 'addEventListener');
    mockReturnTo = 'practice';

    render(<DictationChoiceScreen />);

    const calls = listenerSpy.mock.calls.filter(
      ([event]) => event === 'hardwareBackPress',
    );
    const handler = calls[calls.length - 1]?.[1] as (() => boolean) | undefined;
    expect(handler).toBeDefined();

    const consumed = handler!();

    expect(consumed).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/practice');
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();
  });

  it('calls generateMutation when Surprise Me is pressed', async () => {
    mockGenerateMutateAsync.mockResolvedValueOnce({
      sentences: [{ text: 'Hello world.' }],
      language: 'en',
      title: 'Test',
      topic: 'test',
    });

    const { getByTestId } = render(<DictationChoiceScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('dictation-surprise'));
    });

    expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // BUG-692: back arrow during mutation must not push to playback
  // -----------------------------------------------------------------------

  it('[BUG-692] does not push to playback after back arrow pressed mid-flight', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    mockGenerateMutateAsync.mockReturnValueOnce(pending);

    const { getByTestId } = render(<DictationChoiceScreen />);

    // Trigger the mutation
    fireEvent.press(getByTestId('dictation-surprise'));

    // Press back arrow while mutation is in flight
    fireEvent.press(getByTestId('dictation-choice-back'));

    // Now let the mutation resolve with a successful result
    await act(async () => {
      resolve({
        sentences: [{ text: 'Hello world.' }],
        language: 'en',
        title: 'Test',
        topic: 'test',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // goBackOrReplace was called by the back button
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/practice',
    );
    // push to playback must NOT have been called
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('[BUG-692] does not push to playback after Cancel button pressed mid-flight', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    mockGenerateMutateAsync.mockReturnValueOnce(pending);

    // Render with isPending=true so Cancel button is visible
    mockGenerateIsPending = true;
    const { getByTestId } = render(<DictationChoiceScreen />);

    // Press Cancel (visible because isPending=true)
    fireEvent.press(getByTestId('dictation-loading-cancel'));

    // Resolve the mutation
    await act(async () => {
      resolve({
        sentences: [{ text: 'Hello world.' }],
        language: 'en',
        title: 'Test',
        topic: 'test',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('[BUG-692] does not push to playback when 20s timeout fires before response arrives', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    mockGenerateMutateAsync.mockReturnValueOnce(pending);

    const { getByTestId } = render(<DictationChoiceScreen />);

    // Trigger the mutation
    fireEvent.press(getByTestId('dictation-surprise'));

    // Advance past the 20s timeout — this sets generateCancelledRef.current=true
    act(() => {
      jest.advanceTimersByTime(21_000);
    });

    // Now the response arrives after timeout
    await act(async () => {
      resolve({
        sentences: [{ text: 'Hello world.' }],
        language: 'en',
        title: 'Test',
        topic: 'test',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The timeout set cancelledRef; push must be blocked
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('[DICT-03] Surprise Me success: setData receives full payload and router pushes to playback', async () => {
    // Verify the complete data handoff: completionKey (UUID v4), sentences,
    // language, title, topic, mode='surprise' — and that playback is then
    // opened via router.push.
    mockGenerateMutateAsync.mockResolvedValueOnce({
      sentences: [{ text: 'Die Katze sitzt auf der Matte.' }],
      language: 'de',
      title: 'German dictation',
      topic: 'animals',
    });

    const { getByTestId } = render(<DictationChoiceScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('dictation-surprise'));
      await Promise.resolve();
    });

    // Flush the setTimeout(0) that defers router.push
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockSetData).toHaveBeenCalledTimes(1);
    const payload = mockSetData.mock.calls[0][0] as Record<string, unknown>;
    // completionKey must be a UUID v4 (randomUUID output)
    expect(typeof payload.completionKey).toBe('string');
    expect((payload.completionKey as string).length).toBeGreaterThan(0);
    expect(payload.sentences).toEqual([
      { text: 'Die Katze sitzt auf der Matte.' },
    ]);
    expect(payload.language).toBe('de');
    expect(payload.title).toBe('German dictation');
    expect(payload.topic).toBe('animals');
    expect(payload.mode).toBe('surprise');

    expect(mockPush).toHaveBeenCalledWith('/(app)/dictation/playback');
  });

  it('[WI-78 DS-178] blocks duplicate generation while the first attempt is in flight', async () => {
    let resolveFirst!: (v: unknown) => void;
    mockGenerateMutateAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );

    const { getByTestId } = render(<DictationChoiceScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('dictation-surprise'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(getByTestId('dictation-surprise'));
      await Promise.resolve();
    });

    expect(mockGenerateMutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({
        sentences: [{ text: 'Only prompt.' }],
        language: 'en',
        title: 'Only',
        topic: 'only',
      });
      await Promise.resolve();
    });
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockSetData).toHaveBeenCalledTimes(1);
    expect(mockSetData).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Only', topic: 'only' }),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
