import { Linking, Platform } from 'react-native';
import type {
  CustomerInfo,
  PurchasesError,
  PurchasesPackage,
} from 'react-native-purchases';
import { PACKAGE_TYPE, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import type { Translate } from '../../../i18n';
import { PACKAGE_PERIOD_KEY } from './constants';

export function getPackagePeriodLabel(
  pkg: PurchasesPackage,
  t: Translate,
): string {
  const key = PACKAGE_PERIOD_KEY[pkg.packageType];
  return key ? t(key) : pkg.identifier;
}

export function isTopUpPackage(pkg: PurchasesPackage): boolean {
  return (
    pkg.packageType === PACKAGE_TYPE.CUSTOM &&
    pkg.product.identifier.includes('topup')
  );
}

/**
 * Checks whether a RevenueCat error represents a user-initiated cancellation.
 * User cancellations are not real errors — the user simply dismissed the
 * native payment sheet.
 */
export function isPurchaseCancelledError(error: unknown): boolean {
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
export function isProductAlreadyPurchasedError(error: unknown): boolean {
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
export function isNetworkError(error: unknown): boolean {
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
export function getActiveEntitlement(
  customerInfo: CustomerInfo | null | undefined,
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
export async function openSubscriptionManagement(): Promise<void> {
  if (Platform.OS === 'ios') {
    await Linking.openURL('https://apps.apple.com/account/subscriptions');
  } else {
    await Linking.openURL(
      'https://play.google.com/store/account/subscriptions',
    );
  }
}
