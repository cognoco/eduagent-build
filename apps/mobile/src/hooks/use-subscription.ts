import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

// ---------------------------------------------------------------------------
// Types (matching API response shapes from routes/billing.ts)
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'free' | 'plus' | 'family' | 'pro';
export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired';
export type WarningLevel = 'none' | 'soft' | 'hard' | 'exceeded';

export interface SubscriptionData {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  monthlyLimit: number;
  usedThisMonth: number;
  remainingQuestions: number;
}

export interface UsageData {
  monthlyLimit: number;
  usedThisMonth: number;
  remainingQuestions: number;
  topUpCreditsRemaining: number;
  warningLevel: WarningLevel;
  cycleResetAt: string;
}

interface CheckoutInput {
  tier: 'plus' | 'family' | 'pro';
  interval: 'monthly' | 'yearly';
}

interface CheckoutResult {
  checkoutUrl: string;
  sessionId: string;
}

interface CancelResult {
  message: string;
  currentPeriodEnd: string;
}

interface PortalResult {
  portalUrl: string;
}

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
  CheckoutResult,
  Error,
  CheckoutInput
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: CheckoutInput) => {
      const res = await client.subscription.checkout.$post({ json: input });
      return await res.json();
    },
  });
}

export function useCancelSubscription(): UseMutationResult<
  CancelResult,
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
  PortalResult,
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
