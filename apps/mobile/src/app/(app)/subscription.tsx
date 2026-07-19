import i18next from 'i18next';
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
import { useRouter, useFocusEffect } from 'expo-router';
import type {
  PurchasesPackage,
  PurchasesOffering,
} from 'react-native-purchases';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  subscriptionResponseSchema,
  type FamilySubscription,
  type Usage,
} from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';
import { useProfile } from '../../lib/profile';
import { useApiClient } from '../../lib/api-client';
import { assertOk } from '../../lib/assert-ok';
import { queryKeys } from '../../lib/query-keys';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TimeoutLoader } from '../../components/common';
import {
  useSubscription,
  useUsage,
  useFamilySubscription,
  useJoinByokWaitlist,
  useRemoveFamilyProfile,
  fetchUsageData,
} from '../../hooks/use-subscription';
import {
  useOfferings,
  useCustomerInfo,
  usePurchase,
  useRestorePurchases,
} from '../../hooks/use-revenuecat';
import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import { useNavigationContract } from '../../hooks/use-navigation-contract';
import { track } from '../../lib/analytics';
import { formatShortDate } from '../../lib/format-datetime';
import {
  getTiersToCompare,
  getTierLabel,
  getTierLimit,
  getTierFeatureLabel,
  childCountBucket,
} from './_subscription/tier-helpers';
import {
  isTopUpPackage,
  isPurchaseCancelledError,
  isProductAlreadyPurchasedError,
  isNetworkError,
  getActiveEntitlement,
  openSubscriptionManagement,
} from './_subscription/purchase-errors';
import { PackageOption } from './_subscription/_components/PackageOption';
import { ChildPaywall } from './_subscription/_components/ChildPaywall';
import { SubscriptionHeader } from './_subscription/_components/SubscriptionHeader';
import { SubscriptionUsageCard } from './_subscription/_components/SubscriptionUsageCard';
import {
  deriveTierState,
  deriveOfferingsState,
  deriveChildPaywallGate,
} from './_subscription/_view-models/subscription-derived-state';
import { useMountedRef } from './_subscription/_hooks/use-mounted-ref';
import { usePurchaseConfirmationPoll } from './_subscription/_hooks/use-purchase-confirmation-poll';
import { useByokJoinedFlag } from './_subscription/_hooks/use-byok-joined-flag';

// ---------------------------------------------------------------------------
// Main Subscription Screen
// ---------------------------------------------------------------------------

function sharedPoolQuotaSnapshotsAgree(
  usage: Usage | undefined,
  family: FamilySubscription | null | undefined,
  expectedTier: FamilySubscription['tier'],
): boolean {
  if (!usage || !family || family.tier !== expectedTier) return false;

  const aggregate = usage.familyAggregate;
  const rows = usage.byProfile;
  if (!aggregate || !rows) return false;

  const memberTotal = rows.reduce((sum, row) => sum + row.used, 0);
  const formerMemberUsed = aggregate.formerMemberUsed ?? 0;
  const usageProfileIds = rows.map((row) => row.profile_id).sort();
  const familyProfileIds = family.members
    .map((member) => member.profileId)
    .sort();
  const sameProfileSet = usageProfileIds.every(
    (profileId, index) => profileId === familyProfileIds[index],
  );
  const planRemaining = Math.max(family.monthlyLimit - family.usedThisMonth, 0);

  return (
    family.monthlyLimit === usage.monthlyLimit &&
    aggregate.limit === usage.monthlyLimit &&
    aggregate.used === usage.usedThisMonth &&
    family.usedThisMonth === usage.usedThisMonth &&
    memberTotal + formerMemberUsed === aggregate.used &&
    rows.length === family.profileCount &&
    family.members.length === family.profileCount &&
    sameProfileSet &&
    family.remainingQuestions === planRemaining
  );
}

/**
 * SubscriptionScreen renders SubscriptionContent for all users.
 *
 * SubscriptionContent is responsible for:
 *   - Showing ChildPaywall to non-owner profiles whose subscription is
 *     expired / quota-exceeded.
 *   - Redirecting non-owner profiles with active subscriptions away (via
 *     ParentOnly inside SubscriptionContent, which gates the management UI).
 *
 * We intentionally do NOT wrap the outer screen in ParentOnly so that
 * non-owner profiles can reach the ChildPaywall branch. ParentOnly is applied
 * around the owner-only management content inside SubscriptionContent.
 */
export default function SubscriptionScreen() {
  return <SubscriptionContent />;
}

function SubscriptionContent(): React.ReactElement | null {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { activeProfile, profiles = [] } = useProfile();
  const navigationContract = useNavigationContract();
  const activeProfileRole = useActiveProfileRole();
  const client = useApiClient();
  const { t, i18n } = useTranslation();

  const queryClient = useQueryClient();

  // API hooks for usage display and subscription state
  const {
    data: subscription,
    isLoading: subLoading,
    isError: subError,
    refetch: refetchSub,
    isRefetching: subRefetching,
  } = useSubscription();
  const effectiveTier = subscription?.effectiveAccessTier ?? subscription?.tier;
  const sharedPoolTier =
    effectiveTier === 'family' || effectiveTier === 'pro'
      ? effectiveTier
      : null;
  const isSharedPoolTier = sharedPoolTier !== null;
  const {
    data: usage,
    isLoading: usageLoading,
    isError: usageError,
    refetch: refetchUsage,
    isRefetching: usageRefetching,
  } = useUsage();
  const {
    data: cachedFamilySubscription,
    isLoading: familySubscriptionLoading,
    isError: familySubscriptionError,
    isRefetching: familySubscriptionRefetching,
    refetch: refetchFamilySubscription,
  } = useFamilySubscription(isSharedPoolTier);
  // A disabled TanStack Query can still expose cached data. Gate the value as
  // well as the request so a Family/Pro cache cannot leak into a downgrade.
  const familySubscription = isSharedPoolTier
    ? cachedFamilySubscription
    : undefined;
  const byokWaitlist = useJoinByokWaitlist();
  const removeFamilyProfile = useRemoveFamilyProfile();
  const canUseOwnerBillingGates = navigationContract.gates.showBilling;
  const canRemoveFamilyMember = navigationContract.gates.showRemoveFamilyMember;
  // Session-owner fact: drives analytics and the child-paywall routing
  // decision below. Raw member.isOwner reads below only classify family-pool
  // rows; active-user role checks go through useActiveProfileRole/contract.
  const isOwnerProfile = activeProfileRole === 'owner';
  const linkedChildCount =
    canUseOwnerBillingGates && activeProfile
      ? profiles.filter((profile) => profile.id !== activeProfile.id).length
      : 0;
  const breakdownAnalytics = {
    is_owner: isOwnerProfile,
    breakdown_section_visible: Boolean(usage?.byProfile?.length),
    child_count_bucket: childCountBucket(linkedChildCount),
  };

  useEffect(() => {
    if (!usage) return;
    track('subscription_breakdown_mounted', {
      is_owner: isOwnerProfile,
      child_count_bucket: childCountBucket(linkedChildCount),
    });
  }, [isOwnerProfile, linkedChildCount, usage]);

  // BUG-399: Persistent "already joined" flag for BYOK waitlist
  const { byokJoined, markJoined: markByokJoined } = useByokJoinedFlag();

  // Top-up IAP state
  const [topUpPurchasing, setTopUpPurchasing] = useState(false);
  const [topUpPolling, setTopUpPolling] = useState(false);
  const [pollMessage, setPollMessage] = useState(() =>
    i18next.t('subscriptionScreen.poll.confirming'),
  );
  const topUpInFlightRef = useRef(false);

  // Restore-purchase polling state (BUG-397)
  const [restorePolling, setRestorePolling] = useState(false);
  // [#LOW] "Check later" cancels the spinner but the poll loop keeps running.
  // These refs let the post-resolve alert detect a user-cancelled flow and
  // suppress a late "Restored!"/"confirmed" alert that would confuse the user.
  const restoreCancelledRef = useRef(false);
  const topUpCancelledRef = useRef(false);

  // WI-1065: Reset cancellation refs on every screen focus so a prior
  // "Check later" from a previous visit cannot suppress the next poll's alert.
  // Tab navigation keeps the component mounted across navigations — refs
  // persist across blur/focus unless cleared here.
  useFocusEffect(
    useCallback(() => {
      restoreCancelledRef.current = false;
      topUpCancelledRef.current = false;
    }, []),
  );

  // Post-purchase polling state — shows visible feedback while the webhook
  // confirms the new subscription tier (PR-FIX-07)
  const [purchasePolling, setPurchasePolling] = useState(false);

  // BUG-403: ScrollView ref so the Upgrade button can scroll to offerings
  const scrollViewRef = useRef<ScrollView>(null);
  const offeringsYRef = useRef(0);

  // Track mount state so the top-up polling loop can bail out if the user
  // navigates away mid-poll (prevents setState-on-unmounted warnings and
  // unnecessary query invalidations).
  const mountedRef = useMountedRef();
  // Polling hook used by handleRestore / handlePurchase / handleTopUp to wait
  // for webhook-confirmed state changes after a store-side purchase.
  const poll = usePurchaseConfirmationPoll();

  // Non-owner profiles that do NOT need the child paywall redirect to home.
  // We compute this early so the useEffect runs unconditionally (React hooks
  // rules require all hooks before any conditional early-returns below).
  // The effect is a no-op when data is still loading or the paywall should show.
  const childGate = deriveChildPaywallGate({
    isOwnerProfile,
    hasActiveProfile: Boolean(activeProfile),
    subscriptionStatus: subscription?.status,
    subscriptionIsLoading: subLoading,
    usageWarningLevel: usage?.warningLevel,
    subscriptionLoadError: Boolean(subError),
    usageLoadError: Boolean(usageError),
    hasSubscriptionData: Boolean(subscription),
    hasUsageData: Boolean(usage),
  });
  const { isChild, hasLoadError, trialOrExpired, quotaExhausted, showPaywall } =
    childGate;
  useEffect(() => {
    // Redirect children who don't need the paywall (active sub or load error)
    // away from the owner-only management UI.
    if (isChild && !subLoading && !usageLoading && !showPaywall) {
      router.replace('/');
    }
  }, [isChild, subLoading, usageLoading, showPaywall, router]);

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

  // Shared-pool quota arithmetic is assembled from three independently cached
  // requests. Never compose them unless the server-provided denominator,
  // aggregate, member rows, and plan-cycle remaining value all agree. This
  // also covers a Plus -> Family transition where the old 700 usage query can
  // briefly outlive the new subscription query.
  const sharedPoolQuotaIsCoherent = sharedPoolTier
    ? sharedPoolQuotaSnapshotsAgree(usage, familySubscription, sharedPoolTier)
    : true;
  const sharedPoolQuotaLoading =
    isSharedPoolTier &&
    (familySubscriptionLoading ||
      subRefetching ||
      usageRefetching ||
      familySubscriptionRefetching);
  const sharedPoolQuotaUnavailable =
    isSharedPoolTier &&
    !sharedPoolQuotaLoading &&
    !familySubscriptionLoading &&
    (familySubscriptionError || !sharedPoolQuotaIsCoherent);

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
        t('subscription.restore.failedTitle'),
        t('subscription.restore.failedBody'),
      );
      return;
    }

    // BUG-397: RevenueCat's CustomerInfo is a local snapshot — the webhook
    // may not have processed yet, so poll the API (same pattern as top-up)
    // waiting for a paid subscription tier.
    restoreCancelledRef.current = false;
    setRestorePolling(true);

    const restoreOutcome = await poll.run({
      fetchProbe: () =>
        queryClient.fetchQuery<{ tier: string }>({
          queryKey: queryKeys.subscription(activeProfile?.id),
          staleTime: 0,
          queryFn: async () => {
            const res = await client.subscription.$get({});
            const okRes = await assertOk(res);
            const data = subscriptionResponseSchema.parse(await okRes.json());
            return data.subscription;
          },
        }),
      isConfirmed: (sub) => sub.tier !== 'free',
    });

    if (restoreOutcome === 'unmounted') {
      // TODO(follow-up): investigate whether handleRestore should be touching
      // topUpInFlightRef at all — the original pre-refactor code cleared the
      // top-up in-flight flag from inside the restore handler, which looks
      // like a copy-paste from handleTopUp. Preserved verbatim to keep the
      // refactor mechanical; flag for a separate audit.
      topUpInFlightRef.current = false;
      return;
    }
    setRestorePolling(false);

    // User tapped "Check later" — don't fire a late success/failure alert.
    if (restoreCancelledRef.current) {
      return;
    }

    if (restoreOutcome === 'confirmed') {
      await refetchUsage();
      platformAlert(
        t('subscription.alerts.restoredTitle'),
        t('subscription.alerts.restoredBody'),
      );
    } else {
      platformAlert(
        t('subscription.restore.notFoundTitle'),
        t('subscription.restore.notFoundBody'),
        [
          {
            text: t('subscriptionScreen.alerts.checkAgain'),
            onPress: () => {
              void refetchSub();
            },
          },
          { text: t('common.ok'), style: 'cancel' },
        ],
      );
    }
  }, [
    restore,
    queryClient,
    activeProfile?.id,
    client,
    refetchSub,
    refetchUsage,
    t,
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
            t('subscriptionScreen.alerts.alreadyPurchasedTitle'),
            t('subscriptionScreen.alerts.alreadyPurchasedBody'),
            [
              {
                text: t('subscriptionScreen.alerts.restorePurchasesButton'),
                onPress: () => void handleRestore(),
              },
              { text: t('common.cancel'), style: 'cancel' },
            ],
          );
          return;
        }
        if (isNetworkError(error)) {
          platformAlert(
            t('subscriptionScreen.alerts.networkErrorTitle'),
            t('subscriptionScreen.alerts.networkErrorBody'),
          );
          return;
        }
        platformAlert(
          t('subscriptionScreen.alerts.purchaseFailedTitle'),
          t('subscriptionScreen.alerts.purchaseFailedBody'),
        );
        return;
      }

      // Purchase succeeded on the store side — poll the API until the webhook
      // confirms the new subscription tier (PR-FIX-07: was unrendered _purchasePolling)
      setPurchasePolling(true);

      const purchaseOutcome = await poll.run({
        fetchProbe: () =>
          queryClient.fetchQuery<{ tier: string }>({
            queryKey: queryKeys.subscription(activeProfile?.id),
            staleTime: 0,
            queryFn: async () => {
              const res = await client.subscription.$get({});
              const okRes = await assertOk(res);
              const data = subscriptionResponseSchema.parse(await okRes.json());
              return data.subscription;
            },
          }),
        isConfirmed: (sub) => sub.tier !== 'free',
      });

      if (purchaseOutcome === 'unmounted') return;
      setPurchasePolling(false);

      // CRITICAL: refetchSub + refetchUsage fire UNCONDITIONALLY here (matches
      // pre-refactor behavior) — before the alert branch. Do NOT move this
      // into the confirmed branch.
      await Promise.all([refetchSub(), refetchUsage()]);

      if (purchaseOutcome === 'confirmed') {
        platformAlert(
          t('subscription.alerts.successTitle'),
          t('subscription.alerts.successBody'),
        );
      } else {
        platformAlert(
          t('subscription.alerts.purchaseConfirmedTitle'),
          t('subscription.alerts.purchaseConfirmedBody'),
          [{ text: t('common.ok') }],
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
      t,
    ],
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
        t('subscriptionScreen.alerts.manageBillingErrorTitle'),
        t('subscriptionScreen.alerts.manageBillingErrorBody', { url }),
        [
          {
            text: t('subscriptionScreen.alerts.tryAgain'),
            onPress: () => {
              void openSubscriptionManagement().catch(() => {
                // Second attempt also failed — user already has the URL from the alert.
              });
            },
          },
          { text: t('common.ok'), style: 'cancel' },
        ],
      );
    }
  }, [t]);

  // ---------------------------------------------------------------------------
  // Top-up handler — RevenueCat consumable IAP + poll for webhook confirmation
  // ---------------------------------------------------------------------------

  const handleTopUp = useCallback(async () => {
    if (topUpInFlightRef.current) return;
    // If offerings are still loading, do nothing (button should be disabled)
    if (offeringsLoading) return;

    // If offerings failed to load, give a retry path
    if (offeringsError || !offerings) {
      platformAlert(
        t('subscriptionScreen.alerts.topUpConnectionErrorTitle'),
        t('subscriptionScreen.alerts.topUpConnectionErrorBody'),
        [
          {
            text: t('subscriptionScreen.alerts.topUpRetry'),
            onPress: () => {
              void refetchOfferings();
            },
          },
          { text: t('common.ok'), style: 'cancel' },
        ],
      );
      return;
    }

    // Find the top-up package from offerings
    // RevenueCat consumables can be in a separate offering or as a non-subscription package
    const topUpOffering = offerings.all?.['top_up'] ?? offerings.current;
    const topUpPkg = topUpOffering?.availablePackages.find((p) =>
      isTopUpPackage(p),
    );

    if (!topUpPkg) {
      platformAlert(
        t('subscriptionScreen.alerts.topUpUnavailableTitle'),
        t('subscriptionScreen.alerts.topUpUnavailableBody'),
        [
          {
            text: t('common.retry'),
            onPress: () => {
              void refetchOfferings();
            },
          },
          { text: t('common.ok'), style: 'cancel' },
        ],
      );
      return;
    }

    // BC-02: use the usePurchase() hook instead of direct SDK call so that
    // TanStack Query loading/error state is managed and customerInfo cache
    // is automatically invalidated on success.
    topUpInFlightRef.current = true;
    setTopUpPurchasing(true);
    try {
      await purchase.mutateAsync(topUpPkg);
    } catch (error: unknown) {
      topUpInFlightRef.current = false;
      setTopUpPurchasing(false);
      if (isPurchaseCancelledError(error)) return;
      if (isNetworkError(error)) {
        platformAlert(
          t('subscriptionScreen.alerts.networkErrorTitle'),
          t('subscriptionScreen.alerts.networkErrorBody'),
        );
        return;
      }
      platformAlert(
        t('subscriptionScreen.alerts.purchaseFailedTitle'),
        t('subscriptionScreen.alerts.purchaseFailedBody'),
      );
      return;
    }

    // Purchase succeeded on store side — now poll API for webhook confirmation
    if (!mountedRef.current) return;
    setTopUpPurchasing(false);
    topUpCancelledRef.current = false;
    setTopUpPolling(true);
    setPollMessage(t('subscriptionScreen.poll.confirming'));
    const baseCredits = usage?.topUpCreditsRemaining ?? 0;
    const topUpOutcome = await poll.run({
      fetchProbe: () =>
        queryClient.fetchQuery<{ topUpCreditsRemaining: number }>({
          queryKey: queryKeys.usage(activeProfile?.id),
          staleTime: 0,
          queryFn: () => fetchUsageData(client),
        }),
      isConfirmed: (u) => u.topUpCreditsRemaining > baseCredits,
      onSlowPoll: () => setPollMessage(t('subscriptionScreen.poll.slowPoll')),
    });

    if (topUpOutcome === 'unmounted') return;
    topUpInFlightRef.current = false;
    setTopUpPolling(false);

    // User tapped "Check later" — suppress the late confirmation alert.
    if (topUpCancelledRef.current) {
      return;
    }

    if (topUpOutcome === 'confirmed') {
      platformAlert(
        t('subscription.alerts.topUpTitle'),
        t('subscription.alerts.topUpBody'),
      );
    } else {
      platformAlert(
        t('subscription.alerts.purchaseConfirmedTitle'),
        t('subscriptionScreen.alerts.topUpConfirmedBody'),
        [{ text: t('common.ok') }],
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
    t,
  ]);

  const handleContactSupport = useCallback(async () => {
    try {
      await Linking.openURL(
        'mailto:support@mentomate.app?subject=Subscription%20Help',
      );
    } catch {
      platformAlert(
        t('subscriptionScreen.alerts.contactSupportTitle'),
        t('subscriptionScreen.alerts.contactSupportBody'),
      );
    }
  }, [t]);

  const handleRemoveFamilyProfile = useCallback(
    (profileId: string, displayName: string) => {
      platformAlert(
        t('subscriptionScreen.alerts.removeFamilyTitle'),
        t('subscriptionScreen.alerts.removeFamilyBody', { name: displayName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('subscriptionScreen.alerts.removeAction'),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await removeFamilyProfile.mutateAsync(profileId);
                  await Promise.all([
                    refetchSub(),
                    refetchUsage(),
                    refetchFamilySubscription(),
                  ]);
                  platformAlert(
                    t('subscriptionScreen.alerts.familyUpdatedTitle'),
                    t('subscriptionScreen.alerts.familyUpdatedBody', {
                      name: displayName,
                    }),
                  );
                } catch {
                  platformAlert(
                    t('subscriptionScreen.alerts.removeFailedTitle'),
                    t('subscriptionScreen.alerts.removeFailedBody'),
                  );
                }
              })();
            },
          },
        ],
      );
    },
    [
      refetchFamilySubscription,
      refetchSub,
      refetchUsage,
      removeFamilyProfile,
      t,
    ],
  );

  // ---------------------------------------------------------------------------
  // BYOK waitlist handler
  // ---------------------------------------------------------------------------

  const handleByokSubmit = useCallback(async () => {
    try {
      await byokWaitlist.mutateAsync();
      markByokJoined();
      platformAlert(
        t('subscription.byokWaitlist.alerts.successTitle'),
        t('subscription.byokWaitlist.alerts.successBody'),
      );
    } catch {
      platformAlert(
        t('subscription.byokWaitlist.alerts.errorTitle'),
        t('subscription.byokWaitlist.alerts.errorBody'),
      );
    }
  }, [byokWaitlist, markByokJoined, t]);

  // ---------------------------------------------------------------------------
  // Child profile gate — child sees the child-friendly paywall
  // ---------------------------------------------------------------------------

  if (isChild && (trialOrExpired || quotaExhausted)) {
    const quotaKind =
      // `usage?.dailyLimit !== null` is true when usage is undefined, which
      // mislabels a monthly exhaustion as a daily one. Require an actual daily
      // limit AND a zero daily remainder before calling it daily_exceeded.
      usage?.dailyLimit != null && usage?.dailyRemainingQuestions === 0
        ? 'daily_exceeded'
        : 'monthly_exceeded';
    return (
      <ChildPaywall
        mode={quotaExhausted ? 'quota' : 'subscription'}
        quotaKind={quotaKind}
        resetsAt={usage?.resetsAt ?? usage?.cycleResetAt}
      />
    );
  }

  if (isChild) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Derive API-side subscription state for display
  // ---------------------------------------------------------------------------

  const tierState = deriveTierState({
    tier: subscription?.tier,
    status: subscription?.status,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd,
    hasActiveSubscription,
    platformOS: Platform.OS,
  });
  const { tier, status, isPaidTier, canManageBilling, cancelAtPeriodEnd } =
    tierState;

  // Get the current offering's available packages
  const currentOffering: PurchasesOffering | null = offerings?.current ?? null;
  const offeringsState = deriveOfferingsState({
    currentOffering,
    offeringsLoading,
    platformOS: Platform.OS,
  });
  const { subscriptionPackages, storePurchaseUnavailable } = offeringsState;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="subscription-screen"
    >
      <SubscriptionHeader />

      {isLoading ? (
        // BUG-767: Bare ActivityIndicator left users stuck forever if any of
        // subscription/usage/RevenueCat offerings/customerInfo never resolved
        // (Chrome web reports the screen as unresponsive). TimeoutLoader gives
        // a user-recoverable retry / go-home escape after 15s while keeping
        // the same testID for existing assertions.
        <View
          className="flex-1 items-center justify-center"
          testID="subscription-loading"
        >
          <TimeoutLoader
            isLoading={isLoading}
            timeoutMs={15_000}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => {
                void refetchSub();
                void refetchUsage();
                void refetchFamilySubscription();
                void refetchOfferings();
              },
              testID: 'subscription-loading-timeout-retry',
            }}
            secondaryAction={{
              label: t('common.goBack'),
              onPress: () => router.replace('/(app)/more'),
              testID: 'subscription-loading-timeout-back',
            }}
            testID="subscription-loading-spinner"
          />
        </View>
      ) : hasLoadError ? (
        <View
          className="flex-1 items-center justify-center px-5"
          testID="subscription-error"
        >
          <Text className="text-body text-text-secondary text-center mb-4">
            {t('subscription.loadError.message')}
          </Text>
          <Pressable
            onPress={() => {
              void refetchSub();
              void refetchUsage();
              void refetchFamilySubscription();
            }}
            disabled={
              subRefetching || usageRefetching || familySubscriptionRefetching
            }
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
            testID="subscription-retry-button"
            accessibilityLabel={t('subscription.loadError.retryAccessibility')}
            accessibilityRole="button"
          >
            {subRefetching ||
            usageRefetching ||
            familySubscriptionRefetching ? (
              <ActivityIndicator
                size="small"
                color="white"
                testID="subscription-retry-loading"
                accessibilityLabel={t('common.loading')}
              />
            ) : (
              <Text className="text-text-inverse text-body font-semibold">
                {t('common.retry')}
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
          {/* [BUG-966] Trial banner — surfaces "Trial active" headline with the
              trial end date when the server reports status='trial'. The status
              badge below also shifts to "Trial" so it does not falsely read
              "Active" for a trialing user. */}
          {status === 'trial' && (
            <View
              className="bg-primary-soft rounded-card px-4 py-3 mt-4"
              testID="trial-banner"
            >
              <Text className="text-body font-semibold text-primary">
                {t('subscription.trial.active')}
              </Text>
              {subscription?.trialEndsAt && (
                <Text
                  className="text-caption text-text-secondary mt-0.5"
                  testID="trial-banner-ends-at"
                >
                  {t('subscription.trial.endsAt', {
                    date: formatShortDate(
                      subscription.trialEndsAt,
                      i18n?.language,
                      {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      },
                    ),
                  })}
                </Text>
              )}
            </View>
          )}

          {/* Current plan */}
          <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-4">
            {t('subscription.currentPlan')}
          </Text>
          <View
            className="bg-surface rounded-card px-4 py-3.5"
            testID="current-plan"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-body font-semibold text-text-primary">
                {getTierLabel(tier, t)}
              </Text>
              <View className="bg-primary-soft rounded-full px-2.5 py-1">
                <Text className="text-caption font-semibold text-primary capitalize">
                  {cancelAtPeriodEnd
                    ? t('subscription.statusBadge.cancelling')
                    : status === 'past_due'
                      ? t('subscription.statusBadge.pastDue')
                      : status === 'expired'
                        ? t('subscription.statusBadge.expired')
                        : status === 'trial'
                          ? t('subscription.statusBadge.trial')
                          : status === 'active'
                            ? t('subscription.statusBadge.active')
                            : // Don't show a green "Active" badge for unknown
                              // statuses (paused, incomplete, etc.) — surface the
                              // raw status so it's never misrepresented as healthy.
                              (status ?? t('subscription.statusBadge.unknown'))}
                </Text>
              </View>
            </View>
            <Text className="text-caption text-text-secondary mt-1">
              {getTierLimit(tier, t)}
            </Text>
            {subscription?.currentPeriodEnd && isPaidTier && (
              <Text className="text-caption text-text-secondary mt-1">
                {cancelAtPeriodEnd
                  ? t('subscription.accessUntil', {
                      date: formatShortDate(
                        subscription.currentPeriodEnd,
                        i18n?.language,
                        {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        },
                      ),
                    })
                  : t('subscription.renewsOn', {
                      date: formatShortDate(
                        subscription.currentPeriodEnd,
                        i18n?.language,
                        {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        },
                      ),
                    })}
              </Text>
            )}
            {!isPaidTier &&
              (storePurchaseUnavailable ? (
                <View
                  className="bg-surface-elevated rounded-card px-4 py-3 mt-3"
                  testID="free-upgrade-unavailable"
                >
                  <Text className="text-body-sm font-semibold text-text-primary">
                    {t('subscription.web.plansOnMobile')}
                  </Text>
                  <Text className="text-caption text-text-secondary mt-1">
                    {t('subscription.web.storePurchaseUnavailable')}
                  </Text>
                </View>
              ) : (
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
                    if (
                      subscriptionPackages.length === 0 &&
                      !offeringsLoading
                    ) {
                      void refetchOfferings();
                    }
                  }}
                  className="bg-primary rounded-button py-2.5 px-4 mt-3 items-center"
                  testID="free-upgrade-button"
                  accessibilityLabel={t('subscriptionScreen.a11yUpgradePlan')}
                  accessibilityRole="button"
                >
                  <Text className="text-body font-semibold text-text-inverse">
                    {t('subscription.upgrade')}
                  </Text>
                </Pressable>
              ))}
          </View>

          {/* Cancellation notice */}
          {cancelAtPeriodEnd && subscription?.currentPeriodEnd && (
            <View className="bg-warning-soft rounded-card px-4 py-3 mt-2">
              <Text className="text-body-sm font-semibold text-warning">
                {t('subscription.endingTitle')}
              </Text>
              <Text className="text-caption text-text-secondary mt-0.5">
                {t('subscription.endingBody', {
                  date: formatShortDate(
                    subscription.currentPeriodEnd,
                    i18n?.language,
                    {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    },
                  ),
                })}
              </Text>
            </View>
          )}

          {/* Usage meter */}
          {sharedPoolQuotaLoading ? (
            <View
              className="bg-surface rounded-card px-4 py-4 mt-4 items-center"
              testID="family-quota-loading"
            >
              <ActivityIndicator
                size="small"
                color={colors.primary}
                accessibilityLabel={t('common.loading')}
              />
            </View>
          ) : sharedPoolQuotaUnavailable ? (
            <View
              className="bg-surface rounded-card px-4 py-4 mt-4"
              testID="family-quota-error"
            >
              <Text className="text-body-sm text-text-secondary text-center mb-3">
                {t('subscription.loadError.message')}
              </Text>
              <Pressable
                onPress={() => {
                  void refetchSub();
                  void refetchUsage();
                  void refetchFamilySubscription();
                }}
                disabled={
                  subRefetching ||
                  usageRefetching ||
                  familySubscriptionRefetching
                }
                className="bg-primary rounded-button px-5 py-3 min-h-[48px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={t(
                  'subscription.loadError.retryAccessibility',
                )}
                testID="family-quota-retry"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  {t('common.retry')}
                </Text>
              </Pressable>
            </View>
          ) : usage ? (
            <SubscriptionUsageCard
              usage={usage}
              canUseOwnerBillingGates={canUseOwnerBillingGates}
              breakdownAnalytics={breakdownAnalytics}
            />
          ) : null}

          {familySubscription && sharedPoolQuotaIsCoherent && (
            <View className="mt-4" testID="family-pool-section">
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2">
                {t('subscription.familyPool')}
              </Text>
              <View className="bg-surface rounded-card px-4 py-3.5">
                <Text className="text-body font-semibold text-text-primary">
                  {t('subscription.profilesConnected', {
                    count: familySubscription.profileCount,
                    max: familySubscription.maxProfiles,
                  })}
                </Text>
                <Text className="text-caption text-text-secondary mt-1">
                  {t('subscription.sharedQuestionsLeft', {
                    count: familySubscription.remainingQuestions,
                  })}
                </Text>
                <View className="mt-3">
                  {familySubscription.members.map((member) => (
                    <View
                      key={member.profileId}
                      className="flex-row items-center justify-between py-1"
                      testID={`family-member-${member.profileId}`}
                    >
                      <Text className="text-caption text-text-secondary">
                        {member.isOwner
                          ? t('subscription.memberOwnerLabel', {
                              name: member.displayName,
                            })
                          : member.displayName}
                      </Text>
                      {canRemoveFamilyMember && !member.isOwner ? (
                        <Pressable
                          onPress={() =>
                            handleRemoveFamilyProfile(
                              member.profileId,
                              member.displayName,
                            )
                          }
                          disabled={removeFamilyProfile.isPending}
                          className="min-h-[44px] justify-center px-2"
                          accessibilityRole="button"
                          accessibilityLabel={t(
                            'subscriptionScreen.a11yRemoveMember',
                            {
                              name: member.displayName,
                            },
                          )}
                          testID={`remove-family-member-${member.profileId}`}
                        >
                          <Text className="text-caption font-semibold text-danger">
                            {removeFamilyProfile.isPending
                              ? t('subscription.removingMember')
                              : t('subscription.removeMember')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* RevenueCat Offerings — available packages */}
          {subscriptionPackages.length > 0 && (
            <View
              testID="offerings-section"
              onLayout={(e) => {
                offeringsYRef.current = e.nativeEvent.layout.y;
              }}
            >
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6">
                {t('subscription.plans')}
              </Text>
              {subscriptionPackages.map((pkg) => {
                // Check if this package matches the user's active entitlement
                const isCurrentPlan =
                  hasActiveSubscription &&
                  customerInfo?.activeSubscriptions.includes(
                    pkg.product.identifier,
                  ) === true;
                return (
                  <PackageOption
                    key={`${pkg.identifier}-${pkg.product.identifier}`}
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
                    accessibilityLabel={t('common.loading')}
                  />
                  <Text className="text-body font-semibold text-primary ml-2">
                    {t('subscription.confirmingPurchase')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* No offerings fallback — show static tier comparison when RevenueCat is unavailable */}
          {subscriptionPackages.length === 0 && !offeringsLoading && (
            <View
              testID="no-offerings"
              onLayout={(e) => {
                offeringsYRef.current = e.nativeEvent.layout.y;
              }}
            >
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6">
                {t('subscription.plans')}
              </Text>
              <View className="bg-surface rounded-card px-4 py-3.5 mb-3">
                <Text className="text-body-sm text-text-secondary">
                  {offeringsError
                    ? t('subscriptionScreen.plans.offeringsError', {
                        tier: getTierLabel(tier, t),
                        limits: getTierLimit(tier, t),
                      })
                    : t('subscriptionScreen.plans.offeringsWebOnly', {
                        tier: getTierLabel(tier, t),
                        limits: getTierLimit(tier, t),
                      })}
                </Text>
              </View>
              {getTiersToCompare(tier).map((entry) => (
                <View
                  key={entry.tier}
                  className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
                    entry.tier === tier ? 'border border-primary' : ''
                  }`}
                  testID={`static-tier-${entry.tier}`}
                >
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-body font-semibold text-text-primary">
                      {getTierLabel(entry.tier, t)}
                    </Text>
                    {entry.tier === tier && (
                      <View className="bg-primary-soft rounded-full px-2.5 py-0.5">
                        <Text className="text-caption font-semibold text-primary">
                          {t('subscriptionScreen.plans.currentBadge')}
                        </Text>
                      </View>
                    )}
                  </View>
                  {Array.from({ length: entry.count }, (_, index) =>
                    getTierFeatureLabel(entry.tier, index, t),
                  ).map((feature) => (
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
                    accessibilityLabel={t(
                      'subscriptionScreen.plans.retryOfferingsAccessibilityLabel',
                    )}
                    testID="offerings-retry-button"
                  >
                    <Text className="text-body font-semibold text-text-inverse">
                      {t('subscriptionScreen.plans.retryOfferings')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleContactSupport()}
                    className="flex-1 bg-surface-elevated rounded-button px-4 py-3 min-h-[48px] items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'subscriptionScreen.plans.contactSupportAccessibilityLabel',
                    )}
                    testID="offerings-contact-support"
                  >
                    <Text className="text-body font-semibold text-text-primary">
                      {t('subscriptionScreen.plans.contactSupport')}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Restore purchases — required by App Store 3.1.1.
              [BUG-606] Hidden on web: `handleRestore` calls the RevenueCat
              native SDK (`Purchases.restorePurchases()`), which is not
              available in the web bundle and would throw at runtime when
              tapped from a browser. Native iOS/Android only. */}
          {Platform.OS !== 'web' && (
            <View className="mt-4">
              <Pressable
                onPress={handleRestore}
                disabled={restore.isPending || restorePolling}
                className="bg-surface rounded-card px-4 py-3.5"
                accessibilityLabel={t(
                  'subscription.restore.accessibilityLabel',
                )}
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
                        accessibilityLabel={t('common.loading')}
                      />
                      <Text className="text-body font-semibold text-primary ml-2">
                        {restorePolling
                          ? t('subscription.restore.verifying')
                          : t('subscription.restore.restoring')}
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-body font-semibold text-primary">
                      {t('subscription.restore.button')}
                    </Text>
                  )}
                </View>
              </Pressable>
              {restorePolling && (
                <Pressable
                  onPress={() => {
                    restoreCancelledRef.current = true;
                    setRestorePolling(false);
                    platformAlert(
                      t('subscription.restore.cancelledTitle'),
                      t('subscription.restore.cancelledBody'),
                    );
                  }}
                  className="mt-2 items-center py-2"
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'subscription.restore.cancelAccessibilityLabel',
                  )}
                  testID="restore-polling-cancel"
                >
                  <Text className="text-body-sm text-primary font-semibold">
                    {t('subscription.checkLater')}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Top-up */}
          {isPaidTier && (
            <View className="mt-6" testID="top-up-section">
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2">
                {t('subscription.needMoreQuestions')}
              </Text>
              <Pressable
                onPress={handleTopUp}
                disabled={topUpPurchasing || topUpPolling}
                className="bg-surface rounded-card px-4 py-3.5"
                accessibilityLabel={t('subscriptionScreen.a11yBuyCredits')}
                accessibilityRole="button"
                testID="top-up-button"
              >
                {topUpPurchasing || topUpPolling ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                      testID="top-up-spinner"
                      accessibilityLabel={t('common.loading')}
                    />
                    <Text className="text-body font-semibold text-primary ml-2">
                      {topUpPolling
                        ? pollMessage
                        : t('subscription.openingStore')}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text className="text-body font-semibold text-primary">
                      {t('subscription.buyCredits')}
                    </Text>
                    <Text className="text-caption text-text-secondary mt-0.5">
                      {t('subscription.topUpHint')}
                    </Text>
                  </>
                )}
              </Pressable>
              {topUpPolling && (
                <Pressable
                  onPress={() => {
                    topUpCancelledRef.current = true;
                    setTopUpPolling(false);
                    platformAlert(
                      t('subscriptionScreen.alerts.checkLaterTitle'),
                      t('subscriptionScreen.alerts.checkLaterBody'),
                    );
                  }}
                  className="mt-2 items-center py-2"
                  accessibilityRole="button"
                  accessibilityLabel={t('subscriptionScreen.a11yCancelTopUp')}
                  testID="top-up-polling-cancel"
                >
                  <Text className="text-body-sm text-primary font-semibold">
                    {t('subscription.checkLater')}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Manage billing — native deep link or web-only plan guidance */}
          {/* BUG-394: Fall back to API-side tier when RevenueCat fails */}
          {/* BUG-896/916: Paid native users need a store management path even */}
          {/* when RC sync lags; trial users only get the static web guidance */}
          {/* unless RevenueCat confirms a native entitlement. */}
          {canManageBilling && (
            <View className="mt-6" testID="manage-section">
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2">
                {t('subscription.manage')}
              </Text>
              {/* [BUG-916] Web has no native store deep link — RevenueCat IAP
                  runs on iOS/Android only, Stripe is dormant for web. Render a
                  static info row pointing the user to their mobile device
                  instead of the Google Play link, which is misleading. */}
              {Platform.OS === 'web' ? (
                <View
                  className="bg-surface rounded-card px-4 py-3.5 mb-2"
                  testID="manage-billing-web-info"
                >
                  <Text className="text-body text-text-primary">
                    {t('subscription.manageBilling')}
                  </Text>
                  <Text className="text-caption text-text-secondary mt-0.5">
                    {t('subscription.manageBillingWebHint')}
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={handleManageBilling}
                  className="bg-surface rounded-card px-4 py-3.5 mb-2"
                  accessibilityLabel={t('subscriptionScreen.a11yManageBilling')}
                  accessibilityRole="button"
                  testID="manage-billing-button"
                >
                  <Text className="text-body text-text-primary">
                    {t('subscription.manageBilling')}
                  </Text>
                  <Text className="text-caption text-text-secondary mt-0.5">
                    {Platform.OS === 'ios'
                      ? t('subscription.opensAppStore')
                      : t('subscription.opensGooglePlay')}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <View className="mt-6" testID="byok-waitlist-section">
            <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2">
              {t('subscription.byokWaitlist.heading')}
            </Text>
            <View className="bg-surface rounded-card px-4 py-3.5">
              <Text className="text-body-sm text-text-secondary mb-3">
                {t('subscription.byokWaitlist.body')}
              </Text>
              <Pressable
                onPress={handleByokSubmit}
                disabled={byokWaitlist.isPending || byokJoined}
                className={`rounded-button px-4 py-2.5 items-center justify-center ${
                  byokJoined ? 'bg-surface-elevated' : 'bg-primary'
                }`}
                accessibilityLabel={
                  byokJoined
                    ? t(
                        'subscription.byokWaitlist.alreadyJoinedAccessibilityLabel',
                      )
                    : t('subscription.byokWaitlist.joinAccessibilityLabel')
                }
                accessibilityRole="button"
                testID="join-byok-waitlist-button"
              >
                {byokWaitlist.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.textInverse}
                    testID="join-byok-waitlist-loading"
                    accessibilityLabel={t('common.loading')}
                  />
                ) : byokJoined ? (
                  <Text className="text-text-secondary text-body font-semibold">
                    {t('subscription.byokWaitlist.alreadyJoinedButton')}
                  </Text>
                ) : (
                  <Text className="text-text-inverse text-body font-semibold">
                    {t('subscription.byokWaitlist.joinButton')}
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
