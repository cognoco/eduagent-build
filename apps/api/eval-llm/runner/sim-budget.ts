export interface MasteryBudget {
  rounds: number;
  configuredUnits: number;
  expectedProviderCalls: number;
  configuredUnitsPerRound: number;
  expectedProviderCallsPerRound: number;
}

/**
 * A three-question round schedules learner + grader + tutor work per question,
 * but the final question has no follow-up tutor turn. The configured unit is
 * the conservative 3× question cap; expected provider demand is one unit less.
 */
export function deriveMasteryBudget(input: {
  scenarioCount: number;
  runs: number;
  questionsPerRound?: number;
}): MasteryBudget {
  const questionsPerRound = input.questionsPerRound ?? 3;
  const configuredUnitsPerRound = 3 * questionsPerRound;
  const expectedProviderCallsPerRound = configuredUnitsPerRound - 1;
  const rounds = input.scenarioCount * input.runs;

  return {
    rounds,
    configuredUnits: rounds * configuredUnitsPerRound,
    expectedProviderCalls: rounds * expectedProviderCallsPerRound,
    configuredUnitsPerRound,
    expectedProviderCallsPerRound,
  };
}

export function assertSufficientMasteryBudget(
  budget: MasteryBudget,
  maxLiveCalls: number,
): void {
  if (maxLiveCalls < budget.configuredUnits) {
    throw new Error(
      `mastery grid requires ${budget.configuredUnits} configured units ` +
        `and estimates ${budget.expectedProviderCalls} expected provider calls; ` +
        `--max-live-calls=${maxLiveCalls} is insufficient`,
    );
  }
}
