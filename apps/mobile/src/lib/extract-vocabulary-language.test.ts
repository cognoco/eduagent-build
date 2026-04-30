import { extractLanguageFromTheme } from './extract-vocabulary-language';

describe('extractLanguageFromTheme', () => {
  it('detects Italian at the start of a theme', () => {
    expect(extractLanguageFromTheme('Italian Animals')).toBe('Italian');
  });

  it('detects Spanish across a multi-word theme', () => {
    expect(extractLanguageFromTheme('Spanish food and drink')).toBe('Spanish');
  });

  it('is case-insensitive for the language prefix', () => {
    expect(extractLanguageFromTheme('italian animals')).toBe('Italian');
    expect(extractLanguageFromTheme('SPANISH ANIMALS')).toBe('Spanish');
  });

  it('matches when the theme is exactly the language name', () => {
    expect(extractLanguageFromTheme('Italian')).toBe('Italian');
  });

  it('matches locale aliases like "Italiano" and "Español"', () => {
    expect(extractLanguageFromTheme('Italiano animali')).toBe('Italian');
    expect(extractLanguageFromTheme('Español comidas')).toBe('Spanish');
    expect(extractLanguageFromTheme('Français cuisine')).toBe('French');
  });

  it('returns null when the prefix is a different word starting with the same letters', () => {
    // "Italianate" is not "Italian " — must not false-match.
    expect(extractLanguageFromTheme('Italianate furniture')).toBeNull();
  });

  it('returns null for non-language themes', () => {
    expect(extractLanguageFromTheme('Geography of Africa')).toBeNull();
    expect(extractLanguageFromTheme('Famous scientists')).toBeNull();
  });

  it('returns null for empty / null / whitespace input', () => {
    expect(extractLanguageFromTheme(null)).toBeNull();
    expect(extractLanguageFromTheme(undefined)).toBeNull();
    expect(extractLanguageFromTheme('')).toBeNull();
    expect(extractLanguageFromTheme('   ')).toBeNull();
  });

  it('returns the canonical English display name even when input uses an alias', () => {
    // Output is always the canonical en display name — "Italian" — so the
    // UI never shows mixed casing or two different spellings of the same
    // language across history rows.
    expect(extractLanguageFromTheme('italiano verbi')).toBe('Italian');
  });
});
