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
import type {
  BookNotesResponse,
  TopicNotesResponse,
  CreateNoteInput,
  NoteResponse,
} from '@eduagent/schemas';
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
// useGetTopicNote — fetch a single note for a specific topic (FR68)
// ---------------------------------------------------------------------------

export function useGetTopicNote(
  subjectId: string | undefined,
  topicId: string | undefined
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

  return useQuery({
    queryKey: ['topic-note', subjectId, topicId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId || !topicId)
        throw new Error('subjectId and topicId are required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].topics[
          ':topicId'
        ].note.$get({ param: { subjectId, topicId } }, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as {
          note: {
            id: string;
            topicId: string;
            content: string;
            updatedAt: string;
          } | null;
        };
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!topicId,
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
// Multi-note CRUD hooks (Library v3)
// ---------------------------------------------------------------------------

export function useTopicNotes(
  subjectId: string | undefined,
  topicId: string | undefined
): UseQueryResult<TopicNotesResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['topic-notes', subjectId, topicId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId || !topicId)
        throw new Error('subjectId and topicId required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].topics[
          ':topicId'
        ].notes.$get({ param: { subjectId, topicId } }, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as TopicNotesResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!topicId,
  });
}

export function useCreateNote(
  subjectId: string | undefined,
  bookId: string | undefined
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
    },
  });
}

export function useUpdateNote(): UseMutationResult<
  { note: NoteResponse },
  Error,
  { noteId: string; content: string }
> {
  const client = useApiClient();
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
      void queryClient.invalidateQueries({ queryKey: ['book-notes'] });
      void queryClient.invalidateQueries({ queryKey: ['topic-notes'] });
    },
  });
}

export function useDeleteNoteById(): UseMutationResult<void, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      const res = await client.notes[':noteId'].$delete({
        param: { noteId },
      });
      await assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['book-notes'] });
      void queryClient.invalidateQueries({ queryKey: ['topic-notes'] });
      void queryClient.invalidateQueries({ queryKey: ['note-topic-ids'] });
    },
  });
}
