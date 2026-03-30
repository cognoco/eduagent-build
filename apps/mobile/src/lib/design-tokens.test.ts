import { tokens, tokensToCssVars, accentPresets } from './design-tokens';
import type { Persona } from './theme';

describe('tokensToCssVars', () => {
  it('maps all color tokens to CSS variable keys', () => {
    const base = tokens.learner.dark;
    const cssVars = tokensToCssVars(base);

    expect(cssVars['--color-primary']).toBe(base.colors.primary);
    expect(cssVars['--color-accent']).toBe(base.colors.accent);
    expect(cssVars['--color-secondary']).toBe(base.colors.secondary);
    expect(cssVars['--color-primary-soft']).toBe(base.colors.primarySoft);
    expect(cssVars['--color-coach-bubble']).toBe(base.colors.coachBubble);
    expect(cssVars['--color-background']).toBe(base.colors.background);
  });

  it('includes radii and spacing', () => {
    const base = tokens.teen.light;
    const cssVars = tokensToCssVars(base);

    expect(cssVars['--radius-card']).toBe(base.radii.card);
    expect(cssVars['--radius-button']).toBe(base.radii.button);
    expect(cssVars['--spacing-card-padding']).toBe(base.spacing.cardPadding);
  });
});

describe('accent preset merging', () => {
  const personas: Persona[] = ['teen', 'learner', 'parent'];
  const schemes = ['light', 'dark'] as const;

  it.each(personas)(
    'each %s preset overrides primary, primarySoft, secondary, accent, coachBubble',
    (persona) => {
      const presets = accentPresets[persona];
      expect(presets.length).toBeGreaterThan(0);

      for (const preset of presets) {
        for (const scheme of schemes) {
          const overrides = preset[scheme];
          expect(overrides).toBeDefined();
          expect(typeof overrides.primary).toBe('string');
          expect(typeof overrides.primarySoft).toBe('string');
          expect(typeof overrides.secondary).toBe('string');
          expect(typeof overrides.accent).toBe('string');
          expect(typeof overrides.coachBubble).toBe('string');
        }
      }
    }
  );

  it('merging a non-default accent changes CSS variable values', () => {
    const base = tokens.learner.dark;
    const baseVars = tokensToCssVars(base);

    const tealPreset = accentPresets.learner.find((p) => p.id === 'teal');
    expect(tealPreset).toBeDefined();
    if (!tealPreset) return; // narrowing guard; toBeDefined above catches failure

    const overrides = tealPreset.dark;
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
    for (const persona of personas) {
      const defaultPreset = accentPresets[persona][0]!;
      for (const scheme of schemes) {
        const base = tokens[persona][scheme];
        const overrides = defaultPreset[scheme];

        // The default preset colors should match the base persona tokens
        expect(overrides.primary).toBe(base.colors.primary);
        expect(overrides.accent).toBe(base.colors.accent);
        expect(overrides.secondary).toBe(base.colors.secondary);
      }
    }
  });
});
