import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useRegisterPushToken } from './use-settings';
import { Sentry } from '../lib/sentry';

/**
 * Registers the Expo push token with the API when notification permission
 * is already granted. Does NOT prompt for permission — the permission
 * onboarding gate owns that dialog.
 *
 * @param notificationGranted Reactive signal from the permission gate.
 * When this flips from false to true, the effect re-runs and registers the
 * token in the same session.
 */
export function usePushTokenRegistration(notificationGranted = false): void {
  const hasRegistered = useRef(false);
  const registerPushToken = useRegisterPushToken();

  useEffect(() => {
    if (hasRegistered.current) return;

    async function register() {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        // Android requires a notification channel
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        // Get the Expo push token
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId,
        });

        // Register with our API
        await registerPushToken.mutateAsync(tokenData.data);
        hasRegistered.current = true;
      } catch (err) {
        // Push registration is non-critical, but capture for prod observability [SC-3]
        Sentry.captureException(err, {
          tags: { feature: 'push_registration' },
        });
      }
    }

    void register();
  }, [notificationGranted, registerPushToken]);
}
