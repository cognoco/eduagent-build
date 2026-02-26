// ---------------------------------------------------------------------------
// Subject Auto-Archive — Tests
// ---------------------------------------------------------------------------

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({})),
}));

const mockArchiveInactiveSubjects = jest.fn().mockResolvedValue([]);

jest.mock('../../services/subject', () => ({
  archiveInactiveSubjects: (...args: unknown[]) =>
    mockArchiveInactiveSubjects(...args),
}));

import { subjectAutoArchive } from './subject-auto-archive';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-01-15T02:00:00.000Z');

async function executeSteps(): Promise<Record<string, unknown>> {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn(),
  };

  const handler = (subjectAutoArchive as any).fn;
  const result = await handler({
    event: { name: 'inngest/function.invoked' },
    step: mockStep,
  });

  return { result, mockStep };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env['DATABASE_URL'];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('subjectAutoArchive', () => {
  it('should be defined as an Inngest function', () => {
    expect(subjectAutoArchive).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (subjectAutoArchive as any).opts;
    expect(config.id).toBe('subject-auto-archive');
  });

  it('should have a cron trigger at 02:00 UTC', () => {
    const triggers = (subjectAutoArchive as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 2 * * *' })])
    );
  });

  it('returns completed status with archived count', async () => {
    const { result } = await executeSteps();

    expect(result).toEqual({
      status: 'completed',
      archivedCount: expect.any(Number),
      cutoffDate: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('archives subjects with no recent activity', async () => {
    mockArchiveInactiveSubjects.mockResolvedValueOnce([
      { id: 'subject-1' },
      { id: 'subject-2' },
    ]);

    const { result } = await executeSteps();

    expect(result.archivedCount).toBe(2);
    expect(mockArchiveInactiveSubjects).toHaveBeenCalledTimes(1);
  });

  it('passes cutoff date to service function', async () => {
    await executeSteps();

    expect(mockArchiveInactiveSubjects).toHaveBeenCalledWith(
      expect.anything(), // db instance
      expect.any(Date)
    );

    const cutoffArg = mockArchiveInactiveSubjects.mock.calls[0][1] as Date;
    const expectedCutoff = new Date(NOW);
    expectedCutoff.setDate(expectedCutoff.getDate() - 30);
    expect(cutoffArg.toISOString()).toBe(expectedCutoff.toISOString());
  });

  it('handles zero stale subjects gracefully', async () => {
    mockArchiveInactiveSubjects.mockResolvedValueOnce([]);

    const { result } = await executeSteps();

    expect(result.archivedCount).toBe(0);
  });

  it('calculates cutoff date as 30 days ago', async () => {
    const { result } = await executeSteps();

    const cutoff = new Date(result.cutoffDate as string);
    const expectedCutoff = new Date(NOW);
    expectedCutoff.setDate(expectedCutoff.getDate() - 30);

    expect(cutoff.toISOString()).toBe(expectedCutoff.toISOString());
  });
});
