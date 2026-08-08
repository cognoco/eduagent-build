import { isScenarioOnlyProfile } from '../fixtures/profiles';
import {
  countEnvelopeFlowSamples,
  deriveEnvelopeBudget,
  deriveEnvelopeProviderDemandFromMatrix,
  resolveEnvelopeLiveCallCap,
  type EnvelopeBudgetInput,
  type EnvelopeMatrixFlow,
} from './budget';

describe('deriveEnvelopeBudget', () => {
  const flows: EnvelopeBudgetInput[] = [
    { id: 'flow-a', requiredSamples: 3, baselineSamples: 3 },
    { id: 'flow-b', requiredSamples: 2, baselineSamples: 1 },
  ];

  it('reports reproducible demand, baseline sum, and documented headroom', () => {
    expect(deriveEnvelopeBudget(flows)).toEqual({
      baselineSamples: 4,
      requiredSamples: 5,
      headroomRate: 0.1,
      configuredBudget: 6,
      headroomSamples: 1,
      flows: {
        'flow-a': { baselineSamples: 3, requiredSamples: 3 },
        'flow-b': { baselineSamples: 1, requiredSamples: 2 },
      },
    });
  });
});

describe('deriveEnvelopeProviderDemandFromMatrix', () => {
  it('includes flow-declared internal provider calls in sequential demand', () => {
    const flows: EnvelopeMatrixFlow[] = [
      {
        id: 'safety-probes',
        emitsEnvelope: true,
        buildPromptInput: () => null,
        enumerateScenarios: () => [
          { scenarioId: 'ordinary', input: { category: 'jailbreak' } },
          {
            scenarioId: 'sensitive',
            input: { category: 'legitimate_sensitive' },
          },
        ],
        providerCallCount: (input) =>
          (input as { category?: string }).category === 'legitimate_sensitive'
            ? 2
            : 1,
      },
    ];

    expect(deriveEnvelopeProviderDemandFromMatrix(flows, [{}])).toEqual({
      outerRunLiveCalls: 2,
      internalProviderCalls: 1,
      providerCalls: 3,
      flows: {
        'safety-probes': {
          outerRunLiveCalls: 2,
          internalProviderCalls: 1,
          providerCalls: 3,
        },
      },
    });
  });

  it('evaluates a non-enumerated prompt input once per profile', () => {
    let buildCount = 0;
    const flows: EnvelopeMatrixFlow[] = [
      {
        id: 'single-input',
        emitsEnvelope: true,
        buildPromptInput: () => {
          buildCount++;
          return { scenarioId: `item-${buildCount}` };
        },
      },
    ];

    expect(deriveEnvelopeProviderDemandFromMatrix(flows, [{}])).toMatchObject({
      outerRunLiveCalls: 1,
      providerCalls: 1,
    });
    expect(buildCount).toBe(1);
  });

  it('[provider-accounting] threads providerCallContext through to providerCallCount so pinned-mentor demand differs from unpinned', () => {
    const flows: EnvelopeMatrixFlow[] = [
      {
        id: 'review-continuity-opener',
        emitsEnvelope: true,
        buildPromptInput: () => null,
        enumerateScenarios: () =>
          Array.from({ length: 10 }, (_, i) => ({
            scenarioId: `item-${i}`,
            input: {},
          })),
        providerCallCount: (_input, context) =>
          context.openrouterModel ? 2 : 1,
      },
    ];

    expect(deriveEnvelopeProviderDemandFromMatrix(flows, [{}])).toMatchObject({
      outerRunLiveCalls: 10,
      providerCalls: 10,
    });

    expect(
      deriveEnvelopeProviderDemandFromMatrix(flows, [{}], {
        providerCallContext: { openrouterModel: 'openai/gpt-oss-120b' },
      }),
    ).toMatchObject({
      outerRunLiveCalls: 10,
      providerCalls: 20,
    });
  });

  it("[CodeRabbit] a scenarioFilter that excludes a non-enumerated flow's own id still counts that flow, matching countEnvelopeFlowSamples and the runner", () => {
    // Non-enumerated flows have no real scenarioId — the runner (runner.ts)
    // and countEnvelopeFlowSamples never scenario-filter them. The synthetic
    // `scenarioId: flow.id` used internally here must not be exposed to
    // options.scenarioFilter, or an unrelated --scenarios filter would zero
    // out this flow's provider demand even though the runner would still
    // execute it in full.
    const flows: EnvelopeMatrixFlow[] = [
      {
        id: 'single-input',
        emitsEnvelope: true,
        buildPromptInput: () => ({ some: 'input' }),
      },
    ];

    expect(
      deriveEnvelopeProviderDemandFromMatrix(flows, [{}], {
        scenarioFilter: new Set(['some-other-scenario']),
      }),
    ).toEqual({
      outerRunLiveCalls: 1,
      internalProviderCalls: 0,
      providerCalls: 1,
      flows: {
        'single-input': {
          outerRunLiveCalls: 1,
          internalProviderCalls: 0,
          providerCalls: 1,
        },
      },
    });
  });
});

describe('resolveEnvelopeLiveCallCap', () => {
  it('auto-fits an omitted cap for the live envelope-only path when provider demand is below the sample floor', () => {
    expect(
      resolveEnvelopeLiveCallCap(
        { live: true, onlyEnvelopeFlows: true },
        { configuredBudget: 362 },
        { providerCalls: 300 },
      ),
    ).toBe(362);
  });

  it('preserves an explicit cap for the caller to validate', () => {
    expect(
      resolveEnvelopeLiveCallCap(
        { live: true, onlyEnvelopeFlows: true, maxLiveCalls: 400 },
        { configuredBudget: 362 },
        { providerCalls: 366 },
      ),
    ).toBe(400);
  });

  it('[provider-accounting] never auto-fits below actual provider-call demand, even when it exceeds the sample-count floor', () => {
    // The sample floor (362) is a count of ATTEMPTED ITEMS; providerCalls
    // (366+) counts actual PROVIDER CALLS, which can exceed the sample count
    // whenever a flow costs more than 1 call/item (internal judges). Auto-
    // fitting to the smaller sample floor would under-budget the run.
    expect(
      resolveEnvelopeLiveCallCap(
        { live: true, onlyEnvelopeFlows: true },
        { configuredBudget: 362 },
        { providerCalls: 366 },
      ),
    ).toBe(366);
  });

  it('[provider-accounting] reflects a pinned-mentor run costing more provider calls than an unpinned one', () => {
    // Same sample floor, but the caller pre-computed providerCalls with a
    // pinned-mentor context (376 instead of 366) — the cap must track that,
    // not silently fall back to the smaller unpinned number.
    expect(
      resolveEnvelopeLiveCallCap(
        { live: true, onlyEnvelopeFlows: true },
        { configuredBudget: 362 },
        { providerCalls: 376 },
      ),
    ).toBe(376);
  });
});

// ---------------------------------------------------------------------------
// [WI-2462] scenario-only profiles stay out of the global cross-product.
//
// The runner fans every flow across every profile, so adding a profile for one
// pinned scenario used to add a sample to every default-prompt flow as well —
// moving other flows' counts, which AC-3 forbids. `scenarioOnly` opts a profile
// out. budget.ts re-reads the flag STRUCTURALLY (it carries no imports by
// convention), so the drift test below is what stops that second copy from
// disagreeing with the canonical predicate.
// ---------------------------------------------------------------------------

describe('scenarioOnly profiles (WI-2462)', () => {
  const defaultPromptFlow: EnvelopeMatrixFlow = {
    id: 'default-prompt-flow',
    emitsEnvelope: true,
    buildPromptInput: () => ({}),
  };

  const pinningFlow: EnvelopeMatrixFlow = {
    id: 'pinning-flow',
    emitsEnvelope: true,
    pinsProfilesById: true,
    buildPromptInput: () => null,
    enumerateScenarios: (profile: unknown) =>
      (profile as { id?: string }).id === 'pinned'
        ? [{ scenarioId: 'S1', input: {} }]
        : null,
  };

  const ordinary = { id: 'ordinary' };
  const pinned = { id: 'pinned', scenarioOnly: true };

  it('does not count a scenario-only profile in a default-prompt flow', () => {
    // The whole point: adding `pinned` must not move this flow's count.
    expect(countEnvelopeFlowSamples(defaultPromptFlow, [ordinary])).toBe(1);
    expect(
      countEnvelopeFlowSamples(defaultPromptFlow, [ordinary, pinned]),
    ).toBe(1);
  });

  it('still counts a scenario-only profile in a flow that pins it', () => {
    // Opting out of the cross-product must not opt it out of its own scenario,
    // or the coverage it was added for silently disappears.
    expect(countEnvelopeFlowSamples(pinningFlow, [ordinary, pinned])).toBe(1);
  });

  it('leaves ordinary profiles in the cross-product (guard is narrowing only)', () => {
    expect(
      countEnvelopeFlowSamples(defaultPromptFlow, [ordinary, { id: 'other' }]),
    ).toBe(2);
  });

  it("budget.ts's structural read agrees with the canonical predicate", () => {
    // Drift guard. budget.ts cannot import isScenarioOnlyProfile, so this
    // asserts the two decide identically across the shapes that reach them —
    // a disagreement would make the preflight estimate and the real run
    // disagree, and the live gate would truncate or under-report coverage.
    const cases: unknown[] = [
      ordinary,
      pinned,
      { id: 'explicit-false', scenarioOnly: false },
      { id: 'truthy-not-true', scenarioOnly: 1 },
      null,
      undefined,
      {},
    ];
    for (const candidate of cases) {
      const canonical = isScenarioOnlyProfile(candidate);
      const structural =
        (candidate as { scenarioOnly?: unknown } | null | undefined)
          ?.scenarioOnly === true;
      expect({ candidate, decision: structural }).toEqual({
        candidate,
        decision: canonical,
      });
    }
  });
});
