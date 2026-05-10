import { HANDLED_MARKER_KEYS } from './exchanges';
import { KNOWN_MARKER_KEYS } from './llm/envelope';

describe('HANDLED_MARKER_KEYS invariants', () => {
  it('every handled key is also a known marker key', () => {
    for (const key of HANDLED_MARKER_KEYS) {
      expect(KNOWN_MARKER_KEYS.has(key)).toBe(true);
    }
  });

  it('contains at least one key', () => {
    expect(HANDLED_MARKER_KEYS.size).toBeGreaterThan(0);
  });
});
