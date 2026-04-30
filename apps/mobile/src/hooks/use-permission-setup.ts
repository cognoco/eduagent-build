import { useState, useCallback, useEffect } from 'react';
import { AppState, Platform } from 'react-native';
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
 * One-time permission setup gate. Prompts for mic + notifications before
 * the user reaches the tab navigator. Auto-skips if both are already granted.
 * Returns [shouldShow, dismiss, permState, requestMic, requestNotif].
 */
export function usePermissionSetup(
  profileId: string | undefined
): [
  shouldShow: boolean,
  dismiss: () => void,
  permState: PermState,
  requestMic: () => Promise<void>,
  requestNotif: () => Promise<void>
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
      try {
        const value = await SecureStore.getItemAsync(key);
        if (cancelled) return;
        if (value === 'true') {
          setShouldShow(false);
          setChecked(true);
          return;
        }
      } catch {
        /* SecureStore failure — show gate (safe default) */
      }

      const { micStatus, notifStatus, micAvailable } = await checkPermissions();
      if (cancelled) return;

      const hasMicRow = micAvailable && micStatus !== 'granted';
      const hasNotifRow = Platform.OS !== 'web' && notifStatus !== 'granted';

      if (!hasMicRow && !hasNotifRow) {
        setShouldShow(false);
        void SecureStore.setItemAsync(key, 'true').catch(() => undefined);
        setChecked(true);
        return;
      }

      setShouldShow(true);
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
