import { useState, useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from '../lib/secure-storage';
import { sanitizeSecureStoreKey } from '../lib/secure-storage';
import { Sentry } from '../lib/sentry';

export type PermState = {
  mic: 'unknown' | 'granted' | 'denied';
  notif: 'unknown' | 'granted' | 'denied';
  micCanAskAgain: boolean;
  notifCanAskAgain: boolean;
  micAvailable: boolean;
  checked: boolean;
};

/**
 * Permission state hook. Reads OS permission status for mic + notifications
 * so downstream consumers (push token registration, JIT request callers)
 * can react to changes — but never gates the user behind an upfront screen.
 *
 * Permissions are requested just-in-time at feature entry:
 *   - Microphone — requested by `use-speech-recognition.ts` when the user
 *     first taps the voice button on a session screen.
 *   - Camera — requested by `expo-camera` `useCameraPermissions()` when
 *     the user opens the homework camera screen.
 *   - Media library — requested by `expo-image-picker` when the user picks
 *     an image from the gallery.
 *   - Notifications — requested after the user completes their first
 *     session (the post-value moment, not at cold launch).
 *
 * `shouldShow` always returns `false`. The legacy `PermissionSetupGate`
 * component is kept temporarily for blocked-permission recovery flows.
 *
 * Returns [shouldShow, dismiss, permState, requestMic, requestNotif].
 */
export function usePermissionSetup(
  profileId: string | undefined,
): [
  shouldShow: boolean,
  dismiss: () => void,
  permState: PermState,
  requestMic: () => Promise<void>,
  requestNotif: () => Promise<void>,
] {
  const [shouldShow, setShouldShow] = useState(false);
  const [checked, setChecked] = useState(false);
  const [permState, setPermState] = useState<PermState>({
    mic: 'unknown',
    notif: 'unknown',
    micCanAskAgain: true,
    notifCanAskAgain: true,
    micAvailable: true,
    checked: false,
  });

  const checkPermissions = useCallback(async () => {
    let notifStatus: 'granted' | 'denied' = 'denied';
    let notifCanAskAgain = true;
    try {
      const result = await Notifications.getPermissionsAsync();
      notifStatus = result.status === 'granted' ? 'granted' : 'denied';
      notifCanAskAgain = result.canAskAgain ?? true;
    } catch (err) {
      Sentry.addBreadcrumb({
        category: 'permissions',
        message: 'permission check failed',
        level: 'warning',
        data: { type: 'notifications', error: String(err) },
      });
    }

    let micStatus: 'granted' | 'denied' = 'denied';
    let micCanAskAgain = true;
    let micAvailable = true;
    try {
      const mod = await import('expo-speech-recognition');
      const speechModule = mod.ExpoSpeechRecognitionModule;
      if (speechModule) {
        const { granted, canAskAgain } =
          await speechModule.getPermissionsAsync();
        micStatus = granted ? 'granted' : 'denied';
        micCanAskAgain = canAskAgain;
      } else {
        micAvailable = false;
      }
    } catch (err) {
      Sentry.addBreadcrumb({
        category: 'permissions',
        message: 'permission check failed',
        level: 'warning',
        data: { type: 'microphone', error: String(err) },
      });
      micAvailable = false;
    }

    setPermState({
      mic: micStatus,
      notif: notifStatus,
      micCanAskAgain,
      notifCanAskAgain,
      micAvailable,
      checked: true,
    });

    return { micAvailable, micStatus, notifStatus };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!profileId) {
      setShouldShow(false);
      setChecked(true);
      return;
    }

    setChecked(false);

    // [I-4] Sanitize profileId before interpolating into a SecureStore key.
    const key = sanitizeSecureStoreKey(`permissionSetupSeen_${profileId}`);
    void (async () => {
      // Permissions are JIT — never display the upfront gate. We still
      // probe OS state so push token registration and inline asks have
      // accurate `permState` to read.
      await checkPermissions();
      if (cancelled) return;

      setShouldShow(false);
      void SecureStore.setItemAsync(key, 'true').catch(() => undefined);
      setChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [checkPermissions, profileId]);

  useEffect(() => {
    if (!shouldShow) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void checkPermissions();
      }
    });
    return () => sub.remove();
  }, [checkPermissions, shouldShow]);

  const dismiss = useCallback(() => {
    if (!profileId) return;
    setShouldShow(false);
    // [I-4] Sanitize profileId before interpolating into a SecureStore key.
    const key = sanitizeSecureStoreKey(`permissionSetupSeen_${profileId}`);
    void SecureStore.setItemAsync(key, 'true').catch(() => {
      /* non-fatal */
    });
  }, [profileId]);

  const requestMic = useCallback(async () => {
    try {
      const mod = await import('expo-speech-recognition');
      const speechModule = mod.ExpoSpeechRecognitionModule;
      if (!speechModule) return;
      await speechModule.requestPermissionsAsync();
      const { granted, canAskAgain } = await speechModule.getPermissionsAsync();
      setPermState((prev) => ({
        ...prev,
        mic: granted ? 'granted' : 'denied',
        micCanAskAgain: canAskAgain,
      }));
    } catch (err) {
      Sentry.addBreadcrumb({
        category: 'permissions',
        message: 'permission check failed',
        level: 'warning',
        data: { type: 'microphone_request', error: String(err) },
      });
    }
  }, []);

  const requestNotif = useCallback(async () => {
    try {
      await Notifications.requestPermissionsAsync();
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      setPermState((prev) => ({
        ...prev,
        notif: status === 'granted' ? 'granted' : 'denied',
        notifCanAskAgain: canAskAgain ?? false,
      }));
    } catch (err) {
      Sentry.addBreadcrumb({
        category: 'permissions',
        message: 'permission check failed',
        level: 'warning',
        data: { type: 'notifications_request', error: String(err) },
      });
    }
  }, []);

  return [checked && shouldShow, dismiss, permState, requestMic, requestNotif];
}
