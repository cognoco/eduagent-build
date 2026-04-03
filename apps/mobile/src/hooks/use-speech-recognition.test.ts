import { renderHook, act } from '@testing-library/react-native';
import { useSpeechRecognition } from './use-speech-recognition';

const listeners: Partial<Record<'result' | 'error', (event: unknown) => void>> =
  {};

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
  }
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
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    mockLoadSpeechModule.mockResolvedValue(null);
  });

  it('initializes in idle state', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule)
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.isListening).toBe(false);
  });

  it('sets error when speech recognition is unavailable', async () => {
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule)
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
      useSpeechRecognition(mockLoadSpeechModule)
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

  it('updates transcript from native result events', async () => {
    mockLoadSpeechModule.mockResolvedValue({
      requestPermissionsAsync: mockRequestPermissionsAsync,
      start: mockStart,
      stop: mockStop,
      addListener: mockAddListener,
    });
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule)
    );
    await flushEffects();

    act(() => {
      listeners.result?.({
        isFinal: false,
        results: [{ transcript: 'Photosynthesis is how plants make food' }],
      });
    });

    expect(result.current.transcript).toBe(
      'Photosynthesis is how plants make food'
    );
    expect(result.current.error).toBeNull();
  });

  it('captures native error events', async () => {
    mockLoadSpeechModule.mockResolvedValue({
      requestPermissionsAsync: mockRequestPermissionsAsync,
      start: mockStart,
      stop: mockStop,
      addListener: mockAddListener,
    });
    const { result } = renderHook(() =>
      useSpeechRecognition(mockLoadSpeechModule)
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
      useSpeechRecognition(mockLoadSpeechModule)
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
      useSpeechRecognition(mockLoadSpeechModule)
    );

    await act(async () => {
      await result.current.stopListening();
    });

    expect(result.current.status).toBe('idle');
  });
});
