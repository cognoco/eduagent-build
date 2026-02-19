// ---------------------------------------------------------------------------
// OCR Provider — Tests
// ---------------------------------------------------------------------------

import {
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
