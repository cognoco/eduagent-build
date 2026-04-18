import { renderHook, act } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { useDictationPlayback } from './use-dictation-playback';
import type { DictationSentence } from '@eduagent/schemas';

jest.mock('expo-speech');
const mockSpeak = jest.mocked(Speech.speak);
const mockStop = jest.mocked(Speech.stop);

const TEST_SENTENCES: DictationSentence[] = [
  {
    text: 'First sentence.',
    withPunctuation: 'First sentence period',
    wordCount: 2,
  },
  {
    text: 'Second sentence.',
    withPunctuation: 'Second sentence period',
    wordCount: 2,
  },
  {
    text: 'Third sentence.',
    withPunctuation: 'Third sentence period',
    wordCount: 2,
  },
];

describe('useDictationPlayback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Simulate immediate speech completion
    mockSpeak.mockImplementation((_text, options) => {
      options?.onDone?.();
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    expect(result.current.state).toBe('idle');
    expect(result.current.currentIndex).toBe(0);
  });

  it('transitions to countdown on start', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });

    expect(result.current.state).toBe('countdown');
  });

  it('pauses and resumes', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    // Advance past countdown
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    act(() => {
      result.current.pause();
    });

    expect(result.current.state).toBe('paused');

    act(() => {
      result.current.resume();
    });

    expect(result.current.state).not.toBe('paused');
  });

  it('uses withPunctuation text when punctuationReadAloud is true', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: true,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    // Advance past countdown
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence period',
      expect.objectContaining({ language: 'en' })
    );
  });

  it('uses plain text when punctuationReadAloud is false', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' })
    );
  });

  it('repeat replays current sentence', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    mockSpeak.mockClear();

    act(() => {
      result.current.repeat();
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' })
    );
  });

  it('skip advances to next sentence', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    act(() => {
      result.current.skip();
    });

    expect(result.current.currentIndex).toBe(1);
  });

  it('transitions to complete after last sentence', () => {
    const singleSentence: DictationSentence[] = [
      {
        text: 'Only one.',
        withPunctuation: 'Only one period',
        wordCount: 2,
      },
    ];

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: singleSentence,
        pace: 'fast',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    // Advance past countdown
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    // Advance past the pause after the sentence
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.state).toBe('complete');
  });

  // RF-02: Test that pace changes mid-playback are picked up via configRef
  it('uses updated pace when config changes mid-playback', () => {
    // Start slow, then rerender with fast — the next onDone callback should
    // use the fast pause duration from configRef.current, not the stale slow closure.
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
      // Do NOT call onDone immediately — we'll trigger it manually
    });

    const { result, rerender } = renderHook(
      (props: { pace: 'slow' | 'normal' | 'fast' }) =>
        useDictationPlayback({
          sentences: TEST_SENTENCES,
          pace: props.pace,
          punctuationReadAloud: false,
          language: 'en',
        }),
      { initialProps: { pace: 'slow' as 'slow' | 'normal' | 'fast' } }
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(4000); // Past countdown
    });

    // Now rerender with fast pace while speech is in-flight
    rerender({ pace: 'fast' });

    // Trigger the onDone callback (speech completed)
    act(() => {
      capturedOnDone?.();
    });

    // After onDone, we should be in 'waiting' state (not 'complete' — there are 2 more sentences)
    // The waiting timer should use fast pace config
    // fast: basePause=1000 + 2*700 = 2400ms
    // slow: basePause=2000 + 2*1500 = 5000ms
    // We confirm the hook is in 'waiting' state and advances at fast pace
    expect(result.current.state).toBe('waiting');

    // Advance by fast pause duration (2400ms) — if still using slow pace we'd still be waiting
    act(() => {
      jest.advanceTimersByTime(2400);
    });

    // Should have advanced to next sentence (index 1) using fast pace
    expect(result.current.currentIndex).toBe(1);
  });

  it('stop is called on pause', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    act(() => {
      result.current.pause();
    });

    expect(mockStop).toHaveBeenCalled();
  });

  it('totalSentences matches input sentences count', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'normal',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    expect(result.current.totalSentences).toBe(3);
  });
});
