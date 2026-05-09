import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { useRegisterPushToken } from './use-settings';
import { Sentry } from '../lib/sentry';

export type PushRegistrationFailure =
  | 'permission_denied'
  | 'expo_token_unavailable'
  | 'api_registration_failed'
  | 'unsupported_device';

export type PushRegistrationState =
  | { status: 'idle' }
  | { status: 'registered' }
  | { status: 'failed'; reason: PushRegistrationFailure };

function capturePushRegistrationFailure(
  err: unknown,
  reason: PushRegistrationFailure,
): void {
  Sentry.captureException(err, {
    tags: { feature: 'push_registration', reason },
  });
}

/**
 * Registers the Expo push token with the API when notification permission
 * is already granted. Does NOT prompt for permission — notification consent
 * is requested just-in-time by the post-session primer.
 */
export function usePushTokenRegistration(): PushRegistrationState {
  const hasRegistered = useRef(false);
  const [state, setState] = useState<PushRegistrationState>({
    status: 'idle',
  });
  const registerPushToken = useRegisterPushToken();

  const registerIfAllowed = useCallback(async () => {
    if (hasRegistered.current) return;

    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        setState({ status: 'failed', reason: 'permission_denied' });
        return;
      }

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
      if (!projectId) {
        setState({ status: 'failed', reason: 'unsupported_device' });
        return;
      }

      let tokenData: { data: string };
      try {
        tokenData = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
      } catch (err) {
        setState({ status: 'failed', reason: 'expo_token_unavailable' });
        capturePushRegistrationFailure(err, 'expo_token_unavailable');
        return;
      }

      // Register with our API
      try {
        await registerPushToken.mutateAsync(tokenData.data);
      } catch (err) {
        setState({ status: 'failed', reason: 'api_registration_failed' });
        capturePushRegistrationFailure(err, 'api_registration_failed');
        return;
      }
      hasRegistered.current = true;
      setState({ status: 'registered' });
    } catch (err) {
      // Push registration is non-critical, but capture for prod observability [SC-3]
      setState({ status: 'failed', reason: 'unsupported_device' });
      capturePushRegistrationFailure(err, 'unsupported_device');
    }
  }, [registerPushToken]);

  useEffect(() => {
    void registerIfAllowed();
  }, [registerIfAllowed]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void registerIfAllowed();
      }
    });
    return () => sub.remove();
  }, [registerIfAllowed]);

  return state;
}
