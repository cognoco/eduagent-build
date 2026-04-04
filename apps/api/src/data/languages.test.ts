import {
  detectLanguageHint,
  getLanguageByCode,
  SUPPORTED_LANGUAGES,
} from './languages';

describe('language registry', () => {
  it('detects Spanish from exact name', () => {
    const result = detectLanguageHint('Spanish');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('es');
  });

  it('detects Spanish from alias Español', () => {
    const result = detectLanguageHint('Español');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('es');
  });

  it('detects from "Learn French" prefix', () => {
    const result = detectLanguageHint('Learn French');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('fr');
  });

  it('returns null for non-language subjects', () => {
    expect(detectLanguageHint('Physics')).toBeNull();
    expect(detectLanguageHint('Mathematics')).toBeNull();
  });

  it('is case-insensitive', () => {
    const result = detectLanguageHint('SPANISH');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('es');
  });

  it('lookups by code', () => {
    const lang = getLanguageByCode('fr');
    expect(lang).not.toBeNull();
    expect(lang!.names).toContain('french');
  });

  it('has all Category I and II languages', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(13);
    const codes = SUPPORTED_LANGUAGES.map((language) => language.code);
    expect(codes).toContain('es');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
    expect(codes).toContain('it');
    expect(codes).toContain('pt');
    expect(codes).toContain('nb');
  });
});
