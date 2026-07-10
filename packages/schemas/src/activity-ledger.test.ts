import {
  ledgerKindParamsSchema,
  ledgerKindSchema,
  ledgerParamsSchema,
  parseLedgerParams,
} from './activity-ledger.js';

describe('activity ledger schemas', () => {
  it('defines the written ledger kind set (derive-on-read kinds pruned per MMT-ADR-0022)', () => {
    expect(ledgerKindSchema.options).toEqual([
      'session_filed',
      'milestone_reached',
    ]);
  });

  it('[WI-1121] no longer accepts reward_receipt (removed — no producer, no spec citation)', () => {
    expect(ledgerKindSchema.safeParse('reward_receipt').success).toBe(false);
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

    it('rejects milestone_reached with a non-uuid subjectId', () => {
      expect(
        ledgerKindParamsSchema.safeParse({
          kind: 'milestone_reached',
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
