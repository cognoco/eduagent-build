import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type {
  AccountDeletionResponse,
  CancelDeletionResponse,
  DataExport,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';

export function useDeleteAccount(): UseMutationResult<
  AccountDeletionResponse,
  Error,
  void
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<AccountDeletionResponse> => {
      const res = await client.account.delete.$post({ json: {} });
      return await res.json();
    },
  });
}

export function useCancelDeletion(): UseMutationResult<
  CancelDeletionResponse,
  Error,
  void
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<CancelDeletionResponse> => {
      const res = await client.account['cancel-deletion'].$post({ json: {} });
      return await res.json();
    },
  });
}

export function useExportData(): UseMutationResult<DataExport, Error, void> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<DataExport> => {
      const res = await client.account.export.$get();
      return await res.json();
    },
  });
}
