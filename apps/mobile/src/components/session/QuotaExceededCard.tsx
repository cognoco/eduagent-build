import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { QuotaExceededDetails } from '../../lib/api-client';

export interface QuotaExceededCardProps {
  details: QuotaExceededDetails;
  isOwner: boolean;
}

/**
 * Shown in-chat when the API returns a 402 QuotaExceededError.
 */
export function QuotaExceededCard({
  details,
  isOwner,
}: QuotaExceededCardProps): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();

  const isDailyLimit = details.reason === 'daily';

  return (
    <View
      className="bg-surface rounded-card p-4 mt-2"
      testID="quota-exceeded-card"
      accessibilityRole="alert"
    >
      <Text className="text-body font-semibold text-text-primary mb-1">
        {isDailyLimit
          ? t('session.quota.dailyLimitReached')
          : t('session.quota.monthlyLimitReached')}
      </Text>

      {isOwner ? (
        <>
          <Text className="text-body-sm text-text-secondary mb-3">
            {isDailyLimit
              ? t('session.quota.ownerDailyMessage', {
                  used: String(details.usedToday),
                  limit: String(details.dailyLimit ?? 0),
                })
              : t('session.quota.ownerMonthlyMessage', {
                  used: String(details.usedThisMonth),
                  limit: String(details.monthlyLimit),
                })}
          </Text>

          <Pressable
            onPress={() => router.push('/(app)/subscription' as never)}
            className="bg-primary rounded-button py-3 items-center min-h-[44px] justify-center mb-2"
            accessibilityRole="button"
            accessibilityLabel={t('session.quota.upgradePlan')}
            testID="quota-upgrade-btn"
          >
            <Text className="text-body-sm font-semibold text-text-inverse">
              {t('session.quota.upgradePlan')}
            </Text>
          </Pressable>

          {details.topUpCreditsRemaining > 0 && (
            <Pressable
              onPress={() => router.push('/(app)/subscription' as never)}
              className="bg-surface-elevated rounded-button py-3 items-center min-h-[44px] justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('session.quota.topUpCredits')}
              testID="quota-topup-btn"
            >
              <Text className="text-body-sm font-semibold text-text-secondary">
                {t('session.quota.topUpCreditsWithCount', {
                  count: String(details.topUpCreditsRemaining),
                })}
              </Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <Text className="text-body-sm text-text-secondary mb-3">
            {isDailyLimit
              ? t('session.quota.childDailyMessage')
              : t('session.quota.childMonthlyMessage')}
          </Text>

          <View
            className="bg-surface-elevated rounded-button py-3 px-4 items-center mb-2"
            testID="quota-ask-parent"
          >
            <Text className="text-body-sm text-text-secondary">
              {t('session.quota.askParent')}
            </Text>
          </View>

          {/* H5: Give child a navigation escape so they're not stuck in the locked session */}
          <Pressable
            onPress={() => router.push('/(app)/home' as never)}
            className="bg-surface-elevated rounded-button py-3 items-center min-h-[44px] justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('common.goHome')}
            testID="quota-go-home-btn"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              {t('common.goHome')}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
