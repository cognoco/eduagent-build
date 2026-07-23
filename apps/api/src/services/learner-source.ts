import { and, eq } from 'drizzle-orm';

import {
  bookmarks,
  createScopedRepository,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  sessionEvents,
  topicNotes,
  type Database,
} from '@eduagent/database';
import {
  learnerSourceSchema,
  sessionMetadataSchema,
  type LearnerSource,
  type LearnerSourceKind,
} from '@eduagent/schemas';

function optionalId<Key extends 'topicId' | 'sessionId'>(
  key: Key,
  value: string | null | undefined,
): Partial<Record<Key, string>> {
  return value ? ({ [key]: value } as Partial<Record<Key, string>>) : {};
}

/**
 * Assemble one learner-owned source at read time without copying content into
 * the evidence-link table. Every lookup is profile-scoped; a dangling/purged
 * source resolves to null.
 */
export async function assembleLearnerSource(
  db: Database,
  profileId: string,
  reference: { kind: LearnerSourceKind; id: string },
): Promise<LearnerSource | null> {
  const repo = createScopedRepository(db, profileId);

  switch (reference.kind) {
    case 'note': {
      const [row] = await db
        .select({
          id: topicNotes.id,
          profileId: topicNotes.profileId,
          topicId: topicNotes.topicId,
          subjectId: curriculumBooks.subjectId,
          sessionId: topicNotes.sessionId,
          excerpt: topicNotes.content,
          createdAt: topicNotes.createdAt,
        })
        .from(topicNotes)
        .innerJoin(
          curriculumTopics,
          eq(topicNotes.topicId, curriculumTopics.id),
        )
        .innerJoin(
          curriculumBooks,
          eq(curriculumTopics.bookId, curriculumBooks.id),
        )
        .where(
          and(
            eq(topicNotes.id, reference.id),
            eq(topicNotes.profileId, profileId),
          ),
        )
        .limit(1);
      if (!row) return null;
      return learnerSourceSchema.parse({
        kind: 'note',
        id: row.id,
        profileId: row.profileId,
        topicId: row.topicId,
        subjectId: row.subjectId,
        ...optionalId('sessionId', row.sessionId),
        excerpt: row.excerpt,
        createdAt: row.createdAt.toISOString(),
      });
    }

    case 'bookmark': {
      const row = await repo.bookmarks.findFirst(
        eq(bookmarks.id, reference.id),
      );
      if (!row) return null;
      return learnerSourceSchema.parse({
        kind: 'bookmark',
        id: row.id,
        profileId: row.profileId,
        ...optionalId('topicId', row.topicId),
        subjectId: row.subjectId,
        ...optionalId('sessionId', row.sessionId),
        excerpt: row.content,
        createdAt: row.createdAt.toISOString(),
      });
    }

    case 'transcript_excerpt': {
      const row = await repo.sessionEvents.findFirst(
        eq(sessionEvents.id, reference.id),
      );
      if (!row) return null;
      return learnerSourceSchema.parse({
        kind: 'transcript_excerpt',
        id: row.id,
        profileId: row.profileId,
        ...optionalId('topicId', row.topicId),
        subjectId: row.subjectId,
        sessionId: row.sessionId,
        excerpt: row.content,
        createdAt: row.createdAt.toISOString(),
      });
    }

    case 'homework_ocr': {
      const row = await repo.sessions.findFirst(
        eq(learningSessions.id, reference.id),
      );
      if (!row) return null;
      const metadata = sessionMetadataSchema.safeParse(row.metadata ?? {});
      const excerpt = metadata.success
        ? metadata.data.homework?.ocrText
        : undefined;
      if (!excerpt) return null;
      return learnerSourceSchema.parse({
        kind: 'homework_ocr',
        id: row.id,
        profileId: row.profileId,
        ...optionalId('topicId', row.topicId),
        subjectId: row.subjectId,
        sessionId: row.id,
        excerpt,
        createdAt: row.createdAt.toISOString(),
      });
    }
  }
}
