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
  /** Total provider calls for one matrix item, including internal judges. */
  providerCallCount?(input: unknown): number;
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

export interface EnvelopeProviderDemand {
  outerRunLiveCalls: number;
  internalProviderCalls: number;
  providerCalls: number;
  flows: Record<
    string,
    {
      outerRunLiveCalls: number;
      internalProviderCalls: number;
      providerCalls: number;
    }
  >;
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

export function deriveEnvelopeProviderDemandFromMatrix(
  flows: EnvelopeMatrixFlow[],
  profiles: unknown[],
  options: EnvelopeMatrixOptions = {},
): EnvelopeProviderDemand {
  const byFlow: EnvelopeProviderDemand['flows'] = {};

  for (const flow of flows) {
    if (!flow.emitsEnvelope) continue;
    let outerRunLiveCalls = 0;
    let providerCalls = 0;
    for (const profile of profiles) {
      const scenarios = flow.enumerateScenarios
        ? (flow.enumerateScenarios(profile) ?? [])
        : (() => {
            const input = flow.buildPromptInput(profile);
            return input === null ? [] : [{ scenarioId: flow.id, input }];
          })();
      for (const scenario of scenarios) {
        if (
          options.scenarioFilter &&
          !options.scenarioFilter.has(scenario.scenarioId)
        ) {
          continue;
        }
        outerRunLiveCalls++;
        providerCalls += flow.providerCallCount?.(scenario.input) ?? 1;
      }
    }
    byFlow[flow.id] = {
      outerRunLiveCalls,
      internalProviderCalls: providerCalls - outerRunLiveCalls,
      providerCalls,
    };
  }

  const outerRunLiveCalls = Object.values(byFlow).reduce(
    (sum, flow) => sum + flow.outerRunLiveCalls,
    0,
  );
  const internalProviderCalls = Object.values(byFlow).reduce(
    (sum, flow) => sum + flow.internalProviderCalls,
    0,
  );
  return {
    outerRunLiveCalls,
    internalProviderCalls,
    providerCalls: outerRunLiveCalls + internalProviderCalls,
    flows: byFlow,
  };
}

export function resolveEnvelopeLiveCallCap(
  options: {
    live?: boolean;
    onlyEnvelopeFlows?: boolean;
    maxLiveCalls?: number;
  },
  budget: Pick<EnvelopeBudget, 'configuredBudget'>,
): number | undefined {
  if (
    options.live &&
    options.onlyEnvelopeFlows &&
    options.maxLiveCalls === undefined
  ) {
    return budget.configuredBudget;
  }
  return options.maxLiveCalls;
}
