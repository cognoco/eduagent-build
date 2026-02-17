import { findSimilarTopics, storeEmbedding } from './embeddings.js';
import type { Database } from '../client.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../utils/uuid.js', () => ({
  generateUUIDv7: jest.fn(() => '01933b3c-0000-7000-8000-000000000099'),
}));

const TEST_PROFILE_ID = '01933b3c-0000-7000-8000-000000000001';
const TEST_SESSION_ID = '01933b3c-0000-7000-8000-000000000002';
const TEST_TOPIC_ID = '01933b3c-0000-7000-8000-000000000003';
const TEST_EMBEDDING = [0.1, 0.2, 0.3];

function createMockDb() {
  const execute = jest.fn().mockResolvedValue({ rows: [] });
  const values = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn(() => ({ values }));

  return {
    execute,
    insert,
    values,
    db: { execute, insert } as unknown as Database,
  };
}

// ---------------------------------------------------------------------------
// findSimilarTopics
// ---------------------------------------------------------------------------

describe('findSimilarTopics', () => {
  it('executes cosine distance query with profileId filter', async () => {
    const mockRows = [
      {
        id: 'id-1',
        topicId: TEST_TOPIC_ID,
        content: 'algebra basics',
        distance: 0.12,
      },
    ];
    const { db, execute } = createMockDb();
    execute.mockResolvedValueOnce({ rows: mockRows });

    const result = await findSimilarTopics(
      db,
      TEST_EMBEDDING,
      5,
      TEST_PROFILE_ID
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockRows);

    // Verify profileId was passed as a parameter to the SQL query
    const sqlArg = execute.mock.calls[0][0];
    const flatValues = JSON.stringify(sqlArg);
    expect(flatValues).toContain(TEST_PROFILE_ID);
  });

  it('produces a different query with vs without profileId', async () => {
    const mockWith = createMockDb();
    mockWith.execute.mockResolvedValueOnce({ rows: [] });
    await findSimilarTopics(mockWith.db, TEST_EMBEDDING, 5, TEST_PROFILE_ID);

    const mockWithout = createMockDb();
    mockWithout.execute.mockResolvedValueOnce({ rows: [] });
    await findSimilarTopics(mockWithout.db, TEST_EMBEDDING, 5);

    const queryWith = JSON.stringify(mockWith.execute.mock.calls[0][0]);
    const queryWithout = JSON.stringify(mockWithout.execute.mock.calls[0][0]);
    expect(queryWith).not.toEqual(queryWithout);
  });

  it('executes cosine distance query without profileId filter', async () => {
    const mockRows = [
      { id: 'id-2', topicId: null, content: 'geometry intro', distance: 0.25 },
    ];
    const { db, execute } = createMockDb();
    execute.mockResolvedValueOnce({ rows: mockRows });

    const result = await findSimilarTopics(db, TEST_EMBEDDING, 3);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockRows);
  });

  it('returns empty array when no matches found', async () => {
    const { db, execute } = createMockDb();
    execute.mockResolvedValueOnce({ rows: [] });

    const result = await findSimilarTopics(db, TEST_EMBEDDING);

    expect(result).toEqual([]);
  });

  it('defaults limit to 5', async () => {
    const { db, execute } = createMockDb();
    execute.mockResolvedValueOnce({ rows: [] });

    await findSimilarTopics(db, TEST_EMBEDDING);

    expect(execute).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// storeEmbedding
// ---------------------------------------------------------------------------

describe('storeEmbedding', () => {
  it('inserts embedding with all fields', async () => {
    const { db, insert, values } = createMockDb();

    await storeEmbedding(db, {
      sessionId: TEST_SESSION_ID,
      profileId: TEST_PROFILE_ID,
      topicId: TEST_TOPIC_ID,
      content: 'photosynthesis overview',
      embedding: TEST_EMBEDDING,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      id: '01933b3c-0000-7000-8000-000000000099',
      sessionId: TEST_SESSION_ID,
      profileId: TEST_PROFILE_ID,
      topicId: TEST_TOPIC_ID,
      content: 'photosynthesis overview',
      embedding: TEST_EMBEDDING,
    });
  });

  it('sets topicId to null when omitted', async () => {
    const { db, insert, values } = createMockDb();

    await storeEmbedding(db, {
      sessionId: TEST_SESSION_ID,
      profileId: TEST_PROFILE_ID,
      content: 'general note',
      embedding: TEST_EMBEDDING,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ topicId: null })
    );
  });
});
