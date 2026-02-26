import { renderHook, act } from '@testing-library/react-native';
import { useSpeechRecognition } from './use-speech-recognition';

// Mock expo-speech-recognition — simulate unavailable by default
jest.mock('expo-speech-recognition', () => {
  throw new Error('Module not found');
});

describe('useSpeechRecognition', () => {
  it('initializes in idle state', () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.status).toBe('idle');
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.isListening).toBe(false);
  });

  it('sets error when speech recognition is unavailable', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.startListening();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBeTruthy();
  });

  it('clearTranscript resets state', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.clearTranscript();
    });

    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('stopListening returns to idle even if module unavailable', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.stopListening();
    });

    expect(result.current.status).toBe('idle');
  });

  it('isListening reflects status correctly', () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isListening).toBe(false);
    // isListening is derived from status === 'listening'
    // We can't easily simulate the listening state without the module
  });
});
