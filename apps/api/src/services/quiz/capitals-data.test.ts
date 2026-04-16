import {
  CAPITALS_BY_COUNTRY,
  CAPITALS_DATA,
  CAPITALS_REGIONS,
} from './capitals-data';

describe('capitals reference data', () => {
  it('has at least 70 entries', () => {
    expect(CAPITALS_DATA.length).toBeGreaterThanOrEqual(70);
  });

  it('has unique country names case-insensitively', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];

    for (const entry of CAPITALS_DATA) {
      const key = entry.country.toLowerCase();
      if (seen.has(key)) dupes.push(entry.country);
      seen.add(key);
    }

    expect(dupes).toEqual([]);
  });

  it('gives every entry at least one accepted alias', () => {
    for (const entry of CAPITALS_DATA) {
      expect(entry.acceptedAliases.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives every entry a non-empty fun fact', () => {
    for (const entry of CAPITALS_DATA) {
      expect(entry.funFact.length).toBeGreaterThan(0);
    }
  });

  it('supports case-insensitive lookup', () => {
    expect(CAPITALS_BY_COUNTRY.get('france')?.capital).toBe('Paris');
    expect(CAPITALS_BY_COUNTRY.get('czech republic')?.capital).toBe('Prague');
  });

  it('covers multiple major world regions', () => {
    expect(CAPITALS_REGIONS).toContain('Central Europe');
    expect(CAPITALS_REGIONS).toContain('East Asia');
    expect(CAPITALS_REGIONS).toContain('North America');
    expect(CAPITALS_REGIONS).toContain('South America');
  });
});
