import { getTableConfig } from 'drizzle-orm/pg-core';

import { memoryDedupDecisions } from './memory-dedup-decisions.js';

describe('memoryDedupDecisions schema', () => {
  // BUG-363: category column added; PK widened to (profile_id, pair_key, category)
  it('has the expected columns including category (BUG-363)', () => {
    const cfg = getTableConfig(memoryDedupDecisions);
    expect(cfg.columns.map((c) => c.name).sort()).toEqual([
      'category',
      'created_at',
      'decision',
      'merged_text',
      'model_version',
      'pair_key',
      'profile_id',
    ]);
  });

  it('[BUG-363] composite PK includes category to prevent cross-category collisions', () => {
    const cfg = getTableConfig(memoryDedupDecisions);
    expect(cfg.primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'profile_id',
      'pair_key',
      'category',
    ]);
  });

  it('[BUG-363] has (profile_id, category) index for category-scoped lookups', () => {
    const cfg = getTableConfig(memoryDedupDecisions);
    const idx = cfg.indexes.find(
      (i) => i.config.name === 'memory_dedup_decisions_profile_category_idx',
    );
    expect(idx).toBeDefined();
  });
});
