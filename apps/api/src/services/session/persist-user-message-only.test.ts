import { persistUserMessageOnly } from './persist-user-message-only';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from '@eduagent/schemas';

describe('persistUserMessageOnly', () => {
  let mockDb: any;
  let insertChain: any;
  let sessionRow: any;

  beforeEach(() => {
    sessionRow = {
      id: 'sess-1',
      profileId: 'p-1',
      subjectId: 'subj-1',
      status: 'active',
    };
    insertChain = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockResolvedValue([]),
    };
    const selectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      for: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockImplementation(async () => (sessionRow ? [sessionRow] : [])),
    };
    mockDb = {
      select: jest.fn().mockReturnValue(selectChain),
      insert: jest.fn().mockReturnValue(insertChain),
      transaction: jest.fn(async (fn) => fn(mockDb)),
    };
  });

  it('throws BadRequestError when clientId missing', async () => {
    await expect(
      persistUserMessageOnly(mockDb, 'p-1', 'sess-1', 'Hello', {
        clientId: undefined as unknown as string,
        orphanReason: 'llm_stream_error',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('throws BadRequestError when clientId is empty string', async () => {
    await expect(
      persistUserMessageOnly(mockDb, 'p-1', 'sess-1', 'Hello', {
        clientId: '',
        orphanReason: 'llm_stream_error',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('verifies session ownership before writing', async () => {
    await persistUserMessageOnly(mockDb, 'p-1', 'sess-1', 'Hello', {
      clientId: 'c-1',
      orphanReason: 'llm_stream_error',
    });
    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockDb.select().for).toHaveBeenCalledWith('update');
    const orderRead = mockDb.select().limit.mock.invocationCallOrder[0];
    const orderInsert = mockDb.insert.mock.invocationCallOrder[0];
    expect(orderRead).toBeLessThan(orderInsert);
  });

  it('refuses to write when session belongs to another profile', async () => {
    sessionRow = {
      id: 'sess-1',
      profileId: 'other',
    };
    await expect(
      persistUserMessageOnly(mockDb, 'p-1', 'sess-1', 'Hello', {
        clientId: 'c-1',
        orphanReason: 'llm_stream_error',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('refuses to write when session does not exist', async () => {
    sessionRow = undefined;
    await expect(
      persistUserMessageOnly(mockDb, 'p-1', 'sess-1', 'Hello', {
        clientId: 'c-1',
        orphanReason: 'llm_stream_error',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each(['completed', 'auto_closed'] as const)(
    '[WI-78 DS-242] refuses to write orphan user messages to %s sessions',
    async (status) => {
      sessionRow = {
        id: 'sess-1',
        profileId: 'p-1',
        subjectId: 'subj-1',
        status,
      };

      await expect(
        persistUserMessageOnly(mockDb, 'p-1', 'sess-1', 'Hello', {
          clientId: 'c-1',
          orphanReason: 'llm_stream_error',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(mockDb.insert).not.toHaveBeenCalled();
    },
  );

  it('writes one row with eventType=user_message and orphan_reason', async () => {
    await persistUserMessageOnly(mockDb, 'p-1', 'sess-1', 'Hello world', {
      clientId: 'c-1',
      orphanReason: 'llm_stream_error',
    });
    const valuesArg = insertChain.values.mock.calls[0][0];
    expect(valuesArg).toEqual(
      expect.objectContaining({
        sessionId: 'sess-1',
        profileId: 'p-1',
        eventType: 'user_message',
        content: 'Hello world',
        clientId: 'c-1',
        orphanReason: 'llm_stream_error',
      }),
    );
    expect(valuesArg.role).toBeUndefined();
  });

  it('is idempotent — onConflictDoNothing on (session_id, client_id)', async () => {
    insertChain.onConflictDoNothing.mockResolvedValue([]);
    await expect(
      persistUserMessageOnly(mockDb, 'p-1', 'sess-1', 'm', {
        clientId: 'c',
        orphanReason: 'llm_stream_error',
      }),
    ).resolves.toBeUndefined();
    expect(insertChain.onConflictDoNothing).toHaveBeenCalled();
  });
});
