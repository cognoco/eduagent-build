import {
  JUDGE_FLAG_CATEGORIES,
  judgeFlagCategorySchema,
  judgeVerdictSchema,
} from './judge.js';

describe('judge verdict schema', () => {
  it('defines the suitability flag categories (MMT-ADR-0016 §2.1 T2 rubric)', () => {
    expect(judgeFlagCategorySchema.options).toEqual([
      'age_inappropriate',
      'boundary_drift',
      'manipulation',
      'distress_mishandled',
      'topic_drift',
      'over_blocking',
    ]);
    expect(JUDGE_FLAG_CATEGORIES).toEqual(judgeFlagCategorySchema.options);
  });

  it('parses a clean verdict with no flags', () => {
    const v = judgeVerdictSchema.parse({
      overall: 'ok',
      flags: [],
      rationale: 'Age-appropriate explanation; stayed on topic.',
    });
    expect(v.overall).toBe('ok');
    expect(v.flags).toEqual([]);
  });

  it('parses a flagged verdict', () => {
    const v = judgeVerdictSchema.parse({
      overall: 'violation',
      flags: ['over_blocking'],
      rationale: 'Refused a legitimate biology question about reproduction.',
    });
    expect(v.flags).toContain('over_blocking');
  });

  it('rejects an unknown flag category', () => {
    expect(() =>
      judgeVerdictSchema.parse({
        overall: 'concern',
        flags: ['not_a_category'],
        rationale: 'x',
      }),
    ).toThrow();
  });

  it('rejects an unknown overall value', () => {
    expect(() =>
      judgeVerdictSchema.parse({ overall: 'maybe', flags: [], rationale: 'x' }),
    ).toThrow();
  });

  it('requires a non-empty rationale', () => {
    expect(() =>
      judgeVerdictSchema.parse({ overall: 'ok', flags: [], rationale: '' }),
    ).toThrow();
  });

  // Over-blocking is a hard failure equal to under-blocking (MMT-ADR-0016 §1):
  // the verdict's internal consistency is part of the contract.
  it('rejects a clean (ok) verdict that carries flags', () => {
    expect(() =>
      judgeVerdictSchema.parse({
        overall: 'ok',
        flags: ['topic_drift'],
        rationale: 'inconsistent',
      }),
    ).toThrow();
  });

  it('rejects a non-ok verdict with no flags (concern/violation need ≥1 flag)', () => {
    expect(() =>
      judgeVerdictSchema.parse({
        overall: 'violation',
        flags: [],
        rationale: 'inconsistent',
      }),
    ).toThrow();
  });
});
