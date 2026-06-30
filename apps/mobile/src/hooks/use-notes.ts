// ---------------------------------------------------------------------------
// Topic notes React Query hooks
// ---------------------------------------------------------------------------

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  AllNotesResponse,
  BookNotesResponse,
  ConceptMasterySignalsResponse,
  TopicNotesResponse,
  CreateNoteInput,
  NoteResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useApiQuery } from './use-api-query';
import { useProfile } from '../lib/profile';
import { queryKeys } from '../lib/query-keys';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

// ---------------------------------------------------------------------------
// useBookNotes — fetch all notes for a given book
// ---------------------------------------------------------------------------

export function useAllNotes(options?: {
  subjectId?: string;
  limit?: number;
}): UseInfiniteQueryResult<InfiniteData<AllNotesResponse>, Error> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useInfiniteQuery({
    queryKey: ['all-notes', activeProfile?.id, options?.subjectId],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.notes.$get(
          {
            query: {
              ...(pageParam ? { cursor: pageParam } : {}),
              ...(options?.subjectId ? { subjectId: options.subjectId } : {}),
              ...(options?.limit ? { limit: String(options.limit) } : {}),
            },
          },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as AllNotesResponse;
      } finally {
        cleanup();
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!activeProfile,
  });
}

export function useBookNotes(
  subjectId: string | undefined,
  bookId: string | undefined,
): UseQueryResult<BookNotesResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<BookNotesResponse>({
    queryKey: ['book-notes', subjectId, bookId, activeProfile?.id],
    fetch: (signal) =>
      client.subjects[':subjectId'].books[':bookId'].notes.$get(
        { param: { subjectId: subjectId ?? '', bookId: bookId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json,
    enabled: !!subjectId && !!bookId,
  });
}

// ---------------------------------------------------------------------------
// useGetTopicNote — fetch a single note for a specific topic (FR68)
// ---------------------------------------------------------------------------

export function useGetTopicNote(
  subjectId: string | undefined,
  topicId: string | undefined,
): UseQueryResult<{
  note: {
    id: string;
    topicId: string;
    content: string;
    updatedAt: string;
  } | null;
}> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{
    note: {
      id: string;
      topicId: string;
      content: string;
      updatedAt: string;
    } | null;
  }>({
    queryKey: ['topic-note', subjectId, topicId, activeProfile?.id],
    fetch: (signal) =>
      client.subjects[':subjectId'].topics[':topicId'].note.$get(
        { param: { subjectId: subjectId ?? '', topicId: topicId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json,
    enabled: !!subjectId && !!topicId,
  });
}

// ---------------------------------------------------------------------------
// useNoteTopicIds — get the set of topic IDs that have notes for this profile
// ---------------------------------------------------------------------------

export function useNoteTopicIds(): UseQueryResult<{ topicIds: string[] }> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{ topicIds: string[] }>({
    queryKey: ['note-topic-ids', activeProfile?.id],
    fetch: (signal) => client.notes['topic-ids'].$get({}, { init: { signal } }),
    select: (json) => json,
  });
}

export function useConceptMasterySignals(
  topicIds: string[],
): UseQueryResult<ConceptMasterySignalsResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const sortedTopicIds = useMemo(
    () => [...new Set(topicIds)].sort(),
    [topicIds],
  );

  return useApiQuery<ConceptMasterySignalsResponse>({
    queryKey: queryKeys.library.conceptMastery(
      activeProfile?.id,
      sortedTopicIds,
    ),
    enabled: sortedTopicIds.length > 0,
    fetch: (signal) =>
      client.notes['concept-mastery'].$get(
        { query: { topicIds: sortedTopicIds.join(',') } },
        { init: { signal } },
      ),
    select: (json) => json,
  });
}

// ---------------------------------------------------------------------------
// Multi-note CRUD hooks (Library v3)
// ---------------------------------------------------------------------------

export function useTopicNotes(
  subjectId: string | undefined,
  topicId: string | undefined,
): UseQueryResult<TopicNotesResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<TopicNotesResponse>({
    queryKey: ['topic-notes', subjectId, topicId, activeProfile?.id],
    fetch: (signal) =>
      client.subjects[':subjectId'].topics[':topicId'].notes.$get(
        { param: { subjectId: subjectId ?? '', topicId: topicId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json,
    enabled: !!subjectId && !!topicId,
  });
}

export function useCreateNote(
  subjectId: string | undefined,
  bookId: string | undefined,
): UseMutationResult<
  { note: NoteResponse },
  Error,
  { topicId: string } & CreateNoteInput
> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ topicId, content, sessionId }) => {
      if (!subjectId || !topicId)
        throw new Error('subjectId and topicId are required');
      const res = await client.subjects[':subjectId'].topics[
        ':topicId'
      ].notes.$post({
        param: { subjectId, topicId },
        json: { content, ...(sessionId ? { sessionId } : {}) },
      });
      await assertOk(res);
      return (await res.json()) as { note: NoteResponse };
    },
    onSuccess: (_data, { topicId }) => {
      if (bookId) {
        void queryClient.invalidateQueries({
          queryKey: ['book-notes', subjectId, bookId, activeProfile?.id],
        });
      } else {
        void queryClient.invalidateQueries({
          queryKey: ['book-notes', subjectId],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ['topic-notes', subjectId, topicId, activeProfile?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['note-topic-ids', activeProfile?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['all-notes', activeProfile?.id],
      });
    },
  });
}

export function useUpdateNote(): UseMutationResult<
  { note: NoteResponse },
  Error,
  { noteId: string; content: string }
> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, content }) => {
      const res = await client.notes[':noteId'].$patch({
        param: { noteId },
        json: { content },
      });
      await assertOk(res);
      return (await res.json()) as { note: NoteResponse };
    },
    onSuccess: () => {
      // [BUG-163] Scope invalidations by active profile id so a mutation on
      // this profile cannot invalidate another profile's note caches on a
      // shared device. Note keys all carry profileId as a leading or
      // trailing key segment; we use a predicate so we match both
      // ['book-notes', subjectId, bookId, profileId] and
      // ['all-notes', profileId, subjectId] without enumerating every
      // (subjectId, bookId, topicId) combination.
      const pid = activeProfile?.id;
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (typeof key[0] !== 'string') return false;
          if (
            key[0] !== 'book-notes' &&
            key[0] !== 'topic-notes' &&
            key[0] !== 'all-notes'
          ) {
            return false;
          }
          // Match this profile's keys only — every note query factory
          // includes profileId somewhere in the key tuple.
          return key.some((segment) => segment === pid);
        },
      });
    },
  });
}

export function useDeleteNoteById(): UseMutationResult<void, Error, string> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      const res = await client.notes[':noteId'].$delete({
        param: { noteId },
      });
      await assertOk(res);
    },
    onSuccess: () => {
      // [BUG-163] Scope invalidations by active profile id — see useUpdateNote.
      const pid = activeProfile?.id;
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (typeof key[0] !== 'string') return false;
          if (
            key[0] !== 'book-notes' &&
            key[0] !== 'topic-notes' &&
            key[0] !== 'note-topic-ids' &&
            key[0] !== 'all-notes'
          ) {
            return false;
          }
          return key.some((segment) => segment === pid);
        },
      });
    },
  });
}
