import { NonRetriableError } from 'inngest';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { streakRecord } from './streak-record';

const mockGetStepDatabase = jest.fn();
const mockRecordSessionActivity = jest.fn();

jest.mock(
  '../helpers' /* gc1-allow: Inngest step runtime requires mocking helper abstractions */,
  () => ({ getStepDatabase: () => mockGetStepDatabase() }),
);

jest.mock(
  '../../services/streaks' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    recordSessionActivity: (...args: unknown[]) =>
      mockRecordSessionActivity(...args),
  }),
);

const handler = (streakRecord as any).fn;

const PROFILE_ID = 'a0000000-0000-4000-8000-000000000001';

function validPayload(overrides?: Record<string, unknown>) {
  return {
    profileId: PROFILE_ID,
    date: '2026-05-10',
    ...overrides,
  };
}

describe('streakRecord', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockRecordSessionActivity.mockResolvedValue({
      currentStreak: 3,
      longestStreak: 7,
    });
  });

  it('has correct function id', () => {
    const opts = (streakRecord as any).opts;
    expect(opts.id).toBe('streak-record');
  });

  it('triggers on app/streak.record', () => {
    const triggers = (streakRecord as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/streak.record' }),
      ]),
    );
  });

  it('declares retries: 3', () => {
    const opts = (streakRecord as any).opts;
    expect(opts.retries).toBe(3);
  });

  it('throws NonRetriableError on missing payload', async () => {
    const { step } = createInngestStepRunner();
    await expect(handler({ event: { data: {} }, step })).rejects.toThrow(
      NonRetriableError,
    );
    expect(mockRecordSessionActivity).not.toHaveBeenCalled();
  });

  it('throws NonRetriableError when profileId is not a UUID', async () => {
    const { step } = createInngestStepRunner();
    await expect(
      handler({
        event: { data: validPayload({ profileId: 'not-a-uuid' }) },
        step,
      }),
    ).rejects.toThrow(NonRetriableError);
  });

  it('throws NonRetriableError when date is not YYYY-MM-DD', async () => {
    const { step } = createInngestStepRunner();
    await expect(
      handler({
        event: {
          data: validPayload({ date: '2026-05-10T12:00:00Z' }),
        },
        step,
      }),
    ).rejects.toThrow(NonRetriableError);
  });

  it('records activity and returns streak on valid payload', async () => {
    const { step } = createInngestStepRunner();
    const result = await handler({
      event: { data: validPayload() },
      step,
    });

    expect(mockRecordSessionActivity).toHaveBeenCalledWith(
      mockDb,
      PROFILE_ID,
      '2026-05-10',
    );
    expect(result).toEqual({
      step: 'streak-record',
      status: 'ok',
      streak: { currentStreak: 3, longestStreak: 7 },
    });
  });

  it('calls getStepDatabase inside the step.run closure', async () => {
    const { step, runCalls } = createInngestStepRunner();
    await handler({ event: { data: validPayload() }, step });
    expect(mockGetStepDatabase).toHaveBeenCalledTimes(1);
    expect(runCalls).toEqual([{ name: 'record-activity' }]);
  });
});
