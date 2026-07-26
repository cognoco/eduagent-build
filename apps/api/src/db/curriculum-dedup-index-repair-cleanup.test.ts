import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanupCurriculumDedupIndexRepairTest } from './curriculum-dedup-index-repair-cleanup';

describe('curriculum dedup index repair cleanup [WI-2791]', () => {
  it('preserves setup failures that occur before either pool is initialized', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wi2791-cleanup-no-pools-'));
    const setupError = new Error('database setup failed');

    const failDuringSetup = async (): Promise<void> => {
      try {
        throw setupError;
      } finally {
        await cleanupCurriculumDedupIndexRepairTest({
          adminPool: undefined,
          scratchPool: undefined,
          databaseName: 'wi2791_cleanup_test',
          tempDirs: [tempDir],
        });
      }
    };

    await expect(failDuringSetup()).rejects.toBe(setupError);

    expect(existsSync(tempDir)).toBe(false);
  });

  it('closes an initialized admin pool when scratch-pool setup fails', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wi2791-cleanup-admin-only-'));
    const end = jest.fn().mockResolvedValue(undefined);
    const query = jest.fn().mockRejectedValue(new Error('must not query'));

    await expect(
      cleanupCurriculumDedupIndexRepairTest({
        adminPool: { end, query },
        scratchPool: undefined,
        databaseName: 'wi2791_cleanup_test',
        tempDirs: [tempDir],
      }),
    ).resolves.toBeUndefined();

    expect(end).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    expect(existsSync(tempDir)).toBe(false);
  });
});
