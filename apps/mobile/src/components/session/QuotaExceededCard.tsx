import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { QuotaExceededDetails } from '../../lib/api-client';
import { useNotifyParentChildCap } from '../../hooks/use-child-cap-notifications';

export interface QuotaExceededCardProps {
  details: QuotaExceededDetails;
  isOwner: boolean;
  homeHref?: Href;
}

/**
 * Shown in-chat when the API returns a 402 QuotaExceededError.
 */
export function QuotaExceededCard({
  details,
  isOwner,
  homeHref = '/(app)/home' as Href,
}: QuotaExceededCardProps): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const notifyParent = useNotifyParentChildCap();
  const [notifyState, setNotifyState] = useState<
    'idle' | 'sending' | 'sent' | 'failed'
  >('idle');

  const isDailyLimit = details.reason === 'daily';
  // BUG-143: Surface an approximate reset window so the child knows when
  // they can use the app again. QuotaExceededDetails doesn't carry an
  // exact resetsAt — fall back to the canonical wording per reason.
  const resetHint = isDailyLimit
    ? t('session.quota.resetHintDaily')
    : t('session.quota.resetHintMonthly');

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
            onPress={() => router.push('/(app)/subscription' as Href)}
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
              onPress={() => router.push('/(app)/subscription' as Href)}
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

          {/* BUG-143: Show approximate reset time so the child knows when
              the limit lifts. Replaces the partial dead-end of a static
              "ask parent" View with no recovery information. */}
          <Text
            className="text-caption text-text-tertiary mb-3"
            testID="quota-reset-hint"
          >
            {resetHint}
          </Text>

          {/* BUG-143: Primary recovery — notify the parent in one tap rather
              than leaving the child with a non-interactive "ask parent"
              View. Disabled after success so the child can't spam the
              parent's inbox. */}
          <Pressable
            onPress={() => {
              if (notifyState !== 'idle' && notifyState !== 'failed') return;
              setNotifyState('sending');
              notifyParent.mutate(
                {
                  kind: isDailyLimit ? 'daily_exceeded' : 'monthly_exceeded',
                  resetsAt: details.resetsAt,
                },
                {
                  onSuccess: () => setNotifyState('sent'),
                  onError: () => setNotifyState('failed'),
                },
              );
            }}
            disabled={notifyState === 'sending' || notifyState === 'sent'}
            className={`rounded-button py-3 items-center min-h-[44px] justify-center mb-2 ${
              notifyState === 'sent' ? 'bg-surface-elevated' : 'bg-primary'
            }`}
            accessibilityRole="button"
            accessibilityLabel={
              notifyState === 'sent'
                ? t('session.quota.notifyParentSent')
                : t('session.quota.notifyParent')
            }
            testID="quota-notify-parent-btn"
          >
            {notifyState === 'sending' ? (
              <ActivityIndicator
                color="white"
                accessibilityLabel={t('common.loading')}
              />
            ) : (
              <Text
                className={`text-body-sm font-semibold ${
                  notifyState === 'sent'
                    ? 'text-text-secondary'
                    : 'text-text-inverse'
                }`}
              >
                {notifyState === 'sent'
                  ? t('session.quota.notifyParentSent')
                  : notifyState === 'failed'
                    ? t('session.quota.notifyParentRetry')
                    : t('session.quota.notifyParent')}
              </Text>
            )}
          </Pressable>

          {/* H5: Give child a navigation escape so they're not stuck in the
              locked session. Demoted to secondary action per BUG-143 — the
              primary recovery is now "Notify parent". */}
          <Pressable
            onPress={() => router.push(homeHref as Href)}
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
