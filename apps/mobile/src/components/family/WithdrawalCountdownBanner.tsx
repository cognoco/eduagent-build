import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useRestoreConsent } from '../../hooks/use-restore-consent';
import { getGracePeriodDaysRemaining } from '../../lib/consent-grace';
import { platformAlert } from '../../lib/platform-alert';

export type ChildInGracePeriod = {
  profileId: string;
  displayName: string;
  respondedAt: string;
};

interface WithdrawalCountdownBannerProps {
  childrenInGracePeriod: ChildInGracePeriod[];
}

export function WithdrawalCountdownBanner({
  childrenInGracePeriod,
}: WithdrawalCountdownBannerProps): React.ReactElement | null {
  const { t } = useTranslation();
  const restoreConsent = useRestoreConsent();
  const [pendingChildId, setPendingChildId] = React.useState<string | null>(
    null,
  );
  const [restoredName, setRestoredName] = React.useState<string | null>(null);

  const inGrace = childrenInGracePeriod;

  if (inGrace.length === 0) return null;

  const isMulti = inGrace.length > 1;

  const handleRestore = (child: ChildInGracePeriod): void => {
    setPendingChildId(child.profileId);
    restoreConsent.mutate(
      { childProfileId: child.profileId },
      {
        onSuccess: () => {
          setRestoredName(child.displayName);
        },
        onError: () => {
          platformAlert(
            t('family.withdrawal.restoreErrorTitle'),
            t('family.withdrawal.restoreErrorBody'),
          );
        },
        onSettled: () => {
          setPendingChildId(null);
        },
      },
    );
  };

  return (
    <View
      testID="withdrawal-countdown-banner"
      accessibilityRole="alert"
      className="bg-warning/10 border border-warning/30 rounded-card px-4 py-3 mt-2 mb-3"
    >
      {isMulti && (
        <Text className="text-body font-semibold text-warning mb-2">
          {t('family.withdrawal.bannerTitleMulti', { count: inGrace.length })}
        </Text>
      )}

      {inGrace.map((child) => {
        const daysLeft = getGracePeriodDaysRemaining(child.respondedAt);
        const daysWord = t(
          daysLeft === 1
            ? 'family.withdrawal.daysOne'
            : 'family.withdrawal.daysOther',
        );
        const isPending =
          restoreConsent.isPending && pendingChildId === child.profileId;

        return (
          <View
            key={child.profileId}
            testID={`withdrawal-countdown-row-${child.profileId}`}
            className="flex-row items-center justify-between gap-3 py-1"
          >
            <Text className="text-body-sm text-text-primary flex-1">
              {t('family.withdrawal.bannerTitleSingle', {
                name: child.displayName,
                days: daysLeft,
                daysWord,
              })}
            </Text>
            <Pressable
              testID={`withdrawal-countdown-reverse-${child.profileId}`}
              accessibilityRole="button"
              accessibilityLabel={t('family.withdrawal.bannerCta')}
              disabled={restoreConsent.isPending}
              onPress={() => handleRestore(child)}
              className="bg-warning rounded-button px-3 py-2 min-h-[40px] min-w-[72px] items-center justify-center"
            >
              {isPending ? (
                <ActivityIndicator
                  size="small"
                  testID={`withdrawal-countdown-loading-${child.profileId}`}
                />
              ) : (
                <Text className="text-caption font-semibold text-text-inverse">
                  {t(
                    isMulti
                      ? 'family.withdrawal.bannerCtaShort'
                      : 'family.withdrawal.bannerCta',
                  )}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}

      {restoredName && (
        <Text
          className="text-caption text-text-secondary mt-2"
          testID="withdrawal-countdown-success"
        >
          {t('family.withdrawal.restoreSuccessToast', { name: restoredName })}
        </Text>
      )}
    </View>
  );
}
