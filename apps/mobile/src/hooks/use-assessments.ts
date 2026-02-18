import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Assessment } from '@eduagent/schemas';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

export function useAssessment(assessmentId: string) {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['assessment', assessmentId, activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ assessment: Assessment }>(
        `/assessments/${assessmentId}`
      );
      return data.assessment;
    },
    enabled: !!activeProfile && !!assessmentId,
  });
}

export function useCreateAssessment(subjectId: string, topicId: string) {
  const { post } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      post<{ assessment: Assessment }>(
        `/subjects/${subjectId}/topics/${topicId}/assessments`,
        { subjectId, topicId }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assessment'] });
      void queryClient.invalidateQueries({
        queryKey: ['progress', 'subject', subjectId],
      });
    },
  });
}

export function useSubmitAnswer(assessmentId: string) {
  const { post } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { answer: string }) =>
      post<{
        result: {
          passed: boolean;
          masteryScore: number;
          feedback: string;
        };
      }>(`/assessments/${assessmentId}/answer`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['assessment', assessmentId],
      });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}
