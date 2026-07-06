import React from 'react';
import { Text } from 'react-native';
import {
  render,
  renderHook,
  act,
  waitFor,
} from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import type { SpeechOptions } from 'expo-speech';
import { useTranslation } from 'react-i18next';
import {
  computeChunkPauseMs,
  computeSentencePauseMs,
  getDictationVoiceLanguageName,
  type PlaybackControls,
  useDictationPlayback,
  splitIntoChunks,
} from './use-dictation-playback';
import type { DictationSentence } from '@eduagent/schemas';
import { ensureI18nReady } from '../i18n';

jest.mock('expo-speech');
const mockSpeak = jest.mocked(Speech.speak);
const mockStop = jest.mocked(Speech.stop);
const mockGetAvailableVoicesAsync = jest.mocked(Speech.getAvailableVoicesAsync);

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

// Longer sentences for chunk splitting tests (fallback — no pre-computed chunks)
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

// Sentences with LLM-generated natural chunks
const CHUNKED_SENTENCES: DictationSentence[] = [
  {
    text: 'A black cat that I usually see out of window is not there today.',
    withPunctuation:
      'A black cat that I usually see out of window is not there today period',
    wordCount: 13,
    chunks: [
      'A black cat',
      'that I usually see out of window',
      'is not there today.',
    ],
    chunksWithPunctuation: [
      'A black cat',
      'that I usually see out of window',
      'is not there today period',
    ],
  },
  {
    text: 'Hello there.',
    withPunctuation: 'Hello there period',
    wordCount: 2,
    chunks: ['Hello there.'],
    chunksWithPunctuation: ['Hello there period'],
  },
];

function VoiceUnavailableProbe({
  language,
}: {
  language: string;
}): React.ReactElement {
  const { t } = useTranslation();
  const playback = useDictationPlayback({
    sentences: TEST_SENTENCES,
    pace: 'normal',
    punctuationReadAloud: false,
    language,
  });
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    playback.start();
  }, [playback]);

  return React.createElement(
    Text,
    { testID: 'voice-unavailable-message' },
    playback.state === 'unavailable'
      ? t('dictation.playback.voiceUnavailableMessage', {
          language: getDictationVoiceLanguageName(playback.voiceLanguage),
        })
      : '',
  );
}

async function flushVoicePreflight(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function startPlayback(result: {
  current: PlaybackControls;
}): Promise<void> {
  act(() => {
    result.current.start();
  });
  await flushVoicePreflight();
}

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

  it('keeps short sentences (≤4 words) as a single chunk', () => {
    expect(splitIntoChunks('A black cat.', 2)).toEqual(['A black cat.']);
    expect(splitIntoChunks('Run fast now.', 2)).toEqual(['Run fast now.']);
    expect(splitIntoChunks('She is here today.', 2)).toEqual([
      'She is here today.',
    ]);
  });

  it('splits sentences with more than 4 words', () => {
    expect(
      splitIntoChunks('The little rabbit ran through the forest.', 3),
    ).toEqual(['The little rabbit', 'ran through the', 'forest.']);
  });

  it('handles empty text', () => {
    expect(splitIntoChunks('', 3)).toEqual(['']);
  });
});

describe('computeChunkPauseMs (phrase-pause model)', () => {
  it('uses a short natural phrase pause, not a per-word handwriting budget', () => {
    expect(computeChunkPauseMs('The little rabbit', 'normal', 'adult')).toBe(
      600,
    );
  });

  it('does not make long words wait longer than short words', () => {
    expect(computeChunkPauseMs('I', 'normal', 'adult')).toBe(600);
    expect(computeChunkPauseMs('extraordinary', 'normal', 'adult')).toBe(600);
  });

  it('does not age-scale phrase pauses', () => {
    const chunk = 'The little rabbit';
    expect(computeChunkPauseMs(chunk, 'normal', 'adult')).toBe(600);
    expect(computeChunkPauseMs(chunk, 'normal', 'adolescent')).toBe(600);
    expect(computeChunkPauseMs(chunk, 'normal', 'child')).toBe(600);
  });

  it('keeps pace presets within natural phrase-pause bands', () => {
    const chunk = 'The little rabbit';
    expect(computeChunkPauseMs(chunk, 'fast', 'adult')).toBe(400);
    expect(computeChunkPauseMs(chunk, 'normal', 'adult')).toBe(600);
    expect(computeChunkPauseMs(chunk, 'slow', 'adult')).toBe(700);
  });

  it('returns 0 for an empty chunk', () => {
    expect(computeChunkPauseMs('   ', 'normal', 'adult')).toBe(0);
  });
});

describe('computeSentencePauseMs', () => {
  it('returns the per-pace sentence pause at the adult baseline', () => {
    expect(computeSentencePauseMs('fast', 'adult')).toBe(800);
    expect(computeSentencePauseMs('normal', 'adult')).toBe(1200);
    expect(computeSentencePauseMs('slow', 'adult')).toBe(1400);
  });

  it('scales only the sentence response window up for younger learners', () => {
    expect(computeSentencePauseMs('normal', 'adolescent')).toBe(1380);
    expect(computeSentencePauseMs('normal', 'child')).toBe(1740);
  });
});

describe('useDictationPlayback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetAvailableVoicesAsync.mockResolvedValue([
      {
        identifier: 'en-US-voice',
        name: 'English',
        quality: Speech.VoiceQuality.Default,
        language: 'en-US',
      },
      {
        identifier: 'es-ES-voice',
        name: 'Spanish',
        quality: Speech.VoiceQuality.Default,
        language: 'es-ES',
      },
    ]);
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
      }),
    );

    expect(result.current.state).toBe('idle');
    expect(result.current.currentIndex).toBe(0);
  });

  it('[WI-908] shows translated availability copy and does not speak when no target-language TTS voice exists', async () => {
    await ensureI18nReady();
    mockGetAvailableVoicesAsync.mockResolvedValue([
      {
        identifier: 'en-US-voice',
        name: 'English',
        quality: Speech.VoiceQuality.Default,
        language: 'en-US',
      },
    ]);

    const { getByTestId } = render(
      React.createElement(VoiceUnavailableProbe, { language: 'fr' }),
    );

    await waitFor(() => {
      expect(getByTestId('voice-unavailable-message').props.children).toBe(
        "This device doesn't have a French voice installed yet. Add that voice in your device settings, then try dictation again.",
      );
    });
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('[WI-908] keeps playback unavailable when controls are pressed without a target-language voice', async () => {
    mockGetAvailableVoicesAsync.mockResolvedValue([
      {
        identifier: 'en-US-voice',
        name: 'English',
        quality: Speech.VoiceQuality.Default,
        language: 'en-US',
      },
    ]);

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'normal',
        punctuationReadAloud: false,
        language: 'fr',
      }),
    );

    await startPlayback(result);
    expect(result.current.state).toBe('unavailable');

    act(() => {
      result.current.skip();
      result.current.repeat();
      result.current.previous();
    });

    expect(result.current.state).toBe('unavailable');
    expect(result.current.currentIndex).toBe(0);
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('transitions to countdown on start', async () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);

    expect(result.current.state).toBe('countdown');
  });

  it('[WI-1149] plays when the device returns an empty voice list (graceful degradation)', async () => {
    // Many Android TTS engines return [] from getAvailableVoicesAsync even when
    // the system voice speaks fine. WI-908 wrongly blocked playback here.
    mockGetAvailableVoicesAsync.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);
    expect(result.current.state).toBe('countdown');
    expect(result.current.voiceAvailability).toBe('available');

    act(() => {
      jest.advanceTimersByTime(4000); // past the countdown
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('[WI-1149] plays when voice enumeration throws', async () => {
    mockGetAvailableVoicesAsync.mockRejectedValue(
      new Error('TTS engine not bound'),
    );

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);
    expect(result.current.state).toBe('countdown');
    expect(result.current.voiceAvailability).toBe('available');

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(mockSpeak).toHaveBeenCalled();
  });

  it('[WI-1149] matches a device voice reported with a 3-letter ISO 639-2 tag (eng → en)', async () => {
    mockGetAvailableVoicesAsync.mockResolvedValue([
      {
        identifier: 'eng-voice',
        name: 'English',
        quality: Speech.VoiceQuality.Default,
        language: 'eng',
      },
    ]);

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);
    expect(result.current.state).toBe('countdown');
    expect(result.current.voiceAvailability).toBe('available');

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('pauses and resumes', async () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);
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

  it('uses withPunctuation text when punctuationReadAloud is true', async () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: true,
        language: 'en',
      }),
    );

    await startPlayback(result);
    // Advance past countdown
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // With chunkSize default 3, "First sentence period" (3 words) fits in one chunk
    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence period',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('uses plain text when punctuationReadAloud is false', async () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // "First sentence." (2 words) fits in one chunk with default chunkSize=3
    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('[WI-1412] resets non-paused playback to idle when Speech.speak reports an error', async () => {
    let capturedOnError: SpeechOptions['onError'];
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnError = options?.onError;
    });

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(result.current.state).toBe('speaking');

    act(() => {
      capturedOnError?.(new Error('tts failed'));
    });

    expect(result.current.state).toBe('idle');
  });

  it('speaks long sentences in chunks', async () => {
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
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000); // Past countdown
    });

    // First chunk: "The little rabbit" (3 words)
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'The little rabbit',
      expect.objectContaining({ language: 'en' }),
    );

    // Complete the first chunk
    act(() => {
      capturedOnDone?.();
    });

    // Should be in waiting state (chunk pause)
    expect(result.current.state).toBe('waiting');

    // Advance past the normal phrase pause.
    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Second chunk: "ran through the"
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'ran through the',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('repeat replays current chunk', async () => {
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
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // First chunk spoken: "The little rabbit"
    // Complete it and advance to second chunk
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Now speaking "ran through the"
    mockSpeak.mockClear();

    act(() => {
      result.current.repeat();
    });

    // Should re-speak the same chunk
    expect(mockSpeak).toHaveBeenCalledWith(
      'ran through the',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('skip advances to next sentence (not just next chunk)', async () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: LONG_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
        chunkSize: 3,
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    act(() => {
      result.current.skip();
    });

    // Should jump to sentence index 1, not just next chunk of sentence 0
    expect(result.current.currentIndex).toBe(1);
  });

  it('transitions to complete after last chunk of last sentence', async () => {
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
      }),
    );

    await startPlayback(result);
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
  it('uses updated pace when config changes mid-playback', async () => {
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
      { initialProps: { pace: 'slow' as 'slow' | 'normal' | 'fast' } },
    );

    await startPlayback(result);
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

    // Advance by fast sentence pause.
    act(() => {
      jest.advanceTimersByTime(800);
    });

    // Should have advanced to next sentence using fast pace
    expect(result.current.currentIndex).toBe(1);
  });

  it('stop is called on pause', async () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);
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
      }),
    );

    expect(result.current.totalSentences).toBe(3);
  });

  it('advances through all chunks then to next sentence', async () => {
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
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // Sentence 0 splits into: ["The little rabbit", "ran through the", "forest."]
    // Chunk 0: "The little rabbit"
    expect(result.current.currentIndex).toBe(0);

    // Complete chunk 0 → fast phrase pause → chunk 1
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'ran through the',
      expect.objectContaining({ language: 'en' }),
    );
    expect(result.current.currentIndex).toBe(0); // Still sentence 0

    // Complete chunk 1 → fast phrase pause → chunk 2
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'forest.',
      expect.objectContaining({ language: 'en' }),
    );
    expect(result.current.currentIndex).toBe(0); // Still sentence 0

    // Complete chunk 2 (last chunk) → sentence pause → sentence 1
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(result.current.currentIndex).toBe(1); // Now sentence 1
  });

  it('uses pre-computed LLM chunks instead of mechanical splitting', async () => {
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
    });

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: CHUNKED_SENTENCES,
        pace: 'normal',
        punctuationReadAloud: false,
        language: 'en',
        chunkSize: 3, // should be ignored — pre-computed chunks take priority
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // First chunk should be the natural phrase, not a 3-word mechanical split
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'A black cat',
      expect.objectContaining({ language: 'en' }),
    );

    // Complete chunk 0 → normal phrase pause → chunk 1
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(mockSpeak).toHaveBeenLastCalledWith(
      'that I usually see out of window',
      expect.objectContaining({ language: 'en' }),
    );

    // Complete chunk 1 → normal phrase pause → chunk 2
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(mockSpeak).toHaveBeenLastCalledWith(
      'is not there today.',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('uses chunksWithPunctuation when punctuationReadAloud is true', async () => {
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
    });

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: CHUNKED_SENTENCES,
        pace: 'normal',
        punctuationReadAloud: true,
        language: 'en',
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // First chunk same in both variants (no punctuation in it)
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'A black cat',
      expect.objectContaining({ language: 'en' }),
    );

    // Complete chunk 0 → normal phrase pause → chunk 1
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Complete chunk 1 → normal phrase pause → chunk 2
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Last chunk uses spoken punctuation: "period" instead of "."
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'is not there today period',
      expect.objectContaining({ language: 'en' }),
    );
  });

  // -------------------------------------------------------------------------
  // [BUG-166 / BREAK] Removing the react-hooks/exhaustive-deps suppression on
  // speakChunk must not regress mid-playback config changes. These tests
  // exercise the four config fields the original closure would have staled:
  // sentences, language, punctuationReadAloud, and chunkSize. If a future
  // refactor re-introduces a stale closure (e.g. moves config back into a
  // useCallback dep array without including these fields), these tests fail.
  // -------------------------------------------------------------------------
  it('[BREAK / BUG-166] picks up language change mid-playback', async () => {
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
    });

    const { result, rerender } = renderHook(
      (props: { language: string }) =>
        useDictationPlayback({
          sentences: TEST_SENTENCES,
          pace: 'slow',
          punctuationReadAloud: false,
          language: props.language,
        }),
      { initialProps: { language: 'en' } },
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000); // past countdown
    });

    // First call goes out with 'en'
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' }),
    );

    // Caller flips language mid-flight
    rerender({ language: 'es' });

    // Advance to next sentence — must use the new language
    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(1400); // sentence pause for slow pace
    });
    await flushVoicePreflight();

    expect(mockSpeak).toHaveBeenLastCalledWith(
      'Second sentence.',
      expect.objectContaining({ language: 'es' }),
    );
  });

  it('[BREAK / BUG-166] picks up punctuationReadAloud change mid-playback', async () => {
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
    });

    const { result, rerender } = renderHook(
      (props: { punctuationReadAloud: boolean }) =>
        useDictationPlayback({
          sentences: TEST_SENTENCES,
          pace: 'slow',
          punctuationReadAloud: props.punctuationReadAloud,
          language: 'en',
        }),
      { initialProps: { punctuationReadAloud: false } },
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(mockSpeak).toHaveBeenLastCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' }),
    );

    // Flip to spoken punctuation mid-flight
    rerender({ punctuationReadAloud: true });

    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(1400);
    });

    // Next sentence must use withPunctuation text
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'Second sentence period',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('[BREAK / BUG-166] picks up sentences array swap mid-playback', async () => {
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
    });

    const REPLACEMENT_SENTENCES: DictationSentence[] = [
      {
        text: 'Original kept.',
        withPunctuation: 'Original kept period',
        wordCount: 2,
      },
      {
        text: 'Replaced second sentence.',
        withPunctuation: 'Replaced second sentence period',
        wordCount: 3,
      },
    ];

    const { result, rerender } = renderHook(
      (props: { sentences: DictationSentence[] }) =>
        useDictationPlayback({
          sentences: props.sentences,
          pace: 'slow',
          punctuationReadAloud: false,
          language: 'en',
        }),
      {
        initialProps: {
          sentences: [
            {
              text: 'Original kept.',
              withPunctuation: 'Original kept period',
              wordCount: 2,
            },
            {
              text: 'Original second.',
              withPunctuation: 'Original second period',
              wordCount: 2,
            },
          ],
        },
      },
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(mockSpeak).toHaveBeenLastCalledWith(
      'Original kept.',
      expect.objectContaining({ language: 'en' }),
    );

    // Swap sentences[] mid-flight
    rerender({ sentences: REPLACEMENT_SENTENCES });

    act(() => {
      capturedOnDone?.();
    });
    act(() => {
      jest.advanceTimersByTime(1400);
    });

    // Next sentence must come from the NEW sentences array, not the captured one
    expect(mockSpeak).toHaveBeenLastCalledWith(
      'Replaced second sentence.',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('falls back to splitIntoChunks when no pre-computed chunks exist', async () => {
    mockSpeak.mockImplementation((_text, options) => {
      options?.onDone?.();
    });

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: LONG_SENTENCES, // no chunks/chunksWithPunctuation
        pace: 'normal',
        punctuationReadAloud: false,
        language: 'en',
        chunkSize: 3,
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // Should fall back to mechanical 3-word splitting
    expect(mockSpeak).toHaveBeenCalledWith(
      'The little rabbit',
      expect.objectContaining({ language: 'en' }),
    );
  });

  // -------------------------------------------------------------------------
  // [WI-903] Go back to the previous sentence. Before this, the only backward
  // control was repeat() (re-speaks the current chunk); learners had no way to
  // hear the previous sentence again.
  // -------------------------------------------------------------------------
  it('[WI-903] previous() goes back to the previous sentence and restarts it from the first chunk', async () => {
    mockSpeak.mockImplementation((_text, options) => {
      options?.onDone?.();
    });

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // Move forward to sentence 1
    act(() => {
      result.current.skip();
    });
    expect(result.current.currentIndex).toBe(1);

    mockSpeak.mockClear();
    act(() => {
      result.current.previous();
    });

    expect(result.current.currentIndex).toBe(0);
    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('[WI-903] previous() at the first sentence restarts it (clamps at index 0)', async () => {
    mockSpeak.mockImplementation((_text, options) => {
      options?.onDone?.();
    });

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    mockSpeak.mockClear();
    act(() => {
      result.current.previous();
    });

    expect(result.current.currentIndex).toBe(0);
    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' }),
    );
  });

  // AC variant: "previous while paused" — the learner pauses mid-sentence then
  // taps the previous-sentence button. The hook must clear the pause, stop TTS,
  // move currentIndex back by one, and immediately start speaking that sentence
  // from its first chunk (not wait for a resume).
  it('[WI-903] previous() while paused moves to the previous sentence and starts speaking it', async () => {
    // Do NOT auto-complete speech — we want to observe speaking state without
    // the cascade of onDone timers firing during the assertion phase.
    let capturedOnDone: (() => void) | undefined;
    mockSpeak.mockImplementation((_text, options) => {
      capturedOnDone = options?.onDone;
    });

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      }),
    );

    await startPlayback(result);
    // Advance past countdown (3500 ms + margin)
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // Now speaking sentence 0; complete it to trigger the sentence-boundary pause
    act(() => {
      capturedOnDone?.();
    });
    // Advance past the slow sentence pause to start sentence 1
    act(() => {
      jest.advanceTimersByTime(1400);
    });

    // Confirm we are on sentence 1 and speaking
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.state).toBe('speaking');

    // Pause while on sentence 1
    act(() => {
      result.current.pause();
    });
    expect(result.current.state).toBe('paused');

    // Isolate the previous() call from earlier speak/stop history
    mockSpeak.mockClear();
    mockStop.mockClear();

    // Act: call previous() while paused
    act(() => {
      result.current.previous();
    });

    // previous() must:
    // 1. Stop TTS (clears the paused audio)
    expect(mockStop).toHaveBeenCalled();
    // 2. Move back to sentence 0
    expect(result.current.currentIndex).toBe(0);
    // 3. Start speaking sentence 0 from its first chunk — state is 'speaking', not 'paused'
    expect(result.current.state).toBe('speaking');
    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('speaks each word at natural rate, not the old slurred 0.5-0.6', async () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: LONG_SENTENCES,
        pace: 'normal',
        punctuationReadAloud: false,
        language: 'en',
        chunkSize: 3,
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000); // past countdown
    });

    // The word is spoken at natural articulation speed — the "drunk/slurred"
    // stretch came from a sub-1.0 rate; writing time comes from the pauses, not
    // from drawing the voice out.
    expect(mockSpeak).toHaveBeenCalledWith(
      'The little rabbit',
      expect.objectContaining({ rate: 1.0 }),
    );
  });

  // -------------------------------------------------------------------------
  // Dictation timing: phrase boundaries stay short and natural; sentence
  // boundaries carry the larger response window.
  // -------------------------------------------------------------------------
  it('waits exactly computeChunkPauseMs before the next phrase chunk', async () => {
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
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000); // past countdown
    });

    // Complete chunk 0 ("The little rabbit") → enter the phrase pause.
    act(() => {
      capturedOnDone?.();
    });
    expect(result.current.state).toBe('waiting');

    // The pause must be the short phrase pause, not a handwriting budget.
    const pause = computeChunkPauseMs('The little rabbit', 'normal', 'adult');
    mockSpeak.mockClear();
    act(() => {
      jest.advanceTimersByTime(pause - 1);
    });
    expect(mockSpeak).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(mockSpeak).toHaveBeenCalledWith(
      'ran through the',
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('does not age-scale the phrase timer between chunks', async () => {
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
        ageBracket: 'child',
      }),
    );

    await startPlayback(result);
    act(() => {
      jest.advanceTimersByTime(4000); // past countdown
    });
    act(() => {
      capturedOnDone?.();
    });
    expect(result.current.state).toBe('waiting');

    const adultPause = computeChunkPauseMs(
      'The little rabbit',
      'normal',
      'adult',
    );
    const childPause = computeChunkPauseMs(
      'The little rabbit',
      'normal',
      'child',
    );
    expect(childPause).toBe(adultPause);

    mockSpeak.mockClear();
    act(() => {
      jest.advanceTimersByTime(adultPause);
    });
    expect(mockSpeak).toHaveBeenCalledWith(
      'ran through the',
      expect.objectContaining({ language: 'en' }),
    );
  });
});
