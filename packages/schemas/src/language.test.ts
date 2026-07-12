import {
  pedagogyModeSchema,
  vocabTypeSchema,
  cefrLevelSchema,
  languageCodeSchema,
  languageDetectionSchema,
  languageSetupSchema,
  nativeLanguageUpdateSchema,
  nativeLanguageResponseSchema,
  vocabularySchema,
  vocabularyCreateSchema,
  vocabularyUpdateSchema,
  vocabularyReviewSchema,
  vocabularyRetentionCardSchema,
  vocabularyListResponseSchema,
  vocabularyCreateResponseSchema,
  vocabularyReviewResponseSchema,
  vocabularyDeleteResponseSchema,
  languageMilestoneProgressSchema,
  languageProgressSchema,
  languageSessionSummarySchema,
} from './language.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '660e8400-e29b-41d4-a716-446655440001';
const ISO = '2025-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

describe('pedagogyModeSchema', () => {
  it.each(['socratic', 'four_strands'])('accepts mode "%s"', (mode) => {
    expect(pedagogyModeSchema.parse(mode)).toBe(mode);
  });

  it('rejects invalid pedagogy mode', () => {
    const result = pedagogyModeSchema.safeParse('flashcard');
    expect(result.success).toBe(false);
  });
});

describe('vocabTypeSchema', () => {
  it.each(['word', 'chunk'])('accepts type "%s"', (type) => {
    expect(vocabTypeSchema.parse(type)).toBe(type);
  });

  it('rejects invalid vocab type', () => {
    const result = vocabTypeSchema.safeParse('phrase');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('cefrLevelSchema', () => {
  it.each(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])(
    'accepts CEFR level "%s"',
    (level) => {
      expect(cefrLevelSchema.parse(level)).toBe(level);
    },
  );

  it('rejects invalid CEFR level', () => {
    const result = cefrLevelSchema.safeParse('D1');
    expect(result.success).toBe(false);
  });

  it('rejects lowercase CEFR level', () => {
    const result = cefrLevelSchema.safeParse('a1');
    expect(result.success).toBe(false);
  });
});

describe('languageCodeSchema', () => {
  it('accepts valid 2-char language code', () => {
    expect(languageCodeSchema.parse('en')).toBe('en');
    expect(languageCodeSchema.parse('no')).toBe('no');
  });

  it('accepts longer language code (e.g. en-US)', () => {
    expect(languageCodeSchema.parse('en-US')).toBe('en-US');
  });

  it('rejects code shorter than 2 chars', () => {
    const result = languageCodeSchema.safeParse('e');
    expect(result.success).toBe(false);
  });

  it('rejects code longer than 10 chars', () => {
    const result = languageCodeSchema.safeParse('en-US-extra-long');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// languageDetectionSchema
// ---------------------------------------------------------------------------

describe('languageDetectionSchema', () => {
  const validDetection = {
    code: 'no',
    pedagogyMode: 'four_strands',
    matchedName: 'Norwegian',
    sttLocale: 'nb-NO',
    ttsVoice: 'nb-NO-Standard-A',
  };

  it('accepts valid detection', () => {
    const parsed = languageDetectionSchema.parse(validDetection);
    expect(parsed.code).toBe('no');
    expect(parsed.pedagogyMode).toBe('four_strands');
  });

  it('defaults pedagogyMode to four_strands when omitted', () => {
    const { pedagogyMode: _, ...rest } = validDetection;
    const parsed = languageDetectionSchema.parse(rest);
    expect(parsed.pedagogyMode).toBe('four_strands');
  });

  it('rejects invalid pedagogyMode', () => {
    const result = languageDetectionSchema.safeParse({
      ...validDetection,
      pedagogyMode: 'rote',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// languageSetupSchema
// ---------------------------------------------------------------------------

describe('languageSetupSchema', () => {
  it('accepts valid setup', () => {
    const parsed = languageSetupSchema.parse({
      nativeLanguage: 'Norwegian',
      startingLevel: 'A1',
    });
    expect(parsed.startingLevel).toBe('A1');
  });

  it('rejects invalid CEFR level', () => {
    const result = languageSetupSchema.safeParse({
      nativeLanguage: 'Norwegian',
      startingLevel: 'D1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('startingLevel');
    }
  });
});

// ---------------------------------------------------------------------------
// nativeLanguageUpdateSchema / nativeLanguageResponseSchema
// ---------------------------------------------------------------------------

describe('nativeLanguageUpdateSchema', () => {
  it('accepts string nativeLanguage', () => {
    const parsed = nativeLanguageUpdateSchema.parse({
      nativeLanguage: 'Norwegian',
    });
    expect(parsed.nativeLanguage).toBe('Norwegian');
  });

  it('accepts null nativeLanguage', () => {
    const parsed = nativeLanguageUpdateSchema.parse({ nativeLanguage: null });
    expect(parsed.nativeLanguage).toBeNull();
  });

  it('rejects missing nativeLanguage field', () => {
    const result = nativeLanguageUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('nativeLanguageResponseSchema', () => {
  it('accepts null nativeLanguage', () => {
    expect(
      nativeLanguageResponseSchema.parse({ nativeLanguage: null })
        .nativeLanguage,
    ).toBeNull();
  });

  it('accepts string nativeLanguage', () => {
    expect(
      nativeLanguageResponseSchema.parse({ nativeLanguage: 'English' })
        .nativeLanguage,
    ).toBe('English');
  });
});

// ---------------------------------------------------------------------------
// vocabularySchema
// ---------------------------------------------------------------------------

const validVocabulary = {
  id: UUID,
  profileId: UUID,
  subjectId: UUID,
  term: 'Hund',
  termNormalized: 'hund',
  translation: 'Dog',
  type: 'word',
  mastered: false,
  createdAt: ISO,
  updatedAt: ISO,
};

describe('vocabularySchema', () => {
  it('accepts a valid vocabulary entry', () => {
    const parsed = vocabularySchema.parse(validVocabulary);
    expect(parsed.type).toBe('word');
    expect(parsed.mastered).toBe(false);
  });

  it('accepts optional cefrLevel', () => {
    const parsed = vocabularySchema.parse({
      ...validVocabulary,
      cefrLevel: 'B1',
    });
    expect(parsed.cefrLevel).toBe('B1');
  });

  it('accepts null cefrLevel', () => {
    const parsed = vocabularySchema.parse({
      ...validVocabulary,
      cefrLevel: null,
    });
    expect(parsed.cefrLevel).toBeNull();
  });

  it('accepts optional milestoneId', () => {
    const parsed = vocabularySchema.parse({
      ...validVocabulary,
      milestoneId: UUID2,
    });
    expect(parsed.milestoneId).toBe(UUID2);
  });

  it('accepts null milestoneId', () => {
    const parsed = vocabularySchema.parse({
      ...validVocabulary,
      milestoneId: null,
    });
    expect(parsed.milestoneId).toBeNull();
  });

  it('rejects invalid type enum', () => {
    const result = vocabularySchema.safeParse({
      ...validVocabulary,
      type: 'phrase',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('type');
    }
  });

  it('rejects term exceeding 200 chars', () => {
    const result = vocabularySchema.safeParse({
      ...validVocabulary,
      term: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid datetime for createdAt', () => {
    const result = vocabularySchema.safeParse({
      ...validVocabulary,
      createdAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing subjectId', () => {
    const { subjectId: _, ...rest } = validVocabulary;
    const result = vocabularySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// vocabularyCreateSchema
// ---------------------------------------------------------------------------

describe('vocabularyCreateSchema', () => {
  it('accepts valid create input', () => {
    const parsed = vocabularyCreateSchema.parse({
      term: 'Katt',
      translation: 'Cat',
      type: 'word',
    });
    expect(parsed.type).toBe('word');
  });

  it('defaults type to "word" when omitted', () => {
    const parsed = vocabularyCreateSchema.parse({
      term: 'Katt',
      translation: 'Cat',
    });
    expect(parsed.type).toBe('word');
  });

  it('accepts chunk type', () => {
    const parsed = vocabularyCreateSchema.parse({
      term: 'take it easy',
      translation: 'ta det med ro',
      type: 'chunk',
    });
    expect(parsed.type).toBe('chunk');
  });

  it('rejects empty term', () => {
    const result = vocabularyCreateSchema.safeParse({
      term: '',
      translation: 'Cat',
    });
    expect(result.success).toBe(false);
  });

  it('rejects translation exceeding 500 chars', () => {
    const result = vocabularyCreateSchema.safeParse({
      term: 'Hund',
      translation: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// vocabularyUpdateSchema
// ---------------------------------------------------------------------------

describe('vocabularyUpdateSchema', () => {
  it('accepts partial update (all optional)', () => {
    const parsed = vocabularyUpdateSchema.parse({});
    expect(parsed.translation).toBeUndefined();
  });

  it('accepts mastered=true', () => {
    const parsed = vocabularyUpdateSchema.parse({ mastered: true });
    expect(parsed.mastered).toBe(true);
  });

  it('accepts null cefrLevel (clearing it)', () => {
    const parsed = vocabularyUpdateSchema.parse({ cefrLevel: null });
    expect(parsed.cefrLevel).toBeNull();
  });

  it('accepts null milestoneId', () => {
    const parsed = vocabularyUpdateSchema.parse({ milestoneId: null });
    expect(parsed.milestoneId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// vocabularyReviewSchema
// ---------------------------------------------------------------------------

describe('vocabularyReviewSchema', () => {
  it('accepts quality=0 (boundary)', () => {
    expect(vocabularyReviewSchema.parse({ quality: 0 }).quality).toBe(0);
  });

  it('accepts quality=5 (boundary)', () => {
    expect(vocabularyReviewSchema.parse({ quality: 5 }).quality).toBe(5);
  });

  it('rejects quality=-1', () => {
    const result = vocabularyReviewSchema.safeParse({ quality: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('quality');
    }
  });

  it('rejects quality=6 (above max)', () => {
    const result = vocabularyReviewSchema.safeParse({ quality: 6 });
    expect(result.success).toBe(false);
  });

  it('rejects fractional quality', () => {
    const result = vocabularyReviewSchema.safeParse({ quality: 2.5 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// vocabularyRetentionCardSchema
// ---------------------------------------------------------------------------

const validRetentionCard = {
  vocabularyId: UUID,
  easeFactor: 2.5,
  intervalDays: 7,
  repetitions: 3,
  lastReviewedAt: ISO,
  nextReviewAt: ISO,
  failureCount: 0,
  consecutiveSuccesses: 2,
};

describe('vocabularyRetentionCardSchema', () => {
  it('accepts a valid retention card', () => {
    const parsed = vocabularyRetentionCardSchema.parse(validRetentionCard);
    expect(parsed.easeFactor).toBe(2.5);
  });

  it('accepts null lastReviewedAt and nextReviewAt', () => {
    const parsed = vocabularyRetentionCardSchema.parse({
      ...validRetentionCard,
      lastReviewedAt: null,
      nextReviewAt: null,
    });
    expect(parsed.lastReviewedAt).toBeNull();
    expect(parsed.nextReviewAt).toBeNull();
  });

  it('rejects missing vocabularyId', () => {
    const { vocabularyId: _, ...rest } = validRetentionCard;
    const result = vocabularyRetentionCardSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route-level vocabulary response schemas
// ---------------------------------------------------------------------------

describe('vocabularyListResponseSchema', () => {
  it('accepts empty vocabulary list', () => {
    const parsed = vocabularyListResponseSchema.parse({ vocabulary: [] });
    expect(parsed.vocabulary).toEqual([]);
  });

  it('accepts list with one entry', () => {
    const parsed = vocabularyListResponseSchema.parse({
      vocabulary: [validVocabulary],
    });
    expect(parsed.vocabulary).toHaveLength(1);
  });
});

describe('vocabularyCreateResponseSchema', () => {
  it('wraps single vocabulary entry', () => {
    const parsed = vocabularyCreateResponseSchema.parse({
      vocabulary: validVocabulary,
    });
    expect(parsed.vocabulary.term).toBe('Hund');
  });
});

describe('vocabularyReviewResponseSchema', () => {
  it('wraps vocabulary with retention card', () => {
    const parsed = vocabularyReviewResponseSchema.parse({
      vocabulary: validVocabulary,
      retention: validRetentionCard,
    });
    expect(parsed.retention.easeFactor).toBe(2.5);
  });
});

describe('vocabularyDeleteResponseSchema', () => {
  it('accepts success=true', () => {
    expect(
      vocabularyDeleteResponseSchema.parse({ success: true }).success,
    ).toBe(true);
  });

  it('accepts success=false', () => {
    expect(
      vocabularyDeleteResponseSchema.parse({ success: false }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// languageMilestoneProgressSchema
// ---------------------------------------------------------------------------

describe('languageMilestoneProgressSchema', () => {
  const validMilestone = {
    milestoneId: UUID,
    milestoneTitle: 'A1 Core',
    currentLevel: 'A1',
    currentSublevel: 'A1.1',
    wordsMastered: 50,
    wordsTarget: 100,
    chunksMastered: 10,
    chunksTarget: 20,
    milestoneProgress: 0.5,
  };

  it('accepts valid milestone progress', () => {
    const parsed = languageMilestoneProgressSchema.parse(validMilestone);
    expect(parsed.milestoneProgress).toBe(0.5);
  });

  it('accepts milestoneProgress at boundaries (0 and 1)', () => {
    expect(
      languageMilestoneProgressSchema.parse({
        ...validMilestone,
        milestoneProgress: 0,
      }).milestoneProgress,
    ).toBe(0);
    expect(
      languageMilestoneProgressSchema.parse({
        ...validMilestone,
        milestoneProgress: 1,
      }).milestoneProgress,
    ).toBe(1);
  });

  it('rejects milestoneProgress > 1', () => {
    const result = languageMilestoneProgressSchema.safeParse({
      ...validMilestone,
      milestoneProgress: 1.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid CEFR level', () => {
    const result = languageMilestoneProgressSchema.safeParse({
      ...validMilestone,
      currentLevel: 'D1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('currentLevel');
    }
  });
});

// ---------------------------------------------------------------------------
// languageProgressSchema
// ---------------------------------------------------------------------------

describe('languageProgressSchema', () => {
  const validProgress = {
    subjectId: UUID,
    languageCode: 'no',
    pedagogyMode: 'four_strands',
    currentLevel: null,
    currentSublevel: null,
    currentMilestone: null,
    nextMilestone: null,
    nextPractice: null,
    strandBalance: null,
    skillProfile: null,
  };

  it('accepts progress with all nullable fields null', () => {
    const parsed = languageProgressSchema.parse(validProgress);
    expect(parsed.currentLevel).toBeNull();
    expect(parsed.currentMilestone).toBeNull();
    expect(parsed.nextMilestone).toBeNull();
    expect(parsed.strandBalance).toBeNull();
    expect(parsed.skillProfile).toBeNull();
  });

  it('round-trips strand balance and evidence-backed skill progress', () => {
    const parsed = languageProgressSchema.parse({
      ...validProgress,
      strandBalance: {
        counts: {
          meaning_input: 5,
          meaning_output: 3,
          language_focus: 4,
          fluency: 2,
        },
        sessionsSampled: 3,
      },
      skillProfile: [
        {
          skill: 'vocabulary',
          progress: 0.5,
          evidenceCount: 25,
        },
        {
          skill: 'speaking',
          progress: null,
          evidenceCount: 7,
        },
      ],
    });

    expect(parsed.strandBalance).toEqual({
      counts: {
        meaning_input: 5,
        meaning_output: 3,
        language_focus: 4,
        fluency: 2,
      },
      sessionsSampled: 3,
    });
    expect(parsed.skillProfile).toEqual([
      { skill: 'vocabulary', progress: 0.5, evidenceCount: 25 },
      { skill: 'speaking', progress: null, evidenceCount: 7 },
    ]);
  });

  it('rejects out-of-range skill progress', () => {
    const result = languageProgressSchema.safeParse({
      ...validProgress,
      skillProfile: [{ skill: 'fluency', progress: 1.1, evidenceCount: 1 }],
    });

    expect(result.success).toBe(false);
  });

  it('accepts progress with currentLevel set', () => {
    const parsed = languageProgressSchema.parse({
      ...validProgress,
      currentLevel: 'B2',
      currentSublevel: 'B2.1',
    });
    expect(parsed.currentLevel).toBe('B2');
  });

  it('accepts progress with nextMilestone', () => {
    const parsed = languageProgressSchema.parse({
      ...validProgress,
      nextMilestone: {
        milestoneId: UUID2,
        milestoneTitle: 'B1 Core',
        level: 'B1',
        sublevel: 'B1.1',
      },
    });
    expect(parsed.nextMilestone?.level).toBe('B1');
  });

  it('rejects invalid pedagogyMode', () => {
    const result = languageProgressSchema.safeParse({
      ...validProgress,
      pedagogyMode: 'rote',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('pedagogyMode');
    }
  });

  it('rejects invalid CEFR level for currentLevel', () => {
    const result = languageProgressSchema.safeParse({
      ...validProgress,
      currentLevel: 'X9',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid languageCode (too short)', () => {
    const result = languageProgressSchema.safeParse({
      ...validProgress,
      languageCode: 'x',
    });
    expect(result.success).toBe(false);
  });

  // WI-1552: additive nextPractice field.
  it('accepts progress with a persisted next-practice pointer', () => {
    const parsed = languageProgressSchema.parse({
      ...validProgress,
      nextPractice: {
        strand: 'meaning_output',
        reason:
          'least-practiced strand from the prior session (meaning_input=3, meaning_output=0, language_focus=2, fluency=2)',
        sessionStrandCounts: {
          meaning_input: 3,
          meaning_output: 0,
          language_focus: 2,
          fluency: 2,
        },
        computedAt: '2026-07-11T10:00:00.000Z',
      },
    });
    expect(parsed.nextPractice?.strand).toBe('meaning_output');
  });

  it('rejects an invalid strand on the next-practice pointer', () => {
    const result = languageProgressSchema.safeParse({
      ...validProgress,
      nextPractice: {
        strand: 'not-a-real-strand',
        reason: 'x',
        sessionStrandCounts: {
          meaning_input: 0,
          meaning_output: 0,
          language_focus: 0,
          fluency: 0,
        },
        computedAt: '2026-07-11T10:00:00.000Z',
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [WI-1553] languageSessionSummarySchema
// ---------------------------------------------------------------------------
describe('languageSessionSummarySchema', () => {
  it('accepts a fully-populated (rich-data) summary', () => {
    const result = languageSessionSummarySchema.safeParse({
      practicedScenario: 'order food at a cafe',
      newWords: [{ term: 'croissant', type: 'word' }],
      strengthenedWords: [{ term: 'bonjour', type: 'word' }],
      grammarPatterns: ['polite requests: je voudrais'],
      comprehension: { correct: 1, total: 1 },
      speakingAttempts: 2,
      fluency: { correct: 4, total: 5 },
      nextRecommendationStrand: 'fluency',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an all-empty/null (sparse-data) summary', () => {
    const result = languageSessionSummarySchema.safeParse({
      practicedScenario: null,
      newWords: [],
      strengthenedWords: [],
      grammarPatterns: [],
      comprehension: null,
      speakingAttempts: 0,
      fluency: null,
      nextRecommendationStrand: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid word type', () => {
    const result = languageSessionSummarySchema.safeParse({
      practicedScenario: null,
      newWords: [{ term: 'x', type: 'not-a-real-type' }],
      strengthenedWords: [],
      grammarPatterns: [],
      comprehension: null,
      speakingAttempts: 0,
      fluency: null,
      nextRecommendationStrand: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid nextRecommendationStrand', () => {
    const result = languageSessionSummarySchema.safeParse({
      practicedScenario: null,
      newWords: [],
      strengthenedWords: [],
      grammarPatterns: [],
      comprehension: null,
      speakingAttempts: 0,
      fluency: null,
      nextRecommendationStrand: 'not-a-real-strand',
    });
    expect(result.success).toBe(false);
  });
});
