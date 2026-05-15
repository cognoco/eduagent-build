// ---------------------------------------------------------------------------
// Mocks — must be declared before SUT import
// ---------------------------------------------------------------------------

const mockGenerateEmbedding = jest.fn();
jest.mock('./embeddings' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    './embeddings',
  ) as typeof import('./embeddings');
  return {
    ...actual,
    generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
  };
});

const mockFindSimilarTopics = jest.fn();

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  exports: {
    findSimilarTopics: (...args: unknown[]) => mockFindSimilarTopics(...args),
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// SUT import must come AFTER mock setup so the mock factory can access
// mockDatabaseModule when @eduagent/database is first required.
import { retrieveRelevantMemory } from './memory';

const mockDb = {} as Parameters<typeof retrieveRelevantMemory>[0];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('retrieveRelevantMemory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty result when no voyageApiKey is provided', async () => {
    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'What is a quadratic equation?',
    );

    expect(result).toEqual({ context: '', topicIds: [] });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    expect(mockFindSimilarTopics).not.toHaveBeenCalled();
  });

  it('returns empty result when voyageApiKey is undefined', async () => {
    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'What is a quadratic equation?',
      undefined,
    );

    expect(result).toEqual({ context: '', topicIds: [] });
  });

  it('returns formatted context when similar topics are found', async () => {
    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1, 0.2, 0.3],
      dimensions: 3,
      model: 'voyage-3.5',
      provider: 'voyage',
    });

    mockFindSimilarTopics.mockResolvedValue([
      {
        id: 'emb-1',
        topicId: 'topic-1',
        content: 'Quadratic equations involve x squared terms',
        distance: 0.15,
      },
      {
        id: 'emb-2',
        topicId: 'topic-2',
        content: 'The quadratic formula is x = (-b +/- sqrt(b^2 - 4ac)) / 2a',
        distance: 0.22,
      },
    ]);

    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'How do I solve quadratics?',
      'pa-test-key',
    );

    expect(result.context).toContain('Relevant prior learning');
    expect(result.context).toContain(
      'Quadratic equations involve x squared terms',
    );
    expect(result.context).toContain('quadratic formula');
    expect(result.topicIds).toEqual(['topic-1', 'topic-2']);
  });

  it('generates embedding for the current message', async () => {
    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1, 0.2],
      dimensions: 2,
      model: 'voyage-3.5',
      provider: 'voyage',
    });
    mockFindSimilarTopics.mockResolvedValue([]);

    await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'Tell me about photosynthesis',
      'pa-test-key',
    );

    expect(mockGenerateEmbedding).toHaveBeenCalledWith(
      'Tell me about photosynthesis',
      'pa-test-key',
    );
  });

  it('passes profileId and limit to findSimilarTopics', async () => {
    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1, 0.2],
      dimensions: 2,
      model: 'voyage-3.5',
      provider: 'voyage',
    });
    mockFindSimilarTopics.mockResolvedValue([]);

    await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'Tell me about photosynthesis',
      'pa-test-key',
      5,
    );

    expect(mockFindSimilarTopics).toHaveBeenCalledWith(
      mockDb,
      [0.1, 0.2],
      5,
      'profile-1',
    );
  });

  it('uses default limit of 3 when not specified', async () => {
    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1],
      dimensions: 1,
      model: 'voyage-3.5',
      provider: 'voyage',
    });
    mockFindSimilarTopics.mockResolvedValue([]);

    await retrieveRelevantMemory(mockDb, 'profile-1', 'Hello', 'pa-test-key');

    expect(mockFindSimilarTopics).toHaveBeenCalledWith(
      mockDb,
      [0.1],
      3,
      'profile-1',
    );
  });

  it('returns empty result when no similar topics found', async () => {
    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1, 0.2],
      dimensions: 2,
      model: 'voyage-3.5',
      provider: 'voyage',
    });
    mockFindSimilarTopics.mockResolvedValue([]);

    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'Something completely new',
      'pa-test-key',
    );

    expect(result).toEqual({ context: '', topicIds: [] });
  });

  it('filters out null topicIds from results', async () => {
    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1],
      dimensions: 1,
      model: 'voyage-3.5',
      provider: 'voyage',
    });
    mockFindSimilarTopics.mockResolvedValue([
      { id: 'emb-1', topicId: null, content: 'some content', distance: 0.1 },
      {
        id: 'emb-2',
        topicId: 'topic-1',
        content: 'other content',
        distance: 0.2,
      },
    ]);

    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'Hello',
      'pa-test-key',
    );

    expect(result.topicIds).toEqual(['topic-1']);
  });

  it('returns empty result when embedding generation fails', async () => {
    mockGenerateEmbedding.mockRejectedValue(
      new Error('Voyage AI rate limit exceeded'),
    );

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'Hello',
      'pa-test-key',
    );

    expect(result).toEqual({ context: '', topicIds: [] });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('rate limit'),
    );

    consoleSpy.mockRestore();
  });

  it('returns empty result when findSimilarTopics fails', async () => {
    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1],
      dimensions: 1,
      model: 'voyage-3.5',
      provider: 'voyage',
    });
    mockFindSimilarTopics.mockRejectedValue(
      new Error('pgvector extension not available'),
    );

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'Hello',
      'pa-test-key',
    );

    expect(result).toEqual({ context: '', topicIds: [] });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('pgvector'),
    );

    consoleSpy.mockRestore();
  });

  it('truncates long content in formatted context', async () => {
    const longContent = 'A'.repeat(600);
    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1],
      dimensions: 1,
      model: 'voyage-3.5',
      provider: 'voyage',
    });
    mockFindSimilarTopics.mockResolvedValue([
      { id: 'emb-1', topicId: 'topic-1', content: longContent, distance: 0.1 },
    ]);

    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'Hello',
      'pa-test-key',
    );

    // Content should be truncated to 500 chars + '...'
    expect(result.context).toContain('...');
    expect(result.context).not.toContain(longContent);
  });

  // [CR-668] Previous formatMemoryContext threw on any undefined/empty entry
  // in the contents array. The outer try/catch in retrieveRelevantMemory then
  // swallowed the throw and returned EMPTY_RESULT — meaning ONE bad row
  // silently disabled memory injection for the entire session even when
  // other rows were valid. The fix is to skip empty/null rows individually.
  it('[CR-668] keeps valid memory rows when one row has null content', async () => {
    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1],
      dimensions: 1,
      model: 'voyage-3.5',
      provider: 'voyage',
    });
    mockFindSimilarTopics.mockResolvedValue([
      {
        id: 'emb-1',
        topicId: 'topic-1',
        content: 'Quadratic equations involve x squared',
        distance: 0.1,
      },
      { id: 'emb-2', topicId: 'topic-2', content: null, distance: 0.2 },
      {
        id: 'emb-3',
        topicId: 'topic-3',
        content: 'Linear equations have a single x term',
        distance: 0.3,
      },
    ]);

    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'How do I solve equations?',
      'pa-test-key',
    );

    expect(result.context).toContain('Quadratic equations');
    expect(result.context).toContain('Linear equations');
    expect(result.context).toContain('Relevant prior learning');
    expect(result.topicIds).toEqual(['topic-1', 'topic-2', 'topic-3']);
  });

  it('[CR-668] returns empty context when every row is null/empty (no throw)', async () => {
    mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1],
      dimensions: 1,
      model: 'voyage-3.5',
      provider: 'voyage',
    });
    mockFindSimilarTopics.mockResolvedValue([
      { id: 'emb-1', topicId: 'topic-1', content: null, distance: 0.1 },
      { id: 'emb-2', topicId: 'topic-2', content: '', distance: 0.2 },
    ]);

    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'Hello',
      'pa-test-key',
    );

    expect(result.context).toBe('');
    // Topic IDs are still returned so callers can track which topics matched.
    expect(result.topicIds).toEqual(['topic-1', 'topic-2']);
  });
});
