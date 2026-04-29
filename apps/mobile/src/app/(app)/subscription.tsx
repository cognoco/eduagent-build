import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { platformAlert } from '../../lib/platform-alert';
import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from '../../lib/secure-storage';
import { migrateSecureStoreKey } from '../../lib/migrate-secure-store-key';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type {
  PurchasesPackage,
  PurchasesOffering,
  CustomerInfo,
  PurchasesError,
} from 'react-native-purchases';
import { PURCHASES_ERROR_CODE, PACKAGE_TYPE } from 'react-native-purchases';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors } from '../../lib/theme';
import { goBackOrReplace } from '../../lib/navigation';
import { useProfile } from '../../lib/profile';
import { useApiClient } from '../../lib/api-client';
import { assertOk } from '../../lib/assert-ok';

import { UsageMeter } from '../../components/common';
import {
  useSubscription,
  useUsage,
  useFamilySubscription,
  useJoinByokWaitlist,
  fetchUsageData,
  type SubscriptionTier,
} from '../../hooks/use-subscription';
import {
  useOfferings,
  useCustomerInfo,
  usePurchase,
  useRestorePurchases,
} from '../../hooks/use-revenuecat';
import { useNotifyParentSubscribe } from '../../hooks/use-settings';
import { useXpSummary } from '../../hooks/use-streaks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  plus: 'Plus',
  family: 'Family',
  pro: 'Pro',
};

const TIER_LIMITS: Record<SubscriptionTier, string> = {
  free: '10 questions/day, 100/month',
  plus: '700 questions/month',
  family: '1,500 questions/month (shared)',
  pro: '3,000 questions/month',
};

/**
 * Static tier features for display when RevenueCat offerings are unavailable.
 *
 * BUG-899: Only Free and Plus are surfaced to end-users. Family/Pro tiers
 * exist server-side but their store SKUs are not approved for public listing
 * (see `pricing_dual_cap.md`). Showing them as upgrade options creates
 * marketing/legal exposure and contradicts approved pricing.
 */
const TIER_FEATURES: Array<{
  tier: SubscriptionTier;
  features: string[];
}> = [
  {
    tier: 'free',
    features: [
      '10 questions per day, 100 per month',
      'All subjects',
      'Spaced repetition',
      'Library',
    ],
  },
  {
    tier: 'plus',
    features: [
      '700 questions per month, no daily limit',
      'All Free features',
      'Premium AI mentor',
      'Detailed progress analytics',
    ],
  },
];

/** Map RevenueCat PACKAGE_TYPE to human-readable period labels. */
const PACKAGE_PERIOD_LABEL: Partial<Record<PACKAGE_TYPE, string>> = {
  [PACKAGE_TYPE.MONTHLY]: 'Monthly',
  [PACKAGE_TYPE.ANNUAL]: 'Annual',
  [PACKAGE_TYPE.SIX_MONTH]: '6 Months',
  [PACKAGE_TYPE.THREE_MONTH]: '3 Months',
  [PACKAGE_TYPE.TWO_MONTH]: '2 Months',
  [PACKAGE_TYPE.WEEKLY]: 'Weekly',
  [PACKAGE_TYPE.LIFETIME]: 'Lifetime',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPackagePeriodLabel(pkg: PurchasesPackage): string {
  return PACKAGE_PERIOD_LABEL[pkg.packageType] ?? pkg.identifier;
}

/**
 * Checks whether a RevenueCat error represents a user-initiated cancellation.
 * User cancellations are not real errors — the user simply dismissed the
 * native payment sheet.
 */
function isPurchaseCancelledError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as PurchasesError).code ===
      PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  ) {
    return true;
  }
  return false;
}

/**
 * Checks whether a RevenueCat error indicates the product has already been
 * purchased (e.g. user already owns this entitlement on another device).
 * When this occurs, the user should restore rather than re-purchase.
 */
function isProductAlreadyPurchasedError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as PurchasesError).code ===
      PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR
  ) {
    return true;
  }
  return false;
}

/**
 * Checks whether a RevenueCat error is a network error.
 */
function isNetworkError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as PurchasesError).code === PURCHASES_ERROR_CODE.NETWORK_ERROR ||
      (error as PurchasesError).code ===
        PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR)
  ) {
    return true;
  }
  return false;
}

/**
 * Returns the active entitlement identifier (e.g. "pro", "plus") from
 * CustomerInfo, or null if no entitlement is active.
 */
function getActiveEntitlement(
  customerInfo: CustomerInfo | null | undefined
): string | null {
  if (!customerInfo) return null;
  const activeEntitlements = customerInfo.entitlements.active;
  const keys = Object.keys(activeEntitlements);
  if (keys.length === 0) return null;
  // Return the first active entitlement — for a single-entitlement setup
  return keys[0] ?? null;
}

/**
 * Opens the platform-specific subscription management page.
 */
async function openSubscriptionManagement(): Promise<void> {
  if (Platform.OS === 'ios') {
    await Linking.openURL('https://apps.apple.com/account/subscriptions');
  } else {
    await Linking.openURL(
      'https://play.google.com/store/account/subscriptions'
    );
  }
}

// ---------------------------------------------------------------------------
// PackageOption — displays a single purchasable package
// ---------------------------------------------------------------------------

interface PackageOptionProps {
  pkg: PurchasesPackage;
  isCurrentPlan: boolean;
  onSelect: (pkg: PurchasesPackage) => void;
  isPurchasing: boolean;
}

function PackageOption({
  pkg,
  isCurrentPlan,
  onSelect,
  isPurchasing,
}: PackageOptionProps): React.ReactElement {
  return (
    <Pressable
      onPress={() => !isCurrentPlan && onSelect(pkg)}
      disabled={isCurrentPlan || isPurchasing}
      className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
        isCurrentPlan ? 'border border-primary' : ''
      }`}
      accessibilityLabel={`${isCurrentPlan ? 'Current plan' : 'Subscribe to'} ${
        pkg.product.title
      } ${pkg.product.priceString}`}
      accessibilityRole="button"
      testID={`package-option-${pkg.identifier}`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-body font-semibold text-text-primary">
            {pkg.product.title}
          </Text>
          <Text className="text-caption text-text-secondary mt-0.5">
            {pkg.product.priceString} /{' '}
            {getPackagePeriodLabel(pkg).toLowerCase()}
          </Text>
          {pkg.product.description ? (
            <Text className="text-caption text-text-secondary mt-0.5">
              {pkg.product.description}
            </Text>
          ) : null}
        </View>
        {isCurrentPlan ? (
          <Text className="text-caption font-semibold text-primary">
            Current plan
          </Text>
        ) : (
          <Text className="text-caption font-semibold text-primary">
            {isPurchasing ? 'Processing...' : 'Subscribe'}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// ChildPaywall — shown when a child profile's subscription has expired
// ---------------------------------------------------------------------------

const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// BUG-399: Account-scoped key — BYOK waitlist is per-account email, not per-profile.
const BYOK_JOINED_KEY = 'byok-waitlist-joined';

// Key renamed from colon to dash delimiter — colons caused SecureStore
// crashes on some Android devices. See migrate-secure-store-key.ts.
function getNotifyStorageKey(profileId: string): string {
  return `child-paywall-notified-at-${profileId}`;
}

/** @deprecated Old colon-delimited key — used only for migration. */
function getLegacyNotifyStorageKey(profileId: string): string {
  return `child-paywall-notified-at:${profileId}`;
}

function computeCooldownMsRemaining(notifiedAtMs: number): number {
  const elapsed = Date.now() - notifiedAtMs;
  return Math.max(0, NOTIFY_COOLDOWN_MS - elapsed);
}

function formatCooldownLabel(msRemaining: number): string {
  if (msRemaining <= 0) return '0 seconds';

  if (msRemaining >= 60 * 60 * 1000) {
    const hours = Math.ceil(msRemaining / (60 * 60 * 1000));
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }

  if (msRemaining >= 60_000) {
    const minutes = Math.ceil(msRemaining / 60_000);
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }

  const seconds = Math.ceil(msRemaining / 1000);
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

function ChildPaywall(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { activeProfile } = useProfile();
  const notifyParent = useNotifyParentSubscribe();
  const { data: xpSummary } = useXpSummary();

  const [notifiedAt, setNotifiedAt] = useState<number | null>(null);
  const [cooldownMsRemaining, setCooldownMsRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const profileId = activeProfile?.id ?? '';

  // BM-07: migration and restore must run sequentially — the restore reads
  // the new key that migration writes.  A single effect chains them to avoid
  // a race where restore fires before migration finishes writing.
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    (async () => {
      try {
        // Step 1: migrate legacy key → new key (no-ops if already migrated)
        await migrateSecureStoreKey(
          getLegacyNotifyStorageKey(profileId),
          getNotifyStorageKey(profileId)
        );
        if (cancelled) return;
        // Step 2: restore persisted notified timestamp
        const value = await SecureStore.getItemAsync(
          getNotifyStorageKey(profileId)
        );
        if (cancelled) return;
        if (!value) return;
        const ts = Number(value);
        if (Number.isNaN(ts)) return;
        const remaining = computeCooldownMsRemaining(ts);
        if (remaining > 0) {
          setNotifiedAt(ts);
          setCooldownMsRemaining(remaining);
        }
      } catch {
        /* SecureStore unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // Update countdown more frequently near expiry so the button re-enables on time.
  useEffect(() => {
    if (notifiedAt === null) return;

    const update = () => {
      const remaining = computeCooldownMsRemaining(notifiedAt);
      setCooldownMsRemaining(remaining);
      if (remaining <= 0) {
        setNotifiedAt(null);
        timerRef.current = null;
        return;
      }

      const nextTick = remaining <= 60_000 ? 1000 : 60_000;
      timerRef.current = setTimeout(update, nextTick);
    };

    update();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notifiedAt]);

  const isNotified = notifiedAt !== null && cooldownMsRemaining > 0;

  const handleNotify = useCallback(async () => {
    try {
      const result = await notifyParent.mutateAsync();
      if (result.rateLimited) {
        // Server says rate-limited — persist the current timestamp as fallback
        const now = Date.now();
        setNotifiedAt(now);
        if (profileId) {
          void SecureStore.setItemAsync(
            getNotifyStorageKey(profileId),
            String(now)
          ).catch(() => undefined);
        }
      } else if (result.sent) {
        const now = Date.now();
        setNotifiedAt(now);
        if (profileId) {
          void SecureStore.setItemAsync(
            getNotifyStorageKey(profileId),
            String(now)
          ).catch(() => undefined);
        }
        platformAlert('Sent!', 'We let your parent know!');
      } else {
        platformAlert(
          'Ask your parent',
          'Ask your parent to open the app and subscribe.'
        );
      }
    } catch {
      platformAlert(
        'Could not send notification',
        'Please check your connection and try again.'
      );
    }
  }, [notifyParent, profileId]);

  const topicsLearned = xpSummary?.topicsCompleted ?? 0;
  const totalXp = xpSummary?.totalXp ?? 0;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="child-paywall"
    >
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="me-3 min-w-[44px] min-h-[44px] justify-center items-center"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-semibold">Back</Text>
        </Pressable>
      </View>

      <View className="flex-1 px-5 items-center justify-center">
        <Text className="text-h1 font-bold text-text-primary mb-4 text-center">
          Nice work so far!
        </Text>
        <Text className="text-body text-text-secondary mb-2 text-center">
          {topicsLearned > 0 || totalXp > 0
            ? `You learned ${topicsLearned} topic${
                topicsLearned !== 1 ? 's' : ''
              } and earned ${totalXp} XP \u2014 great work!`
            : "You've been exploring and learning \u2014 great start!"}
        </Text>
        <Text className="text-body text-text-secondary mb-8 text-center">
          You've used all your free questions. Ask your parent to upgrade so you
          can keep learning.
        </Text>

        <Pressable
          onPress={handleNotify}
          disabled={notifyParent.isPending || isNotified}
          className={`rounded-button py-3.5 px-8 items-center mb-3 w-full ${
            isNotified ? 'bg-muted' : 'bg-primary'
          }`}
          testID="notify-parent-button"
          accessibilityRole="button"
          accessibilityLabel={
            isNotified ? 'Parent already notified' : 'Notify my parent'
          }
        >
          {notifyParent.isPending ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text
              className={`text-body font-semibold ${
                isNotified ? 'text-text-secondary' : 'text-text-inverse'
              }`}
            >
              {isNotified ? 'Parent notified' : 'Notify My Parent'}
            </Text>
          )}
        </Pressable>

        {isNotified && (
          <Text
            className="text-body-sm text-text-secondary text-center mb-3"
            testID="notify-countdown"
          >
            You can remind them again in{' '}
            {formatCooldownLabel(cooldownMsRemaining)}.
          </Text>
        )}

        {isNotified ? (
          <Text
            className="text-body-sm text-text-secondary text-center mb-4"
            testID="notified-explore-text"
          >
            Your parent has been notified! While you wait, you can still
            explore:
          </Text>
        ) : (
          <Text className="text-body-sm text-text-secondary text-center mb-4">
            While you wait, you can still browse your Library and see your
            progress.
          </Text>
        )}

        <Pressable
          onPress={() => router.push('/(app)/library')}
          className="bg-surface rounded-button py-3.5 px-8 items-center w-full mb-2"
          testID="browse-library-button"
          accessibilityRole="button"
          accessibilityLabel="Browse Library"
        >
          <Text className="text-body font-semibold text-primary">
            Browse Library
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(app)/progress')}
          className="bg-surface rounded-button py-3.5 px-8 items-center w-full mb-2"
          testID="see-progress-button"
          accessibilityRole="button"
          accessibilityLabel="See your progress"
        >
          <Text className="text-body font-semibold text-primary">
            See your progress
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(app)/home')}
          className="bg-surface rounded-button py-3.5 px-8 items-center w-full"
          testID="go-home-button"
          accessibilityRole="button"
          accessibilityLabel="Go Home"
        >
          <Text className="text-body font-semibold text-primary">Go Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Subscription Screen
// ---------------------------------------------------------------------------

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { activeProfile } = useProfile();
  const client = useApiClient();

  const queryClient = useQueryClient();

  // API hooks for usage display and subscription state
  const {
    data: subscription,
    isLoading: subLoading,
    isError: subError,
    refetch: refetchSub,
    isRefetching: subRefetching,
  } = useSubscription();
  const {
    data: usage,
    isLoading: usageLoading,
    isError: usageError,
    refetch: refetchUsage,
    isRefetching: usageRefetching,
  } = useUsage();
  const { data: familySubscription } = useFamilySubscription(
    subscription?.tier === 'family'
  );
  const byokWaitlist = useJoinByokWaitlist();

  // BUG-399: Persistent "already joined" flag for BYOK waitlist
  const [byokJoined, setByokJoined] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(BYOK_JOINED_KEY);
        if (!cancelled && stored === 'true') {
          setByokJoined(true);
        }
      } catch {
        // SecureStore may throw on web or restricted environments
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Top-up IAP state
  const [topUpPurchasing, setTopUpPurchasing] = useState(false);
  const [topUpPolling, setTopUpPolling] = useState(false);
  const [pollMessage, setPollMessage] = useState('Confirming your purchase...');

  // Restore-purchase polling state (BUG-397)
  const [restorePolling, setRestorePolling] = useState(false);

  // Post-purchase polling state — shows visible feedback while the webhook
  // confirms the new subscription tier (PR-FIX-07)
  const [purchasePolling, setPurchasePolling] = useState(false);

  // BUG-403: ScrollView ref so the Upgrade button can scroll to offerings
  const scrollViewRef = useRef<ScrollView>(null);
  const offeringsYRef = useRef(0);

  // Track mount state so the top-up polling loop can bail out if the user
  // navigates away mid-poll (prevents setState-on-unmounted warnings and
  // unnecessary query invalidations).
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // RevenueCat hooks
  const {
    data: offerings,
    isLoading: offeringsLoading,
    isError: offeringsError,
    refetch: refetchOfferings,
  } = useOfferings();
  const { data: customerInfo, isLoading: customerInfoLoading } =
    useCustomerInfo();
  const purchase = usePurchase();
  const restore = useRestorePurchases();

  const isLoading =
    subLoading || usageLoading || offeringsLoading || customerInfoLoading;

  const activeEntitlement = getActiveEntitlement(customerInfo);
  const hasActiveSubscription = activeEntitlement !== null;

  // ---------------------------------------------------------------------------
  // Restore purchases handler — declared first so handlePurchase can reference it
  // ---------------------------------------------------------------------------

  const handleRestore = useCallback(async () => {
    try {
      await restore.mutateAsync();
    } catch {
      platformAlert(
        'Restore failed',
        'Could not restore purchases. Please try again.'
      );
      return;
    }

    // BUG-397: RevenueCat's CustomerInfo is a local snapshot — the webhook
    // may not have processed yet, so poll the API (same pattern as top-up)
    // waiting for a paid subscription tier.
    if (!mountedRef.current) return;
    setRestorePolling(true);

    const maxAttempts = 15; // ~30 s at 2 s intervals
    const pollIntervalMs = 2000;
    let confirmed = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!mountedRef.current) break;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (!mountedRef.current) break;
      try {
        const freshSub = await queryClient.fetchQuery<{
          tier: string;
        }>({
          queryKey: ['subscription', activeProfile?.id],
          staleTime: 0,
          queryFn: async () => {
            const res = await client.subscription.$get({});
            await assertOk(res);
            const data = await res.json();
            return data.subscription;
          },
        });
        if (freshSub && freshSub.tier !== 'free') {
          confirmed = true;
          break;
        }
      } catch {
        // Network error during poll — continue to next attempt
        continue;
      }
    }

    if (!mountedRef.current) return;
    setRestorePolling(false);

    if (confirmed) {
      await refetchUsage();
      platformAlert('Restored', 'Your subscription has been restored.');
    } else {
      platformAlert(
        'No subscriptions found',
        'We could not find any previous purchases to restore.',
        [
          {
            text: 'Check again',
            onPress: () => {
              void refetchSub();
            },
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
    }
  }, [
    restore,
    queryClient,
    activeProfile?.id,
    client,
    refetchSub,
    refetchUsage,
  ]);

  // ---------------------------------------------------------------------------
  // Purchase handler — triggers native store payment sheet
  // ---------------------------------------------------------------------------

  const handlePurchase = useCallback(
    async (pkg: PurchasesPackage) => {
      try {
        await purchase.mutateAsync(pkg);
      } catch (error: unknown) {
        if (isPurchaseCancelledError(error)) {
          // User cancelled — not an error, just dismiss silently
          return;
        }
        if (isProductAlreadyPurchasedError(error)) {
          // [UX-DE-M8] Product already purchased — prompt restore instead of
          // showing a generic failure. handleRestore is stable (useCallback).
          platformAlert(
            'Already purchased',
            'It looks like you already own this subscription. Tap "Restore purchases" to activate it on this device.',
            [
              {
                text: 'Restore purchases',
                onPress: () => void handleRestore(),
              },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
          return;
        }
        if (isNetworkError(error)) {
          platformAlert(
            'Network error',
            'Please check your internet connection and try again.'
          );
          return;
        }
        platformAlert(
          'Purchase failed',
          'Something unexpected happened with your purchase. Please try again.'
        );
        return;
      }

      // Purchase succeeded on the store side — poll the API until the webhook
      // confirms the new subscription tier (PR-FIX-07: was unrendered _purchasePolling)
      if (!mountedRef.current) return;
      setPurchasePolling(true);

      const maxAttempts = 15; // ~30 s at 2 s intervals
      const pollIntervalMs = 2000;
      let confirmed = false;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!mountedRef.current) break;
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        if (!mountedRef.current) break;
        try {
          const freshSub = await queryClient.fetchQuery<{
            tier: string;
          }>({
            queryKey: ['subscription', activeProfile?.id],
            staleTime: 0,
            queryFn: async () => {
              const res = await client.subscription.$get({});
              await assertOk(res);
              const data = await res.json();
              return data.subscription;
            },
          });
          if (freshSub && freshSub.tier !== 'free') {
            confirmed = true;
            break;
          }
        } catch {
          // Network error during poll — continue to next attempt
          continue;
        }
      }

      if (!mountedRef.current) return;
      setPurchasePolling(false);

      await Promise.all([refetchSub(), refetchUsage()]);

      if (confirmed) {
        platformAlert('Success', 'Your subscription is now active!');
      } else {
        platformAlert(
          'Purchase confirmed',
          'Your subscription is being activated. It usually appears within a minute — pull down to refresh.',
          [{ text: 'OK' }]
        );
      }
    },
    [
      purchase,
      refetchSub,
      refetchUsage,
      handleRestore,
      queryClient,
      activeProfile?.id,
      client,
    ]
  );

  // ---------------------------------------------------------------------------
  // Manage billing — deep link to platform subscription management
  // ---------------------------------------------------------------------------

  const handleManageBilling = useCallback(async () => {
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions';
    try {
      await openSubscriptionManagement();
    } catch {
      // BUG-400: Provide retry + fallback URL so the user isn't stuck.
      platformAlert(
        'Could not open subscription management',
        `You can manage your subscription directly at:\n${url}`,
        [
          {
            text: 'Try again',
            onPress: () => {
              void openSubscriptionManagement().catch(() => {
                // Second attempt also failed — user already has the URL from the alert.
              });
            },
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Top-up handler — RevenueCat consumable IAP + poll for webhook confirmation
  // ---------------------------------------------------------------------------

  const handleTopUp = useCallback(async () => {
    // If offerings are still loading, do nothing (button should be disabled)
    if (offeringsLoading) return;

    // If offerings failed to load, give a retry path
    if (offeringsError || !offerings) {
      platformAlert(
        'Connection error',
        "Couldn't load purchase options. Check your connection and try again.",
        [
          {
            text: 'Retry',
            onPress: () => {
              void refetchOfferings();
            },
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }

    // Find the top-up package from offerings
    // RevenueCat consumables can be in a separate offering or as a non-subscription package
    const topUpOffering = offerings.all?.['top_up'] ?? offerings.current;
    const topUpPkg = topUpOffering?.availablePackages.find(
      (p) =>
        p.packageType === PACKAGE_TYPE.CUSTOM &&
        p.product.identifier.includes('topup')
    );

    if (!topUpPkg) {
      platformAlert(
        'Not available',
        "Top-up credits aren't available right now. Try again later or contact support.",
        [
          {
            text: 'Retry',
            onPress: () => {
              void refetchOfferings();
            },
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }

    // BC-02: use the usePurchase() hook instead of direct SDK call so that
    // TanStack Query loading/error state is managed and customerInfo cache
    // is automatically invalidated on success.
    setTopUpPurchasing(true);
    try {
      await purchase.mutateAsync(topUpPkg);
    } catch (error: unknown) {
      setTopUpPurchasing(false);
      if (isPurchaseCancelledError(error)) return;
      if (isNetworkError(error)) {
        platformAlert(
          'Network error',
          'Please check your internet connection and try again.'
        );
        return;
      }
      platformAlert(
        'Purchase failed',
        'Something unexpected happened with your purchase. Please try again.'
      );
      return;
    }

    // Purchase succeeded on store side — now poll API for webhook confirmation
    if (!mountedRef.current) return;
    setTopUpPurchasing(false);
    setTopUpPolling(true);
    setPollMessage('Confirming your purchase...');
    const messageTimer = setTimeout(() => {
      if (mountedRef.current) {
        setPollMessage(
          'Still confirming \u2014 this can take up to 30 seconds. Your purchase is safe.'
        );
      }
    }, 10_000);

    const baseCredits = usage?.topUpCreditsRemaining ?? 0;
    const maxAttempts = 15; // ~30 seconds with 2s interval
    const pollIntervalMs = 2000;
    let confirmed = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!mountedRef.current) break;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (!mountedRef.current) break;
      // Use fetchQuery with staleTime: 0 to force a fresh network fetch and
      // await the response directly — eliminates the 500ms sleep race where
      // getQueryData could read a stale entry before invalidation propagated.
      let freshUsage: { topUpCreditsRemaining: number } | undefined;
      try {
        freshUsage = await queryClient.fetchQuery<{
          topUpCreditsRemaining: number;
        }>({
          queryKey: ['usage', activeProfile?.id],
          staleTime: 0,
          queryFn: () => fetchUsageData(client),
        });
      } catch {
        // Network error during poll — continue to next attempt
        continue;
      }
      if (!mountedRef.current) break;
      if (freshUsage && freshUsage.topUpCreditsRemaining > baseCredits) {
        confirmed = true;
        break;
      }
    }

    clearTimeout(messageTimer);

    if (!mountedRef.current) return;
    setTopUpPolling(false);

    if (confirmed) {
      platformAlert('Top-up', '500 additional credits have been added!');
    } else {
      platformAlert(
        'Purchase confirmed',
        'Your 500 credits are being added. They usually appear within a minute \u2014 pull down to refresh your usage.',
        [{ text: 'OK' }]
      );
    }
  }, [
    client,
    offerings,
    offeringsLoading,
    offeringsError,
    purchase,
    refetchOfferings,
    usage,
    queryClient,
    activeProfile?.id,
    refetchUsage,
  ]);

  const handleContactSupport = useCallback(async () => {
    try {
      await Linking.openURL(
        'mailto:support@mentomate.app?subject=Subscription%20Help'
      );
    } catch {
      platformAlert(
        'Contact support',
        'Email support@mentomate.app for help with subscriptions.'
      );
    }
  }, []);

  // ---------------------------------------------------------------------------
  // BYOK waitlist handler
  // ---------------------------------------------------------------------------

  const handleByokSubmit = useCallback(async () => {
    try {
      await byokWaitlist.mutateAsync();
      setByokJoined(true);
      void SecureStore.setItemAsync(BYOK_JOINED_KEY, 'true').catch(
        () => undefined
      );
      platformAlert('Waitlist', 'You have been added to the BYOK waitlist.');
    } catch {
      platformAlert('Error', 'Could not join waitlist. Try again.');
    }
  }, [byokWaitlist]);

  // ---------------------------------------------------------------------------
  // Child profile gate — child sees the child-friendly paywall
  // ---------------------------------------------------------------------------

  const isChild = activeProfile ? !activeProfile.isOwner : false;
  const hasLoadError = subError || usageError;
  const trialOrExpired =
    !hasLoadError &&
    (subscription?.status === 'expired' ||
      subscription?.status === 'cancelled' ||
      (!subscription && !subLoading));
  const quotaExhausted = !hasLoadError && usage?.warningLevel === 'exceeded';
  if (isChild && (trialOrExpired || quotaExhausted)) {
    return <ChildPaywall />;
  }

  // ---------------------------------------------------------------------------
  // Derive API-side subscription state for display
  // ---------------------------------------------------------------------------

  const tier = subscription?.tier ?? 'free';
  const status = subscription?.status ?? 'active';
  const isPaidTier = tier !== 'free';
  const cancelAtPeriodEnd = subscription?.cancelAtPeriodEnd ?? false;

  // Get the current offering's available packages
  const currentOffering: PurchasesOffering | null = offerings?.current ?? null;
  const availablePackages = currentOffering?.availablePackages ?? [];

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="subscription-screen"
    >
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="me-3 min-w-[44px] min-h-[44px] justify-center items-center"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-semibold">Back</Text>
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          Subscription
        </Text>
      </View>

      {isLoading ? (
        <View
          className="flex-1 items-center justify-center"
          testID="subscription-loading"
        >
          <ActivityIndicator />
        </View>
      ) : hasLoadError ? (
        <View
          className="flex-1 items-center justify-center px-5"
          testID="subscription-error"
        >
          <Text className="text-body text-text-secondary text-center mb-4">
            Unable to load subscription details. Please try again.
          </Text>
          <Pressable
            onPress={() => {
              void refetchSub();
              void refetchUsage();
            }}
            disabled={subRefetching || usageRefetching}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
            testID="subscription-retry-button"
            accessibilityLabel="Retry loading subscription"
            accessibilityRole="button"
          >
            {subRefetching || usageRefetching ? (
              <ActivityIndicator
                size="small"
                color="white"
                testID="subscription-retry-loading"
              />
            ) : (
              <Text className="text-text-inverse text-body font-semibold">
                Retry
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-5"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        >
          {/* Current plan */}
          <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-4">
            Current plan
          </Text>
          <View
            className="bg-surface rounded-card px-4 py-3.5"
            testID="current-plan"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-body font-semibold text-text-primary">
                {TIER_LABELS[tier]}
              </Text>
              <View className="bg-primary-soft rounded-full px-2.5 py-1">
                <Text className="text-caption font-semibold text-primary capitalize">
                  {cancelAtPeriodEnd
                    ? 'Cancelling'
                    : status === 'past_due'
                    ? 'Past due'
                    : status === 'expired'
                    ? 'Expired'
                    : 'Active'}
                </Text>
              </View>
            </View>
            <Text className="text-caption text-text-secondary mt-1">
              {TIER_LIMITS[tier]}
            </Text>
            {subscription?.currentPeriodEnd && isPaidTier && (
              <Text className="text-caption text-text-secondary mt-1">
                {cancelAtPeriodEnd
                  ? `Access until ${new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}`
                  : `Renews ${new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}`}
              </Text>
            )}
            {!isPaidTier && (
              <Pressable
                onPress={() => {
                  // BUG-403: Scroll to the offerings section.
                  // BUG-[NOTION-3468bce9]: Always scroll — the Plans section
                  // renders a static tier comparison when RevenueCat offerings
                  // are unavailable (e.g. Expo Web, store-publishing blocked),
                  // so the ref target exists regardless of availablePackages.
                  // Without this the button was a silent no-op on web.
                  scrollViewRef.current?.scrollTo({
                    y: offeringsYRef.current,
                    animated: true,
                  });
                  // Background retry if offerings failed to load — the user
                  // is now looking at the Plans section; a fresh fetch can
                  // swap in real packages without a second button press.
                  if (availablePackages.length === 0 && !offeringsLoading) {
                    void refetchOfferings();
                  }
                }}
                className="bg-primary rounded-button py-2.5 px-4 mt-3 items-center"
                testID="free-upgrade-button"
                accessibilityLabel="Upgrade plan"
                accessibilityRole="button"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  Upgrade
                </Text>
              </Pressable>
            )}
          </View>

          {/* Cancellation notice */}
          {cancelAtPeriodEnd && subscription?.currentPeriodEnd && (
            <View className="bg-warning-soft rounded-card px-4 py-3 mt-2">
              <Text className="text-body-sm font-semibold text-warning">
                Subscription ending
              </Text>
              <Text className="text-caption text-text-secondary mt-0.5">
                Your subscription has been cancelled. You can continue using all
                features until{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString(
                  undefined,
                  { year: 'numeric', month: 'long', day: 'numeric' }
                )}
                . After that, your account will revert to the Free tier.
              </Text>
            </View>
          )}

          {/* Usage meter */}
          {usage && (
            <View className="mt-4">
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
                Usage this month
              </Text>
              <View className="bg-surface rounded-card px-4 py-3.5">
                <UsageMeter
                  used={usage.usedThisMonth}
                  limit={usage.monthlyLimit}
                  warningLevel={usage.warningLevel}
                />
                {/* BUG-395: Show daily usage for free-tier users who have a daily cap */}
                {usage.dailyLimit != null && (
                  <View className="mt-2" testID="daily-usage">
                    <Text className="text-caption text-text-secondary">
                      Today: {usage.usedToday} / {usage.dailyLimit} daily
                      questions
                    </Text>
                  </View>
                )}
                {usage.topUpCreditsRemaining > 0 && (
                  <Text className="text-caption text-text-secondary mt-2">
                    + {usage.topUpCreditsRemaining} top-up credits remaining
                  </Text>
                )}
                <Text className="text-caption text-text-secondary mt-1">
                  Resets{' '}
                  {new Date(usage.cycleResetAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              {/* BUG-395: Show daily quota for free-tier users */}
              {usage.dailyLimit != null && (
                <View
                  className="bg-surface rounded-card px-4 py-3.5 mt-2"
                  testID="daily-usage-card"
                >
                  <UsageMeter
                    used={usage.usedToday}
                    limit={usage.dailyLimit}
                    warningLevel={
                      usage.usedToday >= usage.dailyLimit ? 'exceeded' : 'none'
                    }
                  />
                  <Text className="text-caption text-text-secondary mt-1">
                    Daily limit — resets at midnight
                  </Text>
                </View>
              )}
            </View>
          )}

          {familySubscription && (
            <View className="mt-4" testID="family-pool-section">
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
                Family pool
              </Text>
              <View className="bg-surface rounded-card px-4 py-3.5">
                <Text className="text-body font-semibold text-text-primary">
                  {familySubscription.profileCount} of{' '}
                  {familySubscription.maxProfiles} profiles connected
                </Text>
                <Text className="text-caption text-text-secondary mt-1">
                  {familySubscription.remainingQuestions} shared questions left
                  this cycle.
                </Text>
                <Text className="text-caption text-text-secondary mt-1">
                  {familySubscription.members
                    .map((member) =>
                      member.isOwner
                        ? `${member.displayName} (owner)`
                        : member.displayName
                    )
                    .join(', ')}
                </Text>
              </View>
            </View>
          )}

          {/* RevenueCat Offerings — available packages */}
          {availablePackages.length > 0 && (
            <View
              testID="offerings-section"
              onLayout={(e) => {
                offeringsYRef.current = e.nativeEvent.layout.y;
              }}
            >
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
                Plans
              </Text>
              {availablePackages.map((pkg) => {
                // Check if this package matches the user's active entitlement
                const isCurrentPlan =
                  hasActiveSubscription &&
                  customerInfo?.activeSubscriptions.includes(
                    pkg.product.identifier
                  ) === true;
                return (
                  <PackageOption
                    key={pkg.identifier}
                    pkg={pkg}
                    isCurrentPlan={isCurrentPlan}
                    onSelect={handlePurchase}
                    isPurchasing={purchase.isPending || purchasePolling}
                  />
                );
              })}
              {purchasePolling && (
                <View
                  className="bg-surface rounded-card px-4 py-3.5 mt-2 flex-row items-center"
                  testID="purchase-polling-indicator"
                >
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    testID="purchase-polling-spinner"
                  />
                  <Text className="text-body font-semibold text-primary ml-2">
                    Confirming purchase…
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* No offerings fallback — show static tier comparison when RevenueCat is unavailable */}
          {availablePackages.length === 0 && !offeringsLoading && (
            <View
              testID="no-offerings"
              onLayout={(e) => {
                offeringsYRef.current = e.nativeEvent.layout.y;
              }}
            >
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
                Plans
              </Text>
              <View className="bg-surface rounded-card px-4 py-3.5 mb-3">
                <Text className="text-body-sm text-text-secondary">
                  {offeringsError
                    ? `We could not load purchase options right now. You're on the ${TIER_LABELS[tier]} plan with ${TIER_LIMITS[tier]}.`
                    : `You're on the ${TIER_LABELS[tier]} plan with ${TIER_LIMITS[tier]}. Here's what each plan includes — store purchasing isn't available on this device yet.`}
                </Text>
              </View>
              {TIER_FEATURES.map((entry) => (
                <View
                  key={entry.tier}
                  className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
                    entry.tier === tier ? 'border border-primary' : ''
                  }`}
                  testID={`static-tier-${entry.tier}`}
                >
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-body font-semibold text-text-primary">
                      {TIER_LABELS[entry.tier]}
                    </Text>
                    {entry.tier === tier && (
                      <View className="bg-primary-soft rounded-full px-2.5 py-0.5">
                        <Text className="text-caption font-semibold text-primary">
                          Current
                        </Text>
                      </View>
                    )}
                  </View>
                  {entry.features.map((feature) => (
                    <Text
                      key={feature}
                      className="text-caption text-text-secondary ml-1 mb-0.5"
                    >
                      {'\u2022'} {feature}
                    </Text>
                  ))}
                </View>
              ))}
              {offeringsError && (
                <View className="flex-row gap-3 mt-3">
                  <Pressable
                    onPress={() => void refetchOfferings()}
                    className="flex-1 bg-primary rounded-button px-4 py-3 min-h-[48px] items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading subscription offerings"
                    testID="offerings-retry-button"
                  >
                    <Text className="text-body font-semibold text-text-inverse">
                      Retry
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleContactSupport()}
                    className="flex-1 bg-surface-elevated rounded-button px-4 py-3 min-h-[48px] items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel="Contact support"
                    testID="offerings-contact-support"
                  >
                    <Text className="text-body font-semibold text-text-primary">
                      Contact support
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Restore purchases — required by App Store 3.1.1 */}
          <View className="mt-4">
            <Pressable
              onPress={handleRestore}
              disabled={restore.isPending || restorePolling}
              className="bg-surface rounded-card px-4 py-3.5"
              accessibilityLabel="Restore purchases"
              accessibilityRole="button"
              testID="restore-purchases-button"
            >
              <View className="flex-row items-center justify-center">
                {restore.isPending || restorePolling ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                      testID="restore-loading"
                    />
                    <Text className="text-body font-semibold text-primary ml-2">
                      {restorePolling
                        ? 'Verifying purchase...'
                        : 'Restoring...'}
                    </Text>
                  </View>
                ) : (
                  <Text className="text-body font-semibold text-primary">
                    Restore Purchases
                  </Text>
                )}
              </View>
            </Pressable>
            {restorePolling && (
              <Pressable
                onPress={() => {
                  setRestorePolling(false);
                  platformAlert(
                    'Restore cancelled',
                    'Restore will continue in background.'
                  );
                }}
                className="mt-2 items-center py-2"
                accessibilityRole="button"
                accessibilityLabel="Cancel restore"
                testID="restore-polling-cancel"
              >
                <Text className="text-body-sm text-primary font-semibold">
                  Check later
                </Text>
              </Pressable>
            )}
          </View>

          {/* Top-up */}
          {isPaidTier && (
            <View className="mt-6" testID="top-up-section">
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
                Need more questions?
              </Text>
              <Pressable
                onPress={handleTopUp}
                disabled={topUpPurchasing || topUpPolling}
                className="bg-surface rounded-card px-4 py-3.5"
                accessibilityLabel="Buy 500 credits"
                accessibilityRole="button"
                testID="top-up-button"
              >
                {topUpPurchasing || topUpPolling ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                      testID="top-up-spinner"
                    />
                    <Text className="text-body font-semibold text-primary ml-2">
                      {topUpPolling ? pollMessage : 'Opening store...'}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text className="text-body font-semibold text-primary">
                      Buy 500 credits
                    </Text>
                    <Text className="text-caption text-text-secondary mt-0.5">
                      One-time purchase. Credits expire in 12 months.
                    </Text>
                  </>
                )}
              </Pressable>
              {topUpPolling && (
                <Pressable
                  onPress={() => {
                    setTopUpPolling(false);
                    platformAlert(
                      'Check later',
                      'Credits will appear shortly — tap refresh to check.'
                    );
                  }}
                  className="mt-2 items-center py-2"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel top-up confirmation"
                  testID="top-up-polling-cancel"
                >
                  <Text className="text-body-sm text-primary font-semibold">
                    Check later
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Manage billing — deep links to platform subscription management */}
          {/* BUG-394: Fall back to API-side tier when RevenueCat fails */}
          {/* BUG-896: Show whenever user is on a paid tier per API, not only when */}
          {/* RevenueCat reports an active entitlement. The store deep-link works */}
          {/* regardless of RC sync state, and a paid user must always have a way */}
          {/* to cancel/manage in-app. */}
          {(isPaidTier || hasActiveSubscription) && (
            <View className="mt-6" testID="manage-section">
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
                Manage
              </Text>
              <Pressable
                onPress={handleManageBilling}
                className="bg-surface rounded-card px-4 py-3.5 mb-2"
                accessibilityLabel="Manage billing"
                accessibilityRole="button"
                testID="manage-billing-button"
              >
                <Text className="text-body text-text-primary">
                  Manage billing
                </Text>
                <Text className="text-caption text-text-secondary mt-0.5">
                  {Platform.OS === 'ios'
                    ? 'Opens App Store subscriptions'
                    : 'Opens Google Play subscriptions'}
                </Text>
              </Pressable>
            </View>
          )}

          <View className="mt-6" testID="byok-waitlist-section">
            <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
              Bring your own key
            </Text>
            <View className="bg-surface rounded-card px-4 py-3.5">
              <Text className="text-body-sm text-text-secondary mb-3">
                Use your own API key to unlock unlimited questions. Join the
                waitlist to be notified when available. We'll use your account
                email.
              </Text>
              <Pressable
                onPress={handleByokSubmit}
                disabled={byokWaitlist.isPending || byokJoined}
                className={`rounded-button px-4 py-2.5 items-center justify-center ${
                  byokJoined ? 'bg-surface-elevated' : 'bg-primary'
                }`}
                accessibilityLabel={
                  byokJoined
                    ? 'Already joined BYOK waitlist'
                    : 'Join BYOK waitlist'
                }
                accessibilityRole="button"
                testID="join-byok-waitlist-button"
              >
                {byokWaitlist.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.textInverse}
                    testID="join-byok-waitlist-loading"
                  />
                ) : byokJoined ? (
                  <Text className="text-text-secondary text-body font-semibold">
                    Already joined
                  </Text>
                ) : (
                  <Text className="text-text-inverse text-body font-semibold">
                    Join Waitlist
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
