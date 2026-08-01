import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { clerkErasureFenceCleanup } from './clerk-erasure-fence-cleanup';

describe('clerkErasureFenceCleanup', () => {
  it('is a durable daily cleanup and reports the deleted count', async () => {
    expect((clerkErasureFenceCleanup as any).opts.triggers).toEqual([
      { cron: '30 5 * * *' },
    ]);
    const { step, runNames } = createInngestStepRunner({
      runResults: { 'delete-expired-clerk-erasure-fences': 3 },
    });

    await expect(
      (clerkErasureFenceCleanup as any).fn({ step }),
    ).resolves.toEqual({ status: 'completed', deleted: 3 });
    expect(runNames()).toEqual(['delete-expired-clerk-erasure-fences']);
  });
});
