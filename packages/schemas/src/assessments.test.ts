import {
  evaluateAssessmentSchema,
  evaluateEligibilitySchema,
  evaluateDifficultyRungSchema,
  evaluateFailureActionSchema,
  assessmentEligibleTopicSchema,
  needsDeepeningSchema,
  libraryRetentionResponseSchema,
  retentionCardSchema,
  relearnTopicSchema,
  verificationTypeSchema,
  teachingPreferenceResponseDataSchema,
} from './assessments.js';

const TEST_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// verificationTypeSchema
// ---------------------------------------------------------------------------

describe('verificationTypeSchema', () => {
  it('accepts standard', () => {
    expect(verificationTypeSchema.parse('standard')).toBe('standard');
  });

  it('accepts evaluate', () => {
    expect(verificationTypeSchema.parse('evaluate')).toBe('evaluate');
  });

  it('accepts teach_back', () => {
    expect(verificationTypeSchema.parse('teach_back')).toBe('teach_back');
  });

  it('rejects unknown type', () => {
    expect(() => verificationTypeSchema.parse('unknown')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// evaluateAssessmentSchema
// ---------------------------------------------------------------------------

describe('evaluateAssessmentSchema', () => {
  it('parses valid passed assessment', () => {
    const data = {
      challengePassed: true,
      flawIdentified: 'wrong formula applied',
      quality: 4,
    };
    expect(evaluateAssessmentSchema.parse(data)).toEqual(data);
  });

  it('parses valid failed assessment without flawIdentified', () => {
    const data = {
      challengePassed: false,
      quality: 1,
    };
    const result = evaluateAssessmentSchema.parse(data);
    expect(result.challengePassed).toBe(false);
    expect(result.quality).toBe(1);
  });

  it('rejects quality outside 0-5 range', () => {
    expect(() =>
      evaluateAssessmentSchema.parse({
        challengePassed: true,
        quality: 6,
      }),
    ).toThrow();

    expect(() =>
      evaluateAssessmentSchema.parse({
        challengePassed: true,
        quality: -1,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// retentionCardSchema (evaluateDifficultyRung field)
// ---------------------------------------------------------------------------

describe('retentionCardSchema', () => {
  const baseCard = {
    topicId: TEST_UUID,
    easeFactor: 2.5,
    intervalDays: 6,
    repetitions: 3,
    nextReviewAt: '2025-03-01T00:00:00.000Z',
    lastReviewedAt: '2025-02-23T00:00:00.000Z',
    daysSinceLastReview: 6,
    xpStatus: 'verified' as const,
    failureCount: 0,
  };

  it('parses card without evaluateDifficultyRung', () => {
    const result = retentionCardSchema.parse(baseCard);
    expect(result.evaluateDifficultyRung).toBeUndefined();
  });

  it('parses sticky mastery timestamp', () => {
    const result = retentionCardSchema.parse({
      ...baseCard,
      masteredAt: '2025-02-24T00:00:00.000Z',
    });
    expect(result.masteredAt).toBe('2025-02-24T00:00:00.000Z');
  });

  it('accepts null mastery timestamp', () => {
    const result = retentionCardSchema.parse({
      ...baseCard,
      masteredAt: null,
    });
    expect(result.masteredAt).toBeNull();
  });

  it('parses card with evaluateDifficultyRung = null', () => {
    const result = retentionCardSchema.parse({
      ...baseCard,
      evaluateDifficultyRung: null,
    });
    expect(result.evaluateDifficultyRung).toBeNull();
  });

  it('parses card with evaluateDifficultyRung 1-4', () => {
    for (const rung of [1, 2, 3, 4]) {
      const result = retentionCardSchema.parse({
        ...baseCard,
        evaluateDifficultyRung: rung,
      });
      expect(result.evaluateDifficultyRung).toBe(rung);
    }
  });

  it('rejects evaluateDifficultyRung outside 1-4', () => {
    expect(() =>
      retentionCardSchema.parse({ ...baseCard, evaluateDifficultyRung: 0 }),
    ).toThrow();
    expect(() =>
      retentionCardSchema.parse({ ...baseCard, evaluateDifficultyRung: 5 }),
    ).toThrow();
  });
});

describe('libraryRetentionResponseSchema', () => {
  it('accepts orphan retention topics with null bookId', () => {
    const result = libraryRetentionResponseSchema.parse({
      subjects: [
        {
          subjectId: TEST_UUID,
          topics: [
            {
              topicId: TEST_UUID,
              topicTitle: 'Photosynthesis',
              bookId: null,
              easeFactor: 2.5,
              intervalDays: 6,
              repetitions: 3,
              nextReviewAt: '2025-03-01T00:00:00.000Z',
              lastReviewedAt: '2025-02-23T00:00:00.000Z',
              daysSinceLastReview: 6,
              xpStatus: 'verified',
              failureCount: 0,
            },
          ],
          reviewDueCount: 1,
        },
      ],
    });

    expect(result.subjects[0]?.topics[0]?.bookId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// evaluateEligibilitySchema
// ---------------------------------------------------------------------------

describe('evaluateEligibilitySchema', () => {
  it('parses eligible result', () => {
    const data = {
      eligible: true,
      topicId: TEST_UUID,
      topicTitle: 'Photosynthesis',
      currentRung: 2,
      easeFactor: 2.7,
      repetitions: 5,
    };
    expect(evaluateEligibilitySchema.parse(data)).toEqual(data);
  });

  it('parses not eligible result with reason', () => {
    const data = {
      eligible: false,
      topicId: TEST_UUID,
      topicTitle: 'Algebra',
      currentRung: 1,
      easeFactor: 2.1,
      repetitions: 0,
      reason: 'Ease factor below 2.5',
    };
    expect(evaluateEligibilitySchema.parse(data)).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// evaluateDifficultyRungSchema
// ---------------------------------------------------------------------------

describe('evaluateDifficultyRungSchema', () => {
  it.each([1, 2, 3, 4])('accepts rung %d', (rung) => {
    expect(evaluateDifficultyRungSchema.parse(rung)).toBe(rung);
  });

  it('rejects 0', () => {
    expect(() => evaluateDifficultyRungSchema.parse(0)).toThrow();
  });

  it('rejects 5', () => {
    expect(() => evaluateDifficultyRungSchema.parse(5)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// evaluateFailureActionSchema
// ---------------------------------------------------------------------------

describe('evaluateFailureActionSchema', () => {
  it('parses reveal_flaw action', () => {
    const data = {
      action: 'reveal_flaw',
      message: 'Here is the flaw.',
    };
    expect(evaluateFailureActionSchema.parse(data)).toEqual(data);
  });

  it('parses lower_difficulty action with newDifficultyRung', () => {
    const data = {
      action: 'lower_difficulty',
      message: 'Lowering difficulty.',
      newDifficultyRung: 2,
    };
    expect(evaluateFailureActionSchema.parse(data)).toEqual(data);
  });

  it('parses exit_to_standard action', () => {
    const data = {
      action: 'exit_to_standard',
      message: 'Switching to standard review.',
    };
    expect(evaluateFailureActionSchema.parse(data)).toEqual(data);
  });

  it('rejects unknown action', () => {
    expect(() =>
      evaluateFailureActionSchema.parse({
        action: 'unknown',
        message: 'test',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// assessmentEligibleTopicSchema
// ---------------------------------------------------------------------------

describe('assessmentEligibleTopicSchema', () => {
  it('requires the topic description so the check has visible scope', () => {
    const data = {
      topicId: TEST_UUID,
      topicTitle: 'Photosynthesis',
      topicDescription: 'How plants use light, water, and carbon dioxide.',
      subjectId: '660e8400-e29b-41d4-a716-446655440000',
      subjectName: 'Biology',
      pedagogyMode: 'socratic',
      languageCode: null,
      activeAssessmentId: null,
      lastStudiedAt: '2026-05-17T08:00:00.000Z',
    };

    expect(assessmentEligibleTopicSchema.parse(data)).toEqual(data);
    expect(() =>
      assessmentEligibleTopicSchema.parse({
        ...data,
        topicDescription: undefined,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// needsDeepeningSchema
// ---------------------------------------------------------------------------

describe('needsDeepeningSchema', () => {
  it('accepts pending review rows with an expiry timestamp', () => {
    const data = {
      topicId: TEST_UUID,
      status: 'pending_review',
      consecutiveSuccessCount: 0,
      pendingExpiresAt: '2026-06-01T12:00:00.000Z',
    };

    expect(needsDeepeningSchema.parse(data)).toEqual(data);
  });

  it('accepts confirmed rows without a pending expiry timestamp', () => {
    const data = {
      topicId: TEST_UUID,
      status: 'active',
      consecutiveSuccessCount: 2,
      pendingExpiresAt: null,
    };

    expect(needsDeepeningSchema.parse(data)).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// relearnTopicSchema
// ---------------------------------------------------------------------------

describe('relearnTopicSchema', () => {
  it('accepts same-method relearn requests without preferredMethod', () => {
    expect(
      relearnTopicSchema.parse({
        topicId: TEST_UUID,
        method: 'same',
      }),
    ).toEqual({
      topicId: TEST_UUID,
      method: 'same',
    });
  });

  it("requires preferredMethod when method is 'different'", () => {
    const result = relearnTopicSchema.safeParse({
      topicId: TEST_UUID,
      method: 'different',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['preferredMethod'],
            message: "preferredMethod is required when method is 'different'",
          }),
        ]),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// teachingPreferenceResponseDataSchema [WI-979]
// `method` / `analogyDomain` were bare z.string(); tightened to the canonical
// teachingMethodSchema / analogyDomainSchema (the same enums the write path and
// the DB pgEnum columns enforce). nullable/optional modifiers preserved.
// ---------------------------------------------------------------------------

describe('teachingPreferenceResponseDataSchema', () => {
  const SUBJECT_UUID = '660e8400-e29b-41d4-a716-446655440000';

  it('accepts every canonical teachingMethod enum value', () => {
    for (const method of [
      'visual_diagrams',
      'step_by_step',
      'real_world_examples',
      'practice_problems',
    ] as const) {
      const data = {
        subjectId: SUBJECT_UUID,
        method,
        analogyDomain: null,
        nativeLanguage: null,
      };
      expect(teachingPreferenceResponseDataSchema.parse(data)).toEqual(data);
    }
  });

  it('accepts every canonical analogyDomain enum value', () => {
    for (const analogyDomain of [
      'cooking',
      'sports',
      'building',
      'music',
      'nature',
      'gaming',
    ] as const) {
      const data = {
        subjectId: SUBJECT_UUID,
        method: 'step_by_step',
        analogyDomain,
        nativeLanguage: null,
      };
      expect(teachingPreferenceResponseDataSchema.parse(data)).toEqual(data);
    }
  });

  it('allows analogyDomain and nativeLanguage to be null but requires both keys to be present', () => {
    expect(
      teachingPreferenceResponseDataSchema.parse({
        subjectId: SUBJECT_UUID,
        method: 'step_by_step',
        analogyDomain: null,
        nativeLanguage: null,
      }).analogyDomain,
    ).toBeNull();

    // analogyDomain key omitted → response fails (response schema is .nullable(), not .optional())
    expect(
      teachingPreferenceResponseDataSchema.safeParse({
        subjectId: SUBJECT_UUID,
        method: 'step_by_step',
        nativeLanguage: null,
      }).success,
    ).toBe(false);

    // nativeLanguage key omitted → response fails (symmetric to analogyDomain)
    expect(
      teachingPreferenceResponseDataSchema.safeParse({
        subjectId: SUBJECT_UUID,
        method: 'step_by_step',
        analogyDomain: null,
      }).success,
    ).toBe(false);
  });

  it('rejects an out-of-enum method', () => {
    expect(
      teachingPreferenceResponseDataSchema.safeParse({
        subjectId: SUBJECT_UUID,
        method: 'not_a_real_method',
        analogyDomain: null,
        nativeLanguage: null,
      }).success,
    ).toBe(false);
  });

  it('rejects an out-of-enum analogyDomain', () => {
    expect(
      teachingPreferenceResponseDataSchema.safeParse({
        subjectId: SUBJECT_UUID,
        method: 'step_by_step',
        analogyDomain: 'astrology',
        nativeLanguage: null,
      }).success,
    ).toBe(false);
  });
});
