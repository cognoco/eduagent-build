import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '../../../hooks/use-settings';
import { platformAlert } from '../../../lib/platform-alert';
import {
  SectionHeader,
  ToggleRow,
} from '../../../components/more/settings-rows';

export default function NotificationsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const {
    data: notifPrefs,
    isLoading: notifLoading,
    isError: notifError,
  } = useNotificationSettings();
  const updateNotifications = useUpdateNotificationSettings();
  const settingsUnavailable = notifError || !notifPrefs;

  const handleTogglePush = useCallback(
    (value: boolean) => {
      if (!notifPrefs) return;
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
          value={notifPrefs?.pushEnabled ?? false}
          onToggle={handleTogglePush}
          disabled={
            notifLoading || settingsUnavailable || updateNotifications.isPending
          }
          testID="push-notifications-toggle"
        />
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
