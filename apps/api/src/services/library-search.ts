import { eq, and, ilike } from 'drizzle-orm';
import {
  subjects,
  curriculumBooks,
  curriculumTopics,
  topicNotes,
  createScopedRepository,
  type Database,
} from '@eduagent/database';

interface SearchResult {
  subjects: { id: string; name: string }[];
  books: { id: string; subjectId: string; title: string }[];
  topics: {
    id: string;
    bookId: string;
    subjectId: string;
    name: string;
  }[];
  notes: {
    id: string;
    topicId: string;
    bookId: string;
    subjectId: string;
    contentSnippet: string;
  }[];
}

export async function searchLibrary(
  db: Database,
  profileId: string,
  query: string
): Promise<SearchResult> {
  const escaped = query.replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;

  const repo = createScopedRepository(db, profileId);

  const [matchingSubjects, matchingBooks, matchingTopics, matchingNotes] =
    await Promise.all([
      repo.db
        .select({ id: subjects.id, name: subjects.name })
        .from(subjects)
        .where(
          and(eq(subjects.profileId, profileId), ilike(subjects.name, pattern))
        )
        .limit(20),

      repo.db
        .select({
          id: curriculumBooks.id,
          subjectId: curriculumBooks.subjectId,
          title: curriculumBooks.title,
        })
        .from(curriculumBooks)
        .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
        .where(
          and(
            eq(subjects.profileId, profileId),
            ilike(curriculumBooks.title, pattern)
          )
        )
        .limit(20),

      repo.db
        .select({
          id: curriculumTopics.id,
          bookId: curriculumTopics.bookId,
          subjectId: curriculumBooks.subjectId,
          name: curriculumTopics.title,
        })
        .from(curriculumTopics)
        .innerJoin(
          curriculumBooks,
          eq(curriculumTopics.bookId, curriculumBooks.id)
        )
        .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
        .where(
          and(
            eq(subjects.profileId, profileId),
            ilike(curriculumTopics.title, pattern)
          )
        )
        .limit(20),

      repo.db
        .select({
          id: topicNotes.id,
          topicId: topicNotes.topicId,
          bookId: curriculumTopics.bookId,
          subjectId: curriculumBooks.subjectId,
          content: topicNotes.content,
        })
        .from(topicNotes)
        .innerJoin(
          curriculumTopics,
          eq(topicNotes.topicId, curriculumTopics.id)
        )
        .innerJoin(
          curriculumBooks,
          eq(curriculumTopics.bookId, curriculumBooks.id)
        )
        .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
        .where(
          and(
            eq(topicNotes.profileId, profileId),
            eq(subjects.profileId, profileId),
            ilike(topicNotes.content, pattern)
          )
        )
        .limit(20),
    ]);

  return {
    subjects: matchingSubjects,
    books: matchingBooks,
    topics: matchingTopics,
    notes: matchingNotes.map((n) => ({
      id: n.id,
      topicId: n.topicId,
      bookId: n.bookId,
      subjectId: n.subjectId,
      contentSnippet:
        n.content.length > 100 ? n.content.slice(0, 100) + '…' : n.content,
    })),
  };
}
