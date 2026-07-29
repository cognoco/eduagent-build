import { rmSync } from 'node:fs';

import type { Pool } from 'pg';

import { closePoolAndDropScratchDatabase } from './scratch-database-teardown';

interface CleanupCurriculumDedupIndexRepairTestOptions {
  adminPool: Pick<Pool, 'end' | 'query'> | undefined;
  scratchPool: Pick<Pool, 'end'> | undefined;
  databaseName: string;
  tempDirs: string[];
}

export async function cleanupCurriculumDedupIndexRepairTest({
  adminPool,
  scratchPool,
  databaseName,
  tempDirs,
}: CleanupCurriculumDedupIndexRepairTestOptions): Promise<void> {
  try {
    if (adminPool && scratchPool) {
      await closePoolAndDropScratchDatabase({
        adminPool,
        scratchPool,
        databaseName,
      });
    }
  } finally {
    try {
      await adminPool?.end();
    } finally {
      for (const dir of tempDirs) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }
}
