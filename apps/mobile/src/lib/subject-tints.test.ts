import {
  getSubjectTint,
  getSubjectTintMap,
  SUBJECT_TINT_PALETTE,
} from './subject-tints';

describe('getSubjectTint', () => {
  it('keeps the subject palette limited to five colors per scheme', () => {
    expect(SUBJECT_TINT_PALETTE.light).toHaveLength(5);
    expect(SUBJECT_TINT_PALETTE.dark).toHaveLength(5);
  });

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

  it('keeps a single subject on its stable hash tint', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(getSubjectTintMap([id], 'light').get(id)).toEqual(
      getSubjectTint(id, 'light'),
    );
  });

  it('nudges adjacent subjects away from the same palette color', () => {
    const idsByTint = new Map<string, string[]>();
    for (let index = 0; index < 50; index += 1) {
      const id = `subject-${index}`;
      const tint = getSubjectTint(id, 'light');
      idsByTint.set(tint.solid, [...(idsByTint.get(tint.solid) ?? []), id]);
    }
    const collision = [...idsByTint.values()].find((ids) => ids.length >= 2);
    expect(collision).toBeDefined();

    const first = collision![0]!;
    const second = collision![1]!;
    const tintMap = getSubjectTintMap([first, second], 'light');

    expect(tintMap.get(first)?.solid).not.toBe(tintMap.get(second)?.solid);
  });
});
