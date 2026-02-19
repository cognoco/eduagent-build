import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Assessment } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

export function useAssessment(
  assessmentId: string
): UseQueryResult<Assessment> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['assessment', assessmentId, activeProfile?.id],
    queryFn: async () => {
      const res = await client.assessments[':assessmentId'].$get({
        param: { assessmentId },
      });
      const data = await res.json();
      return data.assessment;
    },
    enabled: !!activeProfile && !!assessmentId,
  });
}

export function useCreateAssessment(subjectId: string, topicId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await client.subjects[':subjectId'].topics[
        ':topicId'
      ].assessments.$post({
        param: { subjectId, topicId },
        json: { subjectId, topicId },
      });
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assessment'] });
      void queryClient.invalidateQueries({
        queryKey: ['progress', 'subject', subjectId],
      });
    },
  });
}

export function useSubmitAnswer(assessmentId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { answer: string }) => {
      const res = await client.assessments[':assessmentId'].answer.$post({
        param: { assessmentId },
        json: input,
      });
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['assessment', assessmentId],
      });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}
