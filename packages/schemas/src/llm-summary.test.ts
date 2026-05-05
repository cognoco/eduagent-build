import { describe, expect, it } from '@jest/globals';
import {
  archivedTranscriptResponseSchema,
  llmSummarySchema,
  transcriptResponseSchema,
} from './llm-summary.js';

describe('llmSummarySchema', () => {
  const valid = {
    narrative:
      'Worked through long division by example and named remainders while checking each step carefully.',
    topicsCovered: ['long division', 'remainders'],
    sessionState: 'completed' as const,
    reEntryRecommendation:
      'Pick up by trying a 4-digit dividend with a remainder on the next round.',
  };

  it('accepts a valid summary payload', () => {
    expect(llmSummarySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects short narrative content', () => {
    expect(
      llmSummarySchema.safeParse({ ...valid, narrative: 'too short' }).success
    ).toBe(false);
  });

  it('rejects narratives longer than 1500 chars', () => {
    expect(
      llmSummarySchema.safeParse({
        ...valid,
        narrative: 'x'.repeat(1501),
      }).success
    ).toBe(false);
  });

  it('rejects unknown sessionState values', () => {
    expect(
      llmSummarySchema.safeParse({
        ...valid,
        sessionState: 'pending',
      }).success
    ).toBe(false);
  });

  it('caps topicsCovered at 20 items', () => {
    expect(
      llmSummarySchema.safeParse({
        ...valid,
        topicsCovered: Array.from({ length: 21 }, () => 'topic'),
      }).success
    ).toBe(false);
  });

  it('rejects short re-entry recommendations', () => {
    expect(
      llmSummarySchema.safeParse({
        ...valid,
        reEntryRecommendation: 'short',
      }).success
    ).toBe(false);
  });

  it('rejects narratives that omit every topic anchor', () => {
    expect(
      llmSummarySchema.safeParse({
        ...valid,
        narrative:
          'We talked about something abstract today and reviewed the rule together carefully.',
      }).success
    ).toBe(false);
  });

  it('accepts case-insensitive anchor matches', () => {
    expect(
      llmSummarySchema.safeParse({
        ...valid,
        narrative:
          'We revisited LONG DIVISION and checked how each remainder changes the next step.',
      }).success
    ).toBe(true);
  });

  it('rejects narratives where the topic only appears as a substring of a longer word', () => {
    expect(
      llmSummarySchema.safeParse({
        ...valid,
        topicsCovered: ['animal'],
        narrative:
          'We discussed animalistic behaviours in stories without naming any specific creature today.',
      }).success
    ).toBe(false);
  });

  it('treats unicode letters as part of the word for non-English topics', () => {
    expect(
      llmSummarySchema.safeParse({
        ...valid,
        topicsCovered: ['příroda'],
        narrative:
          'Dnes jsme mluvili o tématu příroda a o tom, jak rostliny rostou v různých prostředích.',
      }).success
    ).toBe(true);
  });

  it('accepts an empty topicsCovered array (thin auto-closed sessions)', () => {
    expect(
      llmSummarySchema.safeParse({
        ...valid,
        topicsCovered: [],
        sessionState: 'auto-closed' as const,
      }).success
    ).toBe(true);
  });
});

describe('transcriptResponseSchema', () => {
  it('accepts the archived transcript branch', () => {
    expect(
      archivedTranscriptResponseSchema.safeParse({
        archived: true,
        archivedAt: '2026-03-12T10:00:00.000Z',
        summary: {
          narrative:
            'Worked through long division and remainders by checking each step out loud together.',
          topicsCovered: ['long division', 'remainders'],
          sessionState: 'completed',
          reEntryRecommendation:
            'Try a 4-digit dividend with a remainder on the next session.',
          learnerRecap:
            'Today you connected division and remainders with more confidence.',
          topicId: null,
        },
      }).success
    ).toBe(true);
  });

  it('accepts the live transcript branch', () => {
    expect(
      transcriptResponseSchema.safeParse({
        archived: false,
        session: {
          sessionId: '00000000-0000-7000-8000-000000000001',
          subjectId: '00000000-0000-7000-8000-000000000002',
          topicId: null,
          sessionType: 'learning',
          inputMode: 'text',
          startedAt: '2026-03-12T10:00:00.000Z',
          exchangeCount: 2,
          milestonesReached: [],
        },
        exchanges: [
          {
            role: 'user',
            content: 'Can we do long division?',
            timestamp: '2026-03-12T10:00:05.000Z',
          },
        ],
      }).success
    ).toBe(true);
  });
});
