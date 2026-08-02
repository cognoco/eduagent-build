export interface FlowCoverage {
  attempted: number;
  completed: number;
  budgetSkipped: number;
  /**
   * Samples this flow's required-sample demand (see `runner/budget.ts`'s
   * `countEnvelopeFlowSamples`) says SHOULD have been attempted. Distinct from
   * `attempted`: an item dropped before the live-call site is ever reached
   * (a `buildPrompt` throw, a filtered-out scenario) never increments
   * `attempted`, so comparing only `attempted === completed` can report
   * `complete: true` on a silently truncated flow. [WI-3029 S4]
   */
  required: number;
  complete: boolean;
}

export function aggregateCoverage(input: {
  attempted: number;
  completed: number;
  budgetSkipped: number;
  required: number;
}): FlowCoverage {
  return {
    ...input,
    complete:
      input.budgetSkipped === 0 &&
      input.completed === input.attempted &&
      input.attempted >= input.required,
  };
}

export function isCoverageIncomplete(
  coverage: FlowCoverage | undefined,
): boolean {
  return coverage !== undefined && !coverage.complete;
}
