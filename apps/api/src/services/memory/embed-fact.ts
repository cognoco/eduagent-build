import type { EmbeddingResult } from '../embeddings';
import { generateEmbedding } from '../embeddings';

export type EmbeddingFn = (text: string) => Promise<EmbeddingResult>;

// ---------------------------------------------------------------------------
// Discriminated failure class: classify errors at the Voyage boundary so
// callers can distinguish poison-pill (invalid_input) from transient failures
// without string-matching on formatted messages.
//
// `reason` is kept for backward compatibility: it mirrors `class` so any
// caller that only checks `result.ok === false` and reads `result.reason`
// as a string continues to work without changes.
// ---------------------------------------------------------------------------

export type EmbedFailureClass =
  | 'invalid_input' // 4xx (except 429): poison pill, skip/log, do not retry
  | 'rate_limited' // 429: back off and retry
  | 'transient' // 5xx or network error: retry with backoff
  | 'empty_text' // guard against malformed callers (not a real DB-data failure)
  | 'no_voyage_key'; // configuration error: no API key present

export type EmbedFactOutcome =
  | { ok: true; vector: number[] }
  | { ok: false; class: EmbedFailureClass; reason: string; message: string };

export type FactEmbedder = (text: string) => Promise<EmbedFactOutcome>;

/**
 * Classifies a Voyage AI error thrown by `generateEmbedding` into a typed
 * failure class. `generateEmbedding` throws with the message pattern:
 *   "Voyage AI embedding request failed (<status>): <body>"
 * We parse the status code from that pattern to distinguish 4xx / 429 / 5xx.
 * Anything else is treated as a transient (network / unknown) error.
 */
function classifyVoyageError(err: unknown): EmbedFailureClass {
  const message = err instanceof Error ? err.message : String(err);
  const match = /Voyage AI embedding request failed \((\d{3})\)/.exec(message);
  if (match) {
    const rawStatus = match[1];
    if (!rawStatus) return 'transient';
    const status = parseInt(rawStatus, 10);
    if (status === 429) return 'rate_limited';
    if (status >= 400 && status < 500) return 'invalid_input';
    if (status >= 500) return 'transient';
  }
  // Network errors, unexpected throws, or injected errors that do not follow
  // the Voyage message pattern are treated as transient.
  return 'transient';
}

/**
 * Wraps an embedding function with error classification.
 *
 * On success returns `{ ok: true, vector }`.
 * On failure returns a discriminated `{ ok: false, class, reason, message }`
 * where `class` lets callers branch on poison-pill vs. transient vs. rate-limit,
 * and `reason` (equal to `class`) is kept for backward-compatible callers that
 * already read `result.reason` as a string.
 *
 * Notes:
 * - The `empty_text` guard is defensive against malformed callers; the DB schema
 *   enforces NOT NULL on `text` so real data will never be blank in production.
 * - Do NOT add retry logic here. That belongs in the Inngest step that calls
 *   this function, where exponential back-off and step retries are available.
 */
export async function embedFactText(
  text: string,
  fn: EmbeddingFn
): Promise<EmbedFactOutcome> {
  // Defensive guard: `text` is NOT NULL in the DB schema so this path should
  // never fire with real data. Kept here to protect against malformed callers.
  if (text.trim().length === 0) {
    return {
      ok: false,
      class: 'empty_text',
      reason: 'empty_text',
      message: 'Text is empty',
    };
  }

  try {
    const result = await fn(text);
    return { ok: true, vector: result.vector };
  } catch (err) {
    const failureClass = classifyVoyageError(err);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, class: failureClass, reason: failureClass, message };
  }
}

export const makeEmbedderFromEnv =
  (apiKey?: string): FactEmbedder =>
  async (text) => {
    if (!apiKey)
      return {
        ok: false,
        class: 'no_voyage_key',
        reason: 'no_voyage_key',
        message: 'No Voyage API key configured',
      };
    return embedFactText(text, (value) => generateEmbedding(value, apiKey));
  };
