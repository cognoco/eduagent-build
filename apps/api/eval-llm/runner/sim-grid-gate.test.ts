// ---------------------------------------------------------------------------
// sim-grid-gate.test.ts — [WI-2461 review round 2] main-grid completeness gate
// for the mastery simulator (simulate.ts).
//
// The bug: runRounds skips a round that fails transiently (or whose profile is
// missing) with only a console.warn, so a partial main grid (a) passed an
// ordinary run with exit 0, (b) let --check-baseline gate over an incomplete
// corpus, and (c) let --update-baseline WRITE a baseline built from incomplete
// results. Any failed main-grid round must fail all three modes, and
// --update-baseline must refuse to write.
//
// Pure-function tests (same extraction pattern as runner/gates.ts —
// simulate.ts self-invokes main() at module load, so the gate logic lives in
// this separately importable module). No jest.mock.
// ---------------------------------------------------------------------------

import { evaluateMainGridCompleteness } from './sim-grid-gate';

describe('evaluateMainGridCompleteness [WI-2461]', () => {
  it('complete grid → ok, no message', () => {
    const r = evaluateMainGridCompleteness({
      attemptedRounds: 21,
      completedRounds: 21,
      mode: 'run',
    });
    expect(r.ok).toBe(true);
    expect(r.skippedRounds).toBe(0);
    expect(r.message).toBeNull();
  });

  it('one skipped main round + --check-baseline → fail closed with counts', () => {
    const r = evaluateMainGridCompleteness({
      attemptedRounds: 21,
      completedRounds: 20,
      mode: 'check-baseline',
    });
    expect(r.ok).toBe(false);
    expect(r.skippedRounds).toBe(1);
    expect(r.message).toContain('20/21');
    expect(r.message).toContain('check-baseline');
    expect(r.message).toMatch(/fail(ing)? closed/i);
  });

  it('one skipped main round + --update-baseline → refuse to write the baseline', () => {
    const r = evaluateMainGridCompleteness({
      attemptedRounds: 21,
      completedRounds: 20,
      mode: 'update-baseline',
    });
    expect(r.ok).toBe(false);
    expect(r.skippedRounds).toBe(1);
    expect(r.message).toMatch(/refus/i);
    expect(r.message).toContain('simulation-baseline');
  });

  it('one skipped main round on an ordinary run → fails too (no silent partial pass)', () => {
    const r = evaluateMainGridCompleteness({
      attemptedRounds: 7,
      completedRounds: 6,
      mode: 'run',
    });
    expect(r.ok).toBe(false);
    expect(r.skippedRounds).toBe(1);
    expect(r.message).toContain('6/7');
  });

  it('zero completed rounds → not ok (backstops the empty-corpus guard)', () => {
    const r = evaluateMainGridCompleteness({
      attemptedRounds: 7,
      completedRounds: 0,
      mode: 'check-baseline',
    });
    expect(r.ok).toBe(false);
    expect(r.skippedRounds).toBe(7);
  });
});
