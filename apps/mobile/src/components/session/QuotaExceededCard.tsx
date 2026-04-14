import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { QuotaExceededDetails } from '../../lib/api-client';

export interface QuotaExceededCardProps {
  details: QuotaExceededDetails;
  isOwner: boolean;
}

/**
 * Shown in-chat when the API returns a 402 QuotaExceededError.
 * Persona-unaware: uses semantic tokens only. isOwner controls variant.
 */
export function QuotaExceededCard({
  details,
  isOwner,
}: QuotaExceededCardProps): React.ReactElement {
  const router = useRouter();

  const isDailyLimit = details.reason === 'daily';
  const limitLabel = isDailyLimit ? "today's limit" : "this month's limit";

  return (
    <View
      className="bg-surface rounded-card p-4 mt-2"
      testID="quota-exceeded-card"
      accessibilityRole="alert"
    >
      <Text className="text-body font-semibold text-text-primary mb-1">
        {isDailyLimit ? 'Daily limit reached' : 'Monthly limit reached'}
      </Text>

      {isOwner ? (
        <>
          <Text className="text-body-sm text-text-secondary mb-3">
            {isDailyLimit
              ? `You've reached today's limit. Used ${details.usedToday} of ${
                  details.dailyLimit ?? details.monthlyLimit
                } — resets at midnight.`
              : `Used ${details.usedThisMonth} of ${details.monthlyLimit} this month.`}{' '}
            Upgrade for more learning time.
          </Text>

          <Pressable
            onPress={() => router.push('/(app)/subscription' as never)}
            className="bg-primary rounded-button py-3 items-center min-h-[44px] justify-center mb-2"
            accessibilityRole="button"
            accessibilityLabel="Upgrade plan"
            testID="quota-upgrade-btn"
          >
            <Text className="text-body-sm font-semibold text-text-inverse">
              Upgrade plan
            </Text>
          </Pressable>

          {details.topUpCreditsRemaining > 0 && (
            <Pressable
              onPress={() => router.push('/(app)/subscription' as never)}
              className="bg-surface-elevated rounded-button py-3 items-center min-h-[44px] justify-center"
              accessibilityRole="button"
              accessibilityLabel="Top up credits"
              testID="quota-topup-btn"
            >
              <Text className="text-body-sm font-semibold text-text-secondary">
                Top up credits ({details.topUpCreditsRemaining} remaining)
              </Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <Text className="text-body-sm text-text-secondary mb-3">
            You've reached {limitLabel} for learning sessions. Ask your parent
            to upgrade so you can keep going.
          </Text>

          <View
            className="bg-surface-elevated rounded-button py-3 px-4 items-center"
            testID="quota-ask-parent"
          >
            <Text className="text-body-sm text-text-secondary">
              Let your parent know to upgrade your plan
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
