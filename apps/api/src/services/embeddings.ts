// ---------------------------------------------------------------------------
// Embedding Service — Stories 2.11/3.10
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------
// Provider: Voyage AI voyage-3.5 (1024 dimensions)
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import {
  storeEmbedding,
  sessionEvents,
  type Database,
} from '@eduagent/database';

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
 */
export async function generateEmbedding(
  text: string,
  apiKey: string
): Promise<EmbeddingResult> {
  const config = getEmbeddingConfig();

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model: config.model,
      input_type: 'document',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Voyage AI embedding request failed (${response.status}): ${body}`
    );
  }

  const json = (await response.json()) as VoyageEmbeddingResponse;

  const vector = json.data[0].embedding;

  return {
    vector,
    dimensions: vector.length,
    model: config.model,
    provider: config.provider,
  };
}

// ---------------------------------------------------------------------------
// Session content extraction (for embedding input)
// ---------------------------------------------------------------------------

/** Max characters for embedding input text */
const MAX_EMBEDDING_CHARS = 8000;

/** Event types that represent actual conversation content */
const CONVERSATION_EVENT_TYPES = ['user_message', 'ai_response'] as const;

/**
 * Extracts conversation content from session events for embedding generation.
 *
 * Queries the `session_events` table and concatenates user_message + ai_response
 * content. Non-conversation events (session_start, escalation, hint, etc.) are
 * filtered out. Output is truncated to 8 000 chars to stay within typical
 * embedding model input limits.
 */
export async function extractSessionContent(
  db: Database,
  sessionId: string,
  profileId: string
): Promise<string> {
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId)
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  const conversationEvents = events.filter((e) =>
    (CONVERSATION_EVENT_TYPES as readonly string[]).includes(e.eventType)
  );

  if (conversationEvents.length === 0) {
    return `Session ${sessionId} \u2014 no conversation events recorded`;
  }

  const joined = conversationEvents.map((e) => e.content).join('\n\n');

  return joined.length > MAX_EMBEDDING_CHARS
    ? joined.slice(0, MAX_EMBEDDING_CHARS)
    : joined;
}

// ---------------------------------------------------------------------------
// DB-aware embedding storage (used by inngest/functions/session-completed.ts)
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
  apiKey: string
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
