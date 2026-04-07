// ---------------------------------------------------------------------------
// OCR Provider — Story 2.5 (ARCH-14)
// Swappable provider interface for server-side OCR.
// Pure business logic, no Hono imports.
// ---------------------------------------------------------------------------

import type { OcrResult } from '@eduagent/schemas';
import { routeAndCall, type ChatMessage } from './llm';

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

/** Strip markdown code fences that LLMs commonly wrap around JSON. */
function stripCodeFences(raw: string): string {
  const fenced = raw.trim().match(/^```(?:\w*)\s*\n?([\s\S]*?)\n?\s*```$/);
  return fenced ? fenced[1]!.trim() : raw.trim();
}

function parseOcrResponse(raw: string): OcrResult {
  const stripped = stripCodeFences(raw);
  try {
    const parsed = JSON.parse(stripped) as {
      text?: unknown;
      confidence?: unknown;
    };
    const text =
      typeof parsed.text === 'string' ? parsed.text.trim() : stripped;
    return {
      text,
      confidence: clampConfidence(parsed.confidence),
      regions: [],
    };
  } catch {
    return {
      text: stripped,
      confidence: 0.75,
      regions: [],
    };
  }
}

/**
 * OCR provider that routes through the LLM router (routeAndCall).
 * Uses multimodal messages so cost monitoring, circuit breaker, and
 * error attribution are applied consistently.
 */
export class GeminiOcrProvider implements OcrProvider {
  async extractText(image: ArrayBuffer, mimeType: string): Promise<OcrResult> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          {
            type: 'inline_data',
            mimeType,
            data: arrayBufferToBase64(image),
          },
        ],
      },
    ];

    const result = await routeAndCall(messages, 1);
    return parseOcrResponse(result.response);
  }
}

// ---------------------------------------------------------------------------
// Factory + DI
// ---------------------------------------------------------------------------

let _provider: OcrProvider | null = null;

/**
 * Returns the current OCR provider.
 *
 * When `useRouter` is truthy the Gemini provider is returned — it routes
 * through routeAndCall() so the API key comes from the registered LLM
 * provider, not from a parameter here.
 *
 * When `useRouter` is falsy and `allowStub` is true, returns StubOcrProvider
 * (for tests only). Otherwise throws — fails closed so production never
 * silently serves fake OCR results.
 */
export function getOcrProvider(
  useRouter?: boolean | string,
  allowStub?: boolean
): OcrProvider {
  if (_provider) {
    return _provider;
  }

  if (useRouter) {
    _provider = new GeminiOcrProvider();
    return _provider;
  }

  if (allowStub) {
    _provider = new StubOcrProvider();
    return _provider;
  }

  throw new Error(
    'OCR provider not configured: set GEMINI_API_KEY or use allowStub for testing'
  );
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
 * @internal Test-only — not called from production routes.
 * Production code uses `getOcrProvider()` which fails closed.
 */
export function createOcrProvider(type?: string): OcrProvider {
  switch (type) {
    case 'gemini':
      return new GeminiOcrProvider();
    default:
      return new StubOcrProvider();
  }
}
