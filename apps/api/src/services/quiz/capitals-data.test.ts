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

  it('has no empty regions and at least 3 entries for major theme regions', () => {
    const byRegion = new Map<string, number>();
    for (const entry of CAPITALS_DATA) {
      byRegion.set(entry.region, (byRegion.get(entry.region) ?? 0) + 1);
    }

    // Every region must have at least 1 entry — prevents silent gaps.
    const emptyRegions: string[] = [];
    for (const [region, count] of byRegion) {
      if (count < 1) emptyRegions.push(region);
    }
    expect(emptyRegions).toEqual([]);

    // Core theme regions (used in LLM prompts) must have >= 3 for variety.
    const coreRegions = [
      'Central Europe',
      'Western Europe',
      'East Asia',
      'South America',
      'North America',
    ];
    for (const region of coreRegions) {
      expect(byRegion.get(region)).toBeGreaterThanOrEqual(3);
    }
  });
});
