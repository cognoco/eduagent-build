import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import { sessionEmbeddings } from '../schema/embeddings';
import { generateUUIDv7 } from '../utils/uuid';

export interface SimilarTopic {
  id: string;
  topicId: string | null;
  content: string;
  distance: number;
}

export interface EmbeddingInsert {
  sessionId: string;
  profileId: string;
  topicId?: string;
  content: string;
  embedding: number[];
}

function validateEmbedding(embedding: number[]): void {
  if (embedding.length === 0) {
    throw new Error('Embedding vector must not be empty');
  }
  for (let i = 0; i < embedding.length; i++) {
    if (typeof embedding[i] !== 'number' || !Number.isFinite(embedding[i])) {
      throw new Error(
        `Embedding contains invalid value at index ${i}: ${embedding[i]}`,
      );
    }
  }
}

/**
 * Find session embeddings whose vectors are closest to `embedding` within the
 * given profile.
 *
 * [BUG-221 / P1-HIGH] `profileId` is REQUIRED. The previous signature treated
 * it as optional, which created an escape hatch: any caller that forgot to
 * pass the profileId would silently issue a global vector search across
 * every account in the database, leaking embeddings (and their associated
 * topic text snippets) cross-profile. The signature is now load-bearing —
 * the type system forbids the unscoped variant, and the test suite asserts
 * that the SQL always carries `profile_id = $profileId`.
 *
 * Callers that genuinely want a global search must construct the raw SQL
 * themselves and document why; there is no in-package helper for it.
 */
export async function findSimilarTopics(
  db: Database,
  embedding: number[],
  limit: number,
  profileId: string,
): Promise<SimilarTopic[]> {
  validateEmbedding(embedding);
  if (!profileId || profileId.trim() === '') {
    // Defence in depth — callers should already be passing a UUID string,
    // but a bug that passes `''` would otherwise reduce to `WHERE profile_id
    // = ''` and silently return no rows. Loud failure beats silent empty.
    throw new Error(
      'findSimilarTopics: profileId is required and must be a non-empty string',
    );
  }
  const vectorStr = `[${embedding.join(',')}]`;

  // Filter by cosine distance < 0.5 to exclude clearly irrelevant matches.
  // Cosine distance 0.5 corresponds to ~50% similarity.
  const maxDistance = 0.5;

  const baseQuery = sql`
    SELECT id, topic_id AS "topicId", content,
           embedding <=> ${vectorStr}::vector AS distance
    FROM session_embeddings
    WHERE profile_id = ${profileId}
      AND embedding <=> ${vectorStr}::vector < ${maxDistance}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  const result = await db.execute(baseQuery);
  return result.rows as unknown as SimilarTopic[];
}

export async function storeEmbedding(
  db: Database,
  data: EmbeddingInsert,
): Promise<void> {
  validateEmbedding(data.embedding);
  await db.insert(sessionEmbeddings).values({
    id: generateUUIDv7(),
    sessionId: data.sessionId,
    profileId: data.profileId,
    topicId: data.topicId ?? null,
    content: data.content,
    embedding: data.embedding,
  });
}
