import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';

interface MoveTopicInput {
  subjectId: string;
  bookId: string;
  topicId: string;
  targetBookId: string;
}

export function useMoveTopic() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subjectId,
      bookId,
      topicId,
      targetBookId,
    }: MoveTopicInput) => {
      const res = await client.subjects[':subjectId'].books[':bookId'].topics[
        ':topicId'
      ].move.$patch({
        param: { subjectId, bookId, topicId },
        json: { targetBookId },
      });
      await assertOk(res);
      return (await res.json()) as {
        moved: boolean;
        topicId: string;
        targetBookId: string;
      };
    },
    onSuccess: (_data, variables) => {
      // Invalidate both source and target book queries
      void queryClient.invalidateQueries({
        queryKey: ['book-sessions', variables.subjectId, variables.bookId],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'book-sessions',
          variables.subjectId,
          variables.targetBookId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: ['book', variables.subjectId, variables.bookId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['book', variables.subjectId, variables.targetBookId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['books', variables.subjectId],
      });
    },
  });
}
