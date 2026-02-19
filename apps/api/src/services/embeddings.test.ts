import {
  getEmbeddingConfig,
  generateEmbedding,
  extractSessionContent,
} from './embeddings';
import type { Database } from '@eduagent/database';

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

// ---------------------------------------------------------------------------
// extractSessionContent
// ---------------------------------------------------------------------------

function createMockDb(
  events: Array<{ eventType: string; content: string }>
): Database {
  return {
    query: {
      sessionEvents: {
        findMany: jest.fn().mockResolvedValue(events),
      },
    },
  } as unknown as Database;
}

const SESSION_ID = '00000000-0000-7000-8000-000000000001';
const PROFILE_ID = '00000000-0000-7000-8000-000000000002';

describe('extractSessionContent', () => {
  it('concatenates user_message and ai_response content', async () => {
    const db = createMockDb([
      { eventType: 'user_message', content: 'What is photosynthesis?' },
      {
        eventType: 'ai_response',
        content: 'Photosynthesis is how plants convert light to energy.',
      },
      { eventType: 'user_message', content: 'How does chlorophyll work?' },
      {
        eventType: 'ai_response',
        content: 'Chlorophyll absorbs light energy from the sun.',
      },
    ]);

    const result = await extractSessionContent(db, SESSION_ID, PROFILE_ID);

    expect(result).toBe(
      'What is photosynthesis?\n\n' +
        'Photosynthesis is how plants convert light to energy.\n\n' +
        'How does chlorophyll work?\n\n' +
        'Chlorophyll absorbs light energy from the sun.'
    );
  });

  it('returns fallback when no events found', async () => {
    const db = createMockDb([]);

    const result = await extractSessionContent(db, SESSION_ID, PROFILE_ID);

    expect(result).toBe(
      `Session ${SESSION_ID} — no conversation events recorded`
    );
  });

  it('filters out non-conversation events', async () => {
    const db = createMockDb([
      { eventType: 'session_start', content: 'Session started' },
      { eventType: 'user_message', content: 'Hello' },
      { eventType: 'escalation', content: 'Escalated to level 2' },
      { eventType: 'ai_response', content: 'Hi there!' },
      { eventType: 'hint', content: 'Think about it differently' },
      { eventType: 'session_end', content: 'Session ended' },
    ]);

    const result = await extractSessionContent(db, SESSION_ID, PROFILE_ID);

    expect(result).toBe('Hello\n\nHi there!');
  });

  it('truncates to 8000 characters max', async () => {
    const longMessage = 'A'.repeat(5000);
    const db = createMockDb([
      { eventType: 'user_message', content: longMessage },
      { eventType: 'ai_response', content: longMessage },
    ]);

    const result = await extractSessionContent(db, SESSION_ID, PROFILE_ID);

    // 5000 + '\n\n' (2) + 5000 = 10002, should be truncated to 8000
    expect(result.length).toBe(8000);
    expect(result).toBe((longMessage + '\n\n' + longMessage).slice(0, 8000));
  });
});
