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

jest.mock(
  '../../../hooks/use-dictation-api' /* gc1-allow: wraps api-client fetch boundary — needs network stub in unit tests */,
  () => ({
    useReviewDictation: () => ({
      mutateAsync: mockReviewMutateAsync,
      isPending: mockReviewIsPending,
      reset: mockReviewReset,
    }),
    useRecordDictationResult: () => ({
      mutateAsync: mockRecordMutateAsync,
      isPending: mockRecordIsPending,
    }),
  }),
);

const mockGoBackOrReplace = jest.fn();
jest.mock(
  '../../../lib/navigation' /* gc1-allow: imports expo-router Router type; goBackOrReplace calls router.back which requires native navigation context */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: wraps RN Alert.alert and Platform.OS — requires native Alert shim unavailable in JSDOM */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

const mockFormatApiError = jest.fn((err: unknown) =>
  err instanceof Error ? `classified:${err.message}` : 'classified:unknown',
);
jest.mock(
  '../../../lib/format-api-error' /* gc1-allow: format-api-error calls i18next which requires expo-localization/async-storage init unavailable in jest */,
  () => ({
    formatApiError: (err: unknown) => mockFormatApiError(err),
  }),
);

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      muted: '#94a3b8',
      primary: '#2563eb',
      textInverse: '#fff',
      textSecondary: '#888',
    }),
  }),
);

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

// DictationData context — configurable per-test
const mockSetData = jest.fn();
const COMPLETION_KEY = '00000000-0000-4000-8000-000000000001';
const defaultSession = {
  completionKey: COMPLETION_KEY,
  sentences: [{ text: 'The quick brown fox.' }],
  language: 'en',
  mode: 'surprise' as const,
};
// mutable so individual tests can override to null (missing-context state)
let mockSessionData: typeof defaultSession | null = defaultSession;

jest.mock(
  './_layout' /* gc1-allow: layout depends on expo-router Stack and native theme — cannot render in JSDOM */,
  () => ({
    useDictationData: () => ({
      get data() {
        return mockSessionData;
      },
      setData: mockSetData,
      clear: jest.fn(),
    }),
  }),
);

const DictationCompleteScreen = require('./complete')
  .default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DictationCompleteScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // jest.clearAllMocks() clears call records but NOT mockReturnValueOnce
    // queues.  Reset the mutation mocks explicitly so an unconsumed
    // mockReturnValueOnce from a prior test cannot leak into the next one
    // (e.g. BUG-692 blur test leaves pending resolved via resolve() but
    // the mockReturnValueOnce was never consumed).
    mockReviewMutateAsync.mockReset();
    mockRecordMutateAsync.mockReset();
    jest.useFakeTimers();
    mockReviewIsPending = false;
    mockRecordIsPending = false;
    mockReviewReset.mockReset();
    mockSessionData = defaultSession;
    mockLaunchCameraResult = { canceled: true };
    delete (global as any).__focusEffectCleanup;
    // Restore default implementations that jest.clearAllMocks() wipes.
    const picker = require('expo-image-picker');
    (picker.launchCameraAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve(mockLaunchCameraResult),
    );
    const fs = require('expo-file-system/legacy');
    (fs.readAsStringAsync as jest.Mock).mockResolvedValue('base64data');
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

  // -----------------------------------------------------------------------
  // [DICT-06] Missing-context guard: data=null must NOT POST /dictation/result
  // -----------------------------------------------------------------------

  it('[DICT-06 F-020] missing-context renders dictation-complete-missing-data without POSTing result', () => {
    // Simulate landing on /dictation/complete via deep-link or back gesture
    // with no active session (data=null). The screen must show the recovery
    // state and must NOT call recordResult.mutateAsync (which would POST a
    // fake 0-sentence entry to the user's history).
    mockSessionData = null;

    const { getByTestId } = render(<DictationCompleteScreen />);

    getByTestId('dictation-complete-missing-data');
    expect(mockRecordMutateAsync).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // [DICT-06] complete-done POST payload: sentenceCount must be included
  // -----------------------------------------------------------------------

  it('[DICT-06] complete-done posts sentenceCount matching the session sentences', async () => {
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
        sentenceCount: 1, // defaultSession has 1 sentence
      }),
    );
  });

  // -----------------------------------------------------------------------
  // [DICT-06] Review spinner visible and cancel navigates away
  // -----------------------------------------------------------------------

  it('[DICT-06] shows review spinner (ActivityIndicator) while isReviewing=true', () => {
    // The check-writing overlay renders while the review mutation is in flight.
    // We confirm the cancel button is visible (overlaid on the spinner state).
    mockReviewIsPending = true;

    const { getByTestId } = render(<DictationCompleteScreen />);

    // The cancel button is inside the reviewing overlay — its presence
    // confirms the spinner UI is rendered.
    getByTestId('review-cancel');
    // The primary "done" / "check writing" buttons must NOT be visible.
    expect(
      (() => {
        try {
          getByTestId('complete-done');
          return true;
        } catch {
          return false;
        }
      })(),
    ).toBe(false);
  });

  it('[DICT-06] review-cancel navigates to practice via goBackOrReplace', () => {
    // Cancel during the check-writing spinner must call goBackOrReplace so
    // the back stack is preserved (not hard-replaced) when the user has a
    // navigation history above practice.
    mockReviewIsPending = true;

    const { getByTestId } = render(<DictationCompleteScreen />);

    fireEvent.press(getByTestId('review-cancel'));

    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/practice',
    );
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

  it('[WI-78 DS-187] blocks duplicate review while the first attempt is in flight', async () => {
    mockLaunchCameraResult = {
      canceled: false,
      assets: [{ uri: 'file://review.jpg', mimeType: 'image/jpeg' }],
    };
    let resolveFirst!: (v: unknown) => void;
    mockReviewMutateAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
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

    expect(mockReviewMutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ mistakeCount: 0, feedback: 'Only', mistakes: [] });
      await Promise.resolve();
    });

    expect(mockSetData).toHaveBeenCalledTimes(1);
    expect(mockSetData).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewResult: expect.objectContaining({ feedback: 'Only' }),
      }),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('[WI-78 review] blocks duplicate attempts before the first review mutation starts', async () => {
    const imagePicker = require('expo-image-picker') as {
      launchCameraAsync: jest.Mock;
    };
    let resolveFirstCamera!: (value: unknown) => void;
    imagePicker.launchCameraAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstCamera = resolve;
        }),
    );
    mockReviewMutateAsync.mockResolvedValueOnce({
      mistakeCount: 0,
      feedback: 'First',
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

    expect(imagePicker.launchCameraAsync).toHaveBeenCalledTimes(1);
    expect(mockReviewMutateAsync).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

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

  it('[WI-78 review] suppresses stale camera errors after screen blur', async () => {
    const imagePicker = require('expo-image-picker') as {
      launchCameraAsync: jest.Mock;
    };
    let rejectCamera!: (reason?: unknown) => void;
    imagePicker.launchCameraAsync.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectCamera = reject;
        }),
    );

    const { getByTestId } = render(<DictationCompleteScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('complete-check-writing'));
      await Promise.resolve();
    });

    const cleanup = (global as any).__focusEffectCleanup;
    if (typeof cleanup === 'function') {
      cleanup();
    }

    await act(async () => {
      rejectCamera(new Error('camera rejected late'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPlatformAlert).not.toHaveBeenCalled();
  });

  it('[WI-78 review] suppresses stale photo read errors after screen blur', async () => {
    mockLaunchCameraResult = {
      canceled: false,
      assets: [{ uri: 'file://review.jpg', mimeType: 'image/jpeg' }],
    };
    const fs = require('expo-file-system/legacy') as {
      readAsStringAsync: jest.Mock;
    };
    let rejectRead!: (reason?: unknown) => void;
    fs.readAsStringAsync.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRead = reject;
        }),
    );

    const { getByTestId } = render(<DictationCompleteScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('complete-check-writing'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const cleanup = (global as any).__focusEffectCleanup;
    if (typeof cleanup === 'function') {
      cleanup();
    }

    await act(async () => {
      rejectRead(new Error('read rejected late'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPlatformAlert).not.toHaveBeenCalled();
  });

  it('[WI-78 review] does not navigate when review resolves after timeout', async () => {
    mockLaunchCameraResult = {
      canceled: false,
      assets: [{ uri: 'file://review.jpg', mimeType: 'image/jpeg' }],
    };
    let resolveReview!: (v: unknown) => void;
    mockReviewMutateAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReview = resolve;
      }),
    );

    const { getByTestId, rerender } = render(<DictationCompleteScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('complete-check-writing'));
      await Promise.resolve();
      await Promise.resolve();
    });

    mockReviewIsPending = true;
    rerender(<DictationCompleteScreen />);

    act(() => {
      jest.advanceTimersByTime(20_000);
    });

    await act(async () => {
      resolveReview({ mistakeCount: 0, feedback: 'Late', mistakes: [] });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSetData).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // BUG-612: 20s review timeout must set reviewCancelledRef so a late
  // successful response does not push to /dictation/review.
  // -----------------------------------------------------------------------

  it('[BUG-612] late review response after timeout does not push to /review', async () => {
    // Arm an unresolved promise that simulates an in-flight review request.
    // We control resolution below so the guard in handleCheckWriting can
    // be checked at the exact moment we choose.
    let resolveReview!: (v: unknown) => void;
    const pendingReview = new Promise((r) => {
      resolveReview = r;
    });

    const picker = require('expo-image-picker');
    (picker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpg', mimeType: 'image/jpeg' }],
    });

    // mutateAsync returns the pending promise and never auto-resolves.
    // Use a synchronous mock so that mutateAsync() RETURNS the promise
    // immediately but does NOT use Promise.resolve() internally — this
    // prevents act() from flushing the resolution through its microtask
    // drain loop.
    mockReviewMutateAsync.mockImplementation(() => pendingReview);

    // Render in the non-reviewing state so the Check button is visible.
    mockReviewIsPending = false;
    const { getByTestId, rerender, queryByTestId } = render(
      <DictationCompleteScreen />,
    );

    // Kick off the review. We use synchronous act so React processes the
    // press synchronously (fires the event, queues effects) but does NOT
    // drain the microtask queue beyond what React needs for synchronous
    // state/effect work.  handleCheckWriting() begins executing — camera
    // resolves (it's a microtask), then FileSystem resolves, then
    // mutateAsync() is called, which returns pendingReview.  The async
    // function suspends at `await pendingReview` and does NOT proceed to
    // the guard check.
    act(() => {
      fireEvent.press(getByTestId('complete-check-writing'));
    });

    // Give the microtask pipeline (camera + FS mocks) time to run so
    // mutateAsync is actually called before we assert anything.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Simulate React Query flipping isPending=true: arm the 20-second timeout
    // useEffect.
    mockReviewIsPending = true;
    act(() => {
      rerender(<DictationCompleteScreen />);
    });

    // The timeout useEffect ran; advance past 20s so it fires.
    act(() => {
      jest.advanceTimersByTime(21_000);
    });

    // Flush the state update from setReviewTimedOut(true).
    await act(async () => {
      await Promise.resolve();
    });

    // Sanity check: the timeout UI is visible (timer fired, reviewTimedOut=true).
    expect(queryByTestId('review-timeout-error')).not.toBeNull();

    // Now the late response arrives.  reviewCancelledRef.current must be
    // true (set by the timeout callback) so the guard suppresses navigation.
    await act(async () => {
      resolveReview({
        mistakeCount: 0,
        feedback: 'Great job!',
        mistakes: [],
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The guard must have fired and blocked push.
    expect(mockPush).not.toHaveBeenCalledWith('/(app)/dictation/review');
  });

  it('[BUG-612] review-timeout-error UI appears after 20s', async () => {
    // Render in reviewing state so the timeout useEffect arms immediately.
    mockReviewIsPending = true;
    const { queryByTestId } = render(<DictationCompleteScreen />);

    // Before timeout the error banner must not be visible.
    expect(queryByTestId('review-timeout-error')).toBeNull();

    // Fire the 20-second timeout.
    act(() => {
      jest.advanceTimersByTime(21_000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // After timeout the error banner must be visible.
    expect(queryByTestId('review-timeout-error')).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // [F-110] Error classification boundary — screens must not bypass classifyApiError
  // -----------------------------------------------------------------------

  it('[F-110] routes review error through formatApiError boundary, not raw instanceof check', async () => {
    const reviewErr = new Error('Network timeout');
    const picker = require('expo-image-picker');
    (picker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpg', mimeType: 'image/jpeg' }],
    });
    mockReviewMutateAsync.mockRejectedValueOnce(reviewErr);

    const { getByTestId } = render(<DictationCompleteScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('complete-check-writing'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFormatApiError).toHaveBeenCalledWith(reviewErr);
    expect(mockPlatformAlert).toHaveBeenCalledWith(
      expect.any(String),
      'classified:Network timeout',
      expect.any(Array),
    );
  });

  it('[F-110] routes record-result error through formatApiError boundary, not raw instanceof check', async () => {
    const recordErr = new Error('Server unavailable');
    mockRecordMutateAsync.mockRejectedValueOnce(recordErr);

    const { getByTestId } = render(<DictationCompleteScreen />);
    fireEvent.press(getByTestId('complete-done'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFormatApiError).toHaveBeenCalledWith(recordErr);
    expect(mockPlatformAlert).toHaveBeenCalledWith(
      expect.any(String),
      'classified:Server unavailable',
      expect.any(Array),
    );
  });
});
