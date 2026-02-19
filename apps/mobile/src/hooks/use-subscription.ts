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
    mutationFn: async (input: CheckoutRequest) => {
      const res = await client.subscription.checkout.$post({ json: input });
      return await res.json();
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
    mutationFn: async () => {
      const res = await client.subscription.cancel.$post({ json: {} });
      return await res.json();
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
    mutationFn: async () => {
      const res = await client.subscription.portal.$post({ json: {} });
      return await res.json();
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
    mutationFn: async () => {
      const res = await client.subscription['top-up'].$post({
        json: { amount: 500 },
      });
      return await res.json();
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
