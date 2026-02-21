import { retrieveRelevantMemory } from './memory';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGenerateEmbedding = jest.fn();
jest.mock('./embeddings', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}));

const mockFindSimilarTopics = jest.fn();
jest.mock('@eduagent/database', () => ({
  findSimilarTopics: (...args: unknown[]) => mockFindSimilarTopics(...args),
}));

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
      'What is a quadratic equation?'
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
      undefined
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
      'pa-test-key'
    );

    expect(result.context).toContain('Relevant prior learning');
    expect(result.context).toContain(
      'Quadratic equations involve x squared terms'
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
      'pa-test-key'
    );

    expect(mockGenerateEmbedding).toHaveBeenCalledWith(
      'Tell me about photosynthesis',
      'pa-test-key'
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
      5
    );

    expect(mockFindSimilarTopics).toHaveBeenCalledWith(
      mockDb,
      [0.1, 0.2],
      5,
      'profile-1'
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
      'profile-1'
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
      'pa-test-key'
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
      'pa-test-key'
    );

    expect(result.topicIds).toEqual(['topic-1']);
  });

  it('returns empty result when embedding generation fails', async () => {
    mockGenerateEmbedding.mockRejectedValue(
      new Error('Voyage AI rate limit exceeded')
    );

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'Hello',
      'pa-test-key'
    );

    expect(result).toEqual({ context: '', topicIds: [] });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[memory]'),
      expect.stringContaining('rate limit')
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
      new Error('pgvector extension not available')
    );

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await retrieveRelevantMemory(
      mockDb,
      'profile-1',
      'Hello',
      'pa-test-key'
    );

    expect(result).toEqual({ context: '', topicIds: [] });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[memory]'),
      expect.stringContaining('pgvector')
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
      'pa-test-key'
    );

    // Content should be truncated to 500 chars + '...'
    expect(result.context).toContain('...');
    expect(result.context).not.toContain(longContent);
  });
});
