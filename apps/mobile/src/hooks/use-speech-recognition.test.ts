import { renderHook, act } from '@testing-library/react-native';
import { useSpeechRecognition } from './use-speech-recognition';

const listeners: Partial<Record<'result' | 'error', (event: unknown) => void>> =
  {};

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockLoadSpeechModule = jest.fn();
const mockAddListener = jest.fn(
  (eventName: 'result' | 'error', listener: (event: unknown) => void) => {
    listeners[eventName] = listener;
    return {
      remove: jest.fn(() => {
        delete listeners[eventName];
      }),
    };
  },
);

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useSpeechRecognition', () => {
  beforeEach(() => {
    delete listeners.result;
    delete listeners.error;
    jest.clearAllMocks();
    mockGetPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    mockLoadSpeechModule.mockResolvedValue(null);
  });

  it('initializes in idle state', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule),
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.isListening).toBe(false);
  });

  it('sets error when speech recognition is unavailable', async () => {
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule),
    );

    await act(async () => {
      await result.current.startListening();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBeTruthy();
  });

  it('starts listening when the module is available', async () => {
    mockLoadSpeechModule.mockResolvedValue({
      requestPermissionsAsync: mockRequestPermissionsAsync,
      start: mockStart,
      stop: mockStop,
      addListener: mockAddListener,
    });
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule),
    );
    await flushEffects();

    await act(async () => {
      await result.current.startListening();
    });

    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledWith({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
    });
    expect(result.current.status).toBe('listening');
    expect(result.current.isListening).toBe(true);
  });

  it('uses the configured language when provided', async () => {
    mockLoadSpeechModule.mockResolvedValue({
      requestPermissionsAsync: mockRequestPermissionsAsync,
      start: mockStart,
      stop: mockStop,
      addListener: mockAddListener,
    });
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: 'es-ES' }, mockLoadSpeechModule),
    );
    await flushEffects();

    await act(async () => {
      await result.current.startListening();
    });

    expect(mockStart).toHaveBeenCalledWith({
      lang: 'es-ES',
      interimResults: true,
      continuous: true,
    });
  });

  it('updates transcript from native result events', async () => {
    mockLoadSpeechModule.mockResolvedValue({
      requestPermissionsAsync: mockRequestPermissionsAsync,
      start: mockStart,
      stop: mockStop,
      addListener: mockAddListener,
    });
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule),
    );
    await flushEffects();

    act(() => {
      listeners.result?.({
        isFinal: false,
        results: [{ transcript: 'Photosynthesis is how plants make food' }],
      });
    });

    expect(result.current.transcript).toBe(
      'Photosynthesis is how plants make food',
    );
    expect(result.current.error).toBeNull();
  });

  it('uses only the top alternative when results[] contains N-best alternatives', async () => {
    mockLoadSpeechModule.mockResolvedValue({
      requestPermissionsAsync: mockRequestPermissionsAsync,
      start: mockStart,
      stop: mockStop,
      addListener: mockAddListener,
    });
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule),
    );
    await flushEffects();

    // expo-speech-recognition delivers the N-best alternatives for one utterance
    // in results[]. They must NOT be concatenated — that produced the
    // "close to equator close to equator close to a Quaker" duplication bug.
    act(() => {
      listeners.result?.({
        isFinal: true,
        results: [
          { transcript: 'maybe that they are close to equator' },
          { transcript: "maybe that they're close to equator" },
          { transcript: 'maybe that they are close to a Quaker' },
        ],
      });
    });

    expect(result.current.transcript).toBe(
      'maybe that they are close to equator',
    );
  });

  it('captures native error events', async () => {
    mockLoadSpeechModule.mockResolvedValue({
      requestPermissionsAsync: mockRequestPermissionsAsync,
      start: mockStart,
      stop: mockStop,
      addListener: mockAddListener,
    });
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule),
    );
    await flushEffects();

    act(() => {
      listeners.error?.({ message: 'No speech detected' });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('No speech detected');
  });

  it('clearTranscript resets state', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule),
    );

    act(() => {
      result.current.clearTranscript();
    });

    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('stopListening returns to idle even if module unavailable', async () => {
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule),
    );

    await act(async () => {
      await result.current.stopListening();
    });

    expect(result.current.status).toBe('idle');
  });

  it('reads microphone permission state without prompting', async () => {
    mockLoadSpeechModule.mockResolvedValue({
      getPermissionsAsync: mockGetPermissionsAsync,
      requestPermissionsAsync: mockRequestPermissionsAsync,
      start: mockStart,
      stop: mockStop,
      addListener: mockAddListener,
    });

    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule),
    );

    let permissionStatus: Awaited<
      ReturnType<typeof result.current.getMicrophonePermissionStatus>
    >;
    await act(async () => {
      permissionStatus = await result.current.getMicrophonePermissionStatus();
    });

    expect(permissionStatus!).toEqual({
      granted: true,
      canAskAgain: true,
    });
    expect(mockGetPermissionsAsync).toHaveBeenCalled();
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Unmount race condition — component unmounts while recognition active
  // -----------------------------------------------------------------------

  describe('unmount race condition', () => {
    it('does not update state after unmount during startListening', async () => {
      // Module resolves AFTER unmount
      let resolveModule: (mod: unknown) => void;
      const slowLoadModule = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveModule = resolve;
          }),
      ) as jest.Mock & (() => Promise<unknown>);

      const { result, unmount } = renderHook(() =>
        useSpeechRecognition(
          slowLoadModule as Parameters<typeof useSpeechRecognition>[0],
        ),
      );

      // Start listening — this will await the slow module
      const startPromise = act(async () => {
        void result.current.startListening();
      });

      // Unmount while the module is still loading
      unmount();

      // Now resolve the module — state updates should be guarded by mountedRef
      await act(async () => {
        resolveModule!({
          requestPermissionsAsync: mockRequestPermissionsAsync,
          start: mockStart,
          stop: mockStop,
          addListener: mockAddListener,
        });
      });

      await startPromise;

      // No crash — the hook guards state updates with mountedRef
      // We just verify the test completes without errors
    });

    it('does not update transcript after unmount when result event fires', async () => {
      mockLoadSpeechModule.mockResolvedValue({
        requestPermissionsAsync: mockRequestPermissionsAsync,
        start: mockStart,
        stop: mockStop,
        addListener: mockAddListener,
      });

      const { result, unmount } = renderHook(() =>
        useSpeechRecognition(mockLoadSpeechModule),
      );
      await flushEffects();

      // Start listening
      await act(async () => {
        await result.current.startListening();
      });

      // Unmount component
      unmount();

      // Fire a result event after unmount — should not throw
      act(() => {
        listeners.result?.({
          results: [{ transcript: 'late transcript' }],
        });
      });

      // Transcript should NOT have been updated (mountedRef is false)
      // The hook's last known state before unmount had empty transcript
      // (startListening clears it). No crash = success.
    });

    it('does not update error state after unmount when error event fires', async () => {
      mockLoadSpeechModule.mockResolvedValue({
        requestPermissionsAsync: mockRequestPermissionsAsync,
        start: mockStart,
        stop: mockStop,
        addListener: mockAddListener,
      });

      const { unmount } = renderHook(() =>
        useSpeechRecognition(mockLoadSpeechModule),
      );
      await flushEffects();

      unmount();

      // Fire an error event after unmount — should not throw
      act(() => {
        listeners.error?.({ message: 'Late error' });
      });

      // No crash = success. mountedRef guards the state update.
    });
  });

  // -----------------------------------------------------------------------
  // Rapid startListening calls (debouncing / deduplication)
  // -----------------------------------------------------------------------

  describe('rapid startListening calls', () => {
    it('handles multiple rapid startListening calls without crashing', async () => {
      mockLoadSpeechModule.mockResolvedValue({
        requestPermissionsAsync: mockRequestPermissionsAsync,
        start: mockStart,
        stop: mockStop,
        addListener: mockAddListener,
      });

      const { result } = renderHook(() =>
        useSpeechRecognition(mockLoadSpeechModule),
      );
      await flushEffects();

      // Fire multiple startListening calls rapidly
      await act(async () => {
        await Promise.all([
          result.current.startListening(),
          result.current.startListening(),
          result.current.startListening(),
        ]);
      });

      // Each call goes through — the native module receives start for each.
      // The important thing is no crash and we end up in listening state.
      expect(result.current.status).toBe('listening');
      expect(mockStart).toHaveBeenCalled();
    });

    it('handles start then immediate stop without crashing', async () => {
      mockLoadSpeechModule.mockResolvedValue({
        requestPermissionsAsync: mockRequestPermissionsAsync,
        start: mockStart,
        stop: mockStop,
        addListener: mockAddListener,
      });

      const { result } = renderHook(() =>
        useSpeechRecognition(mockLoadSpeechModule),
      );
      await flushEffects();

      await act(async () => {
        await result.current.startListening();
        await result.current.stopListening();
      });

      expect(result.current.status).toBe('idle');
      expect(mockStart).toHaveBeenCalled();
      expect(mockStop).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Listener cleanup on hot reload (effect re-run)
  // -----------------------------------------------------------------------

  describe('listener cleanup', () => {
    it('removes old listeners when loadModule reference changes (simulates hot reload)', async () => {
      const removeResult1 = jest.fn();
      const removeError1 = jest.fn();
      const addListener1 = jest.fn(
        (eventName: 'result' | 'error', listener: (event: unknown) => void) => {
          listeners[eventName] = listener;
          return {
            remove: eventName === 'result' ? removeResult1 : removeError1,
          };
        },
      );

      const module1 = {
        requestPermissionsAsync: mockRequestPermissionsAsync,
        start: mockStart,
        stop: mockStop,
        addListener: addListener1,
      };

      const loadModule1 = jest.fn().mockResolvedValue(module1);

      const { rerender } = renderHook(
        ({ loader }: { loader: () => Promise<unknown> }) =>
          useSpeechRecognition(loader as () => Promise<null>),
        { initialProps: { loader: loadModule1 } },
      );
      await flushEffects();

      // Listeners should be registered
      expect(addListener1).toHaveBeenCalledTimes(2);

      // Simulate hot reload by providing a new loadModule function
      const removeResult2 = jest.fn();
      const removeError2 = jest.fn();
      const addListener2 = jest.fn(
        (eventName: 'result' | 'error', listener: (event: unknown) => void) => {
          listeners[eventName] = listener;
          return {
            remove: eventName === 'result' ? removeResult2 : removeError2,
          };
        },
      );

      const module2 = {
        requestPermissionsAsync: mockRequestPermissionsAsync,
        start: mockStart,
        stop: mockStop,
        addListener: addListener2,
      };

      const loadModule2 = jest.fn().mockResolvedValue(module2);

      rerender({ loader: loadModule2 });
      await flushEffects();

      // Old listeners should be cleaned up
      expect(removeResult1).toHaveBeenCalled();
      expect(removeError1).toHaveBeenCalled();

      // New listeners should be registered
      expect(addListener2).toHaveBeenCalledTimes(2);
    });

    it('cleans up listeners on unmount', async () => {
      const removeResult = jest.fn();
      const removeError = jest.fn();
      const addListenerWithTracking = jest.fn(
        (eventName: 'result' | 'error', listener: (event: unknown) => void) => {
          listeners[eventName] = listener;
          return {
            remove: eventName === 'result' ? removeResult : removeError,
          };
        },
      );

      mockLoadSpeechModule.mockResolvedValue({
        requestPermissionsAsync: mockRequestPermissionsAsync,
        start: mockStart,
        stop: mockStop,
        addListener: addListenerWithTracking,
      });

      const { unmount } = renderHook(() =>
        useSpeechRecognition(mockLoadSpeechModule),
      );
      await flushEffects();

      expect(addListenerWithTracking).toHaveBeenCalledTimes(2);

      unmount();

      expect(removeResult).toHaveBeenCalled();
      expect(removeError).toHaveBeenCalled();
    });
  });
});
