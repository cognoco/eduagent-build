import { MODE_SCOPED_KEYS, isProfileScopedModeKey } from './mode-scoped-keys';

describe('MODE_SCOPED_KEYS', () => {
  it('is non-empty and every key is also profile-scoped', () => {
    expect(MODE_SCOPED_KEYS.length).toBeGreaterThan(0);
    for (const key of MODE_SCOPED_KEYS) {
      expect(isProfileScopedModeKey(key)).toBe(true);
    }
  });
});
