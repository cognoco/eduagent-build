import { renderHook, act } from '@testing-library/react-native';
import { useTextToSpeech } from './use-text-to-speech';

// Mock expo-speech
const mockSpeak = jest.fn();
const mockStop = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();

jest.mock('expo-speech', () => ({
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: (...args: unknown[]) => mockStop(...args),
  pause: (...args: unknown[]) => mockPause(...args),
  resume: (...args: unknown[]) => mockResume(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useTextToSpeech', () => {
  it('initializes with isSpeaking false', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.isSpeaking).toBe(false);
  });

  it('initializes with isPaused false', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.isPaused).toBe(false);
  });

  it('initializes rate at 1.0', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.rate).toBe(1.0);
  });

  it('calls Speech.speak when speak() is invoked', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('Hello world');
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'Hello world',
      expect.objectContaining({
        rate: 1.0,
        onStart: expect.any(Function),
        onDone: expect.any(Function),
        onStopped: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('passes current rate to Speech.speak', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.setRate(1.25);
    });
    expect(result.current.rate).toBe(1.25);

    act(() => {
      result.current.speak('Fast speech');
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'Fast speech',
      expect.objectContaining({ rate: 1.25 }),
    );
  });

  it('passes configured language to Speech.speak', () => {
    const { result } = renderHook(() => useTextToSpeech({ language: 'es-ES' }));

    act(() => {
      result.current.speak('Hola');
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'Hola',
      expect.objectContaining({ language: 'es-ES' }),
    );
  });

  it('stops any ongoing speech before starting new', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('First');
    });

    // mockStop called once for the pre-speak stop
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('calls Speech.stop when stop() is invoked', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.stop();
    });

    expect(mockStop).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(false);
  });

  it('sets isSpeaking true on onStart callback', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('Test');
    });

    // Simulate onStart
    const callArgs = mockSpeak.mock.calls[0][1];
    act(() => {
      callArgs.onStart();
    });

    expect(result.current.isSpeaking).toBe(true);
  });

  it('sets isSpeaking false on onDone callback', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('Test');
    });

    const callArgs = mockSpeak.mock.calls[0][1];
    act(() => {
      callArgs.onStart();
    });
    expect(result.current.isSpeaking).toBe(true);

    act(() => {
      callArgs.onDone();
    });
    expect(result.current.isSpeaking).toBe(false);
  });

  it('replay re-speaks last text', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('Original text');
    });
    mockSpeak.mockClear();
    mockStop.mockClear();

    act(() => {
      result.current.replay();
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'Original text',
      expect.objectContaining({ rate: 1.0 }),
    );
  });

  it('replay no-ops when nothing has been spoken', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.replay();
    });

    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('setRate updates state', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.setRate(0.75);
    });

    expect(result.current.rate).toBe(0.75);
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useTextToSpeech());
    unmount();
    expect(mockStop).toHaveBeenCalled();
  });

  // --- Pause/Resume (FR147) ---

  it('calls Speech.pause when pause() is invoked', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.pause();
    });

    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(result.current.isPaused).toBe(true);
  });

  it('calls Speech.resume when resume() is invoked', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.pause();
    });
    expect(result.current.isPaused).toBe(true);

    act(() => {
      result.current.resume();
    });

    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(result.current.isPaused).toBe(false);
  });

  it('stop() resets isPaused to false', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.pause();
    });
    expect(result.current.isPaused).toBe(true);

    act(() => {
      result.current.stop();
    });
    expect(result.current.isPaused).toBe(false);
    expect(result.current.isSpeaking).toBe(false);
  });

  it('speak() resets isPaused to false', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.pause();
    });
    expect(result.current.isPaused).toBe(true);

    act(() => {
      result.current.speak('New text');
    });
    expect(result.current.isPaused).toBe(false);
  });

  it('onDone resets isPaused to false', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('Test');
    });

    const callArgs = mockSpeak.mock.calls[0][1];
    act(() => {
      callArgs.onStart();
    });

    act(() => {
      result.current.pause();
    });
    expect(result.current.isPaused).toBe(true);

    act(() => {
      callArgs.onDone();
    });
    expect(result.current.isPaused).toBe(false);
    expect(result.current.isSpeaking).toBe(false);
  });

  it('onStopped resets isPaused to false', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('Test');
    });

    const callArgs = mockSpeak.mock.calls[0][1];

    act(() => {
      result.current.pause();
    });

    act(() => {
      callArgs.onStopped();
    });
    expect(result.current.isPaused).toBe(false);
  });
});
