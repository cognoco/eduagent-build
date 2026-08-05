import {
  MASTERY_REQUALIFICATION_ROUNDS,
  requalificationRoundsFor,
} from './requalification-policy';

// WI-3043: these pin the RATIFIED POLICY, not an implementation detail. The
// round count must not become a residue of whatever live-call budget remains,
// so a budget refactor that quietly changed it has to fail here first.
describe('mastery requalification policy', () => {
  it('pins the ratified round count at 3', () => {
    expect(MASTERY_REQUALIFICATION_ROUNDS).toBe(3);
  });

  it('gives a single offender the full round count', () => {
    expect(requalificationRoundsFor(1)).toBe(3);
  });

  it('gives every offender the full round count rather than adapting', () => {
    // The rejected adaptive option would have spent FEWER rounds on a single
    // isolated offender. Fixed-per-offender means the multi-offender cost is a
    // straight multiple, never a discount.
    expect(requalificationRoundsFor(2)).toBe(6);
    expect(requalificationRoundsFor(5)).toBe(15);
  });

  it('scales linearly, so the per-offender rate never varies with count', () => {
    for (const offenders of [1, 2, 3, 7, 11]) {
      expect(requalificationRoundsFor(offenders) / offenders).toBe(
        MASTERY_REQUALIFICATION_ROUNDS,
      );
    }
  });

  it('costs nothing when there are no offenders', () => {
    expect(requalificationRoundsFor(0)).toBe(0);
    expect(requalificationRoundsFor(-1)).toBe(0);
  });
});
