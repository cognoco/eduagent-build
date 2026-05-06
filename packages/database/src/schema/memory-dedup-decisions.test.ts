import { getTableConfig } from 'drizzle-orm/pg-core';

import { memoryDedupDecisions } from './memory-dedup-decisions.js';

describe('memoryDedupDecisions schema', () => {
  it('has the expected columns and composite primary key', () => {
    const cfg = getTableConfig(memoryDedupDecisions);
    expect(cfg.columns.map((c) => c.name).sort()).toEqual([
      'created_at',
      'decision',
      'merged_text',
      'model_version',
      'pair_key',
      'profile_id',
    ]);
    expect(cfg.primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'profile_id',
      'pair_key',
    ]);
  });
});
