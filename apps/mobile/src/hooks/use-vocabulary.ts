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
import { queryKeys } from '../lib/query-keys';

export function useVocabulary(subjectId: string) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: queryKeys.vocabulary.subject(activeProfile?.id, subjectId),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].vocabulary.$get(
          { param: { subjectId } },
          { init: { signal } },
        );
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
      // PR-10 deferred: broad ['language-progress'] — review affects the per-subject
      // language progress for `subjectId`, which maps to
      // queryKeys.languageProgress.subject(activeProfileId, subjectId). But
      // activeProfileId is not available here (useReviewVocabulary does not call
      // useProfile). Keep broad until a workflow test proves the precise key.
      void queryClient.invalidateQueries({ queryKey: ['language-progress'] });
    },
  });
}

export function useDeleteVocabulary(subjectId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vocabularyId: string) => {
      const res = await client.subjects[':subjectId'].vocabulary[
        ':vocabularyId'
      ].$delete({
        param: { subjectId, vocabularyId },
      });
      await assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      // PR-10 deferred: broad ['language-progress'] — same reason as
      // useReviewVocabulary above: activeProfileId not in scope here.
      void queryClient.invalidateQueries({ queryKey: ['language-progress'] });
    },
  });
}
