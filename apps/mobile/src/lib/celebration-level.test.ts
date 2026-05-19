import { resolveCelebrationLevelForAccommodation } from './celebration-level';

describe('resolveCelebrationLevelForAccommodation', () => {
  it('honors stored celebration level for none, audio-first, and missing accommodation', () => {
    expect(resolveCelebrationLevelForAccommodation(undefined, 'off')).toBe(
      'off',
    );
    expect(resolveCelebrationLevelForAccommodation('none', 'off')).toBe('off');
    expect(resolveCelebrationLevelForAccommodation('audio-first', 'off')).toBe(
      'off',
    );
  });

  it('honors stored celebration level for short-burst and predictable modes', () => {
    expect(resolveCelebrationLevelForAccommodation('short-burst', 'off')).toBe(
      'off',
    );
    expect(
      resolveCelebrationLevelForAccommodation('predictable', 'big_only'),
    ).toBe('big_only');
  });
});
