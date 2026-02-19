// ---------------------------------------------------------------------------
// Embedding Service Stub — Stories 2.11/3.10
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------
// TODO: Replace with actual provider call after embedding spike decision.
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

/** Stub config — to be replaced with actual decision from embedding spike */
const EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'text-embedding-3-small',
  provider: 'openai',
  dimensions: 1536,
};

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Returns the current embedding configuration.
 *
 * TODO: Replace with actual decision from embedding spike.
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return { ...EMBEDDING_CONFIG };
}

/**
 * Generates an embedding vector for the given text.
 *
 * Currently returns a mock embedding (array of zeros) of the configured
 * dimensions. This stub preserves the interface contract so that
 * downstream code can be built and tested before the actual embedding
 * provider is integrated.
 *
 * TODO: Replace with actual provider call.
 */
export async function generateEmbedding(
  text: string
): Promise<EmbeddingResult> {
  const config = getEmbeddingConfig();

  // Mock: return a zero vector of the configured dimensions
  const vector = new Array<number>(config.dimensions).fill(0);

  return {
    vector,
    dimensions: config.dimensions,
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
  content: string
): Promise<void> {
  const result = await generateEmbedding(content);
  await storeEmbedding(db, {
    sessionId,
    profileId,
    topicId: topicId ?? undefined,
    content,
    embedding: result.vector,
  });
}
