// ---------------------------------------------------------------------------
// Post-session notification permission ask — JIT primer for push notifications.
//
// Triggered after the user has completed at least one session (the "earned
// the ask" moment). Shows a primer Alert; on confirm, fires the OS prompt.
// Marks asked-once in SecureStore so we never bother the user a second time.
//
// Skipped in parent-proxy mode — a parent viewing as their child should not
// be prompted to grant the child's notification permission.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import * as SecureStore from '../lib/secure-storage';
import { platformAlert } from '../lib/platform-alert';
import { Sentry } from '../lib/sentry';
import { notificationFirstAskKey } from '../lib/secure-store-keys';

const PRIMER_DELAY_MS = 1500;

export function usePostSessionNotificationAsk(
  profileId: string | undefined,
  hasCompletedSession: boolean,
  isParentProxy: boolean,
): void {
  const { t } = useTranslation();
  // Tracks the profileId for which the primer has already fired this mount.
  // Using a profile-keyed ref (vs. a boolean) means a profile swap automatically
  // resets the guard — no separate effect needed.
  const firedForProfileRef = useRef<string | null>(null);

  useEffect(() => {
    if (firedForProfileRef.current === profileId) return;
    if (!profileId) return;
    if (!hasCompletedSession) return;
    if (isParentProxy) return;

    // [correctness High] Do NOT latch the guard up-front. A transient
    // SecureStore / permissions failure below must leave the guard un-latched
    // so a later session-summary mount can retry — latching here permanently
    // suppresses the one-time primer for the rest of the mount on any blip.
    // The guard is latched only at the real terminal points (already-asked,
    // already-granted/OS-blocked, or primer actually scheduled).
    const latchGuard = (): void => {
      firedForProfileRef.current = profileId;
    };
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    void (async () => {
      const key = notificationFirstAskKey(profileId);

      try {
        const seen = await SecureStore.getItemAsync(key);
        if (cancelled) return;
        if (seen === 'true') {
          latchGuard();
          return;
        }
      } catch {
        // SecureStore failure — safe default is to skip rather than spam, but
        // leave the guard un-latched so a later mount can retry.
        return;
      }

      let status: Notifications.PermissionStatus | undefined;
      let canAskAgain = true;
      try {
        const result = await Notifications.getPermissionsAsync();
        status = result.status;
        canAskAgain = result.canAskAgain ?? true;
      } catch (err) {
        Sentry.addBreadcrumb({
          category: 'permissions',
          message: 'post-session notif primer: getPermissionsAsync failed',
          level: 'warning',
          data: { error: String(err) },
        });
        // Transient permissions failure — leave the guard un-latched to retry.
        return;
      }
      if (cancelled) return;

      if (status === 'granted' || !canAskAgain) {
        // Already granted or OS-blocked — no point asking. Mark seen so we
        // don't keep probing on every session-summary mount.
        latchGuard();
        void SecureStore.setItemAsync(key, 'true').catch(() => undefined);
        return;
      }

      const markSeen = (): void => {
        void SecureStore.setItemAsync(key, 'true').catch(() => undefined);
      };

      // We've cleared all transient-failure gates and are about to surface the
      // primer — latch now so a re-run during the delay window does not
      // double-schedule the alert.
      latchGuard();

      const handle = setTimeout(() => {
        if (cancelled) return;
        platformAlert(
          t('sessionSummary.notificationPrimer.title'),
          t('sessionSummary.notificationPrimer.message'),
          [
            {
              text: t('sessionSummary.notificationPrimer.notNow'),
              style: 'cancel',
              onPress: markSeen,
            },
            {
              text: t('sessionSummary.notificationPrimer.allow'),
              onPress: () => {
                void (async () => {
                  try {
                    await Notifications.requestPermissionsAsync();
                  } catch (err) {
                    Sentry.addBreadcrumb({
                      category: 'permissions',
                      message:
                        'post-session notif primer: requestPermissionsAsync failed',
                      level: 'warning',
                      data: { error: String(err) },
                    });
                  } finally {
                    markSeen();
                  }
                })();
              },
            },
          ],
        );
      }, PRIMER_DELAY_MS);
      timeouts.push(handle);
    })();

    return () => {
      cancelled = true;
      timeouts.forEach((h) => clearTimeout(h));
    };
  }, [profileId, hasCompletedSession, isParentProxy, t]);
}
