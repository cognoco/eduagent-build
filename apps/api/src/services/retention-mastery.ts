import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  curriculumBooks,
  retentionCards,
  type Database,
} from '@eduagent/database';

interface StampMasteryOnVerifyInput {
  profileId: string;
  topicId: string;
  cardId: string;
  xpChange: 'none' | 'verified' | 'decayed';
  masteredAt?: Date;
}

export async function stampMasteryOnVerify(
  db: Database,
  input: StampMasteryOnVerifyInput,
): Promise<void> {
  if (input.xpChange !== 'verified') {
    return;
  }

  const masteredAt = input.masteredAt ?? new Date();

  // Wrap the card stamp and the book re-check in a single transaction so the
  // book-completeness check (NOT EXISTS any topic with a NULL mastered_at card)
  // sees the just-committed card stamp. Without this, two concurrent
  // verifications of the last two sibling topics in a book can each read the
  // book as not-yet-complete and neither stamps it. (Correctness-lens
  // book-mastery sibling-topic race finding.)
  await db.transaction(async (tx) => {
    await tx
      .update(retentionCards)
      .set({
        masteredAt,
        updatedAt: masteredAt,
      })
      .where(
        and(
          eq(retentionCards.id, input.cardId),
          eq(retentionCards.profileId, input.profileId),
          isNull(retentionCards.masteredAt),
        ),
      );

    await tx
      .update(curriculumBooks)
      .set({
        masteredAt,
        updatedAt: masteredAt,
      })
      .where(
        and(
          isNull(curriculumBooks.masteredAt),
          sql`EXISTS (
          SELECT 1
            FROM curriculum_topics source_t
            INNER JOIN curriculum_books source_b
              ON source_b.id = source_t.book_id
            INNER JOIN subjects source_s
              ON source_s.id = source_b.subject_id
           WHERE source_t.id = ${input.topicId}
             AND source_t.book_id = ${curriculumBooks.id}
             AND source_s.profile_id = ${input.profileId}
        )`,
          sql`EXISTS (
          SELECT 1
            FROM curriculum_topics t
           WHERE t.book_id = ${curriculumBooks.id}
             AND t.skipped = false
        )`,
          sql`NOT EXISTS (
          SELECT 1
            FROM curriculum_topics t
            LEFT JOIN retention_cards rc
              ON rc.topic_id = t.id
             AND rc.profile_id = ${input.profileId}
           WHERE t.book_id = ${curriculumBooks.id}
             AND t.skipped = false
             AND rc.mastered_at IS NULL
        )`,
        ),
      );
  });
}
