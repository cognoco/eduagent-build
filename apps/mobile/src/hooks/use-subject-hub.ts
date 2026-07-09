import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { BookSession, BookWithTopics } from '@eduagent/schemas';
import {
  bookWithTopicsSchema,
  getBookSessionsResponseSchema,
} from '@eduagent/schemas';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { queryKeys } from '../lib/query-keys';
import { parseJson } from '../lib/parse-json';
import {
  combinedSignal,
  LEARNING_ENTRY_QUERY_TIMEOUT_MS,
} from '../lib/query-timeout';
import { useBooks } from './use-books';
import { useNavigationContract } from './use-navigation-contract';
import { useLearningResumeTarget } from './use-progress';
import { useRetentionTopics } from './use-retention';
import { useSubjectNotes, type SubjectHubNote } from './use-subject-notes';
import { useSubjects } from './use-subjects';
import {
  buildSubjectHubData,
  type SubjectHubDataWithResume,
  type SubjectHubEmptyKind,
  type SubjectHubRetentionTopic,
} from './subject-hub-data';

// Match the subjects-list poll cadence (use-subjects.ts) so the hub resolves to
// ready topics on the same beat the list flips curriculumStatus.
const PREPARING_POLL_MS = 3000;

export { buildSubjectHubData } from './subject-hub-data';
export type {
  SubjectHubDataWithResume,
  SubjectHubEmptyKind,
  SubjectHubNextUpWithResume,
  SubjectHubRetentionTopic,
} from './subject-hub-data';
export type { SubjectHubNote };

/**
 * Pure discriminator for the hub's empty-state kind.
 * Exported for unit tests — call sites should use `useSubjectHub` instead.
 *
 * Order of precedence (highest → lowest):
 *  1. `data` is null → 'none' (hub not yet settled)
 *  2. hub has usable topics → 'none'
 *  3. `curriculumStatus === 'failed'` → 'stuck' (terminal; no poll needed)
 *  4. `curriculumStatus === 'preparing'` → 'preparing' (poll active)
 *  5. no book rows → 'pick-book'
 *  6. books present but zero active topics → 'stuck'
 */
export function computeEmptyKind(
  data: SubjectHubDataWithResume | null,
  curriculumStatus: 'ready' | 'preparing' | 'failed' | null,
  booksCount: number,
): SubjectHubEmptyKind {
  const hasUsableData =
    !!data && (data.aggregate.total > 0 || data.chapters.length > 0);
  if (!data || hasUsableData) return 'none';
  if (curriculumStatus === 'failed') return 'stuck';
  if (curriculumStatus === 'preparing') return 'preparing';
  if (booksCount === 0) return 'pick-book';
  return 'stuck';
}

export function useSubjectHub(subjectId: string | undefined): {
  data: SubjectHubDataWithResume | null;
  isLoading: boolean;
  isError: boolean;
  curriculumStatus: 'ready' | 'preparing' | 'failed' | null;
  emptyKind: SubjectHubEmptyKind;
  refetch: () => void;
} {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const navigationContract = useNavigationContract();
  const subjectsQuery = useSubjects({ enabled: !!subjectId });
  const curriculumStatus = subjectId
    ? (subjectsQuery.data?.find((subject) => subject.id === subjectId)
        ?.curriculumStatus ?? null)
    : null;
  const isPreparing = curriculumStatus === 'preparing';
  // While the curriculum is generating, poll the book + topic queries so the hub
  // resolves to studyable topics on its own instead of stranding the learner on
  // a static empty state. The poll self-disables the moment status flips to
  // 'ready' (and stops entirely once the screen unmounts).
  const preparingPoll = isPreparing ? PREPARING_POLL_MS : false;
  const booksQuery = useBooks(subjectId, { refetchInterval: preparingPoll });
  const retentionQuery = useRetentionTopics(subjectId ?? '');
  const resumeTargetQuery = useLearningResumeTarget({ subjectId });
  const notesQuery = useSubjectNotes(subjectId);

  const books = useMemo(() => booksQuery.data ?? [], [booksQuery.data]);
  const generatedBooks = useMemo(
    () => books.filter((book) => book.topicsGenerated),
    [books],
  );

  const bookDetailQueries = useQueries({
    queries: generatedBooks.map((book) => ({
      queryKey: ['book', subjectId, book.id, activeProfile?.id],
      enabled: !!activeProfile && !!subjectId,
      refetchInterval: preparingPoll,
      queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
        if (!subjectId) throw new Error('subjectId is required');
        const { signal, cleanup } = combinedSignal(
          querySignal,
          LEARNING_ENTRY_QUERY_TIMEOUT_MS,
        );
        try {
          const res = await client.subjects[':subjectId'].books[':bookId'].$get(
            { param: { subjectId, bookId: book.id } },
            { init: { signal } },
          );
          await assertOk(res);
          return await parseJson(
            res,
            bookWithTopicsSchema,
            'GET /subjects/:subjectId/books/:bookId',
          );
        } finally {
          cleanup();
        }
      },
    })),
  });

  const bookSessionQueries = useQueries({
    queries: generatedBooks.map((book) => ({
      queryKey: queryKeys.bookSessions(subjectId, book.id, activeProfile?.id),
      enabled: !!activeProfile && !!subjectId,
      refetchInterval: preparingPoll,
      queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
        if (!subjectId) throw new Error('subjectId is required');
        const { signal, cleanup } = combinedSignal(
          querySignal,
          LEARNING_ENTRY_QUERY_TIMEOUT_MS,
        );
        try {
          const res = await client.subjects[':subjectId'].books[
            ':bookId'
          ].sessions.$get(
            { param: { subjectId, bookId: book.id } },
            { init: { signal } },
          );
          await assertOk(res);
          const data = await parseJson(
            res,
            getBookSessionsResponseSchema,
            'GET /subjects/:subjectId/books/:bookId/sessions',
          );
          return data.sessions;
        } finally {
          cleanup();
        }
      },
    })),
  });

  const data = useMemo(() => {
    if (!subjectId) return null;
    const subjectName =
      subjectsQuery.data?.find((subject) => subject.id === subjectId)?.name ??
      books[0]?.title ??
      'Subject';
    const sessionsByBookId = new Map<string, BookSession[]>();
    for (let i = 0; i < generatedBooks.length; i += 1) {
      const book = generatedBooks[i];
      if (book) {
        sessionsByBookId.set(book.id, bookSessionQueries[i]?.data ?? []);
      }
    }

    return buildSubjectHubData({
      subjectId,
      subjectName,
      books,
      bookDetails: bookDetailQueries
        .map((query) => query.data)
        .filter((detail): detail is BookWithTopics => !!detail),
      sessionsByBookId,
      retentionTopics: (retentionQuery.data?.topics ??
        []) as SubjectHubRetentionTopic[],
      resumeTarget: resumeTargetQuery.data,
      notes: notesQuery.notes,
      canStudy: navigationContract.gates.showLearningActions,
    });
  }, [
    bookDetailQueries,
    bookSessionQueries,
    books,
    generatedBooks,
    navigationContract.gates.showLearningActions,
    notesQuery.notes,
    retentionQuery.data?.topics,
    resumeTargetQuery.data,
    subjectId,
    subjectsQuery.data,
  ]);

  const isLoading =
    subjectsQuery.isLoading ||
    booksQuery.isLoading ||
    retentionQuery.isLoading ||
    resumeTargetQuery.isLoading ||
    notesQuery.isLoading ||
    bookDetailQueries.some((query) => query.isLoading || query.isPending) ||
    bookSessionQueries.some((query) => query.isLoading || query.isPending);
  const hasResumeFallback = !!resumeTargetQuery.data?.topicId;
  const bookDataFailed =
    booksQuery.isError ||
    bookDetailQueries.some((query) => query.isError) ||
    bookSessionQueries.some((query) => query.isError);
  const isError =
    subjectsQuery.isError ||
    retentionQuery.isError ||
    resumeTargetQuery.isError ||
    notesQuery.isError ||
    (!hasResumeFallback && bookDataFailed);

  const emptyKind = computeEmptyKind(data, curriculumStatus, books.length);

  return {
    data,
    isLoading,
    isError,
    curriculumStatus,
    emptyKind,
    refetch: () => {
      void subjectsQuery.refetch();
      void booksQuery.refetch();
      void retentionQuery.refetch();
      void resumeTargetQuery.refetch();
      notesQuery.refetch();
      for (const query of bookDetailQueries) void query.refetch();
      for (const query of bookSessionQueries) void query.refetch();
    },
  };
}
