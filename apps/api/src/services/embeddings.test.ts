import {
  getEmbeddingConfig,
  generateEmbedding,
  extractSessionContent,
  storeSessionEmbedding,
} from './embeddings';
import type { Database } from '@eduagent/database';

// ---------------------------------------------------------------------------
// Voyage AI fetch mock helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY = 'pa-test-key-123';

function createVoyageResponse(embedding: number[]): object {
  return {
    data: [{ embedding }],
    model: 'voyage-3.5',
    usage: { total_tokens: 42 },
  };
}

function mockFetchSuccess(embedding: number[]): void {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(createVoyageResponse(embedding)),
  } as unknown as Response);
}

function mockFetchError(status: number, body: string): void {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// getEmbeddingConfig
// ---------------------------------------------------------------------------

describe('getEmbeddingConfig', () => {
  it('returns valid config with Voyage AI fields', () => {
    const config = getEmbeddingConfig();

    expect(config.model).toBe('voyage-3.5');
    expect(config.provider).toBe('voyage');
    expect(config.dimensions).toBe(1024);
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
  const sampleVector = Array.from({ length: 1024 }, (_, i) => i * 0.001);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns correct dimension vector from Voyage API', async () => {
    mockFetchSuccess(sampleVector);

    const result = await generateEmbedding('Hello world', TEST_API_KEY);

    expect(result.dimensions).toBe(1024);
    expect(result.vector).toHaveLength(1024);
    expect(result.vector).toEqual(sampleVector);
  });

  it('includes model and provider in result', async () => {
    mockFetchSuccess(sampleVector);

    const result = await generateEmbedding('Some text', TEST_API_KEY);

    expect(result.model).toBe('voyage-3.5');
    expect(result.provider).toBe('voyage');
  });

  it('sends correct request to Voyage API', async () => {
    mockFetchSuccess(sampleVector);

    await generateEmbedding('Test input text', TEST_API_KEY);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.voyageai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify({
          input: ['Test input text'],
          model: 'voyage-3.5',
          input_type: 'document',
        }),
      }
    );
  });

  it('throws descriptive error on non-200 response', async () => {
    mockFetchError(401, 'Unauthorized: invalid API key');

    await expect(generateEmbedding('Some text', 'bad-key')).rejects.toThrow(
      'Voyage AI embedding request failed (401): Unauthorized: invalid API key'
    );
  });

  it('throws descriptive error on 500 response', async () => {
    mockFetchError(500, 'Internal server error');

    await expect(generateEmbedding('Some text', TEST_API_KEY)).rejects.toThrow(
      'Voyage AI embedding request failed (500): Internal server error'
    );
  });

  it('throws descriptive error on 429 rate limit', async () => {
    mockFetchError(429, 'Rate limit exceeded');

    await expect(generateEmbedding('Some text', TEST_API_KEY)).rejects.toThrow(
      'Voyage AI embedding request failed (429): Rate limit exceeded'
    );
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
      `Session ${SESSION_ID} \u2014 no conversation events recorded`
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

// ---------------------------------------------------------------------------
// storeSessionEmbedding
// ---------------------------------------------------------------------------

jest.mock('@eduagent/database', () => ({
  storeEmbedding: jest.fn().mockResolvedValue(undefined),
  sessionEvents: {},
}));

describe('storeSessionEmbedding', () => {
  const sampleVector = Array.from({ length: 1024 }, (_, i) => i * 0.001);

  beforeEach(() => {
    mockFetchSuccess(sampleVector);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates embedding and stores it in the database', async () => {
    const { storeEmbedding } = jest.requireMock('@eduagent/database') as {
      storeEmbedding: jest.Mock;
    };

    const mockDb = {} as Database;

    await storeSessionEmbedding(
      mockDb,
      'session-001',
      'profile-001',
      'topic-001',
      'Test content',
      TEST_API_KEY
    );

    expect(storeEmbedding).toHaveBeenCalledWith(mockDb, {
      sessionId: 'session-001',
      profileId: 'profile-001',
      topicId: 'topic-001',
      content: 'Test content',
      embedding: sampleVector,
    });
  });

  it('passes undefined topicId when null', async () => {
    const { storeEmbedding } = jest.requireMock('@eduagent/database') as {
      storeEmbedding: jest.Mock;
    };

    const mockDb = {} as Database;

    await storeSessionEmbedding(
      mockDb,
      'session-001',
      'profile-001',
      null,
      'Test content',
      TEST_API_KEY
    );

    expect(storeEmbedding).toHaveBeenCalledWith(mockDb, {
      sessionId: 'session-001',
      profileId: 'profile-001',
      topicId: undefined,
      content: 'Test content',
      embedding: sampleVector,
    });
  });
});
