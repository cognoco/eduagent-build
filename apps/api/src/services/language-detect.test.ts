// ---------------------------------------------------------------------------
// Language Detection — Tests [4A.3]
// ---------------------------------------------------------------------------

jest.mock('./llm', () => ({
  routeAndCall: jest.fn(),
}));

import { detectLanguageSubject } from './language-detect';
import { routeAndCall } from './llm';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

function llmResponse(json: Record<string, unknown>): void {
  mockRouteAndCall.mockResolvedValueOnce({
    response: JSON.stringify(json),
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    latencyMs: 50,
    stopReason: 'stop',
  });
}

beforeEach(() => jest.clearAllMocks());

describe('detectLanguageSubject', () => {
  it('returns null for non-language subjects', async () => {
    const result = await detectLanguageSubject('Mathematics');
    expect(result).toBeNull();
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('returns null for history topics that mention a language name', async () => {
    llmResponse({ isLanguageLearning: false, languageCode: null });

    const result = await detectLanguageSubject('French Revolution');
    // detectLanguageHint will match "french", so LLM is called
    expect(mockRouteAndCall).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('detects Spanish as a language-learning subject', async () => {
    llmResponse({ isLanguageLearning: true, languageCode: 'es' });

    const result = await detectLanguageSubject('Spanish');

    expect(result).not.toBeNull();
    expect(result!.code).toBe('es');
    expect(result!.pedagogyMode).toBe('four_strands');
    expect(result!.sttLocale).toBe('es-ES');
  });

  it('detects "learn French" as a language subject', async () => {
    llmResponse({ isLanguageLearning: true, languageCode: 'fr' });

    const result = await detectLanguageSubject('learn French');

    expect(result).not.toBeNull();
    expect(result!.code).toBe('fr');
    expect(result!.matchedName).toBe('french');
  });

  it('falls back to hint when LLM returns true but unknown language code', async () => {
    llmResponse({ isLanguageLearning: true, languageCode: 'zz' });

    const result = await detectLanguageSubject('Italian');

    expect(result).not.toBeNull();
    expect(result!.code).toBe('it');
  });

  it('falls back to hint when LLM returns no JSON', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: 'I am not sure what to do with this.',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
      stopReason: 'stop',
    });

    const result = await detectLanguageSubject('German');

    expect(result).not.toBeNull();
    expect(result!.code).toBe('de');
  });

  it('falls back to hint when LLM call throws', async () => {
    mockRouteAndCall.mockRejectedValueOnce(new Error('LLM unavailable'));

    const result = await detectLanguageSubject('Portuguese');

    expect(result).not.toBeNull();
    expect(result!.code).toBe('pt');
  });

  it('detects "I want to learn Spanish" with prefix stripping', async () => {
    llmResponse({ isLanguageLearning: true, languageCode: 'es' });

    const result = await detectLanguageSubject('I want to learn Spanish');

    expect(result).not.toBeNull();
    expect(result!.code).toBe('es');
  });

  it('returns null when input has no language hint at all', async () => {
    const result = await detectLanguageSubject('Quantum Physics');

    expect(result).toBeNull();
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('calls routeAndCall with rung 1', async () => {
    llmResponse({ isLanguageLearning: true, languageCode: 'es' });

    await detectLanguageSubject('Spanish');

    expect(mockRouteAndCall).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        // [PROMPT-INJECT-8] rawInput is now wrapped in <subject_text> with
        // entity-encoded content for prompt-injection defense.
        expect.objectContaining({
          role: 'user',
          content: '<subject_text>Spanish</subject_text>',
        }),
      ]),
      1,
    );
  });

  it('returns detection with correct ttsVoice field', async () => {
    llmResponse({ isLanguageLearning: true, languageCode: 'de' });

    const result = await detectLanguageSubject('German');

    expect(result).not.toBeNull();
    expect(result!.ttsVoice).toBe('de-DE');
  });

  it('handles "Spanish Civil War" where LLM says not language learning', async () => {
    llmResponse({ isLanguageLearning: false, languageCode: null });

    const result = await detectLanguageSubject('Spanish Civil War');

    expect(result).toBeNull();
  });
});
