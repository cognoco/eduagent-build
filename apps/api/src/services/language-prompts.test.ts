// ---------------------------------------------------------------------------
// Language Prompts — Tests [4A.5]
// ---------------------------------------------------------------------------

import { buildFourStrandsPrompt } from './language-prompts';
import type { ExchangeContext } from './exchanges';

function makeContext(
  overrides: Partial<ExchangeContext> = {},
): ExchangeContext {
  return {
    sessionId: 'session-1',
    profileId: 'profile-1',
    subjectName: 'Spanish',
    sessionType: 'learning',
    escalationRung: 1,
    exchangeHistory: [],
    ...overrides,
    birthYear: overrides.birthYear ?? new Date().getFullYear() - 14,
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
      makeContext({ languageCode: undefined, subjectName: 'My Language' }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('My Language');
  });

  it('falls back to subjectName for unsupported language code', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'xx', subjectName: 'Klingon' }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('Klingon');
  });

  it('includes native language when provided', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'fr', nativeLanguage: 'English' }),
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
      }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('hola');
    expect(joined).toContain('buenos días');
    expect(joined).toContain('gracias');
  });

  it('handles empty known vocabulary as a hard zero-knowledge signal [BUG-937]', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'es', knownVocabulary: [] }),
    );
    const joined = result.join('\n');

    // BUG-937: empty vocab must read as "treat as complete beginner" so the
    // model cannot assume the learner already knows greetings.
    expect(joined).toContain('NONE');
    expect(joined).toContain('complete beginner');
    expect(joined).toMatch(/Do NOT assume they already know/i);
  });

  it('handles undefined known vocabulary as a hard zero-knowledge signal [BUG-937]', () => {
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'es', knownVocabulary: undefined }),
    );
    const joined = result.join('\n');

    expect(joined).toContain('NONE');
    expect(joined).toContain('complete beginner');
  });

  it('does not soften "NONE" for non-empty vocabulary [BUG-937]', () => {
    // Break test: with vocabulary present, the zero-knowledge wording must NOT
    // appear — otherwise the model gets a contradictory signal.
    const result = buildFourStrandsPrompt(
      makeContext({ languageCode: 'es', knownVocabulary: ['hola', 'gracias'] }),
    );
    const joined = result.join('\n');

    expect(joined).not.toContain('NONE');
    expect(joined).not.toContain('complete beginner');
    expect(joined).toContain('hola');
    expect(joined).toContain('gracias');
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
