import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useConsentStatus } from '../../hooks/use-consent';
import { useMarkAllNudgesRead, useUnreadNudges } from '../../hooks/use-nudges';
import { useProfile } from '../../lib/profile';
import { useThemeColors } from '../../lib/theme';
import { NudgeUnreadModal } from './NudgeUnreadModal';

export function NudgeBanner(): React.ReactElement | null {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { activeProfile } = useProfile();
  const consent = useConsentStatus();
  const unread = useUnreadNudges();
  const markAllRead = useMarkAllNudgesRead();
  const [modalOpen, setModalOpen] = useState(false);

  const nudges = unread.data ?? [];
  const top = nudges[0];
  const isConsented =
    activeProfile?.consentStatus == null ||
    activeProfile.consentStatus === 'CONSENTED' ||
    consent.data?.consentStatus === 'CONSENTED';

  const badge = useMemo(
    () =>
      nudges.length > 1
        ? t('nudge.banner.unreadCount', { count: nudges.length })
        : null,
    [nudges.length, t],
  );

  if (!isConsented || !top) return null;

  const closeModal = (): void => {
    setModalOpen(false);
    markAllRead.mutate();
  };

  return (
    <>
      <Pressable
        onPress={() => setModalOpen(true)}
        className="mx-5 mt-4 rounded-card bg-primary-soft border border-primary/30 px-4 py-3 flex-row items-center"
        accessibilityRole="button"
        testID="nudge-banner"
      >
        <Ionicons name="heart-outline" size={22} color={colors.primary} />
        <View className="flex-1 ml-3">
          <Text className="text-body font-semibold text-text-primary">
            {t('nudge.banner.title', {
              fromDisplayName: top.fromDisplayName,
            })}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t(`nudge.templates.${top.template}`)}
          </Text>
        </View>
        {badge ? (
          <View className="rounded-full bg-primary px-2.5 py-1">
            <Text className="text-caption font-semibold text-text-inverse">
              {badge}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {modalOpen ? (
        <NudgeUnreadModal nudges={nudges} onDismiss={closeModal} />
      ) : null}
    </>
  );
}
