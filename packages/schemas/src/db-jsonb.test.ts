import {
  HOME_SURFACE_CACHE_KIND,
  coachingCardCacheDataSchema,
  coachingCardPendingCelebrationsSchema,
  parseCoachingCardCacheData,
  sessionSummaryLlmSummarySchema,
  parseSessionSummaryLlmSummary,
  onboardingDraftExchangeHistorySchema,
  onboardingDraftExtractedSignalsSchema,
  parseOnboardingDraftExchangeHistory,
  parseOnboardingDraftExtractedSignals,
  assessmentExchangeHistorySchema,
  parseAssessmentExchangeHistory,
} from './db-jsonb.js';

const validCacheData = {
  kind: HOME_SURFACE_CACHE_KIND,
  cachedAt: '2026-01-01T00:00:00.000Z',
  rankedHomeCards: [],
};

// ---------------------------------------------------------------------------
// [BUG-220] coachingCardCacheDataSchema
// ---------------------------------------------------------------------------
describe('coachingCardCacheDataSchema [BUG-220]', () => {
  it('accepts minimal valid cache data', () => {
    expect(coachingCardCacheDataSchema.safeParse(validCacheData).success).toBe(
      true,
    );
  });

  it('defaults rankedHomeCards and interactionStats', () => {
    const parsed = coachingCardCacheDataSchema.parse(validCacheData);
    expect(parsed.rankedHomeCards).toEqual([]);
    expect(parsed.interactionStats.tapsByCardId).toEqual({});
    expect(parsed.interactionStats.events).toEqual([]);
  });

  it('accepts coldStart flag', () => {
    const result = coachingCardCacheDataSchema.safeParse({
      ...validCacheData,
      coldStart: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts rankedHomeCards with extra fields (passthrough)', () => {
    const result = coachingCardCacheDataSchema.safeParse({
      ...validCacheData,
      rankedHomeCards: [
        {
          id: 'study',
          title: 'Study',
          subtitle: 'Continue learning',
          primaryLabel: 'Start',
          priority: 1,
          extra_unknown_field: 'should pass through',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects wrong kind discriminator', () => {
    expect(
      coachingCardCacheDataSchema.safeParse({
        kind: 'wrong_kind',
        cachedAt: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('accepts interaction events', () => {
    const result = coachingCardCacheDataSchema.safeParse({
      ...validCacheData,
      interactionStats: {
        tapsByCardId: { study: 3 },
        dismissalsByCardId: { homework: 1 },
        events: [
          {
            cardId: 'study',
            interactionType: 'tap',
            occurredAt: '2026-01-01T00:05:00.000Z',
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseCoachingCardCacheData
// ---------------------------------------------------------------------------
describe('parseCoachingCardCacheData [BUG-220]', () => {
  it('returns parsed data on valid input', () => {
    const result = parseCoachingCardCacheData(validCacheData);
    expect(result).not.toBeNull();
    expect(result?.kind).toBe(HOME_SURFACE_CACHE_KIND);
  });

  it('returns null on invalid input (wrong kind)', () => {
    const result = parseCoachingCardCacheData({
      kind: 'bad',
      cachedAt: '2026-01-01',
    });
    expect(result).toBeNull();
  });

  it('returns null on null input', () => {
    expect(parseCoachingCardCacheData(null)).toBeNull();
  });

  it('returns null on non-object input', () => {
    expect(parseCoachingCardCacheData('not an object')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// coachingCardPendingCelebrationsSchema
// ---------------------------------------------------------------------------
describe('coachingCardPendingCelebrationsSchema', () => {
  it('accepts empty array', () => {
    expect(coachingCardPendingCelebrationsSchema.safeParse([]).success).toBe(
      true,
    );
  });

  it('accepts array with a celebration', () => {
    const result = coachingCardPendingCelebrationsSchema.safeParse([
      {
        celebration: 'polar_star',
        reason: 'topic_mastered',
        queuedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('rejects array with invalid celebration', () => {
    expect(
      coachingCardPendingCelebrationsSchema.safeParse([
        {
          celebration: 'supernova',
          reason: 'topic_mastered',
          queuedAt: '2026-01-01T00:00:00.000Z',
        },
      ]).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [BUG-222] session_summaries.llm_summary
// ---------------------------------------------------------------------------
describe('sessionSummaryLlmSummarySchema [BUG-222]', () => {
  it('accepts null (no summary yet)', () => {
    expect(sessionSummaryLlmSummarySchema.safeParse(null).success).toBe(true);
  });
});

describe('parseSessionSummaryLlmSummary [BUG-222]', () => {
  it('returns null for null input', () => {
    expect(parseSessionSummaryLlmSummary(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseSessionSummaryLlmSummary(undefined)).toBeNull();
  });

  it('returns null for invalid summary shape', () => {
    expect(parseSessionSummaryLlmSummary({ wrong: 'shape' })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseSessionSummaryLlmSummary('not valid')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [BUG-225] onboarding_drafts.exchange_history
// ---------------------------------------------------------------------------
describe('onboardingDraftExchangeHistorySchema [BUG-225]', () => {
  it('defaults to empty array', () => {
    const result = onboardingDraftExchangeHistorySchema.parse(undefined);
    expect(result).toEqual([]);
  });

  it('accepts empty array', () => {
    expect(onboardingDraftExchangeHistorySchema.safeParse([]).success).toBe(
      true,
    );
  });

  it('accepts array with a chat exchange', () => {
    const result = onboardingDraftExchangeHistorySchema.safeParse([
      {
        role: 'user',
        content: 'Hello',
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('rejects array with invalid exchange', () => {
    expect(
      onboardingDraftExchangeHistorySchema.safeParse([
        { role: 'invalid_role', content: 'Hello' },
      ]).success,
    ).toBe(false);
  });
});

describe('parseOnboardingDraftExchangeHistory [BUG-225]', () => {
  it('returns null for null (null is not a valid array)', () => {
    // null fails safeParse — the schema.default([]) only applies to undefined
    const result = parseOnboardingDraftExchangeHistory(null);
    expect(result).toBeNull();
  });

  it('returns empty array for undefined (default kicks in)', () => {
    const result = parseOnboardingDraftExchangeHistory(undefined);
    expect(Array.isArray(result)).toBe(true);
    expect(result?.length).toBe(0);
  });

  it('returns parsed array for valid input', () => {
    const result = parseOnboardingDraftExchangeHistory([
      { role: 'user', content: 'Hi' },
    ]);
    expect(result).not.toBeNull();
    expect(result?.length).toBe(1);
  });

  it('returns null for non-array input', () => {
    const result = parseOnboardingDraftExchangeHistory('not an array');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [BUG-225] onboarding_drafts.extracted_signals
// ---------------------------------------------------------------------------
describe('onboardingDraftExtractedSignalsSchema [BUG-225]', () => {
  it('defaults to empty signals', () => {
    const result = onboardingDraftExtractedSignalsSchema.parse(undefined);
    expect(result.goals).toEqual([]);
    expect(result.experienceLevel).toBe('');
    expect(result.currentKnowledge).toBe('');
  });

  it('accepts empty object', () => {
    expect(onboardingDraftExtractedSignalsSchema.safeParse({}).success).toBe(
      true,
    );
  });

  it('accepts partial signals (all fields optional via .partial())', () => {
    const result = onboardingDraftExtractedSignalsSchema.safeParse({
      goals: ['Learn algebra'],
    });
    expect(result.success).toBe(true);
    expect(result.data?.goals).toEqual(['Learn algebra']);
  });

  it('accepts full extracted signals', () => {
    const result = onboardingDraftExtractedSignalsSchema.safeParse({
      goals: ['Master calculus'],
      experienceLevel: 'intermediate',
      currentKnowledge: 'Knows basic algebra',
      interests: ['football', 'music'],
      analogyFraming: 'concrete',
    });
    expect(result.success).toBe(true);
  });
});

describe('parseOnboardingDraftExtractedSignals [BUG-225]', () => {
  it('returns null for null (null is not a valid partial object)', () => {
    // null fails safeParse — the schema.default({...}) only applies to undefined
    const result = parseOnboardingDraftExtractedSignals(null);
    expect(result).toBeNull();
  });

  it('returns default signals for undefined (default kicks in)', () => {
    const result = parseOnboardingDraftExtractedSignals(undefined);
    expect(result).not.toBeNull();
    expect(result?.goals).toEqual([]);
  });

  it('returns parsed signals for valid input', () => {
    const result = parseOnboardingDraftExtractedSignals({
      goals: ['Pass exam'],
      experienceLevel: 'beginner',
      currentKnowledge: 'Limited',
    });
    expect(result).not.toBeNull();
    expect(result?.goals).toEqual(['Pass exam']);
  });

  it('returns null for truly invalid input (invalid enum)', () => {
    const result = parseOnboardingDraftExtractedSignals({
      analogyFraming: 'definitely-invalid-value',
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [BUG-391] assessments.exchange_history
// ---------------------------------------------------------------------------
describe('assessmentExchangeHistorySchema [BUG-391]', () => {
  it('defaults to empty array when value is undefined', () => {
    const result = assessmentExchangeHistorySchema.parse(undefined);
    expect(result).toEqual([]);
  });

  it('accepts an empty array (fresh assessment)', () => {
    expect(assessmentExchangeHistorySchema.safeParse([]).success).toBe(true);
  });

  it('accepts a valid exchange array matching the neon-serverless parsed-JSONB shape', () => {
    // Simulates what neon-serverless returns after Drizzle reads the JSONB
    // column: plain JS objects (already parsed from JSON), not Date objects.
    const rawFromDb = [
      { role: 'assistant', content: 'What is a variable?' },
      { role: 'user', content: 'A box that stores data.' },
    ];
    const result = assessmentExchangeHistorySchema.safeParse(rawFromDb);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.role).toBe('assistant');
      expect(result.data[1]!.role).toBe('user');
    }
  });

  it('rejects an entry with an invalid role', () => {
    const result = assessmentExchangeHistorySchema.safeParse([
      { role: 'system', content: 'injected' },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects an entry missing content', () => {
    const result = assessmentExchangeHistorySchema.safeParse([
      { role: 'user' },
    ]);
    expect(result.success).toBe(false);
  });
});

describe('parseAssessmentExchangeHistory [BUG-391]', () => {
  it('returns empty array for null (corrupted / legacy null DB value)', () => {
    // parseAssessmentExchangeHistory returns [] (not null) on failure so the
    // assessment can degrade to empty-history state without throwing.
    expect(parseAssessmentExchangeHistory(null)).toEqual([]);
  });

  it('returns empty array for undefined (column value absent)', () => {
    expect(parseAssessmentExchangeHistory(undefined)).toEqual([]);
  });

  it('returns empty array for non-array input (corrupted row)', () => {
    expect(parseAssessmentExchangeHistory('corrupted')).toEqual([]);
    expect(parseAssessmentExchangeHistory(42)).toEqual([]);
    expect(parseAssessmentExchangeHistory({ role: 'user' })).toEqual([]);
  });

  it('returns empty array for array with invalid exchange shape', () => {
    expect(
      parseAssessmentExchangeHistory([{ role: 'invalid_role', content: 'Hi' }]),
    ).toEqual([]);
  });

  it('returns typed array for a valid neon-serverless-shaped row', () => {
    // This simulates the exact raw value Drizzle surfaces from neon-serverless:
    // a plain JS array of objects (JSONB is already parsed), typed as `unknown`
    // because the column has no $type cast at the Drizzle level pre-fix.
    const rawFromDb: unknown = [
      { role: 'assistant', content: 'What is recursion?' },
      { role: 'user', content: 'A function calling itself.' },
    ];
    const result = parseAssessmentExchangeHistory(rawFromDb);
    expect(result).toHaveLength(2);
    expect(result[0]!.role).toBe('assistant');
    expect(result[0]!.content).toBe('What is recursion?');
    expect(result[1]!.role).toBe('user');
  });

  it('returns empty array for empty array input (new assessment)', () => {
    expect(parseAssessmentExchangeHistory([])).toEqual([]);
  });
});
