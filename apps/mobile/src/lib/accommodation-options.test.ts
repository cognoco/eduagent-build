import {
  ACCOMMODATION_GUIDE,
  ACCOMMODATION_OPTIONS,
  type AccommodationGuideRow,
  type AccommodationOption,
} from './accommodation-options';
import type { AccommodationMode } from '@eduagent/schemas';

describe('ACCOMMODATION_GUIDE', () => {
  it('has exactly 4 rows', () => {
    expect(ACCOMMODATION_GUIDE).toHaveLength(4);
  });

  it('each row has a recommendation that is a valid ACCOMMODATION_OPTIONS mode', () => {
    const validModes = new Set<AccommodationMode>(
      ACCOMMODATION_OPTIONS.map((o: AccommodationOption) => o.mode),
    );
    for (const row of ACCOMMODATION_GUIDE) {
      expect(validModes.has(row.recommendation)).toBe(true);
    }
  });

  it('covers all four accommodation modes', () => {
    const recommendedModes = new Set(
      ACCOMMODATION_GUIDE.map(
        (row: AccommodationGuideRow) => row.recommendation,
      ),
    );
    expect(recommendedModes.has('none')).toBe(true);
    expect(recommendedModes.has('short-burst')).toBe(true);
    expect(recommendedModes.has('audio-first')).toBe(true);
    expect(recommendedModes.has('predictable')).toBe(true);
  });

  it('each row has a non-empty condition string', () => {
    for (const row of ACCOMMODATION_GUIDE) {
      expect(typeof row.condition).toBe('string');
      expect(row.condition.trim().length).toBeGreaterThan(0);
    }
  });
});
