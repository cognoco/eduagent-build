// ---------------------------------------------------------------------------
// Topic notes React Query hooks
// ---------------------------------------------------------------------------

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { BookNotesResponse, UpsertNoteInput } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

// ---------------------------------------------------------------------------
// useBookNotes — fetch all notes for a given book
// ---------------------------------------------------------------------------

export function useBookNotes(
  subjectId: string | undefined,
  bookId: string | undefined
): UseQueryResult<BookNotesResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['book-notes', subjectId, bookId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId || !bookId)
        throw new Error('subjectId and bookId are required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].books[
          ':bookId'
        ].notes.$get({ param: { subjectId, bookId } }, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as BookNotesResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!bookId,
  });
}

// ---------------------------------------------------------------------------
// useUpsertNote — create or update a note for a topic
// ---------------------------------------------------------------------------

type UpsertNoteVariables = { topicId: string } & UpsertNoteInput;

export function useUpsertNote(
  subjectId: string | undefined,
  bookId: string | undefined
): UseMutationResult<unknown, Error, UpsertNoteVariables> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ topicId, content, append }: UpsertNoteVariables) => {
      if (!subjectId || !topicId)
        throw new Error('subjectId and topicId are required');
      const res = await client.subjects[':subjectId'].topics[
        ':topicId'
      ].note.$put({
        param: { subjectId, topicId },
        json: { content, ...(append !== undefined ? { append } : {}) },
      });
      await assertOk(res);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['book-notes', subjectId, bookId, activeProfile?.id],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useNoteTopicIds — get the set of topic IDs that have notes for this profile
// ---------------------------------------------------------------------------

export function useNoteTopicIds(): UseQueryResult<{ topicIds: string[] }> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['note-topic-ids', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.notes['topic-ids'].$get(
          {},
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as { topicIds: string[] };
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

// ---------------------------------------------------------------------------
// useDeleteNote — delete a note for a topic
// ---------------------------------------------------------------------------

export function useDeleteNote(
  subjectId: string | undefined,
  bookId: string | undefined
): UseMutationResult<void, Error, string> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (topicId: string) => {
      if (!subjectId || !topicId)
        throw new Error('subjectId and topicId are required');
      const res = await client.subjects[':subjectId'].topics[
        ':topicId'
      ].note.$delete({
        param: { subjectId, topicId },
      });
      await assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['book-notes', subjectId, bookId, activeProfile?.id],
      });
    },
  });
}
