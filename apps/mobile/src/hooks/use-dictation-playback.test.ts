import { renderHook, act } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import {
  useDictationPlayback,
  splitIntoChunks,
} from './use-dictation-playback';
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

// Longer sentences for chunk splitting tests
const LONG_SENTENCES: DictationSentence[] = [
  {
    text: 'The little rabbit ran through the forest.',
    withPunctuation: 'The little rabbit ran through the forest period',
    wordCount: 7,
  },
  {
    text: 'A bright star shone above.',
    withPunctuation: 'A bright star shone above period',
    wordCount: 5,
  },
];

describe('splitIntoChunks', () => {
  it('splits text into chunks of the given size', () => {
    expect(splitIntoChunks('one two three four five six', 2)).toEqual([
      'one two',
      'three four',
      'five six',
    ]);
  });

  it('handles remainder chunk smaller than size', () => {
    expect(splitIntoChunks('one two three four five', 3)).toEqual([
      'one two three',
      'four five',
    ]);
  });

  it('returns single chunk when text is shorter than size', () => {
    expect(splitIntoChunks('hello world', 5)).toEqual(['hello world']);
  });

  it('handles empty text', () => {
    expect(splitIntoChunks('', 3)).toEqual(['']);
  });
});

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

    // With chunkSize default 3, "First sentence period" (3 words) fits in one chunk
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

    // "First sentence." (2 words) fits in one chunk with default chunkSize=3
    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' })
    );
  });

  it('speaks long sentences in chunks', () => {
    // Don't auto-complete speech — we need to control onDone manually
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
    });

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: LONG_SENTENCES,
        pace: 'normal',
        punctuationReadAloud: false,
        language: 'en',
        chunkSize: 3,
      })
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(4000); // Past countdown
    });

    // First chunk: "The little rabbit" (3 words)
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'The little rabbit',
      expect.objectContaining({ language: 'en' })
    );

    // Complete the first chunk
    act(() => {
      capturedOnDone?.();
    });

    // Should be in waiting state (chunk pause)
    expect(result.current.state).toBe('waiting');

    // Advance past the chunk pause (3 words * 2000ms = 6000ms for normal pace)
    act(() => {
      jest.advanceTimersByTime(6000);
    });

    // Second chunk: "ran through the"
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'ran through the',
      expect.objectContaining({ language: 'en' })
    );
  });

  it('repeat replays current chunk', () => {
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
    });

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: LONG_SENTENCES,
        pace: 'normal',
        punctuationReadAloud: false,
        language: 'en',
        chunkSize: 3,
      })
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // First chunk spoken: "The little rabbit"
    // Complete it and advance to second chunk
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(6000);
    });

    // Now speaking "ran through the"
    mockSpeak.mockClear();

    act(() => {
      result.current.repeat();
    });

    // Should re-speak the same chunk
    expect(mockSpeak).toHaveBeenCalledWith(
      'ran through the',
      expect.objectContaining({ language: 'en' })
    );
  });

  it('skip advances to next sentence (not just next chunk)', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: LONG_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
        chunkSize: 3,
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

    // Should jump to sentence index 1, not just next chunk of sentence 0
    expect(result.current.currentIndex).toBe(1);
  });

  it('transitions to complete after last chunk of last sentence', () => {
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
    // Advance past any remaining timers
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.state).toBe('complete');
  });

  // RF-02: Test that pace changes mid-playback are picked up via configRef
  it('uses updated pace when config changes mid-playback', () => {
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
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

    // After onDone, we should be in 'waiting' state (sentence pause before next sentence)
    expect(result.current.state).toBe('waiting');

    // Advance by fast sentence pause (2000ms)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Should have advanced to next sentence using fast pace
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

  it('advances through all chunks then to next sentence', () => {
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
    });

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: LONG_SENTENCES,
        pace: 'fast',
        punctuationReadAloud: false,
        language: 'en',
        chunkSize: 3,
      })
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // Sentence 0 splits into: ["The little rabbit", "ran through the", "forest."]
    // Chunk 0: "The little rabbit"
    expect(result.current.currentIndex).toBe(0);

    // Complete chunk 0 → chunk pause → chunk 1
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'ran through the',
      expect.objectContaining({ language: 'en' })
    );
    expect(result.current.currentIndex).toBe(0); // Still sentence 0

    // Complete chunk 1 → chunk pause → chunk 2
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'forest.',
      expect.objectContaining({ language: 'en' })
    );
    expect(result.current.currentIndex).toBe(0); // Still sentence 0

    // Complete chunk 2 (last chunk) → sentence pause → sentence 1
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.currentIndex).toBe(1); // Now sentence 1
  });
});
