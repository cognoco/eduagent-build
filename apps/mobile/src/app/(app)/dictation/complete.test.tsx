import React from 'react';
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
  // useFocusEffect: call cb and capture the cleanup for blur simulation
  useFocusEffect: jest.fn((cb: () => (() => void) | void) => {
    const cleanup = cb();
    if (typeof cleanup === 'function') {
      (global as any).__focusEffectCleanup = cleanup;
    }
  }),
}));

const mockReviewMutateAsync = jest.fn();
const mockReviewReset = jest.fn();

const mockRecordMutateAsync = jest.fn();

// We build the mock hooks dynamically so we can control isPending per-test
let mockReviewIsPending = false;
let mockRecordIsPending = false;

jest.mock('../../../hooks/use-dictation-api', () => ({
  useReviewDictation: () => ({
    mutateAsync: mockReviewMutateAsync,
    isPending: mockReviewIsPending,
    reset: mockReviewReset,
  }),
  useRecordDictationResult: () => ({
    mutateAsync: mockRecordMutateAsync,
    isPending: mockRecordIsPending,
  }),
}));

const mockGoBackOrReplace = jest.fn();
jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

const mockPlatformAlert = jest.fn();
jest.mock('../../../lib/platform-alert', () => ({
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#94a3b8',
    primary: '#2563eb',
    textInverse: '#fff',
    textSecondary: '#888',
  }),
}));

// Mock expo-image-picker — not testing camera in unit tests
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('base64data'),
  EncodingType: { Base64: 'base64' },
}));

// DictationData context — valid session
const mockSetData = jest.fn();
const validSession = {
  sentences: [{ text: 'The quick brown fox.' }],
  language: 'en',
  mode: 'surprise' as const,
};

jest.mock('./_layout', () => ({
  useDictationData: () => ({
    data: validSession,
    setData: mockSetData,
    clear: jest.fn(),
  }),
}));

const DictationCompleteScreen = require('./complete')
  .default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DictationCompleteScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockReviewIsPending = false;
    mockRecordIsPending = false;
    delete (global as any).__focusEffectCleanup;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the completion screen with valid session data', () => {
    const { getByTestId } = render(<DictationCompleteScreen />);
    expect(getByTestId('dictation-complete-screen')).toBeTruthy();
    expect(getByTestId('complete-check-writing')).toBeTruthy();
    expect(getByTestId('complete-done')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // BUG-692: Cancel button during review mutation must not push to /review
  // -----------------------------------------------------------------------

  it('[BUG-692] does not push to /dictation/review after Cancel pressed mid-flight', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    mockReviewMutateAsync.mockReturnValueOnce(pending);

    // Render with isReviewing=true so Cancel button is visible
    mockReviewIsPending = true;
    const { getByTestId } = render(<DictationCompleteScreen />);

    // The Cancel button in the loading overlay navigates away and sets
    // reviewCancelledRef before the mutation resolves
    fireEvent.press(getByTestId('review-cancel'));

    // Now let the review mutation resolve
    await act(async () => {
      resolve({
        mistakeCount: 0,
        feedback: 'Great job!',
        mistakes: [],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Cancel already navigated via goBackOrReplace; push must NOT fire
    expect(mockGoBackOrReplace).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('[BUG-692] does not push to /dictation/review after screen blur mid-flight', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    mockReviewMutateAsync.mockReturnValueOnce(pending);

    render(<DictationCompleteScreen />);

    // Simulate screen blur by calling the useFocusEffect cleanup
    const cleanup = (global as any).__focusEffectCleanup;
    if (typeof cleanup === 'function') {
      cleanup();
    }

    // Now let the review mutation resolve
    await act(async () => {
      resolve({
        mistakeCount: 1,
        feedback: 'Almost!',
        mistakes: [],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // push must NOT fire because blur set reviewCancelledRef=true
    expect(mockPush).not.toHaveBeenCalled();
  });
});
