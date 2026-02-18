import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';
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
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['subscription', activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ subscription: SubscriptionData }>(
        '/subscription'
      );
      return data.subscription;
    },
    enabled: !!activeProfile,
  });
}

export function useUsage(): UseQueryResult<UsageData> {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['usage', activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ usage: UsageData }>('/usage');
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
  const { post } = useApi();

  return useMutation({
    mutationFn: (input: CheckoutInput) =>
      post<CheckoutResult>('/subscription/checkout', input),
  });
}

export function useCancelSubscription(): UseMutationResult<
  CancelResult,
  Error,
  void
> {
  const { post } = useApi();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: () => post<CancelResult>('/subscription/cancel', {}),
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
  const { post } = useApi();

  return useMutation({
    mutationFn: () => post<PortalResult>('/subscription/portal', {}),
  });
}

export function usePurchaseTopUp(): UseMutationResult<
  TopUpResult,
  Error,
  void
> {
  const { post } = useApi();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: () =>
      post<TopUpResult>('/subscription/top-up', { amount: 500 }),
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
  const { post } = useApi();

  return useMutation({
    mutationFn: (input: { email: string }) =>
      post<ByokWaitlistResult>('/byok-waitlist', input),
  });
}
