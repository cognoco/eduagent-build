export interface EnvelopeBudgetInput {
  id: string;
  requiredSamples: number;
  baselineSamples: number;
}

/** Execution/accounting context passed through to `providerCallCount` — see
 * the `ProviderCallContext` doc comment in `runner/types.ts` (this is the
 * same shape, redeclared here so `budget.ts` has no import dependency on
 * `types.ts`, matching the existing structural-typing convention this file
 * already uses for `EnvelopeMatrixFlow` vs. `FlowDefinition`). */
export interface EnvelopeProviderCallContext {
  openrouterModel?: string;
}

export interface EnvelopeMatrixFlow {
  id: string;
  emitsEnvelope?: boolean;
  buildPromptInput(profile: unknown): unknown;
  enumerateScenarios?(
    profile: unknown,
  ): Array<{ scenarioId: string; input: unknown }> | null;
  /** Total provider calls for one matrix item, including internal judges. */
  providerCallCount?(
    input: unknown,
    context: EnvelopeProviderCallContext,
  ): number;
}

export interface EnvelopeMatrixOptions {
  scenarioFilter?: Set<string>;
  /**
   * Threaded to every `providerCallCount` call in
   * `deriveEnvelopeProviderDemandFromMatrix` (ignored by
   * `countEnvelopeFlowSamples`, which is sample-count-only and never varies
   * with pinning). Defaults to `{}` (unpinned) when omitted.
   */
  providerCallContext?: EnvelopeProviderCallContext;
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
  const providerCallContext: EnvelopeProviderCallContext =
    options.providerCallContext ?? {};

  for (const flow of flows) {
    if (!flow.emitsEnvelope) continue;
    let outerRunLiveCalls = 0;
    let providerCalls = 0;
    for (const profile of profiles) {
      if (flow.enumerateScenarios) {
        const scenarios = flow.enumerateScenarios(profile) ?? [];
        for (const scenario of scenarios) {
          if (
            options.scenarioFilter &&
            !options.scenarioFilter.has(scenario.scenarioId)
          ) {
            continue;
          }
          outerRunLiveCalls++;
          providerCalls +=
            flow.providerCallCount?.(scenario.input, providerCallContext) ?? 1;
        }
      } else {
        // Non-enumerated flows have no real scenarioId to filter on — the
        // runner (runner.ts) and countEnvelopeFlowSamples never apply
        // scenarioFilter to them either, so this must not synthesize one
        // from flow.id and expose it to the filter (that would zero out the
        // flow's demand whenever an unrelated --scenarios filter doesn't
        // happen to include its id).
        const input = flow.buildPromptInput(profile);
        if (input === null) continue;
        outerRunLiveCalls++;
        providerCalls +=
          flow.providerCallCount?.(input, providerCallContext) ?? 1;
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
  providerDemand: Pick<EnvelopeProviderDemand, 'providerCalls'>,
): number | undefined {
  if (
    options.live &&
    options.onlyEnvelopeFlows &&
    options.maxLiveCalls === undefined
  ) {
    // `budget.configuredBudget` is a SAMPLE-count floor (attempted items,
    // +10% headroom) — it does not account for a flow costing more than one
    // provider call per item (internal judges, or review-continuity-opener's
    // pinned-mentor judge). `providerDemand.providerCalls` is the actual,
    // context-aware provider-call total. Auto-fitting to the sample floor
    // alone would under-budget any matrix where provider calls > samples,
    // causing exactly the silent mid-run truncation this WI exists to
    // prevent — so the effective auto-fit cap is never below either number.
    return Math.max(budget.configuredBudget, providerDemand.providerCalls);
  }
  return options.maxLiveCalls;
}
