import { render, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

const mockGenerateMutateAsync = jest.fn();
const mockGenerateReset = jest.fn();
let mockGenerateIsPending = false;

jest.mock('../../../hooks/use-dictation-api', () => ({
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

jest.mock('./_layout', () => ({
  useDictationData: () => ({
    data: null,
    setData: mockSetData,
    clear: jest.fn(),
  }),
}));

const mockGoBackOrReplace = jest.fn();
jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

jest.mock('../../../lib/platform-alert', () => ({
  platformAlert: jest.fn(),
}));

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    textPrimary: '#fff',
    primary: '#2563eb',
    accent: '#00bfa5',
  }),
}));

jest.mock('../../../lib/format-api-error', () => ({
  formatApiError: (err: unknown) =>
    err instanceof Error ? err.message : 'Unknown error',
}));

jest.mock('../../../components/home/IntentCard', () => ({
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
    jest.useFakeTimers();
    mockGenerateIsPending = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders choice cards', () => {
    const { getByTestId } = render(<DictationChoiceScreen />);
    expect(getByTestId('dictation-homework')).toBeTruthy();
    expect(getByTestId('dictation-surprise')).toBeTruthy();
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
    expect(mockGoBackOrReplace).toHaveBeenCalled();
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
});
