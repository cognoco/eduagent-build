// ---------------------------------------------------------------------------
// Embedding Memory Retrieval — Story 3.10
// Retrieves similar past learning content via pgvector for session context
// Pure business logic + DB-aware queries, no Hono imports
// ---------------------------------------------------------------------------

import { findSimilarTopics, type Database } from '@eduagent/database';
import { generateEmbedding } from './embeddings';

/** Result of memory retrieval — ready for prompt injection */
export interface MemoryRetrievalResult {
  /** Formatted context string for system prompt injection, empty if nothing found */
  context: string;
  /** Topic IDs referenced in the retrieved memories */
  topicIds: string[];
}

/** Empty result returned on graceful fallback */
const EMPTY_RESULT: MemoryRetrievalResult = { context: '', topicIds: [] };

/** Default number of similar topics to retrieve */
const DEFAULT_LIMIT = 3;

// ---------------------------------------------------------------------------
// Core retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieves relevant prior learning memory for a student message.
 *
 * Flow:
 * 1. Generate an embedding for the current student message via Voyage AI
 * 2. Query pgvector for similar past session content scoped to this profile
 * 3. Format results into a context string for system prompt injection
 *
 * Graceful degradation:
 * - No voyageApiKey → returns empty (embedding generation not possible)
 * - No similar topics found → returns empty
 * - Any error (API failure, DB error) → logs warning, returns empty
 *
 * Memory retrieval must NEVER break a session.
 */
export async function retrieveRelevantMemory(
  db: Database,
  profileId: string,
  currentMessage: string,
  voyageApiKey?: string,
  limit?: number
): Promise<MemoryRetrievalResult> {
  if (!voyageApiKey) {
    return EMPTY_RESULT;
  }

  try {
    const embeddingResult = await generateEmbedding(
      currentMessage,
      voyageApiKey
    );

    const similarTopics = await findSimilarTopics(
      db,
      embeddingResult.vector,
      limit ?? DEFAULT_LIMIT,
      profileId
    );

    if (similarTopics.length === 0) {
      return EMPTY_RESULT;
    }

    const topicIds = similarTopics
      .map((t) => t.topicId)
      .filter((id): id is string => id !== null);

    const context = formatMemoryContext(similarTopics.map((t) => t.content));

    return { context, topicIds };
  } catch (err) {
    console.warn(
      '[memory] Embedding retrieval failed, continuing without memory:',
      err instanceof Error ? err.message : err
    );
    return EMPTY_RESULT;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Formats retrieved memory content into a structured text block
 * for system prompt injection.
 */
function formatMemoryContext(contents: string[]): string {
  const lines = [
    'Relevant prior learning (retrieved from past sessions via semantic similarity):',
    '',
  ];

  for (let i = 0; i < contents.length; i++) {
    // Truncate each content block to avoid overwhelming the prompt
    const truncated =
      contents[i].length > 500
        ? contents[i].slice(0, 500) + '...'
        : contents[i];
    lines.push(`[${i + 1}] ${truncated}`);
  }

  lines.push(
    '',
    'Use this context to connect to concepts the learner has encountered before.',
    'Reference their prior learning naturally, without explicitly saying "from your past sessions".'
  );

  return lines.join('\n');
}
