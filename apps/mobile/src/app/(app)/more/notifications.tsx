import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Notifications from 'expo-notifications';
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '../../../hooks/use-settings';
import { usePushTokenRegistration } from '../../../hooks/use-push-token-registration';
import { platformAlert } from '../../../lib/platform-alert';
import {
  SectionHeader,
  SettingsRow,
  ToggleRow,
} from '../../../components/more/settings-rows';

type NotificationPermissionState = Awaited<
  ReturnType<typeof Notifications.getPermissionsAsync>
>;

function hasNotificationPermission(
  permission: NotificationPermissionState | null,
): boolean {
  return permission?.status === 'granted' || permission?.granted === true;
}

export default function NotificationsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const {
    data: notifPrefs,
    isLoading: notifLoading,
    isError: notifError,
    refetch: refetchNotificationSettings,
  } = useNotificationSettings();
  const updateNotifications = useUpdateNotificationSettings();
  const pushRegistration = usePushTokenRegistration();
  const [permissionState, setPermissionState] =
    useState<NotificationPermissionState | null>(null);
  const settingsUnavailable = notifError || !notifPrefs;

  const refreshPermissionState = useCallback(async () => {
    const nextPermission = await Notifications.getPermissionsAsync();
    setPermissionState(nextPermission);
    return nextPermission;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const nextPermission = await Notifications.getPermissionsAsync();
      if (!cancelled) {
        setPermissionState(nextPermission);
      }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const osPermissionGranted = hasNotificationPermission(permissionState);
  const serverPushEnabled = notifPrefs?.pushEnabled === true;
  const pushTokenRegistered = notifPrefs?.pushTokenRegistered === true;
  const pushDescription =
    !notifPrefs || !permissionState
      ? undefined
      : !osPermissionGranted
        ? t('more.notifications.pushMissingPermission')
        : !serverPushEnabled
          ? t('more.notifications.pushMissingServer')
          : !pushTokenRegistered
            ? t('more.notifications.pushMissingToken')
            : undefined;
  const openSettingsVisible =
    permissionState != null &&
    !osPermissionGranted &&
    permissionState.canAskAgain === false;

  const handleTogglePush = useCallback(
    async (value: boolean) => {
      if (!notifPrefs) return;
      if (!value) {
        updateNotifications.mutate(
          {
            reviewReminders: notifPrefs.reviewReminders,
            dailyReminders: notifPrefs.dailyReminders,
            weeklyProgressPush: notifPrefs.weeklyProgressPush,
            weeklyProgressEmail: notifPrefs.weeklyProgressEmail,
            monthlyProgressEmail: notifPrefs.monthlyProgressEmail,
            pushEnabled: false,
          },
          {
            onError: () => {
              platformAlert(
                t('more.notifications.updateErrorTitle'),
                t('more.errors.tryAgain'),
              );
            },
          },
        );
        return;
      }

      let nextPermission: NotificationPermissionState;
      try {
        nextPermission = await refreshPermissionState();
        if (!hasNotificationPermission(nextPermission)) {
          if (nextPermission.canAskAgain === false) {
            return;
          }
          nextPermission = await Notifications.requestPermissionsAsync();
          setPermissionState(nextPermission);
        }
      } catch {
        platformAlert(
          t('more.notifications.updateErrorTitle'),
          t('more.errors.tryAgain'),
        );
        return;
      }

      if (!hasNotificationPermission(nextPermission)) {
        return;
      }

      updateNotifications.mutate(
        {
          reviewReminders: notifPrefs.reviewReminders,
          dailyReminders: notifPrefs.dailyReminders,
          weeklyProgressPush: notifPrefs.weeklyProgressPush,
          weeklyProgressEmail: notifPrefs.weeklyProgressEmail,
          monthlyProgressEmail: notifPrefs.monthlyProgressEmail,
          pushEnabled: value,
        },
        {
          onSuccess: () => {
            void (async () => {
              await pushRegistration.registerIfAllowed();
              await refetchNotificationSettings();
            })();
          },
          onError: () => {
            platformAlert(
              t('more.notifications.updateErrorTitle'),
              t('more.errors.tryAgain'),
            );
          },
        },
      );
    },
    [
      notifPrefs,
      pushRegistration,
      refetchNotificationSettings,
      refreshPermissionState,
      t,
      updateNotifications,
    ],
  );

  const handleToggleDigest = useCallback(
    (value: boolean) => {
      if (!notifPrefs) return;
      updateNotifications.mutate(
        {
          reviewReminders: notifPrefs.reviewReminders,
          dailyReminders: notifPrefs.dailyReminders,
          weeklyProgressPush: value,
          weeklyProgressEmail: notifPrefs.weeklyProgressEmail,
          monthlyProgressEmail: notifPrefs.monthlyProgressEmail,
          pushEnabled: notifPrefs.pushEnabled,
        },
        {
          onError: () => {
            platformAlert(
              t('more.notifications.updateErrorTitle'),
              t('more.errors.tryAgain'),
            );
          },
        },
      );
    },
    [notifPrefs, t, updateNotifications],
  );

  const handleToggleWeeklyEmailDigest = useCallback(
    (value: boolean) => {
      if (!notifPrefs) return;
      updateNotifications.mutate(
        {
          reviewReminders: notifPrefs.reviewReminders,
          dailyReminders: notifPrefs.dailyReminders,
          weeklyProgressPush: notifPrefs.weeklyProgressPush,
          weeklyProgressEmail: value,
          monthlyProgressEmail: notifPrefs.monthlyProgressEmail,
          pushEnabled: notifPrefs.pushEnabled,
        },
        {
          onError: () => {
            platformAlert(
              t('more.notifications.updateErrorTitle'),
              t('more.errors.tryAgain'),
            );
          },
        },
      );
    },
    [notifPrefs, t, updateNotifications],
  );

  const handleToggleMonthlyEmailDigest = useCallback(
    (value: boolean) => {
      if (!notifPrefs) return;
      updateNotifications.mutate(
        {
          reviewReminders: notifPrefs.reviewReminders,
          dailyReminders: notifPrefs.dailyReminders,
          weeklyProgressPush: notifPrefs.weeklyProgressPush,
          weeklyProgressEmail: notifPrefs.weeklyProgressEmail,
          monthlyProgressEmail: value,
          pushEnabled: notifPrefs.pushEnabled,
        },
        {
          onError: () => {
            platformAlert(
              t('more.notifications.updateErrorTitle'),
              t('more.errors.tryAgain'),
            );
          },
        },
      );
    },
    [notifPrefs, t, updateNotifications],
  );

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="more-notifications-scroll"
      >
        <SectionHeader testID="notifications-section-header">
          {t('more.notifications.sectionHeader')}
        </SectionHeader>
        <ToggleRow
          label={t('more.notifications.pushTitle')}
          description={pushDescription}
          value={serverPushEnabled}
          onToggle={handleTogglePush}
          disabled={
            notifLoading || settingsUnavailable || updateNotifications.isPending
          }
          testID="push-notifications-toggle"
        />
        {openSettingsVisible ? (
          <SettingsRow
            label={t('more.notifications.openSettingsTitle')}
            description={t('more.notifications.openSettingsDescription')}
            onPress={() => {
              void Linking.openSettings();
            }}
            testID="push-notifications-open-settings"
          />
        ) : null}
        <ToggleRow
          label={t('more.notifications.weeklyDigestTitle')}
          value={notifPrefs?.weeklyProgressPush ?? false}
          onToggle={handleToggleDigest}
          disabled={
            notifLoading || settingsUnavailable || updateNotifications.isPending
          }
          testID="weekly-digest-toggle"
        />
        <ToggleRow
          label={t('more.notifications.weeklyEmailDigestTitle')}
          description={t('more.notifications.emailDigestDescription')}
          value={notifPrefs?.weeklyProgressEmail ?? true}
          onToggle={handleToggleWeeklyEmailDigest}
          disabled={
            notifLoading || settingsUnavailable || updateNotifications.isPending
          }
          testID="weekly-email-digest-toggle"
        />
        <ToggleRow
          label={t('more.notifications.monthlyEmailDigestTitle')}
          description={t('more.notifications.emailDigestDescription')}
          value={notifPrefs?.monthlyProgressEmail ?? true}
          onToggle={handleToggleMonthlyEmailDigest}
          disabled={
            notifLoading || settingsUnavailable || updateNotifications.isPending
          }
          testID="monthly-email-digest-toggle"
        />
      </ScrollView>
    </View>
  );
}
