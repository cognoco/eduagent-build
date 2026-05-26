import React from 'react';
import { View, Text } from 'react-native';
import { UsageMeter } from '../../../../components/common';
import { TrackedView } from '../../../../components/common/TrackedView';
import type { UsageData } from '../../../../hooks/use-subscription';

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
  return (
    <View className="mt-4">
      <TrackedView
        eventName="subscription_breakdown_viewed"
        dwellMs={2000}
        properties={breakdownAnalytics}
        testID="subscription-usage-tracker"
      >
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2">
          Usage this month
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
                Today: {usage.usedToday} / {usage.dailyLimit} daily questions
              </Text>
            </View>
          )}
          {usage.topUpCreditsRemaining > 0 && (
            <Text className="text-caption text-text-secondary mt-2">
              + {usage.topUpCreditsRemaining} top-up credits remaining
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
                      ? 'Your share'
                      : row.is_self
                        ? 'Your usage'
                        : row.name}
                  </Text>
                  <Text className="text-caption font-semibold text-text-primary">
                    {row.used} questions
                  </Text>
                </View>
              ))}
              {usage.familyAggregate ? (
                <View
                  className="flex-row items-center justify-between py-1"
                  testID="usage-family-aggregate"
                >
                  <Text className="text-caption text-text-secondary">
                    Family aggregate
                  </Text>
                  <Text className="text-caption font-semibold text-text-primary">
                    {usage.familyAggregate.used} / {usage.familyAggregate.limit}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <Text className="text-caption text-text-secondary mt-1">
            Quota resets{' '}
            {usage.resetsAtLabel ??
              new Date(usage.cycleResetAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
          </Text>
          {usage.renewsAtLabel ? (
            <Text className="text-caption text-text-secondary mt-1">
              Subscription renews {usage.renewsAtLabel}
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
              Daily limit — resets at midnight
            </Text>
          </View>
        )}
      </TrackedView>
    </View>
  );
}
