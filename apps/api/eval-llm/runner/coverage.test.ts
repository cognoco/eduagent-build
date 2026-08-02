import {
  aggregateCoverage,
  isCoverageIncomplete,
  type FlowCoverage,
} from './coverage';

describe('aggregateCoverage', () => {
  it('separates attempted, completed, budget-skipped, and required samples', () => {
    const coverage: FlowCoverage = aggregateCoverage({
      attempted: 4,
      completed: 2,
      budgetSkipped: 2,
      required: 4,
    });

    expect(coverage).toEqual({
      attempted: 4,
      completed: 2,
      budgetSkipped: 2,
      required: 4,
      complete: false,
    });
  });

  it('reports complete:true when every attempted sample completed with zero budget-skips and required is met', () => {
    const coverage: FlowCoverage = aggregateCoverage({
      attempted: 3,
      completed: 3,
      budgetSkipped: 0,
      required: 3,
    });

    expect(coverage).toEqual({
      attempted: 3,
      completed: 3,
      budgetSkipped: 0,
      required: 3,
      complete: true,
    });
  });

  it('[WI-3029 S4] reports complete:false when attempted never reaches required, even with zero budget-skips', () => {
    // Simulates a pre-call skip (e.g. buildPrompt throwing for one item): the
    // live-call site never runs for that item, so budgetSkipped stays 0 and
    // completed === attempted, but the item never entered `attempted` either.
    // Comparing against `required` — derived independently from the full
    // scenario population — is what catches this.
    const coverage: FlowCoverage = aggregateCoverage({
      attempted: 2,
      completed: 2,
      budgetSkipped: 0,
      required: 3,
    });

    expect(coverage).toEqual({
      attempted: 2,
      completed: 2,
      budgetSkipped: 0,
      required: 3,
      complete: false,
    });
  });
});

describe('isCoverageIncomplete', () => {
  it('returns false when coverage is undefined (no entry for this flow)', () => {
    expect(isCoverageIncomplete(undefined)).toBe(false);
  });

  it('returns false for complete coverage', () => {
    const coverage = aggregateCoverage({
      attempted: 3,
      completed: 3,
      budgetSkipped: 0,
      required: 3,
    });

    expect(isCoverageIncomplete(coverage)).toBe(false);
  });

  it('returns true for incomplete coverage', () => {
    const coverage = aggregateCoverage({
      attempted: 4,
      completed: 2,
      budgetSkipped: 2,
      required: 4,
    });

    expect(isCoverageIncomplete(coverage)).toBe(true);
  });
});
