import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { preparedNoticeCleanup } from './prepared-notice-cleanup';

describe('preparedNoticeCleanup', () => {
  it('is a durable daily cleanup and reports the deleted count', async () => {
    expect((preparedNoticeCleanup as any).opts.triggers).toEqual([
      { cron: '45 5 * * *' },
    ]);
    const { step, runNames } = createInngestStepRunner({
      runResults: { 'delete-stale-prepared-notices': 2 },
    });

    await expect((preparedNoticeCleanup as any).fn({ step })).resolves.toEqual({
      status: 'completed',
      deleted: 2,
    });
    expect(runNames()).toEqual(['delete-stale-prepared-notices']);
  });
});
