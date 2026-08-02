import { aggregateCoverage, type FlowCoverage } from './coverage';

describe('aggregateCoverage', () => {
  it('separates attempted, completed, and budget-skipped samples', () => {
    const coverage: FlowCoverage = aggregateCoverage({
      attempted: 4,
      completed: 2,
      budgetSkipped: 2,
    });

    expect(coverage).toEqual({
      attempted: 4,
      completed: 2,
      budgetSkipped: 2,
      complete: false,
    });
  });
});
