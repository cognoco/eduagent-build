import { renderHook, act } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
import { useHomeworkOcr, NON_HOMEWORK_ERROR_MESSAGE } from './use-homework-ocr';

const mockFetch = jest.fn();
const mockTrackHomeworkOcrGateAccepted = jest.fn();
const mockTrackHomeworkOcrGateRejected = jest.fn();
const mockTrackHomeworkOcrGateShortcircuit = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({
    getToken: jest.fn().mockResolvedValue('test-token'),
  }),
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'profile-1' },
  }),
}));

jest.mock('../lib/api', () => ({
  getApiUrl: () => 'http://localhost:8787',
}));

jest.mock('../lib/analytics', () => ({
  trackHomeworkOcrGateAccepted: (...args: unknown[]) =>
    mockTrackHomeworkOcrGateAccepted(...args),
  trackHomeworkOcrGateRejected: (...args: unknown[]) =>
    mockTrackHomeworkOcrGateRejected(...args),
  trackHomeworkOcrGateShortcircuit: (...args: unknown[]) =>
    mockTrackHomeworkOcrGateShortcircuit(...args),
}));

// Simulate ML Kit native module being linked
NativeModules.TextRecognition = { recognize: jest.fn() };

const mockRecognize = jest.fn();
jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: {
    recognize: (...args: unknown[]) => mockRecognize(...args),
  },
}));

const mockManipulateAsync = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: 'jpeg' },
}));

const mockCopyAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  copyAsync: (...args: unknown[]) => mockCopyAsync(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockRecognize.mockReset();
  mockManipulateAsync.mockReset();
  mockManipulateAsync.mockResolvedValue({ uri: 'file:///cache/resized.jpg' });
  global.fetch = mockFetch as typeof fetch;
});

describe('useHomeworkOcr', () => {
  it('starts in idle status', () => {
    const { result } = renderHook(() => useHomeworkOcr());

    expect(result.current.status).toBe('idle');
    expect(result.current.text).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.failCount).toBe(0);
  });

  it('valid OCR text reaches status=done unchanged', async () => {
    mockRecognize.mockResolvedValue({ text: 'Solve for x: 2x + 5 = 13' });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('Solve for x: 2x + 5 = 13');
    expect(result.current.failCount).toBe(0);
    expect(mockTrackHomeworkOcrGateAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'local',
        tokens: expect.any(Number),
        words: expect.any(Number),
      }),
    );
  });

  it('copies image to stable cache path before processing', async () => {
    mockRecognize.mockResolvedValue({ text: 'Solve for x: 2x + 5 = 13' });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(mockCopyAsync).toHaveBeenCalledWith({
      from: 'file:///tmp/photo.jpg',
      to: expect.stringMatching(/^file:\/\/\/cache\/homework-\d+\.jpg$/),
    });
  });

  it('resizes cached image to 1600px width before OCR', async () => {
    mockRecognize.mockResolvedValue({ text: 'Solve for x: 2x + 5 = 13' });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(mockManipulateAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/cache\/homework-\d+\.jpg$/),
      [{ resize: { width: 1600 } }],
      { format: 'jpeg', compress: 0.9 },
    );
  });

  it('uses server vision OCR instead of a local non-homework dump', async () => {
    mockRecognize.mockResolvedValue({
      text: Array.from({ length: 130 }, (_, index) => `word${index}`).join(' '),
    });
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: '1. What is chasing you?\n2. What are you avoiding?',
          confidence: 0.88,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe(
      '1. What is chasing you?\n2. What are you avoiding?',
    );
    expect(mockTrackHomeworkOcrGateAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        confidence: 0.88,
      }),
    );
    expect(mockTrackHomeworkOcrGateRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'local',
      }),
    );
  });

  it('escalates short cue-less OCR fragments instead of accepting them as problems', async () => {
    mockRecognize.mockResolvedValue({
      text: 'Radissen\nCryiy\nan\nWhal',
      confidence: 0.9,
    });
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: [
            '1. What is chasing you',
            '2. What are you avoiding',
            '3. What do you want',
            '4. What feels dead',
            '5. What hurts',
            '6. What wants to live',
          ].join('\n'),
          confidence: 0.86,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.status).toBe('done');
    expect(result.current.text).toContain('1. What is chasing you');
    expect(result.current.text).not.toContain('Radissen');
    expect(mockTrackHomeworkOcrGateAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        confidence: 0.86,
      }),
    );
  });

  it('does not treat abbreviation periods as homework cues', async () => {
    mockRecognize.mockResolvedValue({
      text: 'Dr. Smith',
      confidence: 0.9,
    });
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: null, confidence: null }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: null, confidence: null }), {
          status: 200,
        }),
      );

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(
      "We couldn't read that clearly. Try taking the photo again with better lighting.",
    );
    expect(mockTrackHomeworkOcrGateShortcircuit).toHaveBeenCalledWith(
      expect.objectContaining({
        confidence: 0.9,
      }),
    );
  });

  it('does not call server OCR when local ML Kit reads clear homework', async () => {
    mockRecognize.mockResolvedValue({
      text: 'Solve for x: 2x + 5 = 13',
      confidence: 0.9,
    });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('Solve for x: 2x + 5 = 13');
    expect(mockRecognize).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockTrackHomeworkOcrGateAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'local',
      }),
    );
  });

  it('does not call server OCR before local OCR on a normal local success', async () => {
    mockRecognize.mockResolvedValue({
      text: 'What is chasing you',
      confidence: 0.9,
    });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('What is chasing you');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockTrackHomeworkOcrGateAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'local',
      }),
    );
  });

  it('falls back to server OCR when ML Kit returns no text', async () => {
    mockRecognize.mockResolvedValue({ text: '' });
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: 'Server-side OCR rescue text',
          confidence: 0.93,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('Server-side OCR rescue text');
    expect(mockTrackHomeworkOcrGateAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        confidence: 0.93,
      }),
    );
  });

  it('gate-reject on server OCR raises error phase', async () => {
    mockRecognize.mockResolvedValue({ text: '' });
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: 'Solve 2x + 5 = 13',
          confidence: 0.2,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(NON_HOMEWORK_ERROR_MESSAGE);
    expect(mockTrackHomeworkOcrGateRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        confidence: 0.2,
      }),
    );
    expect(mockTrackHomeworkOcrGateShortcircuit).not.toHaveBeenCalled();
  });

  it('falls back to server OCR when the native module is unavailable', async () => {
    const originalTextRecognition = NativeModules.TextRecognition;
    NativeModules.TextRecognition = null;
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ text: 'Uploaded OCR text', confidence: 0.89 }),
        {
          status: 200,
        },
      ),
    );

    const { result } = renderHook(() => useHomeworkOcr());

    try {
      await act(async () => {
        await result.current.process('file:///tmp/photo.jpg');
      });

      expect(result.current.status).toBe('done');
      expect(result.current.text).toBe('Uploaded OCR text');
    } finally {
      NativeModules.TextRecognition = originalTextRecognition;
    }
  });

  it('handles ML Kit exception as error when server fallback also fails', async () => {
    mockRecognize.mockRejectedValue(new Error('ML Kit crash'));
    mockFetch.mockRejectedValueOnce(new Error('server down'));

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(
      "We couldn't read that clearly. Try taking the photo again with better lighting.",
    );
  });

  it('retry() does NOT reset failCount', async () => {
    mockRecognize
      .mockResolvedValueOnce({
        text: Array.from({ length: 130 }, () => 'word').join(' '),
      })
      .mockResolvedValueOnce({
        text: Array.from({ length: 130 }, () => 'word').join(' '),
      });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });
    expect(result.current.failCount).toBe(1);

    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.failCount).toBe(2);
  });

  it('process(newUri) DOES reset failCount', async () => {
    mockRecognize
      .mockResolvedValueOnce({
        text: Array.from({ length: 130 }, () => 'word').join(' '),
      })
      .mockResolvedValueOnce({ text: 'What is new text found' });

    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.process('file:///tmp/photo1.jpg');
    });
    expect(result.current.failCount).toBe(1);

    await act(async () => {
      await result.current.process('file:///tmp/photo2.jpg');
    });
    expect(result.current.failCount).toBe(0);
    expect(result.current.text).toBe('What is new text found');
  });

  it('retry() is a no-op when no image has been processed', async () => {
    const { result } = renderHook(() => useHomeworkOcr());

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.status).toBe('idle');
    expect(mockRecognize).not.toHaveBeenCalled();
  });

  // [BUG-681 / I-16] Break tests: cancel() must cause an in-flight OCR to
  // abandon its result so the hook never transitions to 'done' or 'error'
  // after a deliberate cancel. Without these guards, a slow ML Kit call
  // completing after the user dismissed the screen would re-render stale
  // text and could re-open a modal the user explicitly closed.

  it('cancel() during native recognizeText drops the late result and stays idle [BUG-681]', async () => {
    // Build a deferred recognizeText so we can resolve it AFTER cancel.
    let resolveRecognize: (value: { text: string }) => void = () => undefined;
    const recognizePromise = new Promise<{ text: string }>((resolve) => {
      resolveRecognize = resolve;
    });
    mockRecognize.mockReturnValue(recognizePromise);

    const { result } = renderHook(() => useHomeworkOcr());

    // Kick off the OCR run — do NOT await; it suspends inside recognizeText.
    // Note: process() awaits copyToCache first, then calls runOcr. Drain
    // microtasks until the hook is actually inside the recognizeText await.
    let processPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      processPromise = result.current.process('file:///tmp/photo.jpg');
      // Flush copyToCache + runOcr setup so cancelRef points at the active controller.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Sanity: recognizeText is in flight, status is 'processing'.
    expect(mockRecognize).toHaveBeenCalled();
    expect(result.current.status).toBe('processing');

    // Cancel before recognizeText resolves.
    act(() => {
      result.current.cancel();
    });
    expect(result.current.status).toBe('idle');

    // Now resolve the slow native call with a "valid" result — must be ignored.
    await act(async () => {
      resolveRecognize({ text: 'Solve for x: 2x + 5 = 13' });
      await processPromise;
    });

    // Late result is discarded — cancel's idle wins.
    expect(result.current.status).toBe('idle');
    expect(result.current.text).toBeNull();
    // Gate analytics must NOT fire — late result was dropped before gating ran.
    expect(mockTrackHomeworkOcrGateAccepted).not.toHaveBeenCalled();
    expect(mockTrackHomeworkOcrGateRejected).not.toHaveBeenCalled();
  });

  it('cancel() forwards abort into the server OCR fetch [BUG-681]', async () => {
    // Local OCR returns no text → triggers server fallback path.
    mockRecognize.mockResolvedValue({ text: null });

    let capturedSignal: AbortSignal | undefined;
    let resolveFetch: (value: unknown) => void = () => undefined;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    mockFetch.mockImplementation(
      (_url: string, init: { signal?: AbortSignal }) => {
        capturedSignal = init.signal;
        return fetchPromise;
      },
    );

    const { result } = renderHook(() => useHomeworkOcr());

    let processPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      processPromise = result.current.process('file:///tmp/photo.jpg');
      // Drain microtasks until fetch is issued.
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal!.aborted).toBe(false);

    // Cancel — the signal we passed to fetch must transition to aborted.
    act(() => {
      result.current.cancel();
    });
    expect(capturedSignal!.aborted).toBe(true);

    // Resolve the (in real life: aborted) fetch so the hook can finish.
    await act(async () => {
      resolveFetch({ ok: false, status: 0 });
      await processPromise;
    });

    // No transition to 'done' or 'error' — cancel suppressed the result.
    expect(result.current.status).toBe('idle');
    expect(result.current.text).toBeNull();
  });
});
