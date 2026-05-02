import { tokens, tokensToCssVars, accentPresets } from './design-tokens';

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Expected 6-digit hex color, received "${hex}"`);
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbaToRgb(rgba: string): [number, number, number] {
  const match = rgba.match(
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*0?\.\d+\s*\)$/
  );
  if (!match) {
    throw new Error(`Expected rgba color, received "${rgba}"`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function expectNavyTintedHex(hex: string) {
  const [red, green, blue] = hexToRgb(hex);
  expect(blue - Math.max(red, green)).toBeGreaterThanOrEqual(20);
}

describe('tokensToCssVars', () => {
  it('maps all color tokens to CSS variable keys', () => {
    const base = tokens.dark;
    const cssVars = tokensToCssVars(base);

    expect(cssVars['--color-primary']).toBe(base.colors.primary);
    expect(cssVars['--color-accent']).toBe(base.colors.accent);
    expect(cssVars['--color-secondary']).toBe(base.colors.secondary);
    expect(cssVars['--color-primary-soft']).toBe(base.colors.primarySoft);
    expect(cssVars['--color-coach-bubble']).toBe(base.colors.coachBubble);
    expect(cssVars['--color-background']).toBe(base.colors.background);
  });

  it('includes radii and spacing', () => {
    const base = tokens.light;
    const cssVars = tokensToCssVars(base);

    expect(cssVars['--radius-card']).toBe(base.radii.card);
    expect(cssVars['--radius-button']).toBe(base.radii.button);
    expect(cssVars['--spacing-card-padding']).toBe(base.spacing.cardPadding);
  });
});

describe('accent preset merging', () => {
  const schemes = ['light', 'dark'] as const;

  it('each preset overrides primary, primarySoft, secondary, accent, coachBubble', () => {
    expect(accentPresets.length).toBeGreaterThan(0);

    for (const preset of accentPresets) {
      for (const scheme of schemes) {
        const overrides = preset[scheme];
        expect(overrides).not.toBeNull();
        expect(typeof overrides.primary).toBe('string');
        expect(typeof overrides.primarySoft).toBe('string');
        expect(typeof overrides.secondary).toBe('string');
        expect(typeof overrides.accent).toBe('string');
        expect(typeof overrides.coachBubble).toBe('string');
      }
    }
  });

  it('merging a non-default accent changes CSS variable values', () => {
    const base = tokens.dark;
    const baseVars = tokensToCssVars(base);

    const nonDefaultPreset = accentPresets.find((p) => p.id === 'electric');
    expect(nonDefaultPreset).not.toBeUndefined();
    if (!nonDefaultPreset) return;

    const overrides = nonDefaultPreset.dark;
    const merged = {
      ...base,
      colors: { ...base.colors, ...overrides },
    };
    const mergedVars = tokensToCssVars(merged);

    // Accent-related vars should differ
    expect(mergedVars['--color-primary']).toBe(overrides.primary);
    expect(mergedVars['--color-primary']).not.toBe(baseVars['--color-primary']);

    expect(mergedVars['--color-accent']).toBe(overrides.accent);
    expect(mergedVars['--color-accent']).not.toBe(baseVars['--color-accent']);

    expect(mergedVars['--color-secondary']).toBe(overrides.secondary);

    // Non-accent vars should be unchanged
    expect(mergedVars['--color-background']).toBe(
      baseVars['--color-background']
    );
    expect(mergedVars['--color-success']).toBe(baseVars['--color-success']);
    expect(mergedVars['--color-danger']).toBe(baseVars['--color-danger']);
  });

  it('default preset (first in list) matches the base token colors', () => {
    const defaultPreset = accentPresets[0]!;
    for (const scheme of schemes) {
      const base = tokens[scheme];
      const overrides = defaultPreset[scheme];

      // The default preset colors should match the base tokens
      expect(overrides.primary).toBe(base.colors.primary);
      expect(overrides.accent).toBe(base.colors.accent);
      expect(overrides.secondary).toBe(base.colors.secondary);
    }
  });

  it('every preset keeps primarySoft in the same hue family as primary', () => {
    for (const preset of accentPresets) {
      for (const scheme of schemes) {
        expect(rgbaToRgb(preset[scheme].primarySoft)).toEqual(
          hexToRgb(preset[scheme].primary)
        );
      }
    }
  });
});

describe('dark palette contract', () => {
  it('dark theme uses navy-tinted background surfaces', () => {
    const dark = tokens.dark.colors;

    expect(dark.background).not.toBe('#18181b');
    expect(dark.surface).not.toBe('#1a1a1a');
    expect(dark.surfaceElevated).not.toBe('#262626');

    expectNavyTintedHex(dark.background);
    expectNavyTintedHex(dark.surface);
    expectNavyTintedHex(dark.surfaceElevated);
  });
});
