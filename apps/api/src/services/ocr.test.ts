// ---------------------------------------------------------------------------
// OCR Provider — Tests
// ---------------------------------------------------------------------------

import {
  GeminiOcrProvider,
  StubOcrProvider,
  createOcrProvider,
  getOcrProvider,
  setOcrProvider,
  resetOcrProvider,
  type OcrProvider,
} from './ocr';

describe('StubOcrProvider', () => {
  it('returns a valid OcrResult with text, confidence, and regions', async () => {
    const provider = new StubOcrProvider();
    const result = await provider.extractText(
      new ArrayBuffer(100),
      'image/jpeg'
    );

    expect(result.text).toBe('Stub OCR text for testing');
    expect(result.confidence).toBe(0.95);
    expect(result.regions).toHaveLength(1);
  });

  it('returns regions with bounding box data', async () => {
    const provider = new StubOcrProvider();
    const result = await provider.extractText(new ArrayBuffer(50), 'image/png');

    const region = result.regions[0];
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
      'image/jpeg'
    );
    const result2 = await provider.extractText(
      new ArrayBuffer(1000),
      'image/webp'
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

  it('returns GeminiOcrProvider when requested with an API key', () => {
    const provider = createOcrProvider('gemini', 'test-key');
    expect(provider).toBeInstanceOf(GeminiOcrProvider);
  });
});

describe('getOcrProvider / setOcrProvider', () => {
  afterEach(() => {
    resetOcrProvider();
  });

  it('returns StubOcrProvider by default', () => {
    const provider = getOcrProvider();
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

    expect(getOcrProvider()).toBe(custom);
  });

  it('returns a Gemini provider when an API key is supplied', () => {
    const provider = getOcrProvider('test-key');
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

    const provider = getOcrProvider();
    expect(provider).toBeInstanceOf(StubOcrProvider);
    expect(provider).not.toBe(custom);
  });
});

describe('GeminiOcrProvider', () => {
  it('parses JSON OCR output from Gemini', async () => {
    const provider = new GeminiOcrProvider('test-key');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"text":"Solve for x: 2x + 5 = 13","confidence":0.81}',
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    try {
      const result = await provider.extractText(
        new ArrayBuffer(8),
        'image/jpeg'
      );

      expect(result.text).toBe('Solve for x: 2x + 5 = 13');
      expect(result.confidence).toBe(0.81);
      expect(result.regions).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
