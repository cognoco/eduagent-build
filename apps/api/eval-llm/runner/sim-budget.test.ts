import {
  deriveMasteryBudget,
  assertSufficientMasteryBudget,
} from './sim-budget';

describe('deriveMasteryBudget', () => {
  it('derives the complete current 8 × 3 grid without stale constants', () => {
    expect(deriveMasteryBudget({ scenarioCount: 8, runs: 3 })).toEqual({
      rounds: 24,
      configuredUnits: 216,
      expectedProviderCalls: 192,
      configuredUnitsPerRound: 9,
      expectedProviderCallsPerRound: 8,
    });
  });

  it('changes with scenario and run counts', () => {
    expect(deriveMasteryBudget({ scenarioCount: 2, runs: 4 })).toMatchObject({
      rounds: 8,
      configuredUnits: 72,
      expectedProviderCalls: 64,
    });
  });

  it('rejects below configured demand and accepts the complete configured grid', () => {
    expect(() =>
      assertSufficientMasteryBudget(
        deriveMasteryBudget({ scenarioCount: 8, runs: 3 }),
        215,
      ),
    ).toThrow(/requires 216 configured units.*192 expected provider calls/);

    expect(() =>
      assertSufficientMasteryBudget(
        deriveMasteryBudget({ scenarioCount: 8, runs: 3 }),
        216,
      ),
    ).not.toThrow();
  });
});
