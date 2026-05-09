import type { AccommodationMode, CelebrationLevel } from '@eduagent/schemas';

export function resolveCelebrationLevelForAccommodation(
  accommodationMode: AccommodationMode | undefined,
  celebrationLevel: CelebrationLevel,
): CelebrationLevel {
  if (
    accommodationMode === 'short-burst' ||
    accommodationMode === 'predictable'
  ) {
    return celebrationLevel;
  }

  return 'all';
}
