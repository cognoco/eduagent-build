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
  CheckoutRequest,
  CheckoutResponse,
  CancelResponse,
  PortalResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

// ---------------------------------------------------------------------------
// Types — prefer imports from @eduagent/schemas; local only for API-specific shapes
// ---------------------------------------------------------------------------

export type { SubscriptionTier, SubscriptionStatus };
export type SubscriptionData = Subscription;
export type UsageData = Usage;

/** Matches the warningLevel enum from @eduagent/schemas usageSchema */
export type WarningLevel = 'none' | 'soft' | 'hard' | 'exceeded';

interface TopUpResult {
  topUp: {
    amount: number;
    clientSecret: string;
    paymentIntentId: string;
  };
}

interface ByokWaitlistResult {
  message: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useSubscription(): UseQueryResult<SubscriptionData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['subscription', activeProfile?.id],
    queryFn: async () => {
      const res = await client.subscription.$get();
      const data = await res.json();
      return data.subscription;
    },
    enabled: !!activeProfile,
  });
}

export function useUsage(): UseQueryResult<UsageData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['usage', activeProfile?.id],
    queryFn: async () => {
      const res = await client.usage.$get();
      const data = await res.json();
      return data.usage;
    },
    enabled: !!activeProfile,
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
    queryFn: async () => {
      const res = await client.subscription.status.$get();
      const data = await res.json();
      return data.status;
    },
    enabled: !!activeProfile,
    staleTime: 60_000, // 1 min — fast endpoint, no need for aggressive refetching
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateCheckout(): UseMutationResult<
  CheckoutResponse,
  Error,
  CheckoutRequest
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: CheckoutRequest): Promise<CheckoutResponse> => {
      const res = await client.subscription.checkout.$post({ json: input });
      return (await res.json()) as CheckoutResponse;
    },
  });
}

export function useCancelSubscription(): UseMutationResult<
  CancelResponse,
  Error,
  void
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (): Promise<CancelResponse> => {
      const res = await client.subscription.cancel.$post({ json: {} });
      return (await res.json()) as CancelResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['subscription', activeProfile?.id],
      });
    },
  });
}

export function useCreatePortalSession(): UseMutationResult<
  PortalResponse,
  Error,
  void
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<PortalResponse> => {
      const res = await client.subscription.portal.$post({ json: {} });
      return (await res.json()) as PortalResponse;
    },
  });
}

export function usePurchaseTopUp(): UseMutationResult<
  TopUpResult,
  Error,
  void
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (): Promise<TopUpResult> => {
      const res = await client.subscription['top-up'].$post({
        json: { amount: 500 },
      });
      return (await res.json()) as TopUpResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['usage', activeProfile?.id],
      });
    },
  });
}

export function useJoinByokWaitlist(): UseMutationResult<
  ByokWaitlistResult,
  Error,
  { email: string }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: { email: string }) => {
      const res = await client['byok-waitlist'].$post({ json: input });
      return await res.json();
    },
  });
}
