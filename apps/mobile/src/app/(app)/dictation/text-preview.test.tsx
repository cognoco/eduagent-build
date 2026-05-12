import { render, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({ ocrText: undefined }),
}));

const mockPrepareMutateAsync = jest.fn();
const mockPrepareReset = jest.fn();
let mockPrepareIsPending = false;

jest.mock('../../../hooks/use-dictation-api', () => ({
  usePrepareHomework: () => ({
    mutateAsync: mockPrepareMutateAsync,
    isPending: mockPrepareIsPending,
    reset: mockPrepareReset,
  }),
  useGenerateDictation: () => ({
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
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    textPrimary: '#fff',
    textSecondary: '#888',
    primary: '#2563eb',
    accent: '#00bfa5',
  }),
}));

const TextPreviewScreen = require('./text-preview')
  .default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TextPreviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockPrepareIsPending = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders text input and start button', () => {
    const { getByTestId } = render(<TextPreviewScreen />);
    getByTestId('dictation-text-preview-screen');
    getByTestId('text-preview-input');
    getByTestId('text-preview-start');
  });

  it('calls prepareMutation when Start is pressed with text', async () => {
    mockPrepareMutateAsync.mockResolvedValueOnce({
      sentences: [{ text: 'Hello.' }],
      language: 'en',
    });

    const { getByTestId } = render(<TextPreviewScreen />);

    fireEvent.changeText(getByTestId('text-preview-input'), 'Hello world.');

    await act(async () => {
      fireEvent.press(getByTestId('text-preview-start'));
    });

    expect(mockPrepareMutateAsync).toHaveBeenCalledWith({
      text: 'Hello world.',
    });
  });

  // -----------------------------------------------------------------------
  // BUG-692: back arrow during mutation must not push to playback
  // -----------------------------------------------------------------------

  it('[BUG-692] does not push to playback after back arrow pressed mid-flight', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    mockPrepareMutateAsync.mockReturnValueOnce(pending);

    const { getByTestId } = render(<TextPreviewScreen />);

    // Enter text and start the mutation
    fireEvent.changeText(getByTestId('text-preview-input'), 'Some text here.');
    fireEvent.press(getByTestId('text-preview-start'));

    // Press back arrow while mutation is in flight
    fireEvent.press(getByTestId('text-preview-back'));

    // Now let the mutation resolve
    await act(async () => {
      resolve({
        sentences: [{ text: 'Some text here.' }],
        language: 'en',
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
    mockPrepareMutateAsync.mockReturnValueOnce(pending);

    // Render with isPending=true so Cancel button is visible
    mockPrepareIsPending = true;
    const { getByTestId } = render(<TextPreviewScreen />);

    // Enter text and press start
    fireEvent.changeText(getByTestId('text-preview-input'), 'Some text here.');

    // Press Cancel
    fireEvent.press(getByTestId('text-preview-cancel'));

    // Resolve the mutation
    await act(async () => {
      resolve({
        sentences: [{ text: 'Some text here.' }],
        language: 'en',
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
    mockPrepareMutateAsync.mockReturnValueOnce(pending);

    const { getByTestId } = render(<TextPreviewScreen />);

    // Enter text and start the mutation
    fireEvent.changeText(getByTestId('text-preview-input'), 'Some text here.');
    fireEvent.press(getByTestId('text-preview-start'));

    // Advance past the 20s timeout
    act(() => {
      jest.advanceTimersByTime(21_000);
    });

    // Response arrives after timeout
    await act(async () => {
      resolve({
        sentences: [{ text: 'Some text here.' }],
        language: 'en',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The timeout set prepareCancelledRef; push must be blocked
    expect(mockPush).not.toHaveBeenCalled();
  });
});
