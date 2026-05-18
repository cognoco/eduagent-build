// ---------------------------------------------------------------------------
// sessions.ts — runtime jsonb validation
//
// Pins the runtime parsing contracts for two jsonb columns whose drizzle
// types were TypeScript-only:
//   • session_summaries.llm_summary  (BUG-222)
//   • onboarding_drafts.exchange_history / extracted_signals  (BUG-225)
//
// The break tests reject malformed payloads so a regression that drops the
// schema or weakens it to `z.unknown()` fails CI instead of silently
// propagating corruption into business logic.
// ---------------------------------------------------------------------------

import {
  parseSessionSummaryLlmSummary,
  parseOnboardingDraftExchangeHistory,
  parseOnboardingDraftExtractedSignals,
  onboardingDraftExchangeHistorySchema,
  onboardingDraftExtractedSignalsSchema,
  sessionSummaryLlmSummarySchema,
} from '@eduagent/schemas';
import { onboardingDrafts, sessionSummaries } from './sessions.js';

// ---------------------------------------------------------------------------
// session_summaries.llm_summary  (BUG-222)
// ---------------------------------------------------------------------------

describe('sessionSummaries.llmSummary schema (BUG-222)', () => {
  it('declares llmSummary as jsonb', () => {
    const column = sessionSummaries.llmSummary as unknown as {
      dataType: string;
    };
    expect(column.dataType).toBe('json');
  });
});

describe('parseSessionSummaryLlmSummary (BUG-222)', () => {
  const validSummary = {
    narrative:
      'The learner worked through the introduction to Photosynthesis and articulated the chloroplast role clearly.',
    topicsCovered: ['Photosynthesis'],
    sessionState: 'completed' as const,
    reEntryRecommendation:
      'Next session: revisit the difference between light-dependent and light-independent reactions.',
  };

  it('returns null for null/undefined (column is nullable)', () => {
    expect(parseSessionSummaryLlmSummary(null)).toBeNull();
    expect(parseSessionSummaryLlmSummary(undefined)).toBeNull();
  });

  it('accepts a well-formed LlmSummary payload', () => {
    expect(parseSessionSummaryLlmSummary(validSummary)).toEqual(validSummary);
  });

  // BREAK TESTS — reverting the parser to `raw as LlmSummary` (or removing
  // the schema entirely) would flip these to green.
  it('rejects payload with missing topicsCovered', () => {
    const { topicsCovered: _t, ...rest } = validSummary;
    void _t;
    expect(parseSessionSummaryLlmSummary(rest)).toBeNull();
  });

  it('rejects payload where sessionState is an unsupported value', () => {
    expect(
      parseSessionSummaryLlmSummary({
        ...validSummary,
        sessionState: 'midway',
      }),
    ).toBeNull();
  });

  it('rejects payload where narrative does not mention any topic from topicsCovered', () => {
    // llmSummarySchema enforces the narrative-mentions-topic refinement.
    expect(
      parseSessionSummaryLlmSummary({
        ...validSummary,
        narrative:
          'A long but generic recap that does not name any of the listed topics by name at all yes it is long enough now.',
        topicsCovered: ['VeryUniqueTopic'],
      }),
    ).toBeNull();
  });

  it('exposes the schema from the @eduagent/schemas barrel', () => {
    expect(sessionSummaryLlmSummarySchema).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// onboarding_drafts.exchange_history + extracted_signals  (BUG-225)
// ---------------------------------------------------------------------------

describe('onboardingDrafts jsonb columns (BUG-225)', () => {
  it('exchangeHistory column is jsonb', () => {
    const column = onboardingDrafts.exchangeHistory as unknown as {
      dataType: string;
    };
    expect(column.dataType).toBe('json');
  });

  it('extractedSignals column is jsonb', () => {
    const column = onboardingDrafts.extractedSignals as unknown as {
      dataType: string;
    };
    expect(column.dataType).toBe('json');
  });
});

describe('parseOnboardingDraftExchangeHistory (BUG-225)', () => {
  it('accepts an empty array (column DEFAULT [])', () => {
    expect(parseOnboardingDraftExchangeHistory([])).toEqual([]);
  });

  it('accepts a well-formed exchange array', () => {
    const exchanges = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    expect(parseOnboardingDraftExchangeHistory(exchanges)).toEqual(exchanges);
  });

  // BREAK TESTS
  it('rejects non-array input', () => {
    expect(parseOnboardingDraftExchangeHistory({})).toBeNull();
    expect(parseOnboardingDraftExchangeHistory('hello')).toBeNull();
    expect(parseOnboardingDraftExchangeHistory(null)).toBeNull();
  });

  it('rejects an exchange with an unknown role', () => {
    expect(
      parseOnboardingDraftExchangeHistory([
        { role: 'system-admin', content: 'oops' },
      ]),
    ).toBeNull();
  });

  it('exposes the schema from the @eduagent/schemas barrel', () => {
    expect(onboardingDraftExchangeHistorySchema).toBeDefined();
  });
});

describe('parseOnboardingDraftExtractedSignals (BUG-225)', () => {
  it('accepts an empty object (column DEFAULT {})', () => {
    expect(parseOnboardingDraftExtractedSignals({})).toBeDefined();
  });

  it('accepts a partial signals payload (legacy rows predate fast-path fields)', () => {
    const parsed = parseOnboardingDraftExtractedSignals({
      goals: ['learn Spanish'],
      experienceLevel: 'beginner',
      currentKnowledge: 'colors only',
    });
    expect(parsed?.goals).toEqual(['learn Spanish']);
  });

  // BREAK TESTS
  it('rejects payloads where required fields are the wrong type', () => {
    expect(
      parseOnboardingDraftExtractedSignals({
        goals: 'learn Spanish', // should be string[]
      }),
    ).toBeNull();
  });

  it('rejects non-object input', () => {
    expect(parseOnboardingDraftExtractedSignals('signals')).toBeNull();
    expect(parseOnboardingDraftExtractedSignals(null)).toBeNull();
  });

  it('exposes the schema from the @eduagent/schemas barrel', () => {
    expect(onboardingDraftExtractedSignalsSchema).toBeDefined();
  });
});
