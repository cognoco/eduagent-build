// ---------------------------------------------------------------------------
// Language Prompts — Tests [4A.5]
// ---------------------------------------------------------------------------

import { buildFourStrandsPrompt } from './language-prompts';
import type { ExchangeContext } from './exchanges';

function makeContext(
  overrides: Partial<ExchangeContext> = {}
): ExchangeContext {
  return {
    sessionId: 'session-1',
    profileId: 'profile-1',
    subjectName: 'Spanish',
    sessionType: 'learning',
    escalationRung: 1,
    exchangeHistory: [],
    ...overrides,
  };
}

describe('buildFourStrandsPrompt', () => {
  it('returns an array of prompt paragraphs', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'es' }));

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(4);
    for (const paragraph of result) {
      expect(typeof paragraph).toBe('string');
      expect(paragraph.length).toBeGreaterThan(0);
    }
  });

  it('includes the target language name when languageCode is provided', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'es' }));
    const joined = result.join('\n').toLowerCase();

    expect(joined).toContain('spanish');
  });

  it('falls back to subjectName when languageCode is null', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: undefined, subjectName: 'My Language' })
    );
    const joined = result.join('\n');

    expect(joined).toContain('My Language');
  });

  it('falls back to subjectName for unsupported language code', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'xx', subjectName: 'Klingon' })
    );
    const joined = result.join('\n');

    expect(joined).toContain('Klingon');
  });

  it('includes native language when provided', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'fr', nativeLanguage: 'English' })
    );
    const joined = result.join('\n');

    expect(joined).toContain('<native_language>English</native_language>');
  });

  it('mentions four strands pedagogy', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'es' }));
    const joined = result.join('\n');

    expect(joined).toContain('Four Strands');
  });

  it('includes known vocabulary when provided', () => {
    const result = buildFourStrandsPrompt(
      makeContext({
        languageCode: 'es',
        knownVocabulary: ['hola', 'buenos días', 'gracias'],
      })
    );
    const joined = result.join('\n');

    expect(joined).toContain('hola');
    expect(joined).toContain('buenos días');
    expect(joined).toContain('gracias');
  });

  it('handles empty known vocabulary gracefully', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'es', knownVocabulary: [] })
    );
    const joined = result.join('\n');

    // Should mention vocabulary is not available
    expect(joined).toContain('not available');
  });

  it('handles undefined known vocabulary', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'es', knownVocabulary: undefined })
    );
    const joined = result.join('\n');

    expect(joined).toContain('not available');
  });

  it('includes STT/TTS locale info for supported languages', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'es' }));
    const joined = result.join('\n');

    expect(joined).toContain('es-ES');
  });

  it('mentions direct correction approach', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'de' }));
    const joined = result.join('\n');

    expect(joined).toContain('Correct errors');
    expect(joined).toContain('Socratic');
  });

  it('mentions fluency drills', () => {
    const result = buildFourStrandsPrompt(makeContext({ languageCode: 'fr' }));
    const joined = result.join('\n');

    expect(joined).toContain('fluency');
  });
});
