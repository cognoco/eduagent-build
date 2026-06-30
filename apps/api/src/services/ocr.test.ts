// ---------------------------------------------------------------------------
// OCR Provider — Tests
// ---------------------------------------------------------------------------

jest.mock('./llm' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./llm') as typeof import('./llm');
  return {
    ...actual,
    routeAndCall: jest.fn().mockResolvedValue({
      response: '{"text":"Solve for x: 2x + 5 = 13","confidence":0.81}',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 120,
    }),
  };
});

import {
  GeminiOcrProvider,
  StubOcrProvider,
  getOcrProvider,
  setOcrProvider,
  resetOcrProvider,
  type OcrProvider,
} from './ocr';
import { routeAndCall } from './llm';

describe('StubOcrProvider', () => {
  it('returns a valid OcrResult with text, confidence, and regions', async () => {
    const provider = new StubOcrProvider();
    const result = await provider.extractText(
      new ArrayBuffer(100),
      'image/jpeg',
    );

    expect(result.text).toBe('Stub OCR text for testing');
    expect(result.confidence).toBe(0.95);
    expect(result.regions).toHaveLength(1);
  });

  it('returns regions with bounding box data', async () => {
    const provider = new StubOcrProvider();
    const result = await provider.extractText(new ArrayBuffer(50), 'image/png');

    const region = result.regions[0]!;
    expect(region.text).toBe('Stub OCR text for testing');
    expect(region.confidence).toBe(0.95);
    expect(region.boundingBox).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });

  it('ignores the image buffer content (stub behavior)', async () => {
    const provider = new StubOcrProvider();
    const result1 = await provider.extractText(
      new ArrayBuffer(0),
      'image/jpeg',
    );
    const result2 = await provider.extractText(
      new ArrayBuffer(1000),
      'image/webp',
    );

    expect(result1).toEqual(result2);
  });
});

describe('OcrProvider constructors', () => {
  it('StubOcrProvider is directly instantiable', () => {
    const provider = new StubOcrProvider();
    expect(provider).toBeInstanceOf(StubOcrProvider);
  });

  it('GeminiOcrProvider is directly instantiable', () => {
    const provider = new GeminiOcrProvider();
    expect(provider).toBeInstanceOf(GeminiOcrProvider);
  });
});

describe('getOcrProvider / setOcrProvider', () => {
  afterEach(() => {
    resetOcrProvider();
  });

  it('throws when no provider configured and allowStub is not set', () => {
    expect(() => getOcrProvider()).toThrow('OCR provider not configured');
  });

  // [Gemini-retirement Phase A / T-A4] The not-configured error must not name
  // GEMINI_API_KEY — OCR no longer depends on the Gemini key.
  it('[T-A4] not-configured error is provider-neutral (no GEMINI_API_KEY)', () => {
    expect(() => getOcrProvider()).toThrow(
      'no approved LLM provider registered',
    );
    let message = '';
    try {
      getOcrProvider();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toMatch(/GEMINI_API_KEY/);
  });

  it('[T-A4] getOcrProvider forwards llmTier to the router-backed provider', async () => {
    const provider = getOcrProvider(true, false, 'standard');
    await provider.extractText(new ArrayBuffer(8), 'image/jpeg');

    expect(routeAndCall).toHaveBeenCalledWith(expect.any(Array), 1, {
      flow: 'ocr.extract',
      llmTier: 'standard',
    });
  });

  it('throws when no provider configured and allowStub is false', () => {
    expect(() => getOcrProvider(undefined, false)).toThrow(
      'OCR provider not configured',
    );
  });

  it('returns StubOcrProvider when allowStub is true', () => {
    const provider = getOcrProvider(undefined, true);
    expect(provider).toBeInstanceOf(StubOcrProvider);
  });

  it('returns the custom provider after setOcrProvider', () => {
    const custom: OcrProvider = {
      extractText: jest.fn().mockResolvedValue({
        text: 'custom',
        confidence: 1.0,
        regions: [],
      }),
    };
    setOcrProvider(custom);

    // When a provider is set via DI, getOcrProvider returns it regardless of args
    expect(getOcrProvider()).toBe(custom);
  });

  it('returns a Gemini provider when useRouter is truthy', () => {
    const provider = getOcrProvider(true);
    expect(provider).toBeInstanceOf(GeminiOcrProvider);
  });

  it('returns a Gemini provider when useRouter is a string (API key)', () => {
    const provider = getOcrProvider('some-gemini-key');
    expect(provider).toBeInstanceOf(GeminiOcrProvider);
  });

  it('resets to default after resetOcrProvider', () => {
    const custom: OcrProvider = {
      extractText: jest.fn().mockResolvedValue({
        text: 'custom',
        confidence: 1.0,
        regions: [],
      }),
    };
    setOcrProvider(custom);
    resetOcrProvider();

    // After reset, calling without allowStub throws
    expect(() => getOcrProvider()).toThrow('OCR provider not configured');
  });

  it('[BUG-489 / P2 BREAK] second call with different mode returns correct provider type (no singleton lock-in)', () => {
    // Break test: BEFORE the fix, getOcrProvider set _provider on the first
    // call and returned it on every subsequent call. If the first call used
    // allowStub:true (e.g. test-seed warmup), the second call without allowStub
    // silently returned StubOcrProvider instead of GeminiOcrProvider, meaning
    // production OCR was silently broken for the isolate lifetime.
    // With the fix, provider is built fresh per-call from the args — each call
    // gets exactly the type it asks for.
    const stub = getOcrProvider(undefined, true);
    expect(stub).toBeInstanceOf(StubOcrProvider);

    // Same isolate, different args — must return GeminiOcrProvider, NOT Stub.
    const gemini = getOcrProvider(true);
    expect(gemini).toBeInstanceOf(GeminiOcrProvider);
  });
});

describe('GeminiOcrProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes through routeAndCall with multimodal message', async () => {
    const provider = new GeminiOcrProvider();
    const result = await provider.extractText(new ArrayBuffer(8), 'image/jpeg');

    expect(result.text).toBe('Solve for x: 2x + 5 = 13');
    expect(result.confidence).toBe(0.81);
    expect(result.regions).toEqual([]);

    expect(routeAndCall).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('Ignore logos'),
            }),
            expect.objectContaining({
              type: 'inline_data',
              mimeType: 'image/jpeg',
            }),
          ]),
        }),
      ],
      1,
      { flow: 'ocr.extract' },
    );
  });

  it('handles plain-text response gracefully', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: 'Just some plain text without JSON',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 100,
    });

    const provider = new GeminiOcrProvider();
    const result = await provider.extractText(new ArrayBuffer(8), 'image/png');

    expect(result.text).toBe('Just some plain text without JSON');
    expect(result.confidence).toBe(0.75);
  });

  it('strips markdown code fences from JSON response', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: '```json\n{"text":"Solve: 3x = 9","confidence":0.85}\n```',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 110,
    });

    const provider = new GeminiOcrProvider();
    const result = await provider.extractText(new ArrayBuffer(8), 'image/jpeg');

    expect(result.text).toBe('Solve: 3x = 9');
    expect(result.confidence).toBe(0.85);
  });

  it('returns empty text when LLM returns fenced empty-text JSON', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: '```json\n{"text":"","confidence":0.0}\n```',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 90,
    });

    const provider = new GeminiOcrProvider();
    const result = await provider.extractText(new ArrayBuffer(8), 'image/jpeg');

    expect(result.text).toBe('');
    expect(result.confidence).toBe(0);
  });

  it('strips fences without a language tag', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: '```\n{"text":"No lang tag","confidence":0.7}\n```',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 100,
    });

    const provider = new GeminiOcrProvider();
    const result = await provider.extractText(new ArrayBuffer(8), 'image/png');

    expect(result.text).toBe('No lang tag');
    expect(result.confidence).toBe(0.7);
  });

  // [Gemini-retirement Phase A / T-A4] The vision OCR call must carry the
  // caller's llmTier so the V2 vision matrix can resolve free→Mistral Small /
  // paid→GPT-5 mini. Without it the call defaults to 'standard' and every OCR
  // request (including free) resolves to the paid vision model.
  it('[T-A4] threads llmTier into routeAndCall when constructed with a free tier', async () => {
    const provider = new GeminiOcrProvider('flash');
    await provider.extractText(new ArrayBuffer(8), 'image/jpeg');

    expect(routeAndCall).toHaveBeenCalledWith(expect.any(Array), 1, {
      flow: 'ocr.extract',
      llmTier: 'flash',
    });
  });

  it('[T-A4] threads llmTier into routeAndCall when constructed with a paid tier', async () => {
    const provider = new GeminiOcrProvider('standard');
    await provider.extractText(new ArrayBuffer(8), 'image/jpeg');

    expect(routeAndCall).toHaveBeenCalledWith(expect.any(Array), 1, {
      flow: 'ocr.extract',
      llmTier: 'standard',
    });
  });
});
