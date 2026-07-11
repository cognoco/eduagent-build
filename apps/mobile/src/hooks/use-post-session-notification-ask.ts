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
                    const result =
                      await Notifications.requestPermissionsAsync();
                    if (result.status === 'granted') {
                      // [WI-1441] Sync pushEnabled=true server-side — this is
                      // the only path (besides the explicit More > Notifications
                      // toggle) that grants OS permission, and without this the
                      // server default stays false forever, silently skipping
                      // every push-eligibility cron for this user.
                      //
                      // A grant landing before the settings query resolves
                      // must not silently skip the sync — force a refetch so
                      // the grant always eventually persists.
                      let prefs = notifQueryRef.current.data;
                      if (!prefs) {
                        try {
                          prefs = (await notifQueryRef.current.refetch()).data;
                        } catch (refetchErr) {
                          Sentry.addBreadcrumb({
                            category: 'permissions',
                            message:
                              'post-session notif primer: prefs refetch before pushEnabled sync failed',
                            level: 'warning',
                            data: { error: String(refetchErr) },
                          });
                        }
                      }
                      if (prefs) {
                        updateNotificationsRef.current.mutate(
                          {
                            reviewReminders: prefs.reviewReminders,
                            dailyReminders: prefs.dailyReminders,
                            weeklyProgressPush: prefs.weeklyProgressPush,
                            weeklyProgressEmail: prefs.weeklyProgressEmail,
                            monthlyProgressEmail: prefs.monthlyProgressEmail,
                            maxDailyPush: prefs.maxDailyPush,
                            pushEnabled: true,
                          },
                          {
                            onError: (mutateErr) => {
                              Sentry.addBreadcrumb({
                                category: 'permissions',
                                message:
                                  'post-session notif primer: pushEnabled sync failed',
                                level: 'warning',
                                data: { error: String(mutateErr) },
                              });
                            },
                          },
                        );
                      } else {
                        Sentry.addBreadcrumb({
                          category: 'permissions',
                          message:
                            'post-session notif primer: pushEnabled sync skipped — notification prefs unavailable',
                          level: 'warning',
                        });
                      }
                    }
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
