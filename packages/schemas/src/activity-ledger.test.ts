import {
  ledgerKindParamsSchema,
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

  describe('[WI-992] ledgerKindParamsSchema — per-kind UUID validation', () => {
    const VALID_UUID = '00000000-0000-4000-8000-000000000001';

    it('rejects session_filed when a routing UUID field has a non-uuid value', () => {
      expect(
        ledgerKindParamsSchema.safeParse({
          kind: 'session_filed',
          sessionId: 'not-uuid',
        }).success,
      ).toBe(false);
    });

    it('accepts session_filed with a valid UUID sessionId', () => {
      expect(
        ledgerKindParamsSchema.safeParse({
          kind: 'session_filed',
          sessionId: VALID_UUID,
          subjectId: VALID_UUID,
        }).success,
      ).toBe(true);
    });

    it('rejects topic_mastered with a non-uuid subjectId', () => {
      expect(
        ledgerKindParamsSchema.safeParse({
          kind: 'topic_mastered',
          subjectId: 'not-a-uuid',
        }).success,
      ).toBe(false);
    });

    it('accepts milestone_reached with no UUID fields (they are all optional)', () => {
      expect(
        ledgerKindParamsSchema.safeParse({
          kind: 'milestone_reached',
        }).success,
      ).toBe(true);
    });
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
