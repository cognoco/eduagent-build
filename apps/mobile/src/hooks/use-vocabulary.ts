import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Vocabulary,
  VocabularyCreateInput,
  VocabularyReviewInput,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useVocabulary(subjectId: string) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['vocabulary', activeProfile?.id, subjectId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].vocabulary.$get({
          param: { subjectId },
          init: { signal },
        } as never);
        await assertOk(res);
        const data = (await res.json()) as { vocabulary: Vocabulary[] };
        return data.vocabulary;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useCreateVocabulary(subjectId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: VocabularyCreateInput) => {
      const res = await client.subjects[':subjectId'].vocabulary.$post({
        param: { subjectId },
        json: input,
      });
      await assertOk(res);
      const data = (await res.json()) as { vocabulary: Vocabulary };
      return data.vocabulary;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
    },
  });
}

export function useReviewVocabulary(subjectId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      vocabularyId,
      input,
    }: {
      vocabularyId: string;
      input: VocabularyReviewInput;
    }) => {
      const res = await client.subjects[':subjectId'].vocabulary[
        ':vocabularyId'
      ].review.$post({
        param: { subjectId, vocabularyId },
        json: input,
      });
      await assertOk(res);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      void queryClient.invalidateQueries({ queryKey: ['language-progress'] });
    },
  });
}
