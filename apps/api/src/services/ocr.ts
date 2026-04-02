// ---------------------------------------------------------------------------
// OCR Provider — Story 2.5 (ARCH-14)
// Swappable provider interface for server-side OCR.
// Pure business logic, no Hono imports.
// ---------------------------------------------------------------------------

import type { OcrResult } from '@eduagent/schemas';

const OCR_PROMPT = `Extract all readable text from this image.
Return ONLY JSON with this shape:
{"text":"full extracted text","confidence":0.0}

Rules:
- Preserve line breaks when they matter
- Do not add explanations
- confidence must be between 0 and 1`;

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/** Swappable OCR provider for server-side text extraction. */
export interface OcrProvider {
  extractText(image: ArrayBuffer, mimeType: string): Promise<OcrResult>;
}

// ---------------------------------------------------------------------------
// Stub provider (development / testing)
// ---------------------------------------------------------------------------

/**
 * Stub OCR provider that returns a fixed result.
 * Used in development and testing — replace with a real provider
 * (Google Vision, Workers AI, Tesseract, etc.) when integrating.
 */
export class StubOcrProvider implements OcrProvider {
  async extractText(
    _image: ArrayBuffer,
    _mimeType: string
  ): Promise<OcrResult> {
    return {
      text: 'Stub OCR text for testing',
      confidence: 0.95,
      regions: [
        {
          text: 'Stub OCR text for testing',
          confidence: 0.95,
          boundingBox: { x: 0, y: 0, width: 100, height: 50 },
        },
      ],
    };
  }
}

interface GeminiOcrResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

function arrayBufferToBase64(image: ArrayBuffer): string {
  const bytes = new Uint8Array(image);

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.75;
  }
  return Math.max(0, Math.min(1, value));
}

function parseGeminiOcrText(raw: string): OcrResult {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as {
      text?: unknown;
      confidence?: unknown;
    };
    const text =
      typeof parsed.text === 'string' ? parsed.text.trim() : trimmed;
    return {
      text,
      confidence: clampConfidence(parsed.confidence),
      regions: [],
    };
  } catch {
    return {
      text: trimmed,
      confidence: 0.75,
      regions: [],
    };
  }
}

export class GeminiOcrProvider implements OcrProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = 'gemini-2.5-flash'
  ) {}

  async extractText(image: ArrayBuffer, mimeType: string): Promise<OcrResult> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: OCR_PROMPT },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: arrayBufferToBase64(image),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini OCR failed (${response.status})`);
    }

    const data = (await response.json()) as GeminiOcrResponse;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawText) {
      throw new Error('Gemini OCR returned no text');
    }

    return parseGeminiOcrText(rawText);
  }
}

// ---------------------------------------------------------------------------
// Factory + DI
// ---------------------------------------------------------------------------

let _provider: OcrProvider | null = null;

/** Returns the current OCR provider (defaults to StubOcrProvider). */
export function getOcrProvider(apiKey?: string): OcrProvider {
  if (_provider) {
    return _provider;
  }

  if (apiKey) {
    _provider = new GeminiOcrProvider(apiKey);
    return _provider;
  }

  _provider = new StubOcrProvider();
  return _provider;
}

/** Sets the OCR provider (for DI / testing). */
export function setOcrProvider(provider: OcrProvider): void {
  _provider = provider;
}

/** Resets to default provider (for test cleanup). */
export function resetOcrProvider(): void {
  _provider = null;
}

/**
 * Factory for creating OCR providers by type name.
 * Extensible for future real providers.
 */
export function createOcrProvider(type?: string, apiKey?: string): OcrProvider {
  switch (type) {
    case 'gemini':
      if (!apiKey) {
        throw new Error('Gemini OCR provider requires an API key');
      }
      return new GeminiOcrProvider(apiKey);
    default:
      return new StubOcrProvider();
  }
}
