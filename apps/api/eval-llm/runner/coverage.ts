export interface FlowCoverage {
  attempted: number;
  completed: number;
  budgetSkipped: number;
  complete: boolean;
}

export function aggregateCoverage(input: {
  attempted: number;
  completed: number;
  budgetSkipped: number;
}): FlowCoverage {
  return {
    ...input,
    complete: input.budgetSkipped === 0 && input.completed === input.attempted,
  };
}

export function isCoverageIncomplete(
  coverage: FlowCoverage | undefined,
): boolean {
  return coverage !== undefined && !coverage.complete;
}
