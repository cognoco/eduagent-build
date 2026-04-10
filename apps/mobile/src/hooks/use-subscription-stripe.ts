// ---------------------------------------------------------------------------
// Mutation hooks — Stripe (web client)
// ---------------------------------------------------------------------------
// Kept for future web client — not used by mobile IAP flow.
// Mobile billing uses native IAP via RevenueCat (see use-revenuecat.ts).
// These hooks call Stripe checkout/portal/cancel API routes which are
// dormant for mobile but will be activated when a web client is added.
// ---------------------------------------------------------------------------

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  CheckoutRequest,
  CheckoutResponse,
  CancelResponse,
  PortalResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { assertOk } from '../lib/assert-ok';

interface TopUpResult {
  topUp: {
    amount: number;
    clientSecret: string;
    paymentIntentId: string;
  };
}

/** Kept for future web client — not used by mobile IAP flow. */
export function useCreateCheckout(): UseMutationResult<
  CheckoutResponse,
  Error,
  CheckoutRequest
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: CheckoutRequest): Promise<CheckoutResponse> => {
      const res = await client.subscription.checkout.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as CheckoutResponse;
    },
  });
}

/** Kept for future web client — not used by mobile IAP flow. */
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
      await assertOk(res);
      return (await res.json()) as CancelResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['subscription', activeProfile?.id],
      });
    },
  });
}

/** Kept for future web client — not used by mobile IAP flow. */
export function useCreatePortalSession(): UseMutationResult<
  PortalResponse,
  Error,
  void
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<PortalResponse> => {
      const res = await client.subscription.portal.$post({ json: {} });
      await assertOk(res);
      return (await res.json()) as PortalResponse;
    },
  });
}

/** Kept for future web client — not used by mobile IAP flow. */
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
      await assertOk(res);
      return (await res.json()) as TopUpResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['usage', activeProfile?.id],
      });
    },
  });
}
