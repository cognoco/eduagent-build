import { getEmbeddingConfig, generateEmbedding } from './embeddings';

// ---------------------------------------------------------------------------
// getEmbeddingConfig
// ---------------------------------------------------------------------------

describe('getEmbeddingConfig', () => {
  it('returns valid config with expected fields', () => {
    const config = getEmbeddingConfig();

    expect(config.model).toBe('text-embedding-3-small');
    expect(config.provider).toBe('openai');
    expect(config.dimensions).toBe(1536);
  });

  it('returns a new object each time (no mutation risk)', () => {
    const config1 = getEmbeddingConfig();
    const config2 = getEmbeddingConfig();

    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);
  });
});

// ---------------------------------------------------------------------------
// generateEmbedding
// ---------------------------------------------------------------------------

describe('generateEmbedding', () => {
  it('returns correct dimension vector', async () => {
    const result = await generateEmbedding('Hello world');

    expect(result.dimensions).toBe(1536);
    expect(result.vector).toHaveLength(1536);
  });

  it('returns mock embedding that is all zeros', async () => {
    const result = await generateEmbedding('Test input text');

    const allZeros = result.vector.every((v) => v === 0);
    expect(allZeros).toBe(true);
  });

  it('includes model and provider in result', async () => {
    const result = await generateEmbedding('Some text');

    expect(result.model).toBe('text-embedding-3-small');
    expect(result.provider).toBe('openai');
  });

  it('returns consistent dimensions regardless of input', async () => {
    const result1 = await generateEmbedding('Short');
    const result2 = await generateEmbedding(
      'A much longer input text that has many more words and tokens'
    );

    expect(result1.dimensions).toBe(result2.dimensions);
    expect(result1.vector.length).toBe(result2.vector.length);
  });
});
