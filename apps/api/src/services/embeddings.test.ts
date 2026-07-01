import {
  getEmbeddingConfig,
  generateEmbedding,
  extractSessionContent,
  storeSessionEmbedding,
  EmbeddingDimensionMismatchError,
} from './embeddings';
import type { Database } from '@eduagent/database';
import { TEST_PROFILE_ID, TEST_SESSION_ID } from '@eduagent/test-utils';

function mockDatabaseModuleFactory() {
  const { createDatabaseModuleMock } =
    require('../test-utils/database-module') as typeof import('../test-utils/database-module');

  return createDatabaseModuleMock({
    exports: {
      storeEmbedding: jest.fn().mockResolvedValue(undefined),
      sessionEvents: {},
      // VECTOR_DIM is consumed by generateEmbedding() to validate the
      // Voyage response length. It must be a real number here — leaving
      // it undefined would defeat the dimension-mismatch guard in tests.
      VECTOR_DIM: 1024,
    },
  }).module;
}

jest.mock(
  '@eduagent/database' /* gc1-allow: service unit test — db boundary mocked; real DB covered by sibling .integration.test.ts where present */,
  () => mockDatabaseModuleFactory(),
);

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
      },
    );
  });

  it('throws descriptive error on non-200 response', async () => {
    mockFetchError(401, 'Unauthorized: invalid API key');

    await expect(generateEmbedding('Some text', 'bad-key')).rejects.toThrow(
      'Voyage AI embedding request failed (401): Unauthorized: invalid API key',
    );
  });

  it('throws descriptive error on 500 response', async () => {
    mockFetchError(500, 'Internal server error');

    await expect(generateEmbedding('Some text', TEST_API_KEY)).rejects.toThrow(
      'Voyage AI embedding request failed (500): Internal server error',
    );
  });

  it('throws descriptive error on 429 rate limit', async () => {
    mockFetchError(429, 'Rate limit exceeded');

    await expect(generateEmbedding('Some text', TEST_API_KEY)).rejects.toThrow(
      'Voyage AI embedding request failed (429): Rate limit exceeded',
    );
  });

  // -------------------------------------------------------------------------
  // BREAK TEST — Voyage model/config drift returns wrong-dim vector.
  // Without the EmbeddingDimensionMismatchError guard in generateEmbedding,
  // the mis-sized vector would flow to storeEmbedding/pgvector and either
  // surface as an opaque DB error or (worse) corrupt similarity search if
  // the column width were ever changed. The typed error makes provider
  // drift loud in Sentry and prevents the DB write entirely.
  // -------------------------------------------------------------------------
  describe('dimension validation against VECTOR_DIM', () => {
    it('throws EmbeddingDimensionMismatchError when Voyage returns 512-dim instead of 1024', async () => {
      const shortVector = Array.from({ length: 512 }, (_, i) => i * 0.001);
      mockFetchSuccess(shortVector);

      await expect(
        generateEmbedding('Some text', TEST_API_KEY),
      ).rejects.toBeInstanceOf(EmbeddingDimensionMismatchError);
    });

    it('error carries expected/actual/model/provider for Sentry grouping', async () => {
      const shortVector = Array.from({ length: 512 }, (_, i) => i);
      mockFetchSuccess(shortVector);

      let caught: EmbeddingDimensionMismatchError | undefined;
      try {
        await generateEmbedding('Some text', TEST_API_KEY);
      } catch (err) {
        caught = err as EmbeddingDimensionMismatchError;
      }

      expect(caught).toBeInstanceOf(EmbeddingDimensionMismatchError);
      expect(caught?.expected).toBe(1024);
      expect(caught?.actual).toBe(512);
      expect(caught?.provider).toBe('voyage');
      expect(caught?.model).toBe('voyage-3.5');
      expect(caught?.message).toMatch(/expected 1024, got 512/);
    });

    it('throws on oversized vector too (e.g. 2048-dim drift)', async () => {
      const longVector = Array.from({ length: 2048 }, (_, i) => i * 0.0001);
      mockFetchSuccess(longVector);

      await expect(
        generateEmbedding('Some text', TEST_API_KEY),
      ).rejects.toBeInstanceOf(EmbeddingDimensionMismatchError);
    });

    it('accepts a correctly-sized 1024-dim vector without throwing', async () => {
      const goodVector = Array.from({ length: 1024 }, (_, i) => i * 0.001);
      mockFetchSuccess(goodVector);

      const result = await generateEmbedding('Some text', TEST_API_KEY);
      expect(result.vector).toHaveLength(1024);
      expect(result.dimensions).toBe(1024);
    });
  });

  // -------------------------------------------------------------------------
  // BREAK TEST — storeSessionEmbedding must NOT write when Voyage returns
  // a wrong-dim vector. The guard lives in generateEmbedding, so the DB
  // write should never be reached.
  // -------------------------------------------------------------------------
  it('storeSessionEmbedding does not write to DB on dimension mismatch', async () => {
    const shortVector = Array.from({ length: 512 }, (_, i) => i);
    mockFetchSuccess(shortVector);

    const { storeEmbedding } = jest.requireMock('@eduagent/database') as {
      storeEmbedding: jest.Mock;
    };
    storeEmbedding.mockClear();

    await expect(
      storeSessionEmbedding(
        {} as Database,
        'session-001',
        'profile-001',
        null,
        'Test content',
        TEST_API_KEY,
      ),
    ).rejects.toBeInstanceOf(EmbeddingDimensionMismatchError);

    expect(storeEmbedding).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// extractSessionContent
// ---------------------------------------------------------------------------

function createMockDb(
  events: Array<{ eventType: string; content: string }>,
): Database {
  return {
    query: {
      sessionEvents: {
        findMany: jest.fn().mockResolvedValue(events),
      },
    },
  } as unknown as Database;
}

const SESSION_ID = TEST_SESSION_ID;
const PROFILE_ID = TEST_PROFILE_ID;

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
        'Chlorophyll absorbs light energy from the sun.',
    );
  });

  it('returns fallback when no events found', async () => {
    const db = createMockDb([]);

    const result = await extractSessionContent(db, SESSION_ID, PROFILE_ID);

    expect(result).toBe(
      `Session ${SESSION_ID} \u2014 no conversation events recorded`,
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

  it('[WI-207] projects raw ai_response envelopes before building embedding input', async () => {
    const rawEnvelope = JSON.stringify({
      reply: 'Only this visible reply should be embedded.',
      signals: { close: true },
      ui_hints: { note_prompt: { show: false } },
    });
    const db = createMockDb([
      { eventType: 'user_message', content: 'What should we remember?' },
      { eventType: 'ai_response', content: rawEnvelope },
    ]);

    const result = await extractSessionContent(db, SESSION_ID, PROFILE_ID);

    expect(result).toBe(
      'What should we remember?\n\nOnly this visible reply should be embedded.',
    );
    expect(result).not.toContain('"signals"');
    expect(result).not.toContain('"ui_hints"');
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
      TEST_API_KEY,
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
      TEST_API_KEY,
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
