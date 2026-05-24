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

// [WI-269] Per-test override for route params so we can simulate Expo Router
// returning `string[]` when the same query key appears more than once in the
// URL (e.g. a crafted deep link with duplicate ocrText params).
let mockOcrTextParam: string | string[] | undefined = undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({ ocrText: mockOcrTextParam }),
}));

const mockPrepareMutateAsync = jest.fn();
const mockPrepareReset = jest.fn();
let mockPrepareIsPending = false;

jest.mock('../../../hooks/use-dictation-api', () => ({
  // gc1-allow: wraps api-client fetch boundary — needs network stub in unit tests
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
  // gc1-allow: layout depends on expo-router Stack and native theme — cannot render in JSDOM
  useDictationData: () => ({
    data: null,
    setData: mockSetData,
    clear: jest.fn(),
  }),
}));

const mockGoBackOrReplace = jest.fn();
jest.mock('../../../lib/navigation', () => ({
  // gc1-allow: imports expo-router Router type; goBackOrReplace calls router.back which requires native navigation context
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

jest.mock('../../../lib/platform-alert', () => ({
  // gc1-allow: wraps RN Alert.alert and Platform.OS — requires native Alert shim unavailable in JSDOM
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
    mockOcrTextParam = undefined;
  });

  afterEach(() => {
    jest.clearAllTimers();
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
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/dictation',
    );
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

  // -----------------------------------------------------------------------
  // [WI-269 / DS-180] Duplicate `ocrText` deep-link param must not crash.
  //
  // Expo Router returns `string | string[]` when the same query key appears
  // multiple times in the URL. Pre-fix, the screen used `ocrText` directly as
  // a string, and the render path's `text.trim()` (button disabled state +
  // class name) threw "text.trim is not a function" on array input — a
  // client-side denial of the dictation preview screen via a crafted deep
  // link. Wrap params with `firstParam` so the screen receives a single
  // string regardless of how the deep link was constructed.
  // -----------------------------------------------------------------------

  it('[WI-269] does not crash and seeds the input from the first array element when ocrText arrives as string[]', () => {
    mockOcrTextParam = ['first deep-linked text', 'second'];

    const { getByTestId } = render(<TextPreviewScreen />);

    const input = getByTestId('text-preview-input');
    // Pre-fix, render itself threw because `(['first', 'second']).trim()`
    // ran in the disabled-state expression. The render-without-throw is the
    // primary assertion; the seeded value is a secondary correctness check.
    expect(input.props.value).toBe('first deep-linked text');
  });

  it('[WI-269] uses firstParam normalised value for the subtitle photo-vs-manual conditional', () => {
    // Ensures both render-path callsites pull from the normalised value
    // rather than the raw param — i.e. the subtitle treats array input as a
    // present value (subtitleFromPhoto), not undefined/empty.
    mockOcrTextParam = ['from-photo'];

    const { queryByText } = render(<TextPreviewScreen />);

    // i18n is initialised against the real English catalog in test-setup.ts,
    // so query by the rendered English strings (not the raw keys).
    expect(
      queryByText(
        'Edit any mistakes from the photo, then start your dictation.',
      ),
    ).toBeTruthy();
    expect(
      queryByText('Review your text, then start your dictation.'),
    ).toBeNull();
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
