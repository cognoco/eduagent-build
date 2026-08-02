export interface EnvelopeBudgetInput {
  id: string;
  requiredSamples: number;
  baselineSamples: number;
}

export interface EnvelopeMatrixFlow {
  id: string;
  emitsEnvelope?: boolean;
  buildPromptInput(profile: unknown): unknown;
  enumerateScenarios?(
    profile: unknown,
  ): Array<{ scenarioId: string; input: unknown }> | null;
}

export interface EnvelopeMatrixOptions {
  scenarioFilter?: Set<string>;
}

export interface EnvelopeBudget {
  baselineSamples: number;
  requiredSamples: number;
  headroomRate: number;
  configuredBudget: number;
  headroomSamples: number;
  flows: Record<string, { baselineSamples: number; requiredSamples: number }>;
}

/** The weekly gate keeps 10% explicit headroom for small matrix additions. */
export const ENVELOPE_BUDGET_HEADROOM_RATE = 0.1;

export function deriveEnvelopeBudget(
  inputs: EnvelopeBudgetInput[],
  headroomRate = ENVELOPE_BUDGET_HEADROOM_RATE,
): EnvelopeBudget {
  const baselineSamples = inputs.reduce(
    (sum, input) => sum + input.baselineSamples,
    0,
  );
  const requiredSamples = inputs.reduce(
    (sum, input) => sum + input.requiredSamples,
    0,
  );
  const configuredBudget = Math.ceil(requiredSamples * (1 + headroomRate));

  return {
    baselineSamples,
    requiredSamples,
    headroomRate,
    configuredBudget,
    headroomSamples: configuredBudget - requiredSamples,
    flows: Object.fromEntries(
      inputs.map((input) => [
        input.id,
        {
          baselineSamples: input.baselineSamples,
          requiredSamples: input.requiredSamples,
        },
      ]),
    ),
  };
}

export function countEnvelopeFlowSamples(
  flow: EnvelopeMatrixFlow,
  profiles: unknown[],
  options: EnvelopeMatrixOptions = {},
): number {
  if (!flow.emitsEnvelope) return 0;
  let count = 0;
  for (const profile of profiles) {
    if (flow.enumerateScenarios) {
      const scenarios = flow.enumerateScenarios(profile) ?? [];
      count += scenarios.filter(
        (scenario) =>
          !options.scenarioFilter ||
          options.scenarioFilter.has(scenario.scenarioId),
      ).length;
    } else if (flow.buildPromptInput(profile) !== null) {
      count++;
    }
  }
  return count;
}

export function deriveEnvelopeBudgetFromMatrix(
  flows: EnvelopeMatrixFlow[],
  profiles: unknown[],
  baselineFlows: Record<string, { n: number }> = {},
  options: EnvelopeMatrixOptions = {},
): EnvelopeBudget {
  return deriveEnvelopeBudget(
    flows
      .filter((flow) => flow.emitsEnvelope)
      .map((flow) => ({
        id: flow.id,
        requiredSamples: countEnvelopeFlowSamples(flow, profiles, options),
        baselineSamples: baselineFlows[flow.id]?.n ?? 0,
      })),
  );
}
