import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type {
  BookSession,
  BookWithTopics,
  CurriculumBook,
  CurriculumTopic,
  LearningResumeTarget,
} from '@eduagent/schemas';

import type {
  HubChapter,
  HubNextUp,
  HubTopic,
  HubTopicState,
  SubjectHubData,
} from '../components/subject-hub';
import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { queryKeys } from '../lib/query-keys';
import { combinedSignal } from '../lib/query-timeout';
import { computeUpNextTopic } from '../lib/up-next-topic';
import { useBooks } from './use-books';
import { useLearningResumeTarget } from './use-progress';
import { useRetentionTopics } from './use-retention';
import { useSubjectNotes, type SubjectHubNote } from './use-subject-notes';
import { useSubjects } from './use-subjects';

const MIN_EXCHANGES_FOR_TOPIC_COMPLETION = 4;
const SEARCH_CHAPTER_THRESHOLD = 10;
const SEARCH_TOPIC_THRESHOLD = 50;

export type { SubjectHubNote };

export interface SubjectHubRetentionTopic {
  topicId: string;
  xpStatus?: string | null;
  masteredAt?: string | null;
  nextReviewAt?: string | null;
}

export type SubjectHubNextUpWithResume = HubNextUp & {
  resumeTarget?: LearningResumeTarget;
};

export type SubjectHubDataWithResume = Omit<SubjectHubData, 'nextUp'> & {
  nextUp: SubjectHubNextUpWithResume;
};

interface BuildSubjectHubDataInput {
  subjectId: string;
  subjectName: string;
  books: readonly CurriculumBook[];
  bookDetails: readonly BookWithTopics[];
  sessionsByBookId: ReadonlyMap<string, readonly BookSession[]>;
  retentionTopics: readonly SubjectHubRetentionTopic[];
  resumeTarget: LearningResumeTarget | null | undefined;
  notes: readonly SubjectHubNote[];
  now?: Date;
}

function byTopicSort(a: CurriculumTopic, b: CurriculumTopic): number {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
}

function isActiveTopic(topic: CurriculumTopic): boolean {
  return !topic.skipped && topic.title.trim().length > 0;
}

function isDue(topic: SubjectHubRetentionTopic, now: Date): boolean {
  return (
    !!topic.nextReviewAt && Date.parse(topic.nextReviewAt) <= now.getTime()
  );
}

function resolveTopicBookId(
  topicId: string | null | undefined,
  topicBookIdByTopicId: ReadonlyMap<string, string>,
): string | null {
  if (!topicId) return null;
  return topicBookIdByTopicId.get(topicId) ?? null;
}

function countSessionsByTopic(
  sessions: readonly BookSession[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (!session.topicId) continue;
    counts.set(session.topicId, (counts.get(session.topicId) ?? 0) + 1);
  }
  return counts;
}

function buildStudiedTopicIds(input: {
  bookDetails: readonly BookWithTopics[];
  sessions: readonly BookSession[];
  retentionTopics: readonly SubjectHubRetentionTopic[];
  activeTopicIds: ReadonlySet<string>;
}): Set<string> {
  const ids = new Set<string>();
  for (const detail of input.bookDetails) {
    for (const topicId of detail.completedTopicIds ?? []) {
      if (input.activeTopicIds.has(topicId)) ids.add(topicId);
    }
  }
  for (const session of input.sessions) {
    if (
      session.topicId &&
      input.activeTopicIds.has(session.topicId) &&
      session.exchangeCount >= MIN_EXCHANGES_FOR_TOPIC_COMPLETION
    ) {
      ids.add(session.topicId);
    }
  }
  for (const topic of input.retentionTopics) {
    if (
      topic.xpStatus === 'verified' &&
      input.activeTopicIds.has(topic.topicId)
    ) {
      ids.add(topic.topicId);
    }
  }
  return ids;
}

function buildInProgressTopicIds(input: {
  sessions: readonly BookSession[];
  studiedTopicIds: ReadonlySet<string>;
  activeTopicIds: ReadonlySet<string>;
}): Set<string> {
  const ids = new Set<string>();
  for (const session of input.sessions) {
    if (
      session.topicId &&
      input.activeTopicIds.has(session.topicId) &&
      !input.studiedTopicIds.has(session.topicId)
    ) {
      ids.add(session.topicId);
    }
  }
  return ids;
}

function resolveContinueTopicId(input: {
  resumeTarget: LearningResumeTarget | null | undefined;
  inProgressTopicIds: ReadonlySet<string>;
  sessions: readonly BookSession[];
}): string | null {
  if (
    input.resumeTarget?.topicId &&
    input.inProgressTopicIds.has(input.resumeTarget.topicId)
  ) {
    return input.resumeTarget.topicId;
  }

  return (
    input.sessions
      .filter(
        (session) =>
          !!session.topicId && input.inProgressTopicIds.has(session.topicId),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
      ?.topicId ?? null
  );
}

function buildChapters(input: {
  topics: readonly CurriculumTopic[];
  continueTopicId: string | null;
  upNextTopicId: string | null;
  studiedTopicIds: ReadonlySet<string>;
  inProgressTopicIds: ReadonlySet<string>;
  masteredTopicIds: ReadonlySet<string>;
  sessionCountByTopicId: ReadonlyMap<string, number>;
}): HubChapter[] {
  const grouped = new Map<string, HubTopic[]>();
  for (const topic of input.topics) {
    const chapter = topic.chapter?.trim() || 'General';
    const state: HubTopicState =
      topic.id === input.continueTopicId
        ? 'continue-now'
        : input.inProgressTopicIds.has(topic.id)
          ? 'started'
          : topic.id === input.upNextTopicId
            ? 'up-next'
            : input.masteredTopicIds.has(topic.id)
              ? 'mastered'
              : input.studiedTopicIds.has(topic.id)
                ? 'done'
                : 'later';
    const topics = grouped.get(chapter) ?? [];
    topics.push({
      topic,
      state,
      sessionCount: input.sessionCountByTopicId.get(topic.id) ?? 0,
    });
    grouped.set(chapter, topics);
  }

  return [...grouped.entries()].map(([chapter, topics]) => ({
    chapter,
    topics: topics.sort((a, b) => byTopicSort(a.topic, b.topic)),
  }));
}

function buildNextUp(input: {
  resumeTarget: LearningResumeTarget | null | undefined;
  reviewTopicId: string | null;
  upNextTopic: CurriculumTopic | null;
  topicById: ReadonlyMap<string, CurriculumTopic>;
  topicBookIdByTopicId: ReadonlyMap<string, string>;
}): SubjectHubNextUpWithResume {
  if (input.resumeTarget?.topicId) {
    return {
      kind: 'resume',
      topicId: input.resumeTarget.topicId,
      bookId: resolveTopicBookId(
        input.resumeTarget.topicId,
        input.topicBookIdByTopicId,
      ),
      topicTitle: input.resumeTarget.topicTitle,
      resumeTarget: input.resumeTarget,
    };
  }

  if (input.reviewTopicId) {
    const topic = input.topicById.get(input.reviewTopicId);
    return {
      kind: 'review-due',
      topicId: input.reviewTopicId,
      bookId: resolveTopicBookId(
        input.reviewTopicId,
        input.topicBookIdByTopicId,
      ),
      topicTitle: topic?.title ?? null,
    };
  }

  if (input.upNextTopic) {
    return {
      kind: 'up-next',
      topicId: input.upNextTopic.id,
      bookId: input.upNextTopic.bookId,
      topicTitle: input.upNextTopic.title,
    };
  }

  return {
    kind: 'none',
    topicId: null,
    bookId: null,
    topicTitle: null,
  };
}

export function buildSubjectHubData({
  subjectId,
  subjectName,
  bookDetails,
  sessionsByBookId,
  retentionTopics,
  resumeTarget,
  notes,
  now = new Date(),
}: BuildSubjectHubDataInput): SubjectHubDataWithResume {
  const topics = bookDetails
    .flatMap((detail) => detail.topics)
    .filter(isActiveTopic)
    .sort(byTopicSort);
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const topicBookIdByTopicId = new Map(
    topics.map((topic) => [topic.id, topic.bookId]),
  );
  const activeTopicIds = new Set(topics.map((topic) => topic.id));
  const sessions = [...sessionsByBookId.values()].flat();
  const sessionCountByTopicId = countSessionsByTopic(sessions);
  const studiedTopicIds = buildStudiedTopicIds({
    bookDetails,
    sessions,
    retentionTopics,
    activeTopicIds,
  });
  const masteredTopicIds = new Set(
    retentionTopics
      .filter(
        (topic) => !!topic.masteredAt && activeTopicIds.has(topic.topicId),
      )
      .map((topic) => topic.topicId),
  );
  const inProgressTopicIds = buildInProgressTopicIds({
    sessions,
    studiedTopicIds,
    activeTopicIds,
  });
  const continueTopicId = resolveContinueTopicId({
    resumeTarget,
    inProgressTopicIds,
    sessions,
  });
  const upNextTopic =
    continueTopicId == null
      ? computeUpNextTopic(
          topics,
          studiedTopicIds,
          inProgressTopicIds,
          sessions,
        )
      : null;
  const reviewTopicId =
    retentionTopics
      .filter((topic) => activeTopicIds.has(topic.topicId) && isDue(topic, now))
      .sort(
        (a, b) =>
          Date.parse(a.nextReviewAt ?? '') - Date.parse(b.nextReviewAt ?? ''),
      )[0]?.topicId ?? null;
  const chapters = buildChapters({
    topics,
    continueTopicId,
    upNextTopicId: upNextTopic?.id ?? null,
    studiedTopicIds,
    inProgressTopicIds,
    masteredTopicIds,
    sessionCountByTopicId,
  });
  const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  return {
    subjectId,
    subjectName,
    aggregate: {
      mastered: masteredTopicIds.size,
      learning: [...inProgressTopicIds].filter(
        (topicId) => !masteredTopicIds.has(topicId),
      ).length,
      total: topics.length,
      reviewsDue: retentionTopics.filter(
        (topic) => activeTopicIds.has(topic.topicId) && isDue(topic, now),
      ).length,
      weeklyMasteredDelta: retentionTopics.filter(
        (topic) =>
          !!topic.masteredAt &&
          Date.parse(topic.masteredAt) >= weekStart &&
          Date.parse(topic.masteredAt) <= now.getTime() &&
          activeTopicIds.has(topic.topicId),
      ).length,
      recentPracticePoints: null,
    },
    nextUp: buildNextUp({
      resumeTarget,
      reviewTopicId,
      upNextTopic,
      topicById,
      topicBookIdByTopicId,
    }),
    chapters,
    showSearchFilter:
      chapters.length >= SEARCH_CHAPTER_THRESHOLD ||
      topics.length >= SEARCH_TOPIC_THRESHOLD,
    notes: [...notes],
    canStudy: true,
  };
}

export function useSubjectHub(subjectId: string | undefined): {
  data: SubjectHubDataWithResume | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const subjectsQuery = useSubjects({ enabled: !!subjectId });
  const booksQuery = useBooks(subjectId);
  const retentionQuery = useRetentionTopics(subjectId ?? '');
  const resumeTargetQuery = useLearningResumeTarget({ subjectId });
  const notesQuery = useSubjectNotes(subjectId);

  const books = booksQuery.data ?? [];
  const generatedBooks = books.filter((book) => book.topicsGenerated);

  const bookDetailQueries = useQueries({
    queries: generatedBooks.map((book) => ({
      queryKey: ['book', subjectId, book.id, activeProfile?.id],
      enabled: !!activeProfile && !!subjectId,
      queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
        if (!subjectId) throw new Error('subjectId is required');
        const { signal, cleanup } = combinedSignal(querySignal);
        try {
          const res = await client.subjects[':subjectId'].books[':bookId'].$get(
            { param: { subjectId, bookId: book.id } },
            { init: { signal } },
          );
          await assertOk(res);
          return (await res.json()) as BookWithTopics;
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
      queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
        if (!subjectId) throw new Error('subjectId is required');
        const { signal, cleanup } = combinedSignal(querySignal);
        try {
          const res = await client.subjects[':subjectId'].books[
            ':bookId'
          ].sessions.$get(
            { param: { subjectId, bookId: book.id } },
            { init: { signal } },
          );
          await assertOk(res);
          const data = (await res.json()) as { sessions: BookSession[] };
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
      sessionsByBookId.set(
        generatedBooks[i]!.id,
        bookSessionQueries[i]?.data ?? [],
      );
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
    });
  }, [
    bookDetailQueries,
    bookSessionQueries,
    books,
    generatedBooks,
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

  return {
    data,
    isLoading,
    isError,
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
