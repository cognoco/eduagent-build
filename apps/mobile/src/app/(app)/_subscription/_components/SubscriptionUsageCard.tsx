import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UsageMeter } from '../../../../components/common';
import { TrackedView } from '../../../../components/common/TrackedView';
import type { UsageData } from '../../../../hooks/use-subscription';
import { formatShortDate } from '../../../../lib/format-datetime';

export interface SubscriptionUsageCardProps {
  usage: UsageData;
  canUseOwnerBillingGates: boolean;
  breakdownAnalytics: {
    is_owner: boolean;
    breakdown_section_visible: boolean;
    child_count_bucket: '0' | '1' | '2-3' | '4+';
  };
}

export function SubscriptionUsageCard({
  usage,
  canUseOwnerBillingGates,
  breakdownAnalytics,
}: SubscriptionUsageCardProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <View className="mt-4">
      <TrackedView
        eventName="subscription_breakdown_viewed"
        dwellMs={2000}
        properties={breakdownAnalytics}
        testID="subscription-usage-tracker"
      >
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2">
          {t('subscription.usageCard.usageThisMonth')}
        </Text>
        <View className="bg-surface rounded-card px-4 py-3.5">
          <UsageMeter
            used={usage.usedThisMonth}
            limit={usage.monthlyLimit}
            warningLevel={usage.warningLevel}
          />
          {/* BUG-395: Show daily usage for free-tier users who have a daily cap */}
          {usage.dailyLimit != null && (
            <View className="mt-2" testID="daily-usage">
              <Text className="text-caption text-text-secondary">
                {t('subscription.usageCard.todayUsage', {
                  used: usage.usedToday,
                  limit: usage.dailyLimit,
                })}
              </Text>
            </View>
          )}
          {usage.topUpCreditsRemaining > 0 && (
            <Text className="text-caption text-text-secondary mt-2">
              {t('subscription.usageCard.topUpRemaining', {
                count: usage.topUpCreditsRemaining,
              })}
            </Text>
          )}
          {usage.byProfile && usage.byProfile.length > 0 ? (
            <View className="border-t border-border mt-3 pt-3">
              {usage.byProfile.map((row) => (
                <View
                  key={row.profile_id}
                  className="flex-row items-center justify-between py-1"
                  testID={`usage-profile-${row.profile_id}`}
                >
                  <Text className="text-caption text-text-secondary">
                    {row.is_self && canUseOwnerBillingGates
                      ? t('subscription.usageCard.yourShare')
                      : row.is_self
                        ? t('subscription.usageCard.yourUsage')
                        : row.name}
                  </Text>
                  <Text className="text-caption font-semibold text-text-primary">
                    {t('subscription.usageCard.questionsUsed', {
                      count: row.used,
                    })}
                  </Text>
                </View>
              ))}
              {usage.familyAggregate ? (
                <View
                  className="flex-row items-center justify-between py-1"
                  testID="usage-family-aggregate"
                >
                  <Text className="text-caption text-text-secondary">
                    {t('subscription.usageCard.familyAggregate')}
                  </Text>
                  <Text className="text-caption font-semibold text-text-primary">
                    {usage.familyAggregate.used} / {usage.familyAggregate.limit}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <Text className="text-caption text-text-secondary mt-1">
            {t('subscription.usageCard.quotaResets', {
              date:
                usage.resetsAtLabel ??
                formatShortDate(usage.cycleResetAt, i18n?.language, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }),
            })}
          </Text>
          {usage.renewsAtLabel ? (
            <Text className="text-caption text-text-secondary mt-1">
              {t('subscription.usageCard.renews', {
                date: usage.renewsAtLabel,
              })}
            </Text>
          ) : null}
        </View>
        {/* BUG-395: Show daily quota for free-tier users */}
        {usage.dailyLimit != null && (
          <View
            className="bg-surface rounded-card px-4 py-3.5 mt-2"
            testID="daily-usage-card"
          >
            <UsageMeter
              used={usage.usedToday}
              limit={usage.dailyLimit}
              warningLevel={
                usage.usedToday >= usage.dailyLimit ? 'exceeded' : 'none'
              }
            />
            <Text className="text-caption text-text-secondary mt-1">
              {t('subscription.usageCard.dailyLimitHint')}
            </Text>
          </View>
        )}
      </TrackedView>
    </View>
  );
}
