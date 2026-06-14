import {
  DICTATION_REVIEW_MAX_PROMPT_CHARS,
  DICTATION_REVIEW_MAX_SENTENCES,
  DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS,
  dictationSentenceSchema,
  dictationPaceSchema,
  dictationModeSchema,
  dictationReviewPromptCharCount,
  prepareHomeworkInputSchema,
  prepareHomeworkOutputSchema,
  generateDictationOutputSchema,
  dictationMistakeSchema,
  dictationReviewResultSchema,
  recordDictationResultInputSchema,
  dictationReviewInputSchema,
  dictationResultSchema,
  recordDictationResultResponseSchema,
  dictationStreakSchema,
} from './dictation.js';
import { DictationPayloadTooLargeError } from './errors.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// dictationSentenceSchema
// ---------------------------------------------------------------------------

const validSentence = {
  text: 'The cat sat on the mat.',
  withPunctuation: 'The cat sat on the mat period',
  wordCount: 7,
};

describe('dictationSentenceSchema', () => {
  it('accepts a valid sentence without optional chunks', () => {
    const parsed = dictationSentenceSchema.parse(validSentence);
    expect(parsed.wordCount).toBe(7);
    expect(parsed.chunks).toBeUndefined();
  });

  it('accepts sentence with optional chunks', () => {
    const parsed = dictationSentenceSchema.parse({
      ...validSentence,
      chunks: ['The cat', 'sat on the mat.'],
      chunksWithPunctuation: ['The cat', 'sat on the mat period'],
    });
    expect(parsed.chunks).toHaveLength(2);
    expect(parsed.chunksWithPunctuation).toHaveLength(2);
  });

  it('rejects non-positive wordCount', () => {
    const result = dictationSentenceSchema.safeParse({
      ...validSentence,
      wordCount: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('wordCount');
    }
  });

  it('rejects missing text', () => {
    const { text: _, ...rest } = validSentence;
    const result = dictationSentenceSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('[F-180] rejects chunks array exceeding 100 entries', () => {
    const result = dictationSentenceSchema.safeParse({
      ...validSentence,
      chunks: Array.from({ length: 101 }, (_, i) => `chunk-${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('[F-180] rejects chunksWithPunctuation array exceeding 100 entries', () => {
    const result = dictationSentenceSchema.safeParse({
      ...validSentence,
      chunksWithPunctuation: Array.from(
        { length: 101 },
        (_, i) => `chunk-${i}`,
      ),
    });
    expect(result.success).toBe(false);
  });

  it('[F-180] accepts chunks and chunksWithPunctuation at the 100-entry limit', () => {
    const result = dictationSentenceSchema.safeParse({
      ...validSentence,
      chunks: Array.from({ length: 100 }, (_, i) => `chunk-${i}`),
      chunksWithPunctuation: Array.from(
        { length: 100 },
        (_, i) => `chunk-${i}`,
      ),
    });
    expect(result.success).toBe(true);
  });

  // [S6] Per-string length cap on chunk elements
  it('[S6] rejects a chunks entry exceeding DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS', () => {
    const result = dictationSentenceSchema.safeParse({
      ...validSentence,
      chunks: ['x'.repeat(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS + 1)],
    });
    expect(result.success).toBe(false);
  });

  it('[S6] rejects a chunksWithPunctuation entry exceeding DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS', () => {
    const result = dictationSentenceSchema.safeParse({
      ...validSentence,
      chunksWithPunctuation: [
        'x'.repeat(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS + 1),
      ],
    });
    expect(result.success).toBe(false);
  });

  it('[S6] accepts chunk entries exactly at the per-string cap', () => {
    const atCap = 'x'.repeat(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS);
    const result = dictationSentenceSchema.safeParse({
      ...validSentence,
      chunks: [atCap],
      chunksWithPunctuation: [atCap],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

describe('dictationPaceSchema', () => {
  it.each(['slow', 'normal', 'fast'])('accepts pace "%s"', (pace) => {
    expect(dictationPaceSchema.parse(pace)).toBe(pace);
  });

  it('rejects invalid pace', () => {
    const result = dictationPaceSchema.safeParse('medium');
    expect(result.success).toBe(false);
  });
});

describe('dictationModeSchema', () => {
  it.each(['homework', 'surprise'])('accepts mode "%s"', (mode) => {
    expect(dictationModeSchema.parse(mode)).toBe(mode);
  });

  it('rejects invalid mode', () => {
    const result = dictationModeSchema.safeParse('practice');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// prepareHomeworkInputSchema
// ---------------------------------------------------------------------------

describe('prepareHomeworkInputSchema', () => {
  it('accepts valid homework text', () => {
    const parsed = prepareHomeworkInputSchema.parse({ text: 'Hello world.' });
    expect(parsed.text).toBe('Hello world.');
  });

  it('rejects empty text', () => {
    expect(prepareHomeworkInputSchema.safeParse({ text: '' }).success).toBe(
      false,
    );
  });

  it('accepts text at max length (10000)', () => {
    const result = prepareHomeworkInputSchema.safeParse({
      text: 'x'.repeat(10000),
    });
    expect(result.success).toBe(true);
  });

  it('rejects text exceeding 10000 chars', () => {
    const result = prepareHomeworkInputSchema.safeParse({
      text: 'x'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// prepareHomeworkOutputSchema
// ---------------------------------------------------------------------------

describe('prepareHomeworkOutputSchema', () => {
  it('accepts valid output with at least one sentence', () => {
    const parsed = prepareHomeworkOutputSchema.parse({
      sentences: [validSentence],
      language: 'en',
    });
    expect(parsed.sentences).toHaveLength(1);
    expect(parsed.language).toBe('en');
  });

  it('rejects empty sentences array (min 1)', () => {
    const result = prepareHomeworkOutputSchema.safeParse({
      sentences: [],
      language: 'en',
    });
    expect(result.success).toBe(false);
  });

  it('accepts language code at min length (2)', () => {
    const result = prepareHomeworkOutputSchema.safeParse({
      sentences: [validSentence],
      language: 'no',
    });
    expect(result.success).toBe(true);
  });

  it('rejects language code below min length (2)', () => {
    const result = prepareHomeworkOutputSchema.safeParse({
      sentences: [validSentence],
      language: 'e',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateDictationOutputSchema
// ---------------------------------------------------------------------------

describe('generateDictationOutputSchema', () => {
  it('accepts a valid generate output', () => {
    const parsed = generateDictationOutputSchema.parse({
      sentences: [validSentence],
      title: 'Surprise dictation',
      topic: 'Nature',
      language: 'en',
    });
    expect(parsed.title).toBe('Surprise dictation');
  });

  it('rejects missing title', () => {
    const result = generateDictationOutputSchema.safeParse({
      sentences: [validSentence],
      topic: 'Nature',
      language: 'en',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty sentences array', () => {
    const result = generateDictationOutputSchema.safeParse({
      sentences: [],
      title: 'Test',
      topic: 'Test',
      language: 'en',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dictationMistakeSchema
// ---------------------------------------------------------------------------

describe('dictationMistakeSchema', () => {
  const validMistake = {
    sentenceIndex: 0,
    original: 'The cat sat',
    written: 'The cat set',
    error: 'Wrong vowel',
    correction: 'sat',
    explanation: '"Sat" is past tense of "sit"',
  };

  it('accepts a valid mistake', () => {
    const parsed = dictationMistakeSchema.parse(validMistake);
    expect(parsed.sentenceIndex).toBe(0);
  });

  it('rejects negative sentenceIndex', () => {
    const result = dictationMistakeSchema.safeParse({
      ...validMistake,
      sentenceIndex: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing correction field', () => {
    const { correction: _, ...rest } = validMistake;
    const result = dictationMistakeSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dictationReviewResultSchema
// ---------------------------------------------------------------------------

describe('dictationReviewResultSchema', () => {
  it('accepts a perfect result (no mistakes)', () => {
    const parsed = dictationReviewResultSchema.parse({
      totalSentences: 5,
      correctCount: 5,
      mistakes: [],
    });
    expect(parsed.mistakes).toEqual([]);
  });

  it('accepts result with mistakes', () => {
    const parsed = dictationReviewResultSchema.parse({
      totalSentences: 3,
      correctCount: 2,
      mistakes: [
        {
          sentenceIndex: 1,
          original: 'foo',
          written: 'bar',
          error: 'wrong',
          correction: 'foo',
          explanation: 'Explanation',
        },
      ],
    });
    expect(parsed.mistakes).toHaveLength(1);
  });

  it('rejects negative correctCount', () => {
    const result = dictationReviewResultSchema.safeParse({
      totalSentences: 5,
      correctCount: -1,
      mistakes: [],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordDictationResultInputSchema
// ---------------------------------------------------------------------------

describe('recordDictationResultInputSchema', () => {
  const validInput = {
    completionKey: UUID,
    localDate: '2025-01-15',
    sentenceCount: 5,
    mistakeCount: 1,
    mode: 'homework',
    reviewed: true,
    subjectId: UUID,
  };

  it('accepts valid input', () => {
    const parsed = recordDictationResultInputSchema.parse(validInput);
    expect(parsed.completionKey).toBe(UUID);
    expect(parsed.mode).toBe('homework');
    expect(parsed.reviewed).toBe(true);
  });

  it('[WI-84 review] accepts missing completionKey for legacy clients', () => {
    const { completionKey: _, ...rest } = validInput;
    const parsed = recordDictationResultInputSchema.parse(rest);
    expect(parsed.completionKey).toBeUndefined();
  });

  it('[WI-84 review] rejects malformed completionKey when provided', () => {
    const result = recordDictationResultInputSchema.safeParse({
      ...validInput,
      completionKey: 'not-a-uuid',
    });

    expect(result.success).toBe(false);
  });

  it('defaults reviewed to false', () => {
    const { reviewed: _, ...rest } = validInput;
    const parsed = recordDictationResultInputSchema.parse(rest);
    expect(parsed.reviewed).toBe(false);
  });

  it('accepts null mistakeCount', () => {
    const parsed = recordDictationResultInputSchema.parse({
      ...validInput,
      mistakeCount: null,
    });
    expect(parsed.mistakeCount).toBeNull();
  });

  it('accepts null subjectId', () => {
    const parsed = recordDictationResultInputSchema.parse({
      ...validInput,
      subjectId: null,
    });
    expect(parsed.subjectId).toBeNull();
  });

  it('rejects sentenceCount=0 (must be positive)', () => {
    const result = recordDictationResultInputSchema.safeParse({
      ...validInput,
      sentenceCount: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('sentenceCount');
    }
  });

  it('rejects invalid date format for localDate', () => {
    const result = recordDictationResultInputSchema.safeParse({
      ...validInput,
      localDate: '2025-13-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid mode enum', () => {
    const result = recordDictationResultInputSchema.safeParse({
      ...validInput,
      mode: 'practice',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('mode');
    }
  });
});

// ---------------------------------------------------------------------------
// dictationReviewInputSchema
// ---------------------------------------------------------------------------

describe('dictationReviewInputSchema', () => {
  const validReviewInput = {
    imageBase64: 'abc123',
    imageMimeType: 'image/jpeg',
    sentences: [validSentence],
    language: 'en',
  };

  it('accepts valid review input', () => {
    const parsed = dictationReviewInputSchema.parse(validReviewInput);
    expect(parsed.imageMimeType).toBe('image/jpeg');
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'accepts imageMimeType "%s"',
    (mimeType) => {
      const result = dictationReviewInputSchema.safeParse({
        ...validReviewInput,
        imageMimeType: mimeType,
      });
      expect(result.success).toBe(true);
    },
  );

  it('rejects invalid imageMimeType', () => {
    const result = dictationReviewInputSchema.safeParse({
      ...validReviewInput,
      imageMimeType: 'image/gif',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('imageMimeType');
    }
  });

  it('rejects empty imageBase64', () => {
    const result = dictationReviewInputSchema.safeParse({
      ...validReviewInput,
      imageBase64: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty sentences array', () => {
    const result = dictationReviewInputSchema.safeParse({
      ...validReviewInput,
      sentences: [],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dictationResultSchema
// ---------------------------------------------------------------------------

describe('dictationResultSchema', () => {
  const validResult = {
    id: UUID,
    profileId: UUID,
    completionKey: UUID,
    date: '2025-01-15',
    sentenceCount: 5,
    mistakeCount: 1,
    mode: 'homework',
    reviewed: false,
  };

  it('accepts a valid dictation result', () => {
    const parsed = dictationResultSchema.parse(validResult);
    expect(parsed.id).toBe(UUID);
    expect(parsed.reviewed).toBe(false);
  });

  it('accepts null mistakeCount', () => {
    const parsed = dictationResultSchema.parse({
      ...validResult,
      mistakeCount: null,
    });
    expect(parsed.mistakeCount).toBeNull();
  });

  it('rejects sentenceCount=0', () => {
    const result = dictationResultSchema.safeParse({
      ...validResult,
      sentenceCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid mode enum', () => {
    const result = dictationResultSchema.safeParse({
      ...validResult,
      mode: 'unknown',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('mode');
    }
  });

  it('rejects invalid date format', () => {
    const result = dictationResultSchema.safeParse({
      ...validResult,
      date: '2025/01/15',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing profileId', () => {
    const { profileId: _, ...rest } = validResult;
    const result = dictationResultSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordDictationResultResponseSchema
// ---------------------------------------------------------------------------

describe('recordDictationResultResponseSchema', () => {
  it('wraps dictation result correctly', () => {
    const validResult = {
      id: UUID,
      profileId: UUID,
      completionKey: UUID,
      date: '2025-01-15',
      sentenceCount: 5,
      mistakeCount: 0,
      mode: 'surprise',
      reviewed: true,
    };
    const parsed = recordDictationResultResponseSchema.parse({
      result: validResult,
    });
    expect(parsed.result.mode).toBe('surprise');
  });
});

// ---------------------------------------------------------------------------
// dictationStreakSchema
// ---------------------------------------------------------------------------

describe('dictationStreakSchema', () => {
  it('accepts a streak with lastDate', () => {
    const parsed = dictationStreakSchema.parse({
      streak: 7,
      lastDate: '2025-01-14',
    });
    expect(parsed.streak).toBe(7);
    expect(parsed.lastDate).toBe('2025-01-14');
  });

  it('accepts null lastDate (never done)', () => {
    const parsed = dictationStreakSchema.parse({ streak: 0, lastDate: null });
    expect(parsed.lastDate).toBeNull();
  });

  it('rejects negative streak', () => {
    const result = dictationStreakSchema.safeParse({
      streak: -1,
      lastDate: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('streak');
    }
  });
});

// ---------------------------------------------------------------------------
// [WI-150 / WI-206] Payload caps — schema, prompt-char helper, typed error
// ---------------------------------------------------------------------------

describe('dictation payload caps [WI-150 / WI-206]', () => {
  const VALID_BASE_INPUT = {
    imageBase64: 'dGVzdA==',
    imageMimeType: 'image/jpeg' as const,
    language: 'en',
  };

  function sentenceOfLen(textLen: number, withPunctLen = textLen) {
    return {
      text: 'a'.repeat(textLen),
      withPunctuation: 'a'.repeat(withPunctLen),
      wordCount: Math.max(1, Math.floor(textLen / 4)),
    };
  }

  describe('per-sentence text/withPunctuation caps', () => {
    it('accepts text at the per-sentence cap', () => {
      const result = dictationSentenceSchema.safeParse(
        sentenceOfLen(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS),
      );
      expect(result.success).toBe(true);
    });

    it('rejects text one over the per-sentence cap', () => {
      const result = dictationSentenceSchema.safeParse(
        sentenceOfLen(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS + 1, 10),
      );
      expect(result.success).toBe(false);
    });

    it('rejects withPunctuation one over the per-sentence cap', () => {
      const result = dictationSentenceSchema.safeParse(
        sentenceOfLen(10, DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS + 1),
      );
      expect(result.success).toBe(false);
    });
  });

  describe('sentence-array cap on dictationReviewInputSchema', () => {
    it('accepts exactly DICTATION_REVIEW_MAX_SENTENCES sentences', () => {
      const result = dictationReviewInputSchema.safeParse({
        ...VALID_BASE_INPUT,
        sentences: Array.from({ length: DICTATION_REVIEW_MAX_SENTENCES }, () =>
          sentenceOfLen(20),
        ),
      });
      expect(result.success).toBe(true);
    });

    it('rejects one over the sentence-array cap', () => {
      const result = dictationReviewInputSchema.safeParse({
        ...VALID_BASE_INPUT,
        sentences: Array.from(
          { length: DICTATION_REVIEW_MAX_SENTENCES + 1 },
          () => sentenceOfLen(20),
        ),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('dictationReviewPromptCharCount helper', () => {
    it('sums text + withPunctuation across all sentences', () => {
      expect(
        dictationReviewPromptCharCount({
          sentences: [
            { text: 'aaa', withPunctuation: 'bb' }, // 5
            { text: 'cccc', withPunctuation: 'd' }, // 5
          ],
        }),
      ).toBe(10);
    });

    it('returns 0 for an empty sentences array', () => {
      expect(dictationReviewPromptCharCount({ sentences: [] })).toBe(0);
    });
  });

  describe('DictationPayloadTooLargeError', () => {
    it('carries errorCode, limit, and actual for caller diagnostics', () => {
      const err = new DictationPayloadTooLargeError(
        'Total prompt size 13000 exceeds 12000',
        DICTATION_REVIEW_MAX_PROMPT_CHARS,
        13000,
      );
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DictationPayloadTooLargeError);
      expect(err.errorCode).toBe('PAYLOAD_TOO_LARGE');
      expect(err.limit).toBe(DICTATION_REVIEW_MAX_PROMPT_CHARS);
      expect(err.actual).toBe(13000);
    });

    it('preserves instanceof across Promise.reject round-trip', async () => {
      await expect(
        Promise.reject(
          new DictationPayloadTooLargeError(
            'too big',
            DICTATION_REVIEW_MAX_PROMPT_CHARS,
            13000,
          ),
        ),
      ).rejects.toBeInstanceOf(DictationPayloadTooLargeError);
    });
  });
});
