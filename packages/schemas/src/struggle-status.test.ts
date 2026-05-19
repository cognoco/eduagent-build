import {
  struggleStatusSchema,
  type StruggleStatus,
} from './struggle-status.js';

describe('struggleStatusSchema', () => {
  it('accepts the three canonical values', () => {
    for (const value of ['normal', 'needs_deepening', 'blocked'] as const) {
      const parsed: StruggleStatus = struggleStatusSchema.parse(value);
      expect(parsed).toBe(value);
    }
  });

  it('rejects unknown values', () => {
    expect(struggleStatusSchema.safeParse('struggling').success).toBe(false);
    expect(struggleStatusSchema.safeParse('').success).toBe(false);
    expect(struggleStatusSchema.safeParse(null).success).toBe(false);
  });
});
