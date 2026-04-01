import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type {
  AccountDeletionResponse,
  CancelDeletionResponse,
  DataExport,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';

export function useDeleteAccount(): UseMutationResult<
  AccountDeletionResponse,
  Error,
  void
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<AccountDeletionResponse> => {
      const res = await client.account.delete.$post({ json: {} });
      await assertOk(res);
      return (await res.json()) as AccountDeletionResponse;
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
      await assertOk(res);
      return (await res.json()) as CancelDeletionResponse;
    },
  });
}

export function useExportData(): UseMutationResult<DataExport, Error, void> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<DataExport> => {
      const res = await client.account.export.$get();
      await assertOk(res);
      return (await res.json()) as DataExport;
    },
  });
}
