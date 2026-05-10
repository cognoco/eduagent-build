import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  SubscriptionTier,
  SubscriptionStatus,
  Subscription,
  Usage,
  FamilySubscription,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

// ---------------------------------------------------------------------------
// Types — prefer imports from @eduagent/schemas; local only for API-specific shapes
// ---------------------------------------------------------------------------

export type { SubscriptionTier, SubscriptionStatus };
export type SubscriptionData = Subscription;
export type UsageData = Usage;

/** Matches the warningLevel enum from @eduagent/schemas usageSchema */
export type WarningLevel = 'none' | 'soft' | 'hard' | 'exceeded';

interface ByokWaitlistResult {
  message: string;
  email: string;
}

interface RemoveFamilyProfileResult {
  message: string;
  removedProfileId: string;
}

// ---------------------------------------------------------------------------
// Shared fetchers (used by hooks and polling)
// ---------------------------------------------------------------------------

type ApiClient = ReturnType<typeof useApiClient>;

/** Fetch current usage data — shared by useUsage and top-up polling. */
export async function fetchUsageData(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<UsageData> {
  const res = await client.usage.$get({}, { init: { signal } });
  await assertOk(res);
  const data = await res.json();
  return data.usage;
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useSubscription(): UseQueryResult<SubscriptionData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['subscription', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subscription.$get({}, { init: { signal } });
        await assertOk(res);
        const data = await res.json();
        return data.subscription;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useUsage(): UseQueryResult<UsageData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['usage', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        return await fetchUsageData(client, signal);
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useFamilySubscription(
  enabled = true,
): UseQueryResult<FamilySubscription | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['subscription-family', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const familyClient = client.subscription.family as {
          $get: (input: { init: { signal: AbortSignal } }) => Promise<Response>;
        };
        const res = await familyClient.$get({
          init: { signal },
        });
        // 404 = no family subscription exists — not an error
        // (handles non-throwing environments such as test mocks)
        if (res.status === 404) {
          return null;
        }
        await assertOk(res);
        const data = await res.json();
        return data.family as FamilySubscription;
      } catch (error) {
        // Production api-client throws before returning the Response, so the
        // res.status === 404 check above is unreachable in production.
        // Catch the thrown error here instead.
        if (
          error instanceof Error &&
          error.message.startsWith('API error 404')
        ) {
          return null;
        }
        throw error;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && enabled,
  });
}

/** Lightweight subscription status for header badges — KV-backed (fast). */
export interface SubscriptionStatusData {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  monthlyLimit: number;
  usedThisMonth: number;
}

export function useSubscriptionStatus(): UseQueryResult<SubscriptionStatusData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['subscription-status', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subscription.status.$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        const data = await res.json();
        return data.status;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    staleTime: 60_000, // 1 min — fast endpoint, no need for aggressive refetching
  });
}

export function useJoinByokWaitlist(): UseMutationResult<
  ByokWaitlistResult,
  Error,
  void
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async () => {
      const res = await client['byok-waitlist'].$post({ json: {} });
      await assertOk(res);
      return (await res.json()) as ByokWaitlistResult;
    },
  });
}

export function useRemoveFamilyProfile(): UseMutationResult<
  RemoveFamilyProfileResult,
  Error,
  string
> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileId: string) => {
      const familyClient = client.subscription.family as {
        remove: {
          $post: (input: { json: { profileId: string } }) => Promise<Response>;
        };
      };
      const res = await familyClient.remove.$post({ json: { profileId } });
      await assertOk(res);
      return (await res.json()) as RemoveFamilyProfileResult;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profiles'] }),
        queryClient.invalidateQueries({
          queryKey: ['subscription-family', activeProfile?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['subscription', activeProfile?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['usage', activeProfile?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['revenuecat', 'customerInfo'],
        }),
      ]);
    },
  });
}
