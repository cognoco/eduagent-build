// ---------------------------------------------------------------------------
// RevenueCat hooks — identity sync, offerings, customer info, purchasing
//
// These hooks wrap the RevenueCat SDK for use in React components with
// TanStack Query for caching and Clerk for identity management.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
  MakePurchaseResult,
} from 'react-native-purchases';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { getRevenueCatApiKey } from '../lib/revenuecat';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** RevenueCat is only functional on native platforms with a configured API key. */
function isRevenueCatAvailable(): boolean {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
    getRevenueCatApiKey() !== ''
  );
}

// ---------------------------------------------------------------------------
// Identity — sync Clerk auth state with RevenueCat user identity
// ---------------------------------------------------------------------------

/**
 * Syncs Clerk authentication state with RevenueCat identity.
 *
 * - When a Clerk user signs in, calls `Purchases.logIn(clerkUserId)`.
 * - When a Clerk user signs out, calls `Purchases.logOut()`.
 * - Skips on web or when RevenueCat API key is not configured.
 *
 * Should be called once in an authenticated layout (e.g. learner/parent).
 */
export function useRevenueCatIdentity(): void {
  const { isSignedIn, userId } = useAuth();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isRevenueCatAvailable()) return;

    const syncIdentity = async (): Promise<void> => {
      try {
        if (isSignedIn && userId) {
          // Only logIn if the user changed
          if (previousUserIdRef.current !== userId) {
            await Purchases.logIn(userId);
            previousUserIdRef.current = userId;
          }
        } else if (previousUserIdRef.current !== null) {
          // User signed out — reset RevenueCat to anonymous
          await Purchases.logOut();
          previousUserIdRef.current = null;
        }
      } catch {
        // Silently fail — RevenueCat identity sync is non-critical.
        // The SDK falls back to anonymous user if logIn/logOut fails.
      }
    };

    void syncIdentity();
  }, [isSignedIn, userId]);
}

// ---------------------------------------------------------------------------
// Offerings — fetch available packages for purchase
// ---------------------------------------------------------------------------

/**
 * Fetches and caches RevenueCat offerings via TanStack Query.
 *
 * Offerings contain the products configured in the RevenueCat dashboard,
 * organized into packages (monthly, annual, etc.).
 *
 * Returns `null` data on web or when RevenueCat is not configured.
 */
export function useOfferings(): UseQueryResult<PurchasesOfferings | null> {
  return useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: async ({
      signal: querySignal,
    }): Promise<PurchasesOfferings | null> => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        if (!isRevenueCatAvailable()) return null;
        // RevenueCat SDK doesn't accept AbortSignal, but we check after
        // the call returns so the query fails fast on timeout.
        const offerings = await Purchases.getOfferings();
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return offerings;
      } finally {
        cleanup();
      }
    },
    staleTime: 5 * 60_000, // 5 minutes — offerings don't change often
  });
}

// ---------------------------------------------------------------------------
// Customer Info — current entitlement / subscription status
// ---------------------------------------------------------------------------

/**
 * Fetches the current customer's entitlement info from RevenueCat.
 *
 * Use this to check whether the user has an active "pro" (or any other)
 * entitlement. Returns `null` on web or when RevenueCat is not configured.
 */
export function useCustomerInfo(): UseQueryResult<CustomerInfo | null> {
  return useQuery({
    queryKey: ['revenuecat', 'customerInfo'],
    queryFn: async ({ signal: querySignal }): Promise<CustomerInfo | null> => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        if (!isRevenueCatAvailable()) return null;
        const info = await Purchases.getCustomerInfo();
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return info;
      } finally {
        cleanup();
      }
    },
    staleTime: 60_000, // 1 minute — re-check entitlements periodically
  });
}

// ---------------------------------------------------------------------------
// Purchase — buy a package
// ---------------------------------------------------------------------------

/**
 * Mutation hook that wraps `Purchases.purchasePackage()`.
 *
 * After a successful purchase, invalidates the customerInfo query so
 * entitlement checks reflect the new state immediately.
 */
export function usePurchase(): UseMutationResult<
  MakePurchaseResult,
  Error,
  PurchasesPackage
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      aPackage: PurchasesPackage
    ): Promise<MakePurchaseResult> => {
      const result = await Purchases.purchasePackage(aPackage);
      return result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['revenuecat', 'customerInfo'],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Restore — restore previous purchases
// ---------------------------------------------------------------------------

/**
 * Mutation hook that wraps `Purchases.restorePurchases()`.
 *
 * Useful when a user reinstalls the app or switches devices and needs
 * to recover previously purchased entitlements.
 *
 * After a successful restore, invalidates the customerInfo query.
 */
export function useRestorePurchases(): UseMutationResult<
  CustomerInfo,
  Error,
  void
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<CustomerInfo> => {
      const info = await Purchases.restorePurchases();
      return info;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['revenuecat', 'customerInfo'],
      });
    },
  });
}
