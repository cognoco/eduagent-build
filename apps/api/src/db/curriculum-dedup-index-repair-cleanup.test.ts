import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanupCurriculumDedupIndexRepairTest } from './curriculum-dedup-index-repair-cleanup';

describe('curriculum dedup index repair cleanup [WI-2791]', () => {
  it('correlates the scratch pool and teardown with one random application name', () => {
    const source = readFileSync(
      join(__dirname, 'curriculum-dedup-index-repair.integration.test.ts'),
      'utf8',
    );

    expect(source).toContain(
      "const scratchRunId = randomBytes(4).toString('hex');",
    );
    expect(source).toContain(
      'const databaseName = `wi2791_repair_${scratchRunId}`;',
    );
    expect(source).toContain(
      'const scratchApplicationName = `wi2791-repair-${scratchRunId}`;',
    );
    expect(source).toContain('application_name: scratchApplicationName');
    expect(source).toContain('ownedApplicationName: scratchApplicationName');
  });

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
          ownedApplicationName: 'wi2791-cleanup-test',
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
        ownedApplicationName: 'wi2791-cleanup-test',
        tempDirs: [tempDir],
      }),
    ).resolves.toBeUndefined();

    expect(end).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    expect(existsSync(tempDir)).toBe(false);
  });
});
