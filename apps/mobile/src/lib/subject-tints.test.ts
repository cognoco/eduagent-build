import { getSubjectTint, SUBJECT_TINT_PALETTE } from './subject-tints';

describe('getSubjectTint', () => {
  it('returns a tint object for a valid UUID', () => {
    const tint = getSubjectTint('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'dark');
    expect(tint).toHaveProperty('solid');
    expect(tint).toHaveProperty('soft');
    expect(SUBJECT_TINT_PALETTE.dark).toContainEqual(
      expect.objectContaining({ solid: tint.solid }),
    );
  });

  it('returns the same tint for the same ID across calls', () => {
    const id = 'deadbeef-dead-beef-dead-beefdeadbeef';
    expect(getSubjectTint(id, 'dark')).toEqual(getSubjectTint(id, 'dark'));
  });

  it('returns different colors for light vs dark scheme', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const lightTint = getSubjectTint(id, 'light');
    const darkTint = getSubjectTint(id, 'dark');
    expect(lightTint.solid).not.toEqual(darkTint.solid);
  });

  it('distributes 20 random UUIDs across at least 4 of 5 palette entries', () => {
    const ids = Array.from({ length: 20 }, () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
    );
    const tints = ids.map((id) => getSubjectTint(id, 'dark'));
    const uniqueSolids = new Set(tints.map((t) => t.solid));
    expect(uniqueSolids.size).toBeGreaterThanOrEqual(4);
  });
});
