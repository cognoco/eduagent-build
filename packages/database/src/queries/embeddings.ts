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
        `Embedding contains invalid value at index ${i}: ${embedding[i]}`
      );
    }
  }
}

export async function findSimilarTopics(
  db: Database,
  embedding: number[],
  limit = 5,
  profileId?: string
): Promise<SimilarTopic[]> {
  validateEmbedding(embedding);
  const vectorStr = `[${embedding.join(',')}]`;

  // Filter by cosine distance < 0.5 to exclude clearly irrelevant matches.
  // Cosine distance 0.5 corresponds to ~50% similarity.
  const maxDistance = 0.5;

  const baseQuery = profileId
    ? sql`
        SELECT id, topic_id AS "topicId", content,
               embedding <=> ${vectorStr}::vector AS distance
        FROM session_embeddings
        WHERE profile_id = ${profileId}
          AND embedding <=> ${vectorStr}::vector < ${maxDistance}
        ORDER BY distance ASC
        LIMIT ${limit}
      `
    : sql`
        SELECT id, topic_id AS "topicId", content,
               embedding <=> ${vectorStr}::vector AS distance
        FROM session_embeddings
        WHERE embedding <=> ${vectorStr}::vector < ${maxDistance}
        ORDER BY distance ASC
        LIMIT ${limit}
      `;

  const result = await db.execute(baseQuery);
  return result.rows as unknown as SimilarTopic[];
}

export async function storeEmbedding(
  db: Database,
  data: EmbeddingInsert
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
