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
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from './use-settings';

const PRIMER_DELAY_MS = 1500;

export function usePostSessionNotificationAsk(
  profileId: string | undefined,
  hasCompletedSession: boolean,
  isParentProxy: boolean,
  hasMentorNotice = false,
): void {
  const { t } = useTranslation();
  // Tracks the profileId for which the primer has already fired this mount.
  // Using a profile-keyed ref (vs. a boolean) means a profile swap automatically
  // resets the guard — no separate effect needed.
  const firedForProfileRef = useRef<string | null>(null);

  // [WI-1441] Read via refs, not the effect's dependency array: the "Allow"
  // handler below is created once inside the effect closure, and neither
  // value should re-trigger/re-schedule the primer if it changes mid-flight.
  // The full query result (not just `.data`) is kept so a grant that lands
  // before the settings query resolves can force a refetch instead of
  // silently skipping the sync.
  const notifQuery = useNotificationSettings();
  const notifQueryRef = useRef(notifQuery);
  notifQueryRef.current = notifQuery;
  const updateNotifications = useUpdateNotificationSettings();
  const updateNotificationsRef = useRef(updateNotifications);
  updateNotificationsRef.current = updateNotifications;

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
    // OS-blocked, or primer actually scheduled).
    const latchGuard = (): void => {
      firedForProfileRef.current = profileId;
    };
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // [WI-1441 round 3] Attempts to persist pushEnabled=true server-side and
    // reports whether it actually succeeded. The caller must only consume the
    // primer (mark SecureStore seen) when this resolves true — marking seen
    // on a failed sync reproduces the original bug: the OS grant would be
    // recorded, but the server's pushEnabled would silently stay false
    // forever with no further retry.
    const syncPushEnabled = async (
      breadcrumbPrefix: string,
    ): Promise<boolean> => {
      let prefs = notifQueryRef.current.data;
      if (!prefs) {
        try {
          prefs = (await notifQueryRef.current.refetch()).data;
        } catch (refetchErr) {
          Sentry.addBreadcrumb({
            category: 'permissions',
            message: `${breadcrumbPrefix}: prefs refetch before pushEnabled sync failed`,
            level: 'warning',
            data: { error: String(refetchErr) },
          });
        }
      }
      if (!prefs) {
        Sentry.addBreadcrumb({
          category: 'permissions',
          message: `${breadcrumbPrefix}: pushEnabled sync skipped — notification prefs unavailable`,
          level: 'warning',
        });
        return false;
      }
      try {
        await updateNotificationsRef.current.mutateAsync({
          reviewReminders: prefs.reviewReminders,
          dailyReminders: prefs.dailyReminders,
          weeklyProgressPush: prefs.weeklyProgressPush,
          weeklyProgressEmail: prefs.weeklyProgressEmail,
          monthlyProgressEmail: prefs.monthlyProgressEmail,
          maxDailyPush: prefs.maxDailyPush,
          pushEnabled: true,
        });
        return true;
      } catch (mutateErr) {
        Sentry.addBreadcrumb({
          category: 'permissions',
          message: `${breadcrumbPrefix}: pushEnabled sync failed`,
          level: 'warning',
          data: { error: String(mutateErr) },
        });
        return false;
      }
    };

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

      if (status === 'granted') {
        // [WI-1441 round 3] Silent repair path: permission is already
        // granted — possibly from an earlier attempt whose sync failed. Do
        // NOT re-prompt with the OS dialog (the user already said yes); just
        // retry the persist quietly, and only consume the primer if it
        // succeeds. A repeated failure leaves the primer eligible so the
        // next session-summary mount tries again.
        const synced = await syncPushEnabled(
          'post-session notif primer (silent repair)',
        );
        if (cancelled) return;
        if (synced) {
          latchGuard();
          void SecureStore.setItemAsync(key, 'true').catch(() => undefined);
        }
        return;
      }

      if (!canAskAgain) {
        // OS has permanently blocked re-asking — nothing more we can do, so
        // this is a genuinely terminal no-op. Mark seen so we don't keep
        // probing on every session-summary mount.
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
          t(
            hasMentorNotice
              ? 'sessionSummary.notificationPrimer.noticeTitle'
              : 'sessionSummary.notificationPrimer.title',
          ),
          t(
            hasMentorNotice
              ? 'sessionSummary.notificationPrimer.noticeMessage'
              : 'sessionSummary.notificationPrimer.message',
          ),
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
                    const result =
                      await Notifications.requestPermissionsAsync();
                    if (result.status === 'granted') {
                      // [WI-1441 round 3] Only consume the primer once the
                      // sync actually succeeds. If it fails, leave SecureStore
                      // un-marked — the next session-summary mount will find
                      // permission already granted and retry via the silent
                      // repair path above, rather than losing the sync forever.
                      const synced = await syncPushEnabled(
                        'post-session notif primer',
                      );
                      if (synced) {
                        markSeen();
                      }
                    } else {
                      // User was asked and declined, or dismissed — genuinely
                      // terminal; consume the primer as before.
                      markSeen();
                    }
                  } catch (err) {
                    Sentry.addBreadcrumb({
                      category: 'permissions',
                      message:
                        'post-session notif primer: requestPermissionsAsync failed',
                      level: 'warning',
                      data: { error: String(err) },
                    });
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
  }, [profileId, hasCompletedSession, isParentProxy, hasMentorNotice, t]);
}
