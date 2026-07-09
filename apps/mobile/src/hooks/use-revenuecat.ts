// ---------------------------------------------------------------------------
// RevenueCat hooks — identity sync, offerings, customer info, purchasing
//
// These hooks wrap the RevenueCat SDK for use in React components with
// TanStack Query for caching and Clerk for identity management.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
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
import { useAuth } from '@clerk/expo';
import { getRevenueCatApiKey } from '../lib/revenuecat';
import { combinedSignal } from '../lib/query-timeout';
import { queryKeys } from '../lib/query-keys';

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
// Identity-sync store — which Clerk userId the RC SDK is confirmed synced to
// ---------------------------------------------------------------------------

// [F-134] `useCustomerInfo` caches `Purchases.getCustomerInfo()` under the
// CLERK userId, but the SDK answers for whatever identity it is currently
// logged into. On a shared-device account switch the query refetches under
// the new user's key before `Purchases.logIn(newUserId)` resolves, so the
// previous account's entitlement snapshot can be cached (and persisted) under
// the new user's key. This module-level store records the userId for which
// identity sync has COMPLETED; `useCustomerInfo` gates on it so the query can
// never run while the SDK identity and the query key disagree.
// `null` = signed-out / anonymous (the initial state).
let rcSyncedUserId: string | null = null;
const rcSyncListeners = new Set<() => void>();

function setRcSyncedUserId(userId: string | null): void {
  rcSyncedUserId = userId;
  for (const listener of rcSyncListeners) listener();
}

function subscribeToRcSyncedUserId(listener: () => void): () => void {
  rcSyncListeners.add(listener);
  return () => {
    rcSyncListeners.delete(listener);
  };
}

function getRcSyncedUserId(): string | null {
  return rcSyncedUserId;
}

/** Test-only: clear module-level identity-sync state between tests. */
export function resetRevenueCatIdentitySyncForTests(): void {
  rcSyncedUserId = null;
  rcSyncListeners.clear();
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
  const queryClient = useQueryClient();
  const previousUserIdRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RETRIES = 2;

  useEffect(() => {
    if (!isRevenueCatAvailable()) return;

    retryCountRef.current = 0;
    let cancelled = false;

    const syncIdentity = async (): Promise<void> => {
      if (cancelled) return;
      try {
        if (isSignedIn && userId) {
          if (previousUserIdRef.current !== userId) {
            await Purchases.logIn(userId);
            if (cancelled) return;
            previousUserIdRef.current = userId;
            retryCountRef.current = 0;
            // [F-134] Mark identity sync complete BEFORE invalidating, so the
            // refetch triggered by the invalidation below is not suppressed
            // by the useCustomerInfo `enabled` gate.
            setRcSyncedUserId(userId);
            // [F-134] A snapshot cached under this key before the gate was in
            // effect (e.g. restored by the query persister) may belong to a
            // different SDK identity — force a refetch now that the SDK
            // identity is confirmed to match the key.
            void queryClient.invalidateQueries({
              queryKey: queryKeys.revenuecat.customerInfo(userId),
            });
          }
        } else if (previousUserIdRef.current !== null) {
          await Purchases.logOut();
          if (cancelled) return;
          previousUserIdRef.current = null;
          retryCountRef.current = 0;
          // [F-134] RC identity is now anonymous — gate signed-in keys again.
          setRcSyncedUserId(null);
        }
      } catch (error) {
        if (cancelled) return;
        // BUG-393: Log failure instead of silently swallowing.
        // RevenueCat falls back to anonymous, but we need visibility.
        Sentry.addBreadcrumb({
          category: 'revenuecat',
          message: `Identity sync failed: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
          level: 'warning',
          data: { userId, attempt: retryCountRef.current + 1 },
        });

        // Retry on transient failures (network issues, SDK init race)
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1;
          retryTimerRef.current = setTimeout(() => void syncIdentity(), 3000);
        } else {
          // [error-observability H-2] Retries exhausted — RevenueCat stays in
          // anonymous mode and billing receipts from this session would be
          // mis-attributed. A breadcrumb alone is invisible unless a later
          // exception fires in the same session, so escalate the underlying
          // error to a real Sentry event with queryable tags (silent recovery
          // without escalation is banned in billing code).
          Sentry.captureException(
            error instanceof Error ? error : new Error(String(error)),
            {
              tags: {
                surface: 'revenuecat_identity',
                reason: 'max_retries_exhausted',
              },
              extra: { userId },
            },
          );
          // [F-134] With the identity-sync gate in place, a terminal sync
          // failure leaves useCustomerInfo disabled for the session
          // (fail-closed: no RC snapshot beats another account's snapshot;
          // the subscription screen falls back to the server tier, which is
          // the access authority). Escalate beyond a breadcrumb so the
          // failure rate is queryable — silent recovery without escalation
          // is banned on billing paths.
          Sentry.captureMessage(
            '[revenuecat] identity sync failed after retries — customerInfo gated off',
            'warning',
          );
        }
      }
    };

    void syncIdentity();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [isSignedIn, userId, queryClient]);
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
  const { userId } = useAuth();

  return useQuery({
    queryKey: queryKeys.revenuecat.offerings(userId),
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
  // BC-01: scope query cache by userId to prevent entitlement leakage
  const { userId } = useAuth();
  // [F-134] Gate fetching on identity-sync completion: getCustomerInfo()
  // answers for the SDK's CURRENT identity, so fetching before
  // Purchases.logIn(userId) resolves would cache another account's
  // entitlement snapshot under this user's key. Web / unconfigured platforms
  // have no RC identity at all — the queryFn returns null there, so they
  // stay ungated.
  const syncedUserId = useSyncExternalStore(
    subscribeToRcSyncedUserId,
    getRcSyncedUserId,
    getRcSyncedUserId,
  );
  const identityReady =
    !isRevenueCatAvailable() || syncedUserId === (userId ?? null);
  return useQuery({
    queryKey: queryKeys.revenuecat.customerInfo(userId),
    enabled: identityReady,
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
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      aPackage: PurchasesPackage,
    ): Promise<MakePurchaseResult> => {
      const result = await Purchases.purchasePackage(aPackage);
      return result;
    },
    onSuccess: () => {
      // [BUG-167] Scope invalidation by Clerk userId so a purchase on this
      // user cannot invalidate another user's cached entitlements on a
      // shared device. The customerInfo key includes userId (see
      // useCustomerInfo) so we mirror that scope here.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.revenuecat.customerInfo(userId),
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
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<CustomerInfo> => {
      const info = await Purchases.restorePurchases();
      return info;
    },
    onSuccess: () => {
      // [BUG-167] Scope invalidation by Clerk userId — see usePurchase.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.revenuecat.customerInfo(userId),
      });
    },
  });
}
