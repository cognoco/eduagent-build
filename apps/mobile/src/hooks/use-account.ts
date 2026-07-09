import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import {
  accountDeletionStatusResponseSchema,
  type AccountDeletionStatusResponse,
} from '@eduagent/schemas';
import type {
  AccountDeletionResponse,
  CancelDeletionResponse,
  DataExport,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { combinedSignal } from '../lib/query-timeout';

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
    retry: 1,
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
        return accountDeletionStatusResponseSchema.parse(await res.json());
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
      return (await res.json()) as DataExport;
    },
  });
}
