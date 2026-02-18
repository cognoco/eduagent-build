import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type {
  AccountDeletionResponse,
  CancelDeletionResponse,
  DataExport,
} from '@eduagent/schemas';
import { useApi } from '../lib/auth-api';

export function useDeleteAccount(): UseMutationResult<
  AccountDeletionResponse,
  Error,
  void
> {
  const { post } = useApi();

  return useMutation({
    mutationFn: async (): Promise<AccountDeletionResponse> => {
      return post<AccountDeletionResponse>('/account/delete', {});
    },
  });
}

export function useCancelDeletion(): UseMutationResult<
  CancelDeletionResponse,
  Error,
  void
> {
  const { post } = useApi();

  return useMutation({
    mutationFn: async (): Promise<CancelDeletionResponse> => {
      return post<CancelDeletionResponse>('/account/cancel-deletion', {});
    },
  });
}

export function useExportData(): UseMutationResult<DataExport, Error, void> {
  const { get } = useApi();

  return useMutation({
    mutationFn: async (): Promise<DataExport> => {
      return get<DataExport>('/account/export');
    },
  });
}
