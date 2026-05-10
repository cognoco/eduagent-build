import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { useRegisterPushToken } from './use-settings';
import { Sentry } from '../lib/sentry';
import { useProfile } from '../lib/profile';

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

function isMissingAndroidFirebaseAppError(err: unknown): boolean {
  if (Platform.OS !== 'android' || !(err instanceof Error)) return false;

  // Match the canonical Expo error string for missing Android Firebase config.
  // The full docs URL is part of Expo's hard-coded error, not a generic path —
  // anchoring on the full URL avoids matching unrelated errors that happen to
  // mention the trailing path fragment.
  return (
    err.message.includes('Default FirebaseApp is not initialized') ||
    err.message.includes(
      'https://docs.expo.dev/push-notifications/fcm-credentials/',
    )
  );
}

/**
 * Registers the Expo push token with the API when notification permission
 * is already granted. Does NOT prompt for permission — notification consent
 * is requested just-in-time by the post-session primer.
 */
export function usePushTokenRegistration(): PushRegistrationState {
  const registeredProfileToken = useRef<{
    profileId: string;
    token: string;
  } | null>(null);
  const pendingProfileToken = useRef<{
    profileId: string;
    token: string;
  } | null>(null);
  const [state, setState] = useState<PushRegistrationState>({
    status: 'idle',
  });
  const { activeProfile } = useProfile();
  const registerPushToken = useRegisterPushToken();

  const registerIfAllowed = useCallback(async () => {
    // React Query keeps mutation objects stable; this prevents duplicate
    // registrations while a foreground/AppState retry is already in flight.
    if (registerPushToken.isPending) return;

    const activeProfileId = activeProfile?.id ?? null;
    if (!activeProfileId) return;

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
        if (__DEV__ && isMissingAndroidFirebaseAppError(err)) {
          return;
        }
        capturePushRegistrationFailure(err, 'expo_token_unavailable');
        return;
      }

      if (
        registeredProfileToken.current?.profileId === activeProfileId &&
        registeredProfileToken.current.token === tokenData.data
      ) {
        return;
      }
      if (
        pendingProfileToken.current?.profileId === activeProfileId &&
        pendingProfileToken.current.token === tokenData.data
      ) {
        return;
      }

      // Register with our API
      try {
        pendingProfileToken.current = {
          profileId: activeProfileId,
          token: tokenData.data,
        };
        await registerPushToken.mutateAsync(tokenData.data);
      } catch (err) {
        setState({ status: 'failed', reason: 'api_registration_failed' });
        capturePushRegistrationFailure(err, 'api_registration_failed');
        return;
      } finally {
        if (
          pendingProfileToken.current?.profileId === activeProfileId &&
          pendingProfileToken.current.token === tokenData.data
        ) {
          pendingProfileToken.current = null;
        }
      }
      registeredProfileToken.current = {
        profileId: activeProfileId,
        token: tokenData.data,
      };
      setState({ status: 'registered' });
    } catch (err) {
      // Push registration is non-critical, but capture for prod observability [SC-3]
      setState({ status: 'failed', reason: 'unsupported_device' });
      capturePushRegistrationFailure(err, 'unsupported_device');
    }
  }, [activeProfile?.id, registerPushToken]);

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
