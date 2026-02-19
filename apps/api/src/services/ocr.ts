// ---------------------------------------------------------------------------
// OCR Provider — Story 2.5 (ARCH-14)
// Swappable provider interface for server-side OCR.
// Pure business logic, no Hono imports.
// ---------------------------------------------------------------------------

import type { OcrResult } from '@eduagent/schemas';

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

// ---------------------------------------------------------------------------
// Factory + DI
// ---------------------------------------------------------------------------

let _provider: OcrProvider | null = null;

/** Returns the current OCR provider (defaults to StubOcrProvider). */
export function getOcrProvider(): OcrProvider {
  if (!_provider) {
    _provider = new StubOcrProvider();
  }
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
export function createOcrProvider(type?: string): OcrProvider {
  switch (type) {
    // Future: case 'google-vision': return new GoogleVisionOcrProvider();
    // Future: case 'workers-ai': return new WorkersAiOcrProvider();
    default:
      return new StubOcrProvider();
  }
}
