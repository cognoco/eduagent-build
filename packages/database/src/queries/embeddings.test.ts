import { findSimilarTopics, storeEmbedding } from './embeddings.js';
import type { Database } from '../client.js';

const TEST_PROFILE_ID = '01933b3c-0000-7000-8000-000000000001';
const TEST_SESSION_ID = '01933b3c-0000-7000-8000-000000000002';
const TEST_TOPIC_ID = '01933b3c-0000-7000-8000-000000000003';
const TEST_EMBEDDING = [0.1, 0.2, 0.3];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

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
      TEST_PROFILE_ID,
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockRows);

    // Verify profileId was passed as a parameter to the SQL query
    const sqlArg = execute.mock.calls[0][0];
    const flatValues = JSON.stringify(sqlArg);
    expect(flatValues).toContain(TEST_PROFILE_ID);
  });

  it('returns empty array when no matches found', async () => {
    const { db, execute } = createMockDb();
    execute.mockResolvedValueOnce({ rows: [] });

    const result = await findSimilarTopics(
      db,
      TEST_EMBEDDING,
      5,
      TEST_PROFILE_ID,
    );

    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // [BUG-221 / P1-HIGH] profileId is required — break tests
  //
  // The signature change (profileId moved from optional to required) is the
  // primary defence. The runtime guard below catches callers that bypass the
  // type system (raw JS in tests, casts, dynamic invocations) by passing an
  // empty string. Without the guard, `WHERE profile_id = ''` would return no
  // rows and the bug would surface as "search broken" instead of "search
  // unscoped".
  // ---------------------------------------------------------------------------

  it('throws when profileId is an empty string (defence-in-depth runtime guard)', async () => {
    const { db } = createMockDb();
    await expect(findSimilarTopics(db, TEST_EMBEDDING, 5, '')).rejects.toThrow(
      /profileId is required/,
    );
  });

  it('throws when profileId is a whitespace-only string', async () => {
    const { db } = createMockDb();
    await expect(
      findSimilarTopics(db, TEST_EMBEDDING, 5, '   '),
    ).rejects.toThrow(/profileId is required/);
  });

  it('always includes profile_id = $profileId in the issued SQL', async () => {
    const { db, execute } = createMockDb();
    execute.mockResolvedValueOnce({ rows: [] });

    await findSimilarTopics(db, TEST_EMBEDDING, 5, TEST_PROFILE_ID);

    const sqlArg = execute.mock.calls[0][0];
    // The drizzle SQL object should contain the literal "profile_id" string
    // in one of its query chunks. Serialise and grep.
    const serialised = JSON.stringify(sqlArg);
    expect(serialised).toMatch(/profile_id/);
    expect(serialised).toContain(TEST_PROFILE_ID);
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
      id: expect.stringMatching(UUID_PATTERN),
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
      expect.objectContaining({ topicId: null }),
    );
  });
});
