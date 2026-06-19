import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';

import * as SecureStore from '../lib/secure-storage';
import { sanitizeSecureStoreKey } from '../lib/secure-storage';
import {
  isGuardianProfile,
  useLinkedChildren,
  useProfile,
} from '../lib/profile';
import { platformAlert } from '../lib/platform-alert';
import { Sentry } from '../lib/sentry';
import { useNavigationContract } from './use-navigation-contract';

const PRIMER_DELAY_MS = 1500;

export function getGuardianNotificationAskShownKey(profileId: string): string {
  return sanitizeSecureStoreKey(`guardianNotificationAskShown_${profileId}`);
}

export function useGuardianNotificationAsk(): void {
  const { t } = useTranslation();
  const { activeProfile, profiles } = useProfile();
  const linkedChildren = useLinkedChildren();
  const navigationContract = useNavigationContract();
  const firedForProfileRef = useRef<string | null>(null);

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
      const key = getGuardianNotificationAskShownKey(profileId);

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
                    await Notifications.requestPermissionsAsync();
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
