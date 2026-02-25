import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useRegisterPushToken } from './use-settings';

/**
 * Requests notification permissions and registers the Expo push token
 * with the API on first mount. Guarded by a ref to prevent duplicate calls.
 *
 * Should be called once in the learner layout after consent gate passes.
 */
export function usePushTokenRegistration(): void {
  const hasRegistered = useRef(false);
  const registerPushToken = useRegisterPushToken();

  useEffect(() => {
    if (hasRegistered.current) return;

    async function register() {
      try {
        // Request notification permissions
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') return;

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
      } catch {
        // Silently fail — push token registration is non-critical
      }
    }

    void register();
  }, [registerPushToken]);
}
