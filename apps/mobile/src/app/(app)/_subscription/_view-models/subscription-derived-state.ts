import type { Platform as PlatformModule } from 'react-native';
import type {
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import type { SubscriptionTier } from '../../../../hooks/use-subscription';
import { isTopUpPackage } from '../purchase-errors';

export function deriveTierState(args: {
  tier: SubscriptionTier | undefined;
  status: string | undefined;
  cancelAtPeriodEnd: boolean | undefined;
  hasActiveSubscription: boolean;
  platformOS: PlatformModule['OS'];
}): {
  tier: SubscriptionTier;
  status: string;
  isPaidTier: boolean;
  canManageBilling: boolean;
  cancelAtPeriodEnd: boolean;
} {
  const tier = args.tier ?? 'free';
  const status = args.status ?? 'active';
  const isPaidTier = tier !== 'free';
  const canManageBilling =
    isPaidTier ||
    args.hasActiveSubscription ||
    (status === 'trial' && args.platformOS === 'web');
  return {
    tier,
    status,
    isPaidTier,
    canManageBilling,
    cancelAtPeriodEnd: args.cancelAtPeriodEnd ?? false,
  };
}

export function deriveOfferingsState(args: {
  currentOffering: PurchasesOffering | null;
  offeringsLoading: boolean;
  platformOS: PlatformModule['OS'];
}): {
  availablePackages: readonly PurchasesPackage[];
  subscriptionPackages: readonly PurchasesPackage[];
  storePurchaseUnavailable: boolean;
} {
  const availablePackages = args.currentOffering?.availablePackages ?? [];
  const subscriptionPackages = availablePackages.filter(
    (pkg) => !isTopUpPackage(pkg),
  );
  const storePurchaseUnavailable =
    args.platformOS === 'web' &&
    subscriptionPackages.length === 0 &&
    !args.offeringsLoading;
  return { availablePackages, subscriptionPackages, storePurchaseUnavailable };
}

export function deriveChildPaywallGate(args: {
  isOwnerProfile: boolean;
  hasActiveProfile: boolean;
  subscriptionStatus: string | undefined;
  subscriptionIsLoading: boolean;
  usageWarningLevel: string | undefined;
  subscriptionLoadError: boolean;
  usageLoadError: boolean;
  hasSubscriptionData: boolean;
  hasUsageData: boolean;
}): {
  isChild: boolean;
  hasLoadError: boolean;
  trialOrExpired: boolean;
  quotaExhausted: boolean;
  showPaywall: boolean;
} {
  const isChild = args.hasActiveProfile ? !args.isOwnerProfile : false;
  const hasSubscriptionLoadError =
    args.subscriptionLoadError && !args.hasSubscriptionData;
  const hasUsageLoadError = args.usageLoadError && !args.hasUsageData;
  const quotaExhausted =
    !hasUsageLoadError && args.usageWarningLevel === 'exceeded';
  const trialOrExpired =
    !hasSubscriptionLoadError &&
    (args.subscriptionStatus === 'expired' ||
      args.subscriptionStatus === 'cancelled' ||
      (!args.hasSubscriptionData && !args.subscriptionIsLoading));
  const showPaywall = isChild && (trialOrExpired || quotaExhausted);
  const hasLoadError =
    hasUsageLoadError || (hasSubscriptionLoadError && !showPaywall);
  return {
    isChild,
    hasLoadError,
    trialOrExpired,
    quotaExhausted,
    showPaywall,
  };
}
