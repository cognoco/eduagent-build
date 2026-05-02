import { appendOrphanInterviewTurn } from './append-orphan-interview-turn';
import { BadRequestError, NotFoundError } from '@eduagent/schemas';

describe('appendOrphanInterviewTurn', () => {
  let mockDb: any;
  let updateChain: any;

  beforeEach(() => {
    updateChain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'd1' }]),
    };
    mockDb = {
      query: {
        onboardingDrafts: {
          findFirst: jest.fn(),
        },
      },
      update: jest.fn().mockReturnValue(updateChain),
    };
  });

  it('throws BadRequestError when clientId missing', async () => {
    await expect(
      appendOrphanInterviewTurn(mockDb, 'p1', 'd1', 'msg', {
        clientId: undefined as unknown as string,
        orphanReason: 'llm_stream_error',
      })
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestError when clientId is empty string', async () => {
    await expect(
      appendOrphanInterviewTurn(mockDb, 'p1', 'd1', 'msg', {
        clientId: '',
        orphanReason: 'llm_stream_error',
      })
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('performs atomic update and does not follow up when rows affected', async () => {
    updateChain.returning.mockResolvedValue([{ id: 'd1' }]);
    await appendOrphanInterviewTurn(mockDb, 'p1', 'd1', 'msg', {
      clientId: 'c1',
      orphanReason: 'llm_stream_error',
    });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.query.onboardingDrafts.findFirst).not.toHaveBeenCalled();
  });

  it('is idempotent — zero rows affected + draft exists = no-op', async () => {
    updateChain.returning.mockResolvedValue([]);
    mockDb.query.onboardingDrafts.findFirst.mockResolvedValue({ id: 'd1' });
    await expect(
      appendOrphanInterviewTurn(mockDb, 'p1', 'd1', 'msg', {
        clientId: 'c1',
        orphanReason: 'llm_stream_error',
      })
    ).resolves.toBeUndefined();
  });

  it('throws NotFoundError when draft not found or profileId mismatches', async () => {
    updateChain.returning.mockResolvedValue([]);
    mockDb.query.onboardingDrafts.findFirst.mockResolvedValue(undefined);
    await expect(
      appendOrphanInterviewTurn(mockDb, 'p1', 'd1', 'msg', {
        clientId: 'c1',
        orphanReason: 'unknown_post_stream',
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('passes set and where arguments to the update call', async () => {
    updateChain.returning.mockResolvedValue([{ id: 'd1' }]);
    await appendOrphanInterviewTurn(mockDb, 'p1', 'd1', 'lost message', {
      clientId: 'c1',
      orphanReason: 'persist_curriculum_failed',
    });
    expect(updateChain.set).toHaveBeenCalledTimes(1);
    expect(updateChain.where).toHaveBeenCalledTimes(1);
    expect(updateChain.returning).toHaveBeenCalledTimes(1);
  });
});
