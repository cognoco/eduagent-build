// ---------------------------------------------------------------------------
// Language Detection — Tests [4A.3]
// ---------------------------------------------------------------------------

// EXTERNAL boundary mock — routeAndCall is the LLM provider HTTP call.
// requireActual spreads all real exports; only routeAndCall is replaced with
// a jest.fn() so the real module's other helpers remain intact.
const mockRouteAndCall = jest.fn();
jest.mock('./llm', () => {
  const actual = jest.requireActual('./llm') as typeof import('./llm');
  return {
    ...actual,
    routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
  };
});

const mockCaptureException = jest.fn();
const mockLoggerWarn = jest.fn();
jest.mock('./sentry', () => {
  const actual = jest.requireActual('./sentry') as typeof import('./sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});
jest.mock('./logger', () => {
  const actual = jest.requireActual('./logger') as typeof import('./logger');
  return {
    ...actual,
    createLogger: () => ({
      info: jest.fn(),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };
});

import { detectLanguageSubject } from './language-detect';

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

  // ---------------------------------------------------------------------------
  // [WI-1755] Launch-guard regression examples — ambiguous topics that mention
  // a supported language name (or nothing at all) must not route into
  // four_strands language mode.
  // ---------------------------------------------------------------------------

  it('[WI-1755] handles "Spanish politics" where LLM says not language learning', async () => {
    llmResponse({ isLanguageLearning: false, languageCode: null });

    const result = await detectLanguageSubject('Spanish politics');

    expect(mockRouteAndCall).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('[WI-1755] returns null for a Celsius/temperature question without calling the LLM', async () => {
    const result = await detectLanguageSubject('Celsius');

    expect(result).toBeNull();
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('[WI-1755] still detects genuine target-language practice ("practice French")', async () => {
    llmResponse({ isLanguageLearning: true, languageCode: 'fr' });

    const result = await detectLanguageSubject('practice French');

    expect(result).not.toBeNull();
    expect(result!.code).toBe('fr');
    expect(result!.pedagogyMode).toBe('four_strands');
  });

  // ---------------------------------------------------------------------------
  // [BUG-462] Break tests — LLM error is observable, fallback still returned
  // ---------------------------------------------------------------------------

  describe('[BUG-462] captureException + logger.warn on LLM failure', () => {
    it('calls captureException with language-detect.fallback context when LLM throws', async () => {
      mockRouteAndCall.mockRejectedValueOnce(new Error('quota exceeded'));

      const result = await detectLanguageSubject('Portuguese');

      // Fallback still returned — resilience preserved
      expect(result).not.toBeNull();
      expect(result!.code).toBe('pt');

      // Error is now visible — not swallowed
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            context: 'language-detect.fallback',
          }),
        }),
      );
      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('calls captureException when LLM throws a network error', async () => {
      const networkError = new Error('fetch failed: ECONNRESET');
      mockRouteAndCall.mockRejectedValueOnce(networkError);

      await detectLanguageSubject('German');

      expect(mockCaptureException).toHaveBeenCalledWith(
        networkError,
        expect.objectContaining({
          extra: expect.objectContaining({
            context: 'language-detect.fallback',
          }),
        }),
      );
    });
  });

  // Red-green proof [BUG-110]: revert to `.match(/\{[\s\S]*\}/)` and this
  // fails — the regex cannot pierce a markdown ```json fence and returns
  // null, so the detector silently falls back to the hint instead of
  // honoring the LLM's classification.
  it('[BUG-110] extracts JSON from markdown-fenced LLM response', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response:
        '```json\n{"isLanguageLearning": true, "languageCode": "fr"}\n```',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
      stopReason: 'stop',
    });

    const result = await detectLanguageSubject('French');

    expect(result).not.toBeNull();
    expect(result!.code).toBe('fr');
  });
});
