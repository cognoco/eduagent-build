import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';

import * as SecureStore from '../lib/secure-storage';
import {
  isGuardianProfile,
  useLinkedChildren,
  useProfile,
} from '../lib/profile';
import { platformAlert } from '../lib/platform-alert';
import { Sentry } from '../lib/sentry';
import { useNavigationContract } from './use-navigation-contract';
import { guardianNotificationAskKey } from '../lib/secure-store-keys';
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from './use-settings';
// [WI-1090] Key definition lives in the barrel; re-exported here for backward
// compatibility with callers that import directly from this hook module.
export { guardianNotificationAskKey as getGuardianNotificationAskShownKey } from '../lib/secure-store-keys';

const PRIMER_DELAY_MS = 1500;

export function useGuardianNotificationAsk(): void {
  const { t } = useTranslation();
  const { activeProfile, profiles } = useProfile();
  const linkedChildren = useLinkedChildren();
  const navigationContract = useNavigationContract();
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

  const profileId = activeProfile?.id;
  const guardianEligible =
    isGuardianProfile(activeProfile, profiles) && linkedChildren.length > 0;

  useEffect(() => {
    if (firedForProfileRef.current === profileId) return;
    if (!profileId) return;
    if (!guardianEligible) return;
    if (navigationContract.isParentProxy) return;

    firedForProfileRef.current = profileId;
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    void (async () => {
      const key = guardianNotificationAskKey(profileId);

      try {
        const seen = await SecureStore.getItemAsync(key);
        if (cancelled) return;
        if (seen === 'true') return;
      } catch {
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
          message: 'guardian notif primer: getPermissionsAsync failed',
          level: 'warning',
          data: { error: String(err) },
        });
        return;
      }
      if (cancelled) return;

      if (status === 'granted' || !canAskAgain) {
        void SecureStore.setItemAsync(key, 'true').catch(() => undefined);
        return;
      }

      const markSeen = (): void => {
        void SecureStore.setItemAsync(key, 'true').catch(() => undefined);
      };

      const handle = setTimeout(() => {
        if (cancelled) return;
        platformAlert(
          t('notifications.guardianPrimer.title'),
          t('notifications.guardianPrimer.message'),
          [
            {
              text: t('notifications.guardianPrimer.notNow'),
              style: 'cancel',
              onPress: markSeen,
            },
            {
              text: t('notifications.guardianPrimer.allow'),
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
                              'guardian notif primer: prefs refetch before pushEnabled sync failed',
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
                                  'guardian notif primer: pushEnabled sync failed',
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
                            'guardian notif primer: pushEnabled sync skipped — notification prefs unavailable',
                          level: 'warning',
                        });
                      }
                    }
                  } catch (err) {
                    Sentry.addBreadcrumb({
                      category: 'permissions',
                      message:
                        'guardian notif primer: requestPermissionsAsync failed',
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
          { cancelable: true, onDismiss: markSeen },
        );
      }, PRIMER_DELAY_MS);
      timeouts.push(handle);
    })();

    return () => {
      cancelled = true;
      timeouts.forEach((handle) => clearTimeout(handle));
    };
  }, [profileId, guardianEligible, navigationContract.isParentProxy, t]);
}
