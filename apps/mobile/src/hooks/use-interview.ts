import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

interface InterviewState {
  draftId: string;
  status: 'in_progress' | 'completed' | 'expired';
  exchangeCount: number;
  subjectName: string;
}

interface InterviewResponse {
  response: string;
  isComplete: boolean;
  exchangeCount: number;
}

export function useInterviewState(
  subjectId: string
): UseQueryResult<InterviewState | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['interview', subjectId, activeProfile?.id],
    queryFn: async () => {
      const res = await client.subjects[':subjectId'].interview.$get({
        param: { subjectId },
      });
      const data = await res.json();
      return data.state;
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useSendInterviewMessage(
  subjectId: string
): UseMutationResult<InterviewResponse, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (message: string) => {
      const res = await client.subjects[':subjectId'].interview.$post({
        param: { subjectId },
        json: { message },
      });
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['interview', subjectId],
      });
    },
  });
}
