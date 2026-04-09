import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
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
import { useProfile } from '../../lib/profile';
import { UsageMeter } from '../../components/common';
import {
  useSubscription,
  useUsage,
  useFamilySubscription,
  useJoinByokWaitlist,
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

/** Static tier features for display when RevenueCat offerings are unavailable. */
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
  {
    tier: 'family',
    features: [
      '1,500 questions per month (shared)',
      'All Free features',
      'Up to 4 child profiles',
      'Parent dashboard',
    ],
  },
  {
    tier: 'pro',
    features: [
      '3,000 questions per month',
      'Up to 6 profiles',
      'Premium AI mentor for 2 profiles',
      'Priority support',
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
          );
        }
      } else if (result.sent) {
        const now = Date.now();
        setNotifiedAt(now);
        if (profileId) {
          void SecureStore.setItemAsync(
            getNotifyStorageKey(profileId),
            String(now)
          );
        }
        Alert.alert('Sent!', 'We let your parent know!');
      } else {
        Alert.alert(
          'Ask your parent',
          'Ask your parent to open the app and subscribe.'
        );
      }
    } catch {
      Alert.alert(
        'Ask your parent',
        'Ask your parent to open the app and subscribe.'
      );
    }
  }, [notifyParent, profileId]);

  const topicsLearned = xpSummary?.topicsCompleted ?? 0;
  const totalXp = xpSummary?.totalXp ?? 0;
  const hasStats = topicsLearned > 0 || totalXp > 0;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="child-paywall"
    >
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
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
          {hasStats
            ? `You learned ${topicsLearned} topic${
                topicsLearned !== 1 ? 's' : ''
              } and earned ${totalXp} XP \u2014 keep going!`
            : "You've been making great progress \u2014 keep going!"}
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

        <Text className="text-body-sm text-text-secondary text-center mb-6">
          While you wait, you can still browse your Library and see your
          progress.
        </Text>

        <Pressable
          onPress={() => router.push('/(app)/library')}
          className="bg-surface rounded-button py-3.5 px-8 items-center w-full"
          testID="browse-library-button"
          accessibilityRole="button"
          accessibilityLabel="Browse Library"
        >
          <Text className="text-body font-semibold text-primary">
            Browse Library
          </Text>
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
  const [byokEmail, setByokEmail] = useState('');
  const { activeProfile } = useProfile();

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

  // Top-up IAP state
  const [topUpPurchasing, setTopUpPurchasing] = useState(false);
  const [topUpPolling, setTopUpPolling] = useState(false);

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
  // Purchase handler — triggers native store payment sheet
  // ---------------------------------------------------------------------------

  const handlePurchase = useCallback(
    async (pkg: PurchasesPackage) => {
      try {
        await purchase.mutateAsync(pkg);
        await Promise.all([refetchSub(), refetchUsage()]);
        Alert.alert('Success', 'Your subscription is now active!');
      } catch (error: unknown) {
        if (isPurchaseCancelledError(error)) {
          // User cancelled — not an error, just dismiss silently
          return;
        }
        if (isNetworkError(error)) {
          Alert.alert(
            'Network error',
            'Please check your internet connection and try again.'
          );
          return;
        }
        Alert.alert(
          'Purchase failed',
          'Something unexpected happened with your purchase. Please try again.'
        );
      }
    },
    [purchase, refetchSub, refetchUsage]
  );

  // ---------------------------------------------------------------------------
  // Restore purchases handler
  // ---------------------------------------------------------------------------

  const handleRestore = useCallback(async () => {
    try {
      const info = await restore.mutateAsync();
      const restoredEntitlement = getActiveEntitlement(info);
      if (restoredEntitlement) {
        await Promise.all([refetchSub(), refetchUsage()]);
        Alert.alert('Restored', 'Your subscription has been restored.');
      } else {
        Alert.alert(
          'No subscriptions found',
          'We could not find any previous purchases to restore.'
        );
      }
    } catch {
      Alert.alert(
        'Restore failed',
        'Could not restore purchases. Please try again.'
      );
    }
  }, [refetchSub, refetchUsage, restore]);

  // ---------------------------------------------------------------------------
  // Manage billing — deep link to platform subscription management
  // ---------------------------------------------------------------------------

  const handleManageBilling = useCallback(async () => {
    try {
      await openSubscriptionManagement();
    } catch {
      Alert.alert('Error', 'Could not open subscription management.');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Top-up handler — RevenueCat consumable IAP + poll for webhook confirmation
  // ---------------------------------------------------------------------------

  const handleTopUp = useCallback(async () => {
    // Find the top-up package from offerings
    // RevenueCat consumables can be in a separate offering or as a non-subscription package
    const topUpOffering = offerings?.all?.['top_up'] ?? offerings?.current;
    const topUpPkg = topUpOffering?.availablePackages.find((p) =>
      p.product.identifier.includes('topup')
    );

    if (!topUpPkg) {
      Alert.alert('Error', 'Top-up package not available.');
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
        Alert.alert(
          'Network error',
          'Please check your internet connection and try again.'
        );
        return;
      }
      Alert.alert(
        'Purchase failed',
        'Something unexpected happened with your purchase. Please try again.'
      );
      return;
    }

    // Purchase succeeded on store side — now poll API for webhook confirmation
    if (!mountedRef.current) return;
    setTopUpPurchasing(false);
    setTopUpPolling(true);

    const baseCredits = usage?.topUpCreditsRemaining ?? 0;
    const maxAttempts = 15; // ~30 seconds with 2s interval
    const pollIntervalMs = 2000;
    let confirmed = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!mountedRef.current) break;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (!mountedRef.current) break;
      await queryClient.invalidateQueries({ queryKey: ['usage'] });
      // Brief wait for the query to refetch
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!mountedRef.current) break;
      const freshUsage = queryClient.getQueryData<{
        topUpCreditsRemaining: number;
      }>(['usage', activeProfile?.id]);
      if (freshUsage && freshUsage.topUpCreditsRemaining > baseCredits) {
        confirmed = true;
        break;
      }
    }

    if (!mountedRef.current) return;
    setTopUpPolling(false);

    if (confirmed) {
      Alert.alert('Top-up', '500 additional credits have been added!');
    } else {
      Alert.alert(
        'Processing',
        'Your purchase is being processed. Credits will appear shortly.',
        [
          {
            text: 'Check your usage',
            onPress: () => {
              void refetchUsage();
            },
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
    }
  }, [offerings, usage, queryClient, activeProfile?.id, refetchUsage]);

  const handleContactSupport = useCallback(async () => {
    try {
      await Linking.openURL(
        'mailto:support@mentomate.app?subject=Subscription%20Help'
      );
    } catch {
      Alert.alert(
        'Contact support',
        'Email support@mentomate.app for help with subscriptions.'
      );
    }
  }, []);

  // ---------------------------------------------------------------------------
  // BYOK waitlist handler
  // ---------------------------------------------------------------------------

  const handleByokSubmit = useCallback(async () => {
    const email = byokEmail.trim();
    if (!email) return;
    try {
      await byokWaitlist.mutateAsync({ email });
      Alert.alert('Waitlist', 'You have been added to the BYOK waitlist.');
      setByokEmail('');
    } catch {
      Alert.alert('Error', 'Could not join waitlist. Try again.');
    }
  }, [byokEmail, byokWaitlist]);

  // ---------------------------------------------------------------------------
  // Child profile gate — child sees the child-friendly paywall
  // ---------------------------------------------------------------------------

  const isChild = activeProfile ? !activeProfile.isOwner : false;
  const hasLoadError = subError || usageError;
  const trialOrExpired =
    !hasLoadError &&
    (subscription?.status === 'expired' || (!subscription && !subLoading));
  if (isChild && trialOrExpired) {
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
          onPress={() => router.back()}
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
                    ).toLocaleDateString()}`
                  : `Renews ${new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString()}`}
              </Text>
            )}
            {!isPaidTier && (
              <Pressable
                onPress={() => {
                  if (availablePackages.length > 0) {
                    // RevenueCat packages available — scroll handled by layout
                  } else {
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
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                After that, your account will revert to the Free tier.
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
                {usage.topUpCreditsRemaining > 0 && (
                  <Text className="text-caption text-text-secondary mt-2">
                    + {usage.topUpCreditsRemaining} top-up credits remaining
                  </Text>
                )}
                <Text className="text-caption text-text-secondary mt-1">
                  Resets {new Date(usage.cycleResetAt).toLocaleDateString()}
                </Text>
              </View>
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
            <View testID="offerings-section">
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
                    isPurchasing={purchase.isPending}
                  />
                );
              })}
            </View>
          )}

          {/* No offerings fallback — show static tier comparison when RevenueCat is unavailable */}
          {availablePackages.length === 0 && !offeringsLoading && (
            <View testID="no-offerings">
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
                Plans
              </Text>
              <View className="bg-surface rounded-card px-4 py-3.5 mb-3">
                <Text className="text-body-sm text-text-secondary">
                  {offeringsError
                    ? 'We could not load purchase options right now. '
                    : 'Subscription plans will be available soon. '}
                  {`You're on the ${TIER_LABELS[tier]} plan with ${TIER_LIMITS[tier]}.`}
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
              disabled={restore.isPending}
              className="bg-surface rounded-card px-4 py-3.5"
              accessibilityLabel="Restore purchases"
              accessibilityRole="button"
              testID="restore-purchases-button"
            >
              <View className="flex-row items-center justify-center">
                {restore.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    testID="restore-loading"
                  />
                ) : (
                  <Text className="text-body font-semibold text-primary">
                    Restore Purchases
                  </Text>
                )}
              </View>
            </Pressable>
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
                      {topUpPolling
                        ? 'Purchase processing...'
                        : 'Opening store...'}
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
            </View>
          )}

          {/* AI Upgrade — premium model for individual profiles */}
          {isPaidTier && (
            <View className="mt-6" testID="ai-upgrade-section">
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
                Premium Mentor
              </Text>
              <View className="bg-surface rounded-card px-4 py-3.5">
                <Text className="text-body font-semibold text-text-primary mb-1">
                  Upgrade your AI mentor
                </Text>
                <Text className="text-body-sm text-text-secondary mb-3">
                  Get a more advanced AI that explains things more clearly,
                  catches misunderstandings faster, and adapts better to how you
                  learn. Available as an add-on for individual profiles.
                </Text>
                <View className="bg-primary-soft rounded-card px-3 py-2">
                  <Text className="text-body-sm font-semibold text-primary">
                    +$15/month per profile
                  </Text>
                  <Text className="text-caption text-text-secondary mt-0.5">
                    Coming soon — we'll notify you when available.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Manage billing — deep links to platform subscription management */}
          {hasActiveSubscription && (
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
                waitlist to be notified when available.
              </Text>
              <View className="flex-row">
                <TextInput
                  value={byokEmail}
                  onChangeText={setByokEmail}
                  placeholder="your@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="flex-1 bg-background rounded-button px-3 py-2.5 text-body text-text-primary me-2"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Email for BYOK waitlist"
                  testID="byok-waitlist-email-input"
                />
                <Pressable
                  onPress={handleByokSubmit}
                  disabled={byokWaitlist.isPending || !byokEmail.trim()}
                  className="bg-primary rounded-button px-4 py-2.5 justify-center"
                  accessibilityLabel="Join BYOK waitlist"
                  accessibilityRole="button"
                  testID="join-byok-waitlist-button"
                >
                  {byokWaitlist.isPending ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.textInverse}
                      testID="join-byok-waitlist-loading"
                    />
                  ) : (
                    <Text className="text-text-inverse text-body font-semibold">
                      Join
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
