import { sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { sessionEmbeddings } from '../schema/embeddings.js';
import { generateUUIDv7 } from '../utils/uuid.js';

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

export async function findSimilarTopics(
  db: Database,
  embedding: number[],
  limit = 5,
  profileId?: string
): Promise<SimilarTopic[]> {
  const vectorStr = `[${embedding.join(',')}]`;

  const baseQuery = profileId
    ? sql`
        SELECT id, topic_id AS "topicId", content,
               embedding <=> ${vectorStr}::vector AS distance
        FROM session_embeddings
        WHERE profile_id = ${profileId}
        ORDER BY distance ASC
        LIMIT ${limit}
      `
    : sql`
        SELECT id, topic_id AS "topicId", content,
               embedding <=> ${vectorStr}::vector AS distance
        FROM session_embeddings
        ORDER BY distance ASC
        LIMIT ${limit}
      `;

  const result = await db.execute(baseQuery);
  return result.rows as SimilarTopic[];
}

export async function storeEmbedding(
  db: Database,
  data: EmbeddingInsert
): Promise<void> {
  await db.insert(sessionEmbeddings).values({
    id: generateUUIDv7(),
    sessionId: data.sessionId,
    profileId: data.profileId,
    topicId: data.topicId ?? null,
    content: data.content,
    embedding: data.embedding,
  });
}
