import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { clerkErasureFenceCleanup } from './clerk-erasure-fence-cleanup';

describe('clerkErasureFenceCleanup', () => {
  it('is a durable daily cleanup that drains bounded batches and reports the total', async () => {
    expect((clerkErasureFenceCleanup as any).opts.triggers).toEqual([
      { cron: '30 5 * * *' },
    ]);
    const { step, runNames } = createInngestStepRunner({
      runResults: {
        'delete-expired-clerk-erasure-fences-0': 500,
        'delete-expired-clerk-erasure-fences-1': 3,
      },
    });

    await expect(
      (clerkErasureFenceCleanup as any).fn({ step }),
    ).resolves.toEqual({ status: 'completed', deleted: 503 });
    expect(runNames()).toEqual([
      'delete-expired-clerk-erasure-fences-0',
      'delete-expired-clerk-erasure-fences-1',
    ]);
  });
});
