// ---------------------------------------------------------------------------
// OCR Provider — Story 2.5 (MMT-ADR-0006, formerly ARCH-14)
// Swappable provider interface for server-side OCR.
// Pure business logic, no Hono imports.
// ---------------------------------------------------------------------------

import type { OcrResult } from '@eduagent/schemas';
import { routeAndCall, type ChatMessage } from './llm';
import type { LLMTier } from './subscription';

const OCR_PROMPT = `Extract the readable homework text from this image.
Return ONLY JSON with this shape:
{"text":"full extracted text","confidence":0.0}

Rules:
- Focus on handwritten or printed homework/problem text
- Ignore logos, brand names, headers, watermarks, and page decorations
- Preserve line breaks and numbering when they matter
- If the homework text is too unclear to read reliably, return {"text":"","confidence":0}
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
    _mimeType: string,
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
  return fenced ? (fenced[1] ?? '').trim() : raw.trim();
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
  // [Gemini-retirement Phase A / T-A4] The caller's subscription llmTier is
  // threaded so the V2 vision matrix resolves free→Mistral Small / paid→GPT-5
  // mini. Undefined keeps the router's 'standard' default (legacy behavior).
  constructor(private readonly llmTier?: LLMTier) {}

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

    // conversationLanguage not threaded: output is extracted source-image text; UI locale irrelevant
    const result = await routeAndCall(messages, 1, {
      flow: 'ocr.extract',
      ...(this.llmTier ? { llmTier: this.llmTier } : {}),
    });
    return parseOcrResponse(result.response);
  }
}

// ---------------------------------------------------------------------------
// Factory + DI
// ---------------------------------------------------------------------------

// [BUG-489 / P2] The module-global singleton was removed. Previously,
// `_provider` was set on the first call and reused for the entire CF Worker
// isolate lifetime. If a test-seed warmup request set `allowStub:true` first,
// all subsequent production requests in that isolate silently used StubOcrProvider.
// The fix: build the provider per-call from the explicit args — construction is
// cheap (no network calls), and the lifetime mismatch with isolate reuse is gone.
// DI override via `setOcrProvider` is retained for integration tests that need
// a deterministic provider pinned across multiple calls.

let _overrideProvider: OcrProvider | null = null;

/**
 * Returns the current OCR provider.
 *
 * When `useRouter` is truthy the router-backed provider is returned — it routes
 * through routeAndCall() so the model/provider comes from the registered LLM
 * provider registry (no API key passed here). [Gemini-retirement Phase A / T-A4]
 * the router-vs-stub decision no longer keys on GEMINI_API_KEY; callers pass a
 * plain `true` and the optional `llmTier` so vision routing can pick the
 * tier-correct approved provider.
 *
 * When `useRouter` is falsy and `allowStub` is true, returns StubOcrProvider
 * (for tests only). Otherwise throws — fails closed so production never
 * silently serves fake OCR results.
 *
 * Provider is built fresh per-call (no module-global cache) so the provider
 * mode cannot be locked in by an earlier request in the same isolate.
 * Exception: a DI override set via `setOcrProvider` takes precedence and IS
 * cached — it is only used in tests to pin a specific provider instance.
 */
export function getOcrProvider(
  useRouter?: boolean | string,
  allowStub?: boolean,
  llmTier?: LLMTier,
): OcrProvider {
  // DI override takes precedence — only used in tests.
  if (_overrideProvider) {
    return _overrideProvider;
  }

  if (useRouter) {
    return new GeminiOcrProvider(llmTier);
  }

  if (allowStub) {
    return new StubOcrProvider();
  }

  throw new Error(
    'OCR provider not configured: no approved LLM provider registered; use allowStub for testing',
  );
}

/** Sets the OCR provider (for DI / testing). */
export function setOcrProvider(provider: OcrProvider): void {
  _overrideProvider = provider;
}

/** Resets to default provider (for test cleanup). */
export function resetOcrProvider(): void {
  _overrideProvider = null;
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
