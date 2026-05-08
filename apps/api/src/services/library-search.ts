import { eq, and, ilike, asc, desc, inArray, isNull, or } from 'drizzle-orm';
import {
  subjects,
  curriculumBooks,
  curriculumTopics,
  topicNotes,
  learningSessions,
  sessionSummaries,
  createScopedRepository,
  type Database,
} from '@eduagent/database';

import type { LibrarySearchResult } from '@eduagent/schemas';

function truncateSnippet(content: string): string {
  return content.length > 100 ? `${content.slice(0, 100)}...` : content;
}

function pickSnippet(query: string, values: Array<string | null>): string {
  const normalizedQuery = query.trim().toLowerCase();
  const nonEmptyValues = values.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  const matchedValue = nonEmptyValues.find((value) =>
    value.toLowerCase().includes(normalizedQuery),
  );
  return truncateSnippet(matchedValue ?? nonEmptyValues[0] ?? '');
}

export async function searchLibrary(
  db: Database,
  profileId: string,
  query: string,
): Promise<LibrarySearchResult> {
  const escaped = query.replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;

  const repo = createScopedRepository(db, profileId);

  const [
    matchingSubjects,
    matchingBooks,
    matchingTopics,
    matchingNotes,
    matchingSessions,
  ] = await Promise.all([
    repo.db
      .select({ id: subjects.id, name: subjects.name })
      .from(subjects)
      .where(
        and(eq(subjects.profileId, profileId), ilike(subjects.name, pattern)),
      )
      .orderBy(asc(subjects.name), asc(subjects.id))
      .limit(20),

    repo.db
      .select({
        id: curriculumBooks.id,
        subjectId: curriculumBooks.subjectId,
        subjectName: subjects.name,
        title: curriculumBooks.title,
      })
      .from(curriculumBooks)
      .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
      .where(
        and(
          eq(subjects.profileId, profileId),
          ilike(curriculumBooks.title, pattern),
        ),
      )
      .orderBy(
        asc(subjects.name),
        asc(curriculumBooks.title),
        asc(curriculumBooks.id),
      )
      .limit(20),

    repo.db
      .select({
        id: curriculumTopics.id,
        bookId: curriculumTopics.bookId,
        bookTitle: curriculumBooks.title,
        subjectId: curriculumBooks.subjectId,
        subjectName: subjects.name,
        name: curriculumTopics.title,
      })
      .from(curriculumTopics)
      .innerJoin(
        curriculumBooks,
        eq(curriculumTopics.bookId, curriculumBooks.id),
      )
      .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
      .where(
        and(
          eq(subjects.profileId, profileId),
          ilike(curriculumTopics.title, pattern),
        ),
      )
      .orderBy(
        asc(subjects.name),
        asc(curriculumTopics.title),
        asc(curriculumTopics.id),
      )
      .limit(20),

    repo.db
      .select({
        id: topicNotes.id,
        sessionId: topicNotes.sessionId,
        topicId: topicNotes.topicId,
        topicName: curriculumTopics.title,
        bookId: curriculumTopics.bookId,
        subjectId: curriculumBooks.subjectId,
        subjectName: subjects.name,
        content: topicNotes.content,
        createdAt: topicNotes.createdAt,
      })
      .from(topicNotes)
      .innerJoin(curriculumTopics, eq(topicNotes.topicId, curriculumTopics.id))
      .innerJoin(
        curriculumBooks,
        eq(curriculumTopics.bookId, curriculumBooks.id),
      )
      .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
      .where(
        and(
          eq(topicNotes.profileId, profileId),
          eq(subjects.profileId, profileId),
          ilike(topicNotes.content, pattern),
        ),
      )
      .orderBy(asc(subjects.name), asc(topicNotes.id))
      .limit(20),

    repo.db
      .select({
        sessionId: sessionSummaries.sessionId,
        topicId: learningSessions.topicId,
        topicTitle: curriculumTopics.title,
        bookId: curriculumTopics.bookId,
        subjectId: subjects.id,
        subjectName: subjects.name,
        content: sessionSummaries.content,
        narrative: sessionSummaries.narrative,
        learnerRecap: sessionSummaries.learnerRecap,
        aiFeedback: sessionSummaries.aiFeedback,
        highlight: sessionSummaries.highlight,
        closingLine: sessionSummaries.closingLine,
        occurredAt: learningSessions.startedAt,
      })
      .from(sessionSummaries)
      .innerJoin(
        learningSessions,
        eq(sessionSummaries.sessionId, learningSessions.id),
      )
      .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
      .leftJoin(
        curriculumTopics,
        eq(learningSessions.topicId, curriculumTopics.id),
      )
      .leftJoin(
        curriculumBooks,
        eq(curriculumTopics.bookId, curriculumBooks.id),
      )
      .where(
        and(
          eq(sessionSummaries.profileId, profileId),
          eq(learningSessions.profileId, profileId),
          eq(subjects.profileId, profileId),
          isNull(sessionSummaries.purgedAt),
          inArray(sessionSummaries.status, [
            'submitted',
            'accepted',
            'auto_closed',
          ]),
          or(
            ilike(sessionSummaries.content, pattern),
            ilike(sessionSummaries.narrative, pattern),
            ilike(sessionSummaries.learnerRecap, pattern),
            ilike(sessionSummaries.aiFeedback, pattern),
            ilike(sessionSummaries.highlight, pattern),
            ilike(sessionSummaries.closingLine, pattern),
          ),
        ),
      )
      .orderBy(asc(subjects.name), desc(learningSessions.startedAt))
      .limit(20),
  ]);

  return {
    subjects: matchingSubjects,
    books: matchingBooks,
    topics: matchingTopics,
    notes: matchingNotes.map((n) => ({
      id: n.id,
      sessionId: n.sessionId ?? null,
      topicId: n.topicId,
      topicName: n.topicName,
      bookId: n.bookId,
      subjectId: n.subjectId,
      subjectName: n.subjectName,
      contentSnippet: truncateSnippet(n.content),
      createdAt: n.createdAt.toISOString(),
    })),
    sessions: matchingSessions.map((s) => ({
      sessionId: s.sessionId,
      topicId: s.topicId ?? null,
      topicTitle: s.topicTitle ?? null,
      bookId: s.bookId ?? null,
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      snippet: pickSnippet(query, [
        s.content,
        s.narrative,
        s.learnerRecap,
        s.aiFeedback,
        s.highlight,
        s.closingLine,
      ]),
      occurredAt: s.occurredAt.toISOString(),
    })),
  };
}
