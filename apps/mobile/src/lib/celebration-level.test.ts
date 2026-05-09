import { resolveCelebrationLevelForAccommodation } from './celebration-level';

describe('resolveCelebrationLevelForAccommodation', () => {
  it('forces celebrations on for none, audio-first, and missing accommodation', () => {
    expect(resolveCelebrationLevelForAccommodation(undefined, 'off')).toBe(
      'all',
    );
    expect(resolveCelebrationLevelForAccommodation('none', 'off')).toBe('all');
    expect(resolveCelebrationLevelForAccommodation('audio-first', 'off')).toBe(
      'all',
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
