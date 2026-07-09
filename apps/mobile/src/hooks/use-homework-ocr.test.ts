import { renderHook, act } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
import { useHomeworkOcr } from './use-homework-ocr';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';

const mockFetch = jest.fn();
const mockTrackHomeworkOcrGateAccepted = jest.fn();
const mockTrackHomeworkOcrGateRejected = jest.fn();
const mockTrackHomeworkOcrGateShortcircuit = jest.fn();
const formDataGlobal = global as typeof globalThis & {
  FormData: typeof FormData;
};
const originalFormData = formDataGlobal.FormData;

class MockFormData {
  private readonly parts: Array<[string, unknown]> = [];

  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
}

// @clerk/expo is a third-party auth SDK — cannot run without native
// Clerk runtime. The global test-setup mock covers most cases; this local
// override narrows getToken to a deterministic resolved value for OCR tests.
jest.mock('@clerk/expo', () => ({
  // gc1-allow: external-boundary
  useAuth: () => ({
    getToken: jest.fn().mockResolvedValue('test-token'),
  }),
}));

// Use requireActual so all pure helpers (hashProfileId, bucketAccountAge, track,
// etc.) stay real. Only the three gate-telemetry functions are overridden with
// jest.fn() so assertions can verify they were called with the correct payload.
// Sentry.addBreadcrumb is globally stubbed in test-setup.ts, so the real
// implementations run safely without any network or native dependency.
jest.mock(
  '../lib/analytics' /* gc1-allow: pattern-a conversion; analytics is a side-effect boundary — real calls hit external telemetry */,
  () => {
    const actual = jest.requireActual(
      '../lib/analytics',
    ) as typeof import('../lib/analytics');
    return {
      ...actual,
      trackHomeworkOcrGateAccepted: (...args: unknown[]) =>
        mockTrackHomeworkOcrGateAccepted(...args),
      trackHomeworkOcrGateRejected: (...args: unknown[]) =>
        mockTrackHomeworkOcrGateRejected(...args),
      trackHomeworkOcrGateShortcircuit: (...args: unknown[]) =>
        mockTrackHomeworkOcrGateShortcircuit(...args),
    };
  },
);

// ML Kit TextRecognition requires a native module (JNI / ObjC) that is not
// available in the Jest runtime — shim the default export so recognizeText()
// can be controlled per-test via mockRecognize.
jest.mock('@react-native-ml-kit/text-recognition', () => ({
  // gc1-allow: native-boundary
  __esModule: true,
  default: {
    recognize: (...args: unknown[]) => mockRecognize(...args),
  },
}));

// expo-image-manipulator wraps native image processing APIs (CGImageDestination
// on iOS, BitmapFactory on Android) that have no JSVM equivalent.
jest.mock('expo-image-manipulator', () => ({
  // gc1-allow: native-boundary
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: 'jpeg' },
}));

// expo-file-system/legacy wraps the native file system APIs (NSFileManager /
// java.io.File) that are not available in the Jest runtime.
jest.mock('expo-file-system/legacy', () => ({
  // gc1-allow: native-boundary
  cacheDirectory: 'file:///cache/',
  copyAsync: (...args: unknown[]) => mockCopyAsync(...args),
}));

// Simulate ML Kit native module being linked
NativeModules.TextRecognition = { recognize: jest.fn() };

const mockRecognize = jest.fn();
const mockManipulateAsync = jest.fn();
const mockCopyAsync = jest.fn().mockResolvedValue(undefined);

function createWrapper() {
  return createHookWrapper({
    activeProfile: createTestProfile({ id: 'profile-1' }),
  }).wrapper;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockRecognize.mockReset();
  mockManipulateAsync.mockReset();
  mockManipulateAsync.mockResolvedValue({ uri: 'file:///cache/resized.jpg' });
  mockCopyAsync.mockResolvedValue(undefined);
  formDataGlobal.FormData = MockFormData as unknown as typeof FormData;
  global.fetch = mockFetch as typeof fetch;
});

afterAll(() => {
  formDataGlobal.FormData = originalFormData;
});

describe('useHomeworkOcr', () => {
  it('starts in idle status', () => {
    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.text).toBeNull();
    expect(result.current.source).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.failCount).toBe(0);
  });

  it('valid OCR text reaches status=done unchanged', async () => {
    mockRecognize.mockResolvedValue({ text: 'Solve for x: 2x + 5 = 13' });

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('Solve for x: 2x + 5 = 13');
    expect(result.current.source).toBe('local');
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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe(
      '1. What is chasing you?\n2. What are you avoiding?',
    );
    expect(result.current.source).toBe('server');
    expect(mockTrackHomeworkOcrGateAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        confidence: 0.88,
      }),
    );
    // The fixture is 130 "wordN" tokens with no strong homework cue, so the
    // stricter gate now short-circuits the local result and escalates to the
    // server directly — without first running isLikelyHomework. The shortcircuit
    // analytics event fires instead of the "rejected as local" event.
    expect(mockTrackHomeworkOcrGateShortcircuit).toHaveBeenCalled();
  });

  // Regression test for handwriting garble shipped from a real device:
  // the photo was a numbered list ("1. What is chasing you / 2. What are
  // you avoiding / ...") on Radisson BLU letterhead. ML Kit returned 8
  // lines of confident garble containing an embedded digit "608" inside
  // "Shob608rgg". Before the gate-tightening fix, the embedded digit
  // satisfied the loose /\d/ check in hasStrongHomeworkCue, so the gate
  // accepted the garble and never called the server LLM. The user saw
  // the garbled text rendered as homework problems.
  it('escalates ML Kit garble with embedded digit (long output, no real homework cue)', async () => {
    const garble = [
      'Rad',
      'meol bs',
      'Homo mino Shob608rgg',
      'cnbejol liog',
      '&iOs hodet',
      'BLU',
      'RADISSON',
      'MEET INGS',
    ].join('\n');
    mockRecognize.mockResolvedValue({ text: garble });
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: [
            '1. What is chasing you',
            '2. What are you avoiding',
            '3. What do you want',
          ].join('\n'),
          confidence: 0.9,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.status).toBe('done');
    expect(result.current.text).toContain('What is chasing you');
    expect(result.current.source).toBe('server');
    expect(result.current.text).not.toContain('Shob608rgg');
    expect(result.current.text).not.toContain('RADISSON');
  });

  it('escalates handwriting garble to the server and accepts the LLM read', async () => {
    mockRecognize.mockResolvedValue({ text: 'how Rad meol 5 bs Homo mino' });
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: 'Translate: "I like to learn."',
          confidence: 0.9,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/note.jpg');
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('Translate: "I like to learn."');
    expect(result.current.source).toBe('server');
  });

  it('accepts a short server read of free-form notes without the old homework-gate rejection', async () => {
    mockRecognize.mockResolvedValue({ text: '' });
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: 'Photosynthesis notes.',
          confidence: 0.9,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/note.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.errorCode).toBeUndefined();
    expect(result.current.text).toBe('Photosynthesis notes.');
    expect(result.current.source).toBe('server');
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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.status).toBe('done');
    expect(result.current.text).toContain('1. What is chasing you');
    expect(result.current.source).toBe('server');
    expect(result.current.text).not.toContain('Radissen');
    expect(mockTrackHomeworkOcrGateAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        confidence: 0.86,
      }),
    );
  });

  it('escalates numbered local OCR fragments when numbering is the only cue', async () => {
    mockRecognize.mockResolvedValue({
      text: '1. Radissen\n2. Cryiy\nan\nWhal',
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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('done');
    expect(result.current.text).toContain('1. What is chasing you');
    expect(result.current.source).toBe('server');
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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('Solve for x: 2x + 5 = 13');
    expect(result.current.source).toBe('local');
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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('What is chasing you');
    expect(result.current.source).toBe('local');
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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('Server-side OCR rescue text');
    expect(result.current.source).toBe('server');
    expect(mockTrackHomeworkOcrGateAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        confidence: 0.93,
      }),
    );
  });

  it('accepts low-confidence server OCR instead of re-running the homework gate', async () => {
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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.text).toBe('Solve 2x + 5 = 13');
    expect(result.current.source).toBe('server');
    expect(mockTrackHomeworkOcrGateAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        confidence: 0.2,
      }),
    );
    expect(mockTrackHomeworkOcrGateRejected).not.toHaveBeenCalled();
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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    try {
      await act(async () => {
        await result.current.process('file:///tmp/photo.jpg');
      });

      expect(result.current.status).toBe('done');
      expect(result.current.text).toBe('Uploaded OCR text');
      expect(result.current.source).toBe('server');
    } finally {
      NativeModules.TextRecognition = originalTextRecognition;
    }
  });

  it('handles ML Kit exception as error when server fallback also fails (NetworkError surfaces specific copy)', async () => {
    // mockFetch rejecting becomes a typed NetworkError inside
    // fetchOrThrowNetworkError. tryServerFallback now classifies that to the
    // 'NETWORK_ERROR' outcome with offline-specific copy, instead of being
    // flattened to the generic LOW_QUALITY "couldn't read clearly" message.
    mockRecognize.mockRejectedValue(new Error('ML Kit crash'));
    mockFetch.mockRejectedValueOnce(new Error('server down'));

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.process('file:///tmp/photo.jpg');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('NETWORK_ERROR');
    expect(result.current.error).toBe(
      "Looks like you're offline. Check your connection and try again.",
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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

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
    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

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

    const { result } = renderHook(() => useHomeworkOcr(), {
      wrapper: createWrapper(),
    });

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
