import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';
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
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['interview', subjectId, activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ state: InterviewState | null }>(
        `/subjects/${subjectId}/interview`
      );
      return data.state;
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useSendInterviewMessage(
  subjectId: string
): UseMutationResult<InterviewResponse, Error, string> {
  const { post } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (message: string) =>
      post<InterviewResponse>(`/subjects/${subjectId}/interview`, {
        message,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['interview', subjectId],
      });
    },
  });
}
