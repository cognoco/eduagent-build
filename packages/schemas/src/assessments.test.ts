import {
  evaluateAssessmentSchema,
  evaluateEligibilitySchema,
  evaluateDifficultyRungSchema,
  evaluateFailureActionSchema,
  retentionCardSchema,
  verificationTypeSchema,
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
      })
    ).toThrow();

    expect(() =>
      evaluateAssessmentSchema.parse({
        challengePassed: true,
        quality: -1,
      })
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
    xpStatus: 'verified' as const,
    failureCount: 0,
  };

  it('parses card without evaluateDifficultyRung', () => {
    const result = retentionCardSchema.parse(baseCard);
    expect(result.evaluateDifficultyRung).toBeUndefined();
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
      retentionCardSchema.parse({ ...baseCard, evaluateDifficultyRung: 0 })
    ).toThrow();
    expect(() =>
      retentionCardSchema.parse({ ...baseCard, evaluateDifficultyRung: 5 })
    ).toThrow();
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
      })
    ).toThrow();
  });
});
