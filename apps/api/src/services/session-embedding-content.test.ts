import type { Database } from '@eduagent/database';
import type { LlmSummary } from '@eduagent/schemas';
import {
  buildSummaryEmbeddingText,
  loadSummarySafeEmbeddingContent,
} from './session-embedding-content';

const VALID_SUMMARY: LlmSummary = {
  narrative:
    'Worked through fractions and connected equivalent forms with pictures.',
  topicsCovered: ['fractions', 'equivalent fractions'],
  sessionState: 'completed',
  reEntryRecommendation:
    'Resume with one more equivalent-fractions example and ask for the rule aloud.',
};

/**
 * Verbatim learner turn. Nothing derived from a real transcript may reach the
 * summary-safe text, so this string is the negative control throughout.
 */
const RAW_LEARNER_TURN =
  'my mum says i have dyslexia and i hate reading out loud';

/**
 * DI test double for the one read this module performs. The real query is
 * covered end-to-end in
 * inngest/functions/session-embedding-summary-safe.integration.test.ts.
 */
function createDb(row: Record<string, unknown> | undefined): Database {
  return {
    query: {
      sessionSummaries: {
        findFirst: jest.fn().mockResolvedValue(row),
      },
    },
  } as unknown as Database;
}

describe('buildSummaryEmbeddingText', () => {
  it('includes the summary narrative, anchors, recap, and re-entry hint', () => {
    const text = buildSummaryEmbeddingText(
      VALID_SUMMARY,
      'You connected pictures to the fraction rule.',
    );

    expect(text).toContain('Narrative: Worked through fractions');
    expect(text).toContain('Topics: fractions, equivalent fractions');
    expect(text).toContain('Learner recap: You connected pictures');
    expect(text).toContain('Resume here: Resume with one more');
  });

  it('omits the recap line when there is no learner recap', () => {
    const text = buildSummaryEmbeddingText(VALID_SUMMARY, null);

    expect(text).not.toContain('Learner recap:');
    expect(text).toContain('Resume here: Resume with one more');
  });
});

describe('loadSummarySafeEmbeddingContent', () => {
  it('builds the summary-safe text from a complete summary row', async () => {
    const db = createDb({
      topicId: 'topic-1',
      llmSummary: VALID_SUMMARY,
      learnerRecap: 'You connected pictures to the fraction rule.',
      purgedAt: null,
    });

    const result = await loadSummarySafeEmbeddingContent(
      db,
      'session-1',
      'profile-1',
    );

    expect(result).toEqual({
      status: 'ok',
      content: buildSummaryEmbeddingText(
        VALID_SUMMARY,
        'You connected pictures to the fraction rule.',
      ),
      topicId: 'topic-1',
    });
  });

  it('still builds content for a short session that never got a learner recap', async () => {
    // generateLearnerRecap needs >=4 transcript turns, so short sessions have
    // learner_recap NULL forever. Requiring it would strand them unembedded;
    // the llm_summary alone is already summary-safe.
    const db = createDb({
      topicId: null,
      llmSummary: VALID_SUMMARY,
      learnerRecap: null,
      purgedAt: null,
    });

    const result = await loadSummarySafeEmbeddingContent(
      db,
      'session-1',
      'profile-1',
    );

    expect(result).toEqual({
      status: 'ok',
      content: buildSummaryEmbeddingText(VALID_SUMMARY, null),
      topicId: null,
    });
  });

  it('[BREAK] never returns learner transcript text even when the summary quotes the session', async () => {
    // The summary row is the ONLY input to the content builder. Even if the
    // session's raw turn sits in session_events, nothing in this module can
    // reach it — losing that property is the WI-3141 regression.
    const db = createDb({
      topicId: null,
      llmSummary: VALID_SUMMARY,
      learnerRecap: 'You connected pictures to the fraction rule.',
      purgedAt: null,
    });

    const result = await loadSummarySafeEmbeddingContent(
      db,
      'session-1',
      'profile-1',
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.content).not.toContain(RAW_LEARNER_TURN);
    expect(result.content).not.toContain('dyslexia');
  });

  it.each([
    ['summary_missing', undefined],
    [
      'already_purged',
      {
        topicId: null,
        llmSummary: VALID_SUMMARY,
        learnerRecap: 'recap',
        purgedAt: new Date(),
      },
    ],
    [
      'missing_llm_summary',
      {
        topicId: null,
        llmSummary: null,
        learnerRecap: 'recap',
        purgedAt: null,
      },
    ],
    [
      'invalid_llm_summary',
      {
        topicId: null,
        llmSummary: { narrative: 'too short' },
        learnerRecap: 'recap',
        purgedAt: null,
      },
    ],
  ])('fails closed with reason %s', async (reason, row) => {
    const db = createDb(row as Record<string, unknown> | undefined);

    const result = await loadSummarySafeEmbeddingContent(
      db,
      'session-1',
      'profile-1',
    );

    expect(result).toEqual({ status: 'unavailable', reason });
  });
});
