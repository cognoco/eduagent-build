import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import {
  accountDeletionResponseSchema,
  accountDeletionStatusResponseSchema,
  cancelDeletionResponseSchema,
  dataExportSchema,
  type AccountDeletionStatusResponse,
  type AccountDeletionResponse,
  type CancelDeletionResponse,
  type DataExport,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { NetworkError } from '../lib/api-errors';
import { assertOk } from '../lib/assert-ok';
import { combinedSignal } from '../lib/query-timeout';
import { parseJson } from '../lib/parse-json';

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
      return parseJson(
        res,
        accountDeletionResponseSchema,
        'POST /account/delete',
      );
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
      return parseJson(
        res,
        cancelDeletionResponseSchema,
        'POST /account/cancel-deletion',
      );
    },
  });
}

export function useDeletionStatus(): UseQueryResult<
  AccountDeletionStatusResponse,
  Error
> {
  const client = useApiClient();
  // [BUG-126 / BUG-159] Scope the cache by Clerk userId so a previous user's
  // deletion-status cache cannot be served stale to the next signed-in user on
  // a shared device. Mirrors the use-profiles.ts pattern documented in
  // memory/project_cross_account_leak_2026_05_10.md.
  const { isSignedIn, userId } = useAuth();

  return useQuery({
    queryKey: ['account', 'deletion-status', userId],
    staleTime: 30_000,
    retry: (failureCount, error) =>
      !(error instanceof NetworkError) && failureCount < 1,
    retryDelay: 250,
    queryFn: async ({
      signal: querySignal,
    }): Promise<AccountDeletionStatusResponse> => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.account['deletion-status'].$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        return parseJson(
          res,
          accountDeletionStatusResponseSchema,
          'GET /account/deletion-status',
        );
      } finally {
        cleanup();
      }
    },
    enabled: !!isSignedIn,
  });
}

export function useExportData(): UseMutationResult<DataExport, Error, void> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<DataExport> => {
      const res = await client.account.export.$get();
      await assertOk(res);
      return parseJson(res, dataExportSchema, 'GET /account/export');
    },
  });
}
