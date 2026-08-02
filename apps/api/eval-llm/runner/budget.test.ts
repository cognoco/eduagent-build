import {
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
          input.category === 'legitimate_sensitive' ? 2 : 1,
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
});

describe('resolveEnvelopeLiveCallCap', () => {
  it('auto-fits an omitted cap for the live envelope-only path', () => {
    expect(
      resolveEnvelopeLiveCallCap(
        { live: true, onlyEnvelopeFlows: true },
        { configuredBudget: 362 },
      ),
    ).toBe(362);
  });

  it('preserves an explicit cap for the caller to validate', () => {
    expect(
      resolveEnvelopeLiveCallCap(
        { live: true, onlyEnvelopeFlows: true, maxLiveCalls: 400 },
        { configuredBudget: 362 },
      ),
    ).toBe(400);
  });
});
