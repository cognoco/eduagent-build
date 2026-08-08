// ---------------------------------------------------------------------------
// Embedding Service — Stories 2.11/3.10
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------
// Provider: Voyage AI voyage-3.5 (1024 dimensions)
// ---------------------------------------------------------------------------

import {
  storeEmbedding,
  sessionEmbeddings,
  VECTOR_DIM,
  type Database,
} from '@eduagent/database';

import { filterLearnerAuthoredTextForEgress } from './learner-egress-filter';
import { assertLearnerDataEgressAllowed } from './llm/transfer-evidence-gate';
import { isNodeTestEnv } from '../config';

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  model: string;
  provider: string;
}

export interface EmbeddingConfig {
  model: string;
  provider: string;
  dimensions: number;
}

/**
 * Thrown when the Voyage AI response vector length does not match
 * `VECTOR_DIM` (the canonical pgvector column width). This is a typed
 * error so callers can distinguish provider/config drift from generic
 * transport failures, and Sentry can group these incidents under a single
 * fingerprint instead of opaque pgvector error strings.
 *
 * NEVER swallow this error and never coerce/truncate the vector — a
 * dimension mismatch means the model or config drifted and writing the
 * mis-sized vector would either fail at pgvector (loud) or silently
 * corrupt similarity search if the DB column width were ever changed
 * to match the bad response.
 */
export class EmbeddingDimensionMismatchError extends Error {
  readonly expected: number;
  readonly actual: number;
  readonly model: string;
  readonly provider: string;

  constructor(params: {
    expected: number;
    actual: number;
    model: string;
    provider: string;
  }) {
    super(
      `Voyage AI embedding dimension mismatch: expected ${params.expected}, ` +
        `got ${params.actual} (model=${params.model}, provider=${params.provider}). ` +
        `Provider config drift — refusing to write mis-sized vector.`,
    );
    this.name = 'EmbeddingDimensionMismatchError';
    this.expected = params.expected;
    this.actual = params.actual;
    this.model = params.model;
    this.provider = params.provider;
  }
}

const MAX_VOYAGE_RETRY_AFTER_MS = 15 * 60_000;

/** Parse Retry-After without allowing a provider response to park work forever. */
export function parseVoyageRetryAfterMs(
  value: string | null,
  nowMs = Date.now(),
): number | null {
  const normalized = value?.trim();
  if (!normalized) return null;

  let delayMs: number;
  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    if (!Number.isSafeInteger(seconds) || seconds <= 0) return null;
    delayMs = seconds * 1000;
  } else {
    const retryAt = Date.parse(normalized);
    if (!Number.isFinite(retryAt)) return null;
    delayMs = retryAt - nowMs;
    if (delayMs <= 0) return null;
  }

  return Math.min(delayMs, MAX_VOYAGE_RETRY_AFTER_MS);
}

/** Sanitized Voyage HTTP failure; provider response bodies are never retained. */
export class VoyageEmbeddingHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(params: { status: number; retryAfterMs: number | null }) {
    super(`Voyage AI embedding request failed (${params.status})`);
    this.name = 'VoyageEmbeddingHttpError';
    this.status = params.status;
    this.retryAfterMs = params.retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Voyage AI voyage-3.5 — 1024-dimensional embeddings */
const EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'voyage-3.5',
  provider: 'voyage',
  dimensions: 1024,
};

/** Voyage AI API endpoint */
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Returns the current embedding configuration.
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return { ...EMBEDDING_CONFIG };
}

/**
 * Voyage AI API response shape (only the fields we use).
 */
interface VoyageEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  model: string;
  usage: { total_tokens: number };
}

/**
 * Generates an embedding vector for the given text using Voyage AI.
 *
 * Calls the Voyage AI REST API with the configured model. The API key
 * is passed as a parameter so the service layer stays decoupled from
 * Hono env bindings.
 *
 * [WI-3020 rework] THE Voyage egress choke point. Every embedding caller —
 * the session-message path (`prepareExchangeContext`), semantic memory
 * retrieval, memory-fact embedding and its backfill, session-completed, and
 * transcript purge — reaches Voyage through this one function, so the
 * launch-stop is asserted here rather than at each call site. `text` here is
 * raw learner-authored content, so the assert runs FIRST: before the egress
 * filter, before the request body is serialised, before any network call.
 */
export async function generateEmbedding(
  text: string,
  apiKey: string,
): Promise<EmbeddingResult> {
  assertLearnerDataEgressAllowed({
    surface: 'voyage_embeddings',
    destination: VOYAGE_API_URL,
    nodeTestEnv: isNodeTestEnv(),
  });

  const config = getEmbeddingConfig();
  const filteredText = filterLearnerAuthoredTextForEgress(text);

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: [filteredText],
      model: config.model,
      input_type: 'document',
    }),
  });

  if (!response.ok) {
    throw new VoyageEmbeddingHttpError({
      status: response.status,
      retryAfterMs: parseVoyageRetryAfterMs(
        response.headers.get('Retry-After'),
      ),
    });
  }

  const json = (await response.json()) as VoyageEmbeddingResponse;

  const firstEmbedding = json.data[0];
  if (!firstEmbedding)
    throw new Error('Voyage AI response contained no embedding data');
  const vector = firstEmbedding.embedding;

  // Validate dimension against the canonical pgvector column width
  // (`VECTOR_DIM` from @eduagent/database). If the Voyage model or config
  // drifts and returns a different-length vector, throw a typed error so
  // the failure is loud in logs/Sentry and we NEVER silently write a
  // mis-sized vector that pgvector would reject with an opaque message
  // or — worse — that downstream code would truncate/pad.
  if (vector.length !== VECTOR_DIM) {
    throw new EmbeddingDimensionMismatchError({
      expected: VECTOR_DIM,
      actual: vector.length,
      model: json.model ?? config.model,
      provider: config.provider,
    });
  }

  return {
    vector,
    dimensions: vector.length,
    model: config.model,
    provider: config.provider,
  };
}

// ---------------------------------------------------------------------------
// DB-aware embedding storage (used by inngest/functions/session-completed.ts)
// ---------------------------------------------------------------------------
//
// [WI-3141] `content` here is written verbatim into the queryable
// `session_embeddings.content` column, so it must already be summary-safe.
// Callers build it through `loadSummarySafeEmbeddingContent`
// (services/session-embedding-content.ts) and fail closed when it is
// unavailable \u2014 never pass a raw transcript. The raw-transcript extractor
// that used to live in this file was deleted with WI-3141 so no caller can
// reach for it again.
// ---------------------------------------------------------------------------

/**
 * Generates and stores an embedding for a session.
 * Wraps generateEmbedding + storeEmbedding from @eduagent/database
 * so Inngest functions only import from the service layer.
 */
export async function storeSessionEmbedding(
  db: Database,
  sessionId: string,
  profileId: string,
  topicId: string | null,
  content: string,
  apiKey: string,
): Promise<void> {
  const result = await generateEmbedding(content, apiKey);
  await storeEmbedding(db, {
    sessionId,
    profileId,
    topicId: topicId ?? undefined,
    content,
    embedding: result.vector,
  });
}

/**
 * Same write, but tolerant of an existing row for (sessionId, profileId).
 *
 * Used by the WI-3141 catch-up backfill, which can race the initial write or
 * the purge rewrite; a plain insert would hit the unique constraint. Mirrors
 * the conflict target the purge uses (transcript-purge.ts).
 */
export async function upsertSessionEmbedding(
  db: Database,
  sessionId: string,
  profileId: string,
  topicId: string | null,
  content: string,
  apiKey: string,
): Promise<void> {
  const result = await generateEmbedding(content, apiKey);
  await db
    .insert(sessionEmbeddings)
    .values({
      sessionId,
      profileId,
      topicId: topicId ?? null,
      content,
      embedding: result.vector,
    })
    .onConflictDoUpdate({
      target: [sessionEmbeddings.sessionId, sessionEmbeddings.profileId],
      set: { topicId: topicId ?? null, content, embedding: result.vector },
    });
}
