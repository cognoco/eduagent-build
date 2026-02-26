import { renderHook, act } from '@testing-library/react-native';
import { useTextToSpeech } from './use-text-to-speech';

// Mock expo-speech
const mockSpeak = jest.fn();
const mockStop = jest.fn();

jest.mock('expo-speech', () => ({
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: (...args: unknown[]) => mockStop(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useTextToSpeech', () => {
  it('initializes with isSpeaking false', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.isSpeaking).toBe(false);
  });

  it('calls Speech.speak when speak() is invoked', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('Hello world');
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'Hello world',
      expect.objectContaining({
        onStart: expect.any(Function),
        onDone: expect.any(Function),
        onStopped: expect.any(Function),
        onError: expect.any(Function),
      })
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

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useTextToSpeech());
    unmount();
    expect(mockStop).toHaveBeenCalled();
  });
});
