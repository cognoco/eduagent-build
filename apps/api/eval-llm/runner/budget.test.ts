import { deriveEnvelopeBudget, type EnvelopeBudgetInput } from './budget';

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
