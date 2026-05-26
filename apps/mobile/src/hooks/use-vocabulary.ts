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
  const { activeProfile } = useProfile();

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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.vocabulary.subject(activeProfile?.id, subjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.languageProgress.subject(
          activeProfile?.id,
          subjectId,
        ),
      });
    },
  });
}

export function useReviewVocabulary(subjectId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

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
    // [BUG-535] Profile-scoped, subject-scoped invalidation. The previous
    // bare ['vocabulary'] / ['language-progress'] keys matched every profile's
    // cached entry on a shared device — broad-prefix matching crossed account
    // boundaries and ratcheted excess network. Use the canonical typed keys
    // from query-keys.ts so invalidation targets only the active profile's
    // cache entry for `subjectId`.
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.vocabulary.subject(activeProfile?.id, subjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.languageProgress.subject(
          activeProfile?.id,
          subjectId,
        ),
      });
    },
  });
}

export function useDeleteVocabulary(subjectId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (vocabularyId: string) => {
      const res = await client.subjects[':subjectId'].vocabulary[
        ':vocabularyId'
      ].$delete({
        param: { subjectId, vocabularyId },
      });
      await assertOk(res);
    },
    // [BUG-535] See useReviewVocabulary above — same profile-scoping fix.
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.vocabulary.subject(activeProfile?.id, subjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.languageProgress.subject(
          activeProfile?.id,
          subjectId,
        ),
      });
    },
  });
}
