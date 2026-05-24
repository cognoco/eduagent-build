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
  // gc1-allow: wraps api-client fetch boundary — needs network stub in unit tests
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
  // gc1-allow: imports expo-router Router type; goBackOrReplace calls router.back which requires native navigation context
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

const mockPlatformAlert = jest.fn();
jest.mock('../../../lib/platform-alert', () => ({
  // gc1-allow: wraps RN Alert.alert and Platform.OS — requires native Alert shim unavailable in JSDOM
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

jest.mock('../../../lib/theme', () => ({
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    muted: '#94a3b8',
    primary: '#2563eb',
    textInverse: '#fff',
    textSecondary: '#888',
  }),
}));

let mockLaunchCameraResult: unknown = { canceled: true };

// Mock expo-image-picker — configurable for review request tests
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(() => Promise.resolve(mockLaunchCameraResult)),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('base64data'),
  EncodingType: { Base64: 'base64' },
}));

// DictationData context — valid session
const mockSetData = jest.fn();
const COMPLETION_KEY = '00000000-0000-4000-8000-000000000001';
const mockValidSession = {
  completionKey: COMPLETION_KEY,
  sentences: [{ text: 'The quick brown fox.' }],
  language: 'en',
  mode: 'surprise' as const,
};

jest.mock('./_layout', () => ({
  // gc1-allow: layout depends on expo-router Stack and native theme — cannot render in JSDOM
  useDictationData: () => ({
    data: mockValidSession,
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
    mockReviewMutateAsync.mockReset();
    mockReviewReset.mockReset();
    mockRecordMutateAsync.mockReset();
    mockLaunchCameraResult = { canceled: true };
    delete (global as any).__focusEffectCleanup;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renders the completion screen with valid session data', () => {
    const { getByTestId } = render(<DictationCompleteScreen />);
    getByTestId('dictation-complete-screen');
    getByTestId('complete-check-writing');
    getByTestId('complete-done');
  });

  it('[WI-84 DS-115] reuses the session completionKey when recording unreviewed results', async () => {
    mockRecordMutateAsync.mockResolvedValueOnce(undefined);
    const { getByTestId } = render(<DictationCompleteScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('complete-done'));
      await Promise.resolve();
    });

    expect(mockRecordMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        completionKey: COMPLETION_KEY,
        reviewed: false,
      }),
    );
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
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/practice',
    );
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

  it('[WI-78 DS-187] ignores an older review result after a retry starts', async () => {
    mockLaunchCameraResult = {
      canceled: false,
      assets: [{ uri: 'file://review.jpg', mimeType: 'image/jpeg' }],
    };
    let resolveFirst!: (v: unknown) => void;
    let resolveSecond!: (v: unknown) => void;
    mockReviewMutateAsync
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );

    const { getByTestId } = render(<DictationCompleteScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('complete-check-writing'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(getByTestId('complete-check-writing'));
      await Promise.resolve();
    });

    expect(mockReviewMutateAsync).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveFirst({ mistakeCount: 2, feedback: 'Old', mistakes: [] });
      await Promise.resolve();
    });

    expect(mockSetData).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      resolveSecond({ mistakeCount: 0, feedback: 'New', mistakes: [] });
      await Promise.resolve();
    });

    expect(mockSetData).toHaveBeenCalledTimes(1);
    expect(mockSetData).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewResult: expect.objectContaining({ feedback: 'New' }),
      }),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('[WI-78 review] abandons an older attempt before its review mutation starts', async () => {
    const imagePicker = require('expo-image-picker') as {
      launchCameraAsync: jest.Mock;
    };
    let resolveFirstCamera!: (value: unknown) => void;
    imagePicker.launchCameraAsync
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstCamera = resolve;
          }),
      )
      .mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file://second.jpg', mimeType: 'image/jpeg' }],
      });
    mockReviewMutateAsync.mockResolvedValueOnce({
      mistakeCount: 0,
      feedback: 'New',
      mistakes: [],
    });

    const { getByTestId } = render(<DictationCompleteScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('complete-check-writing'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(getByTestId('complete-check-writing'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockReviewMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstCamera({
        canceled: false,
        assets: [{ uri: 'file://first.jpg', mimeType: 'image/jpeg' }],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockReviewMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
