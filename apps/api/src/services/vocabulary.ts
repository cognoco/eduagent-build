import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  vocabulary,
  vocabularyRetentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import { sm2 } from '@eduagent/retention';
import type {
  Vocabulary,
  VocabularyCreateInput,
  VocabularyRetentionCard,
  VocabularyReviewInput,
  VocabularyUpdateInput,
} from '@eduagent/schemas';
import {
  SubjectNotFoundError,
  VocabularyNotFoundError,
} from '@eduagent/schemas';
import { recordPracticeActivityEvent } from './practice-activity-events';

function mapVocabularyRow(row: typeof vocabulary.$inferSelect): Vocabulary {
  return {
    id: row.id,
    profileId: row.profileId,
    subjectId: row.subjectId,
    term: row.term,
    termNormalized: row.termNormalized,
    translation: row.translation,
    type: row.type,
    cefrLevel: row.cefrLevel as Vocabulary['cefrLevel'],
    milestoneId: row.milestoneId ?? null,
    mastered: row.mastered,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapVocabularyRetentionCard(
  row: typeof vocabularyRetentionCards.$inferSelect,
): VocabularyRetentionCard {
  return {
    vocabularyId: row.vocabularyId,
    easeFactor: row.easeFactor,
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
    nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
    failureCount: row.failureCount,
    consecutiveSuccesses: row.consecutiveSuccesses,
  };
}

export function normalizeVocabTerm(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function ensureLanguageSubject(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<void> {
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
  });

  if (!subject) {
    throw new SubjectNotFoundError();
  }
}

export async function listVocabulary(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<Vocabulary[]> {
  await ensureLanguageSubject(db, profileId, subjectId);

  const rows = await db
    .select()
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.profileId, profileId),
        eq(vocabulary.subjectId, subjectId),
      ),
    )
    .orderBy(asc(vocabulary.mastered), asc(vocabulary.termNormalized));

  return rows.map(mapVocabularyRow);
}

export async function createVocabulary(
  db: Database,
  profileId: string,
  subjectId: string,
  input: VocabularyCreateInput,
): Promise<Vocabulary> {
  await ensureLanguageSubject(db, profileId, subjectId);

  const [row] = await db
    .insert(vocabulary)
    .values({
      profileId,
      subjectId,
      term: input.term.trim(),
      termNormalized: normalizeVocabTerm(input.term),
      translation: input.translation.trim(),
      type: input.type,
      cefrLevel: input.cefrLevel ?? null,
      milestoneId: input.milestoneId ?? null,
    })
    .onConflictDoUpdate({
      target: [
        vocabulary.profileId,
        vocabulary.subjectId,
        vocabulary.termNormalized,
      ],
      set: {
        translation: input.translation.trim(),
        type: input.type,
        // Preserve existing cefrLevel/milestoneId when new input doesn't provide them —
        // prevents a later session with no CEFR context from clobbering good data.
        cefrLevel:
          input.cefrLevel != null
            ? input.cefrLevel
            : sql`${vocabulary.cefrLevel}`,
        milestoneId:
          input.milestoneId != null
            ? input.milestoneId
            : sql`${vocabulary.milestoneId}`,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error('Upsert vocabulary did not return a row');
  return mapVocabularyRow(row);
}

export async function updateVocabulary(
  db: Database,
  profileId: string,
  vocabularyId: string,
  input: VocabularyUpdateInput,
): Promise<Vocabulary | null> {
  const updates: Partial<typeof vocabulary.$inferInsert> & { updatedAt: Date } =
    {
      updatedAt: new Date(),
    };

  if (input.translation !== undefined) {
    updates.translation = input.translation.trim();
  }
  if (input.type !== undefined) {
    updates.type = input.type;
  }
  if (input.cefrLevel !== undefined) {
    updates.cefrLevel = input.cefrLevel;
  }
  if (input.milestoneId !== undefined) {
    updates.milestoneId = input.milestoneId;
  }
  if (input.mastered !== undefined) {
    updates.mastered = input.mastered;
  }

  const rows = await db
    .update(vocabulary)
    .set(updates)
    .where(
      and(eq(vocabulary.id, vocabularyId), eq(vocabulary.profileId, profileId)),
    )
    .returning();

  return rows[0] ? mapVocabularyRow(rows[0]) : null;
}

export async function deleteVocabulary(
  db: Database,
  profileId: string,
  subjectId: string,
  vocabularyId: string,
): Promise<boolean> {
  const rows = await db
    .delete(vocabulary)
    .where(
      and(
        eq(vocabulary.id, vocabularyId),
        eq(vocabulary.profileId, profileId),
        eq(vocabulary.subjectId, subjectId),
      ),
    )
    .returning({ id: vocabulary.id });

  return rows.length > 0;
}

export async function ensureVocabularyRetentionCard(
  db: Database,
  profileId: string,
  vocabularyId: string,
): Promise<typeof vocabularyRetentionCards.$inferSelect> {
  // [VOCAB-RETENTION-INSERT] intervalDays must be >= 1 to satisfy the
  // vocab_retention_cards_interval_days_positive CHECK constraint. Use 1
  // (sm2's "first review" default per packages/retention/src/sm2.ts:54,58)
  // rather than 0, so a never-reviewed card looks identical to a freshly-seen
  // one — both have a 1-day interval until the first real review overwrites
  // the row with the SM-2 calculated value.
  await db
    .insert(vocabularyRetentionCards)
    .values({
      profileId,
      vocabularyId,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
    })
    .onConflictDoNothing({
      target: [vocabularyRetentionCards.vocabularyId],
    });

  const row = await db.query.vocabularyRetentionCards.findFirst({
    where: and(
      eq(vocabularyRetentionCards.profileId, profileId),
      eq(vocabularyRetentionCards.vocabularyId, vocabularyId),
    ),
  });

  if (!row) {
    throw new Error(
      `Failed to ensure retention card for vocabulary ${vocabularyId}`,
    );
  }

  return row;
}

export async function reviewVocabulary(
  db: Database,
  profileId: string,
  vocabularyId: string,
  input: VocabularyReviewInput,
  subjectId?: string,
): Promise<{
  vocabulary: Vocabulary;
  retention: VocabularyRetentionCard;
}> {
  const conditions = [
    eq(vocabulary.id, vocabularyId),
    eq(vocabulary.profileId, profileId),
  ];
  if (subjectId) {
    conditions.push(eq(vocabulary.subjectId, subjectId));
  }
  const vocabRow = await db.query.vocabulary.findFirst({
    where: and(...conditions),
  });
  if (!vocabRow) {
    throw new VocabularyNotFoundError();
  }

  // Wrap read-compute-write in a transaction to prevent SM-2 race conditions:
  // concurrent reviews reading the same consecutiveSuccesses would silently
  // overwrite each other's SM-2 parameters without serialization.
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const card = await ensureVocabularyRetentionCard(
      txDb,
      profileId,
      vocabularyId,
    );
    const now = new Date().toISOString();
    const result = sm2({
      quality: input.quality,
      card: {
        easeFactor: card.easeFactor,
        interval: Math.max(1, card.intervalDays),
        repetitions: card.repetitions,
        lastReviewedAt: card.lastReviewedAt?.toISOString() ?? now,
        nextReviewAt: card.nextReviewAt?.toISOString() ?? now,
      },
    });

    const consecutiveSuccesses =
      input.quality >= 3 ? card.consecutiveSuccesses + 1 : 0;
    const failureCount =
      input.quality >= 3 ? card.failureCount : card.failureCount + 1;
    const mastered = consecutiveSuccesses >= 3;

    const [updatedCard] = await txDb
      .update(vocabularyRetentionCards)
      .set({
        easeFactor: result.card.easeFactor,
        intervalDays: result.card.interval,
        repetitions: result.card.repetitions,
        lastReviewedAt: new Date(result.card.lastReviewedAt),
        nextReviewAt: new Date(result.card.nextReviewAt),
        failureCount,
        consecutiveSuccesses,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vocabularyRetentionCards.vocabularyId, vocabularyId),
          eq(vocabularyRetentionCards.profileId, profileId),
        ),
      )
      .returning();

    const [updatedVocab] = await txDb
      .update(vocabulary)
      .set({
        mastered,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vocabulary.id, vocabularyId),
          eq(vocabulary.profileId, profileId),
        ),
      )
      .returning();

    if (!updatedCard)
      throw new Error('Update vocabulary retention card did not return a row');

    await recordPracticeActivityEvent(txDb, {
      profileId,
      subjectId: (updatedVocab ?? vocabRow).subjectId,
      activityType: 'review',
      activitySubtype: 'vocabulary',
      completedAt: new Date(now),
      score: input.quality,
      total: 5,
      sourceType: 'vocabulary_retention_card',
      sourceId: updatedCard.id,
      occurrenceKey: `vocabulary:${vocabularyId}:reviewed:${now}`,
      metadata: {
        vocabularyId,
        mastered,
        repetitions: result.card.repetitions,
        intervalDays: result.card.interval,
      },
    });

    return {
      vocabulary: mapVocabularyRow(updatedVocab ?? vocabRow),
      retention: mapVocabularyRetentionCard(updatedCard),
    };
  });
}

export async function upsertExtractedVocabulary(
  db: Database,
  profileId: string,
  subjectId: string,
  items: Array<
    VocabularyCreateInput & {
      quality?: number;
    }
  >,
): Promise<Vocabulary[]> {
  const created: Vocabulary[] = [];

  for (const item of items) {
    const vocabItem = await createVocabulary(db, profileId, subjectId, item);
    created.push(vocabItem);
    if (item.quality != null) {
      await reviewVocabulary(db, profileId, vocabItem.id, {
        quality: item.quality,
      });
    }
  }

  return created;
}

export async function getVocabularyDueForReview(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<Array<Vocabulary & { nextReviewAt: string | null }>> {
  const rows = await db
    .select({
      vocab: vocabulary,
      card: vocabularyRetentionCards,
    })
    .from(vocabulary)
    .leftJoin(
      vocabularyRetentionCards,
      eq(vocabulary.id, vocabularyRetentionCards.vocabularyId),
    )
    .where(
      and(
        eq(vocabulary.profileId, profileId),
        eq(vocabulary.subjectId, subjectId),
      ),
    )
    .orderBy(
      asc(vocabulary.mastered),
      asc(vocabularyRetentionCards.nextReviewAt),
      desc(vocabulary.createdAt),
    );

  return rows.map((row) => ({
    ...mapVocabularyRow(row.vocab),
    nextReviewAt: row.card?.nextReviewAt?.toISOString() ?? null,
  }));
}
