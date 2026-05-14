// ---------------------------------------------------------------------------
// OCR Provider — Tests
// ---------------------------------------------------------------------------

jest.mock('./llm', () => { // gc1-allow: LLM external boundary (routeAndCall); requireActual spread applied
  const actual = jest.requireActual('./llm') as Record<string, unknown>;
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
  createOcrProvider,
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

describe('createOcrProvider', () => {
  it('returns StubOcrProvider by default', () => {
    const provider = createOcrProvider();
    expect(provider).toBeInstanceOf(StubOcrProvider);
  });

  it('returns StubOcrProvider for unknown type', () => {
    const provider = createOcrProvider('unknown');
    expect(provider).toBeInstanceOf(StubOcrProvider);
  });

  it('returns GeminiOcrProvider when requested', () => {
    const provider = createOcrProvider('gemini');
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
});
