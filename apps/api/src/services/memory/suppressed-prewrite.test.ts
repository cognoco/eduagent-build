import type { ScopedRepository } from '@eduagent/database';

import { isSuppressedFact } from './suppressed-prewrite';

function makeScoped(hit: boolean): ScopedRepository {
  return {
    memoryFacts: {
      findFirstActive: jest.fn().mockResolvedValue(hit ? { id: 's1' } : null),
    },
  } as unknown as ScopedRepository;
}

describe('isSuppressedFact', () => {
  it('looks up case- and whitespace-normalized text', async () => {
    for (const variant of ['Fractions', '  fractions  ', 'FRACTIONS']) {
      await expect(isSuppressedFact(makeScoped(true), variant)).resolves.toBe(
        true
      );
    }
  });

  it('returns false when no suppressed row exists', async () => {
    await expect(
      isSuppressedFact(makeScoped(false), 'fractions')
    ).resolves.toBe(false);
  });
});
