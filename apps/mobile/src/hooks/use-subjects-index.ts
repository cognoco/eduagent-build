import { useMemo } from 'react';
import type {
  CurriculumBook,
  GetAllProfileBooksResponse,
  Subject,
  SubjectStatus,
} from '@eduagent/schemas';

import { useAllBooks } from './use-all-books';
import {
  useOverallProgress,
  type OverallProgressResponse,
} from './use-progress';
import { useSubjects } from './use-subjects';

export interface SubjectIndexItem {
  subjectId: string;
  subjectName: string;
  status: SubjectStatus;
  urgencyBoostUntil: string | null;
  mastered: number;
  learning: number;
  total: number;
  dueReviews: number;
  books: CurriculumBook[];
}

interface BuildSubjectsIndexInput {
  subjects: readonly Subject[];
  librarySubjects: readonly GetAllProfileBooksResponse['subjects'][number][];
  progressSubjects: readonly OverallProgressResponse['subjects'][number][];
}

export function buildSubjectsIndex({
  subjects,
  librarySubjects,
  progressSubjects,
}: BuildSubjectsIndexInput): SubjectIndexItem[] {
  const booksBySubject = new Map(
    librarySubjects.map((subject) => [subject.subjectId, subject.books]),
  );
  const progressBySubject = new Map(
    progressSubjects.map((subject) => [subject.subjectId, subject]),
  );

  // All statuses pass through (active/paused/archived) — the consumer groups by
  // status. The legacy active-only filter hid paused/archived subjects entirely.
  return subjects.map((subject) => {
    const books = booksBySubject.get(subject.id) ?? [];
    const progress = progressBySubject.get(subject.id);
    const fallbackTotal = books.reduce(
      (sum, book) => sum + (book.topicCount ?? 0),
      0,
    );
    const fallbackMastered = books.reduce(
      (sum, book) => sum + (book.masteredTopicCount ?? 0),
      0,
    );
    const fallbackCompleted = books.reduce(
      (sum, book) => sum + (book.completedTopicCount ?? 0),
      0,
    );

    return {
      subjectId: subject.id,
      subjectName: subject.name,
      status: subject.status,
      urgencyBoostUntil: subject.urgencyBoostUntil ?? null,
      mastered: progress?.topicsMastered ?? fallbackMastered,
      learning:
        progress?.topicsLearning ??
        Math.max(0, fallbackCompleted - fallbackMastered),
      total: progress?.topicsTotal ?? fallbackTotal,
      dueReviews: books.filter((book) => book.status === 'REVIEW_DUE').length,
      books,
    };
  });
}

export function useSubjectsIndex(): {
  subjects: SubjectIndexItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const subjectsQuery = useSubjects();
  const libraryBooks = useAllBooks();
  const progressQuery = useOverallProgress();

  const librarySubjects = useMemo(() => {
    const grouped = new Map<
      string,
      { subjectId: string; subjectName: string; books: CurriculumBook[] }
    >();
    for (const item of libraryBooks.books) {
      const current = grouped.get(item.subjectId) ?? {
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        books: [],
      };
      current.books.push(item.book);
      grouped.set(item.subjectId, current);
    }
    return [...grouped.values()];
  }, [libraryBooks.books]);

  const subjects = useMemo(
    () =>
      buildSubjectsIndex({
        subjects: subjectsQuery.data ?? [],
        librarySubjects,
        progressSubjects: progressQuery.data?.subjects ?? [],
      }),
    [librarySubjects, progressQuery.data?.subjects, subjectsQuery.data],
  );

  return {
    subjects,
    isLoading:
      subjectsQuery.isLoading ||
      libraryBooks.isLoading ||
      progressQuery.isLoading,
    isError:
      subjectsQuery.isError || libraryBooks.isError || progressQuery.isError,
    refetch: () => {
      void subjectsQuery.refetch();
      libraryBooks.refetch();
      void progressQuery.refetch();
    },
  };
}
