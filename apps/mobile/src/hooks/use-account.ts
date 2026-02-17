import { useMutation } from '@tanstack/react-query';
import type { AccountDeletionResponse, DataExport } from '@eduagent/schemas';
import { useApi } from '../lib/auth-api';

interface CancelDeletionResponse {
  message: string;
}

export function useDeleteAccount() {
  const { post } = useApi();

  return useMutation({
    mutationFn: async (): Promise<AccountDeletionResponse> => {
      return post<AccountDeletionResponse>('/account/delete', {});
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
