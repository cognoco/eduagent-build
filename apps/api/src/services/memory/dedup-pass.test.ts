import { dedupPairKey } from './dedup-pass';

describe('dedupPairKey', () => {
  it('is independent of pair order', () => {
    expect(dedupPairKey('fractions', 'fraction arithmetic')).toBe(
      dedupPairKey('fraction arithmetic', 'fractions')
    );
  });
});
