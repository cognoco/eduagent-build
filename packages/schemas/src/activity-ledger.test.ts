import {
  ledgerKindSchema,
  ledgerParamsSchema,
  ledgerTemplateKeySchema,
  ledgerVisibilitySchema,
  parseLedgerParams,
} from './activity-ledger.js';

describe('activity ledger schemas', () => {
  it('defines the S0 ledger kind set', () => {
    expect(ledgerKindSchema.options).toEqual([
      'session_filed',
      'topic_mastered',
      'retention_due',
      'needs_deepening_added',
      'recap_ready',
      'snapshot_ready',
      'milestone_reached',
      'reward_receipt',
    ]);
  });

  it('defines the ledger visibility set', () => {
    expect(ledgerVisibilitySchema.options).toEqual([
      'self',
      'supporter',
      'both',
    ]);
  });

  it('keeps template keys aligned to ledger kinds', () => {
    expect(ledgerTemplateKeySchema.options).toHaveLength(
      ledgerKindSchema.options.length,
    );

    for (const key of ledgerTemplateKeySchema.options) {
      expect(key).toMatch(/^ledger\.[a-z_]+\.[a-z_]+$/);
      const [, kind] = key.split('.');
      expect(ledgerKindSchema.options).toContain(kind);
    }
  });

  it('parses params objects and falls back to an empty object on invalid raw values', () => {
    expect(ledgerParamsSchema.parse({ topicTitle: 'Gravity' })).toEqual({
      topicTitle: 'Gravity',
    });
    expect(parseLedgerParams(undefined)).toEqual({});
    expect(parseLedgerParams(null)).toEqual({});
    expect(parseLedgerParams(['not', 'a', 'record'])).toEqual({});
  });
});
