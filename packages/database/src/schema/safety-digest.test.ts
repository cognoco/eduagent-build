import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  blockedSafetyDailyBuckets,
  blockedSafetyDigestReceipts,
} from './safety-digest.js';
import {
  blockedSafetyDailyBuckets as exportedBuckets,
  blockedSafetyDigestReceipts as exportedReceipts,
} from './index.js';

describe('[WI-1691] blocked-safety digest schema', () => {
  it('exports both first-party digest tables', () => {
    expect(exportedReceipts).toBe(blockedSafetyDigestReceipts);
    expect(exportedBuckets).toBe(blockedSafetyDailyBuckets);
  });

  it('deduplicates receipts by event ID and stores no learner pointers or content', () => {
    const config = getTableConfig(blockedSafetyDigestReceipts);
    expect(config.columns.map((column) => column.name).sort()).toEqual([
      'bucket_date',
      'event_id',
      'event_name',
      'recorded_at',
    ]);
    expect(
      config.columns.find((column) => column.name === 'event_id')?.primary,
    ).toBe(true);
  });

  it('uses one immutable UTC-date bucket with three non-negative counters', () => {
    const config = getTableConfig(blockedSafetyDailyBuckets);
    expect(config.columns.map((column) => column.name).sort()).toEqual([
      'bucket_date',
      'created_at',
      'dangerous_procedure_blocked_count',
      'delivered_at',
      'minor_pii_echo_redacted_count',
      'suitability_blocked_count',
      'updated_at',
    ]);
    expect(
      config.columns.find((column) => column.name === 'bucket_date')?.primary,
    ).toBe(true);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'blocked_safety_daily_buckets_dangerous_count_nonnegative',
      'blocked_safety_daily_buckets_minor_pii_count_nonnegative',
      'blocked_safety_daily_buckets_suitability_count_nonnegative',
    ]);
  });
});
