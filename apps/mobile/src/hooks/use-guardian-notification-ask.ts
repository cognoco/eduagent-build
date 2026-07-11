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

      if (status === 'granted') {
        // [WI-1441 round 3] Silent repair path: permission is already
        // granted — possibly from an earlier attempt whose sync failed. Do
        // NOT re-prompt with the OS dialog (the user already said yes); just
        // retry the persist quietly, and only consume the primer if it
        // succeeds. A repeated failure leaves the primer eligible so the
        // next mount tries again.
        const synced = await syncPushEnabled(
          'guardian notif primer (silent repair)',
        );
        if (cancelled) return;
        if (synced) {
          void SecureStore.setItemAsync(key, 'true').catch(() => undefined);
        }
        return;
      }

      if (!canAskAgain) {
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
                      // [WI-1441 round 3] Only consume the primer once the
                      // sync actually succeeds. If it fails, leave SecureStore
                      // un-marked — the next mount will find permission
                      // already granted and retry via the silent repair path
                      // above, rather than losing the sync forever.
                      const synced = await syncPushEnabled(
                        'guardian notif primer',
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
                        'guardian notif primer: requestPermissionsAsync failed',
                      level: 'warning',
                      data: { error: String(err) },
                    });
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
