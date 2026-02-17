import { useMutation } from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';

interface DeletionResponse {
  message: string;
  gracePeriodEnds: string;
}

interface CancelDeletionResponse {
  message: string;
}

interface DataExport {
  account: { email: string; createdAt: string };
  profiles: unknown[];
  consentStates: unknown[];
  exportedAt: string;
}

export function useDeleteAccount() {
  const { post } = useApi();

  return useMutation({
    mutationFn: async (): Promise<DeletionResponse> => {
      return post<DeletionResponse>('/account/delete', {});
    },
  });
}

export function useCancelDeletion() {
  const { post } = useApi();

  return useMutation({
    mutationFn: async (): Promise<CancelDeletionResponse> => {
      return post<CancelDeletionResponse>('/account/cancel-deletion', {});
    },
  });
}

export function useExportData() {
  const { get } = useApi();

  return useMutation({
    mutationFn: async (): Promise<DataExport> => {
      return get<DataExport>('/account/export');
    },
  });
}
