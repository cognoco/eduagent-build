import type { Translate } from '../../../i18n';
import { NOTIFY_COOLDOWN_MS } from './constants';

// Key renamed from colon to dash delimiter — colons caused SecureStore
// crashes on some Android devices. See migrate-secure-store-key.ts.
export function getNotifyStorageKey(profileId: string): string {
  return `child-paywall-notified-at-${profileId}`;
}

/** @deprecated Old colon-delimited key — used only for migration. */
export function getLegacyNotifyStorageKey(profileId: string): string {
  return `child-paywall-notified-at:${profileId}`;
}

export function computeCooldownMsRemaining(notifiedAtMs: number): number {
  const elapsed = Date.now() - notifiedAtMs;
  return Math.max(0, NOTIFY_COOLDOWN_MS - elapsed);
}

export function formatCooldownLabel(msRemaining: number, t: Translate): string {
  if (msRemaining <= 0)
    return t('subscriptionScreen.childPaywall.cooldownZero');

  if (msRemaining >= 60 * 60 * 1000) {
    const hours = Math.ceil(msRemaining / (60 * 60 * 1000));
    return t('subscriptionScreen.childPaywall.cooldownHours', {
      count: hours,
    });
  }

  if (msRemaining >= 60_000) {
    const minutes = Math.ceil(msRemaining / 60_000);
    return t('subscriptionScreen.childPaywall.cooldownMinutes', {
      count: minutes,
    });
  }

  const seconds = Math.ceil(msRemaining / 1000);
  return t('subscriptionScreen.childPaywall.cooldownSeconds', {
    count: seconds,
  });
}
