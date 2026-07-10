import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import type {
  SubscriptionTier,
  SubscriptionStatus,
  Subscription,
  Usage,
  FamilySubscription,
  SubscriptionStatusResponse,
} from '@eduagent/schemas';
import {
  byokWaitlistResponseSchema,
  familyRemoveResponseSchema,
  familyResponseSchema,
  subscriptionResponseSchema,
  subscriptionStatusResponseSchema,
  usageResponseSchema,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { NotFoundError } from '../lib/api-errors';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { queryKeys } from '../lib/query-keys';
import { parseJson } from '../lib/parse-json';
import { useApiQuery } from './use-api-query';

// ---------------------------------------------------------------------------
// Types — prefer imports from @eduagent/schemas; local only for API-specific shapes
// ---------------------------------------------------------------------------

export type { SubscriptionTier, SubscriptionStatus };
export type SubscriptionData = Subscription;
export type UsageData = Usage;

/** Matches the warningLevel enum from @eduagent/schemas usageSchema */
// [BUG-640] 'top-up-available': monthly exhausted but credits remain
export type WarningLevel =
  | 'none'
  | 'soft'
  | 'hard'
  | 'exceeded'
  | 'top-up-available';

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
  const data = await parseJson(res, usageResponseSchema, 'GET /usage');
  return data.usage;
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useSubscription(): UseQueryResult<SubscriptionData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{ subscription: SubscriptionData }, SubscriptionData>({
    queryKey: queryKeys.subscription(activeProfile?.id),
    schema: subscriptionResponseSchema,
    fetch: (signal) => client.subscription.$get({}, { init: { signal } }),
    select: (json) => json.subscription,
  });
}

export function useUsage(): UseQueryResult<UsageData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{ usage: UsageData }, UsageData>({
    queryKey: queryKeys.usage(activeProfile?.id),
    schema: usageResponseSchema,
    fetch: (signal) => client.usage.$get({}, { init: { signal } }),
    select: (json) => json.usage,
  });
}

export function useFamilySubscription(
  enabled = true,
): UseQueryResult<FamilySubscription | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: queryKeys.subscriptionFamily(activeProfile?.id),
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
        const data = await parseJson(
          res,
          familyResponseSchema,
          'GET /subscription/family',
        );
        return data.family;
      } catch (error) {
        // [BUG-160] Production api-client throws before returning the Response,
        // so the res.status === 404 check above is unreachable in production.
        // Classify on the raw typed error (per AGENTS.md "Classify errors
        // before formatting") instead of string-matching the formatted message,
        // which is fragile when the formatter changes.
        if (error instanceof NotFoundError) {
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
export type SubscriptionStatusData = SubscriptionStatusResponse['status'];

export function useSubscriptionStatus(options?: {
  enabled?: boolean;
}): UseQueryResult<SubscriptionStatusData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: queryKeys.subscriptionStatus(activeProfile?.id),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subscription.status.$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        const data = await parseJson(
          res,
          subscriptionStatusResponseSchema,
          'GET /subscription/status',
        );
        return data.status;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && (options?.enabled ?? true),
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
      return parseJson(res, byokWaitlistResponseSchema, 'POST /byok-waitlist');
    },
  });
}

export function useRemoveFamilyProfile(): UseMutationResult<
  RemoveFamilyProfileResult,
  Error,
  string
> {
  const client = useApiClient();
  const { userId } = useAuth();
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
      return parseJson(
        res,
        familyRemoveResponseSchema,
        'POST /subscription/family/remove',
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.profiles.list(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.subscriptionFamily(activeProfile?.id),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.subscription(activeProfile?.id),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.usage(activeProfile?.id),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.revenuecat.customerInfo(userId),
        }),
      ]);
    },
  });
}
