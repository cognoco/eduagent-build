import { and, eq, inArray } from 'drizzle-orm';
import {
  curriculumBooks,
  curricula,
  curriculumTopics,
  subjects,
  type Database,
} from '@eduagent/database';
import { NotFoundError } from '../errors';

export interface OwnedCurriculumTopic {
  topicId: string;
  topicTitle: string;
  topicDescription: string | null;
  topicChapter: string | null;
  topicEstimatedMinutes: number;
  bookId: string;
  bookTitle: string;
  curriculumId: string;
  subjectId: string;
  topicSource: (typeof curriculumTopics.$inferSelect)['source'];
  subjectName: string;
  subjectPedagogyMode: (typeof subjects.$inferSelect)['pedagogyMode'];
  subjectLanguageCode: (typeof subjects.$inferSelect)['languageCode'];
}

export async function findOwnedCurriculumTopic(
  db: Database,
  params: { profileId: string; topicId: string; subjectId?: string },
): Promise<OwnedCurriculumTopic | null> {
  const conditions = [
    eq(curriculumTopics.id, params.topicId),
    eq(subjects.profileId, params.profileId),
  ];
  if (params.subjectId) {
    conditions.push(eq(subjects.id, params.subjectId));
  }

  const [row] = await db
    .select({
      topicId: curriculumTopics.id,
      topicTitle: curriculumTopics.title,
      topicDescription: curriculumTopics.description,
      topicChapter: curriculumTopics.chapter,
      topicEstimatedMinutes: curriculumTopics.estimatedMinutes,
      bookId: curriculumBooks.id,
      bookTitle: curriculumBooks.title,
      curriculumId: curriculumTopics.curriculumId,
      subjectId: subjects.id,
      topicSource: curriculumTopics.source,
      subjectName: subjects.name,
      subjectPedagogyMode: subjects.pedagogyMode,
      subjectLanguageCode: subjects.languageCode,
    })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
    .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
    .innerJoin(
      subjects,
      and(
        eq(subjects.id, curriculumBooks.subjectId),
        eq(subjects.id, curricula.subjectId),
      ),
    )
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

export async function findOwnedCurriculumTopics(
  db: Database,
  params: { profileId: string; topicIds: string[]; subjectId?: string },
): Promise<OwnedCurriculumTopic[]> {
  if (params.topicIds.length === 0) return [];

  const conditions = [
    inArray(curriculumTopics.id, params.topicIds),
    eq(subjects.profileId, params.profileId),
  ];
  if (params.subjectId) {
    conditions.push(eq(subjects.id, params.subjectId));
  }

  return db
    .select({
      topicId: curriculumTopics.id,
      topicTitle: curriculumTopics.title,
      topicDescription: curriculumTopics.description,
      topicChapter: curriculumTopics.chapter,
      topicEstimatedMinutes: curriculumTopics.estimatedMinutes,
      bookId: curriculumBooks.id,
      bookTitle: curriculumBooks.title,
      curriculumId: curriculumTopics.curriculumId,
      subjectId: subjects.id,
      topicSource: curriculumTopics.source,
      subjectName: subjects.name,
      subjectPedagogyMode: subjects.pedagogyMode,
      subjectLanguageCode: subjects.languageCode,
    })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
    .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
    .innerJoin(
      subjects,
      and(
        eq(subjects.id, curriculumBooks.subjectId),
        eq(subjects.id, curricula.subjectId),
      ),
    )
    .where(and(...conditions));
}

export async function assertOwnedCurriculumTopic(
  db: Database,
  params: { profileId: string; topicId: string; subjectId?: string },
): Promise<OwnedCurriculumTopic> {
  const row = await findOwnedCurriculumTopic(db, params);
  if (!row) throw new NotFoundError('Topic');
  return row;
}
