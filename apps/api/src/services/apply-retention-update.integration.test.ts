import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const RETENTION_WRITER_FILES = [
  'apps/api/src/services/retention-data.ts',
  'apps/api/src/inngest/functions/review-calibration-grade.ts',
];

function source(file: string): string {
  return readFileSync(resolve(__dirname, '../../../..', file), 'utf8');
}

describe('applyRetentionUpdate retention writer integration guard', () => {
  it('routes retention-derived reward status sync through the explicit retention wrapper', () => {
    for (const file of RETENTION_WRITER_FILES) {
      expect(source(file)).toContain('syncRewardStatusFromRetention');
      expect(source(file)).not.toContain('syncXpLedgerStatus(');
    }
  });

  it('keeps the explicit retention wrapper co-located with the retention write chokepoint', () => {
    const helperSource = source(
      ['apps', 'api', 'src', 'services', 'apply-retention-update.ts'].join(sep),
    );

    expect(helperSource).toContain('syncRewardStatusFromRetention');
    expect(helperSource).toContain('syncXpLedgerStatus(');
  });
});
