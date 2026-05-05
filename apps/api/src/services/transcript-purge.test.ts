const mockGenerateEmbedding = jest.fn();

jest.mock('./embeddings', () => {
  const actual = jest.requireActual('./embeddings') as Record<string, unknown>;
  return {
    ...actual,
    generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
  };
});

import type { Database } from '@eduagent/database';
import {
  buildSummaryEmbeddingText,
  purgeSessionTranscript,
} from './transcript-purge';

function createPurgeDb(summaryRow: Record<string, unknown> | null) {
  const deleteEmbeddingsReturning = jest
    .fn()
    .mockResolvedValue([{ id: 'embedding-1' }]);
  const deleteEventsReturning = jest
    .fn()
    .mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);
  const deleteEmbeddingsWhere = jest.fn().mockReturnValue({
    returning: deleteEmbeddingsReturning,
  });
  const deleteEventsWhere = jest.fn().mockReturnValue({
    returning: deleteEventsReturning,
  });
  const insertValues = jest.fn().mockResolvedValue(undefined);
  const updateWhere = jest.fn().mockResolvedValue(undefined);

  const db = {
    query: {
      sessionSummaries: {
        findFirst: jest.fn().mockResolvedValue(summaryRow),
      },
    },
    delete: jest
      .fn()
      .mockReturnValueOnce({
        where: deleteEmbeddingsWhere,
      })
      .mockReturnValueOnce({
        where: deleteEventsWhere,
      }),
    insert: jest.fn().mockReturnValue({
      values: insertValues,
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: updateWhere,
      }),
    }),
    transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  } as unknown as Database;

  return {
    db,
    deleteEmbeddingsWhere,
    deleteEventsWhere,
    deleteEmbeddingsReturning,
    deleteEventsReturning,
    insertValues,
    updateWhere,
  };
}

describe('buildSummaryEmbeddingText', () => {
  it('includes the summary narrative, anchors, recap, and re-entry hint', () => {
    const text = buildSummaryEmbeddingText(
      {
        narrative:
          'Worked through fractions and connected equivalent forms with pictures.',
        topicsCovered: ['fractions', 'equivalent fractions'],
        sessionState: 'completed',
        reEntryRecommendation:
          'Resume with one more equivalent-fractions example and ask for the rule aloud.',
      },
      'You connected pictures to the fraction rule.'
    );

    expect(text).toContain('Narrative: Worked through fractions');
    expect(text).toContain('Topics: fractions, equivalent fractions');
    expect(text).toContain('Learner recap: You connected pictures');
    expect(text).toContain('Resume here: Resume with one more');
  });
});

describe('purgeSessionTranscript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips rows whose llmSummary is missing or invalid', async () => {
    const { db } = createPurgeDb({
      id: 'summary-1',
      sessionId: 'session-1',
      profileId: 'profile-1',
      topicId: null,
      llmSummary: { narrative: 'too short' },
      learnerRecap: 'Solid progress today.',
      purgedAt: null,
    });

    const result = await purgeSessionTranscript(
      db,
      'profile-1',
      'summary-1',
      'voyage-key'
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'skipped',
        reason: 'invalid_llm_summary',
      })
    );
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    expect(
      (db as unknown as { transaction: jest.Mock }).transaction
    ).not.toHaveBeenCalled();
  });

  it('purges events, replaces embeddings, and stamps purgedAt inside one transaction', async () => {
    const { db, insertValues, updateWhere } = createPurgeDb({
      id: 'summary-1',
      sessionId: 'session-1',
      profileId: 'profile-1',
      topicId: null,
      llmSummary: {
        narrative:
          'Worked through fractions and named equivalent fractions while comparing visual models together.',
        topicsCovered: ['fractions', 'equivalent fractions'],
        sessionState: 'completed',
        reEntryRecommendation:
          'Resume with one more equivalent-fractions example and ask for the rule aloud.',
      },
      learnerRecap: 'You connected pictures to the fraction rule.',
      purgedAt: null,
    });

    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1, 0.2],
      dimensions: 2,
      model: 'voyage-3.5',
      provider: 'voyage',
    });

    const result = await purgeSessionTranscript(
      db,
      'profile-1',
      'summary-1',
      'voyage-key'
    );

    expect(mockGenerateEmbedding).toHaveBeenCalledWith(
      expect.stringContaining('Narrative: Worked through fractions'),
      'voyage-key'
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        profileId: 'profile-1',
        embedding: [0.1, 0.2],
      })
    );
    expect(updateWhere).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        status: 'purged',
        sessionId: 'session-1',
        sessionSummaryId: 'summary-1',
        eventsDeleted: 2,
        embeddingRowsReplaced: 1,
        purgedAt: expect.any(Date),
      })
    );
  });

  it('keeps DB writes untouched when Voyage embedding generation fails', async () => {
    const { db, insertValues, updateWhere } = createPurgeDb({
      id: 'summary-1',
      sessionId: 'session-1',
      profileId: 'profile-1',
      topicId: null,
      llmSummary: {
        narrative:
          'Worked through fractions and named equivalent fractions while comparing visual models together.',
        topicsCovered: ['fractions', 'equivalent fractions'],
        sessionState: 'completed',
        reEntryRecommendation:
          'Resume with one more equivalent-fractions example and ask for the rule aloud.',
      },
      learnerRecap: 'You connected pictures to the fraction rule.',
      purgedAt: null,
    });

    mockGenerateEmbedding.mockRejectedValueOnce(
      new Error('Voyage unavailable')
    );

    await expect(
      purgeSessionTranscript(db, 'profile-1', 'summary-1', 'voyage-key')
    ).rejects.toThrow('Voyage unavailable');

    expect(
      (db as unknown as { transaction: jest.Mock }).transaction
    ).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(updateWhere).not.toHaveBeenCalled();
  });
});
