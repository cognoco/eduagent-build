import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ChildCapNotifyParentInput } from '@eduagent/schemas';

import { platformAlert } from '../../../../lib/platform-alert';
import * as SecureStore from '../../../../lib/secure-storage';
import { migrateSecureStoreKey } from '../../../../lib/migrate-secure-store-key';
import { useThemeColors } from '../../../../lib/theme';
import { formatMediumDateTime } from '../../../../lib/format-datetime';
import { useProfile } from '../../../../lib/profile';
import { useNotifyParentSubscribe } from '../../../../hooks/use-settings';
import { useNotifyParentChildCap } from '../../../../hooks/use-child-cap-notifications';
import { useXpSummary } from '../../../../hooks/use-streaks';

import {
  getNotifyStorageKey,
  getLegacyNotifyStorageKey,
  computeCooldownMsRemaining,
  formatCooldownLabel,
} from '../child-paywall-helpers';

// [#11] Hermes-safe — delegates to the shared formatter so a missing-ICU
// Intl throw cannot crash the paywall. See lib/format-datetime.ts.
function formatResetAt(value: string | undefined): string {
  return value ? formatMediumDateTime(value) || value : '';
}

type ChildPaywallMode = 'subscription' | 'quota';

interface ChildPaywallProps {
  mode?: ChildPaywallMode;
  quotaKind?: ChildCapNotifyParentInput['kind'];
  resetsAt?: string;
}

export function ChildPaywall({
  mode = 'subscription',
  quotaKind = 'monthly_exceeded',
  resetsAt,
}: ChildPaywallProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { activeProfile } = useProfile();
  const notifyParentSubscribe = useNotifyParentSubscribe();
  const notifyParentChildCap = useNotifyParentChildCap();
  const { data: xpSummary } = useXpSummary();
  const { t } = useTranslation();
  const isQuotaMode = mode === 'quota';

  const [notifiedAt, setNotifiedAt] = useState<number | null>(null);
  const [cooldownMsRemaining, setCooldownMsRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const profileId = activeProfile?.id ?? '';

  // BM-07: migration and restore must run sequentially — the restore reads
  // the new key that migration writes.  A single effect chains them to avoid
  // a race where restore fires before migration finishes writing.
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    (async () => {
      try {
        // Step 1: migrate legacy key → new key (no-ops if already migrated)
        await migrateSecureStoreKey(
          getLegacyNotifyStorageKey(profileId),
          getNotifyStorageKey(profileId),
        );
        if (cancelled) return;
        // Step 2: restore persisted notified timestamp
        const value = await SecureStore.getItemAsync(
          getNotifyStorageKey(profileId),
        );
        if (cancelled) return;
        if (!value) return;
        const ts = Number(value);
        if (Number.isNaN(ts)) return;
        const remaining = computeCooldownMsRemaining(ts);
        if (remaining > 0) {
          setNotifiedAt(ts);
          setCooldownMsRemaining(remaining);
        }
      } catch {
        /* SecureStore unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // Update countdown more frequently near expiry so the button re-enables on time.
  useEffect(() => {
    if (notifiedAt === null) return;

    const update = () => {
      const remaining = computeCooldownMsRemaining(notifiedAt);
      setCooldownMsRemaining(remaining);
      if (remaining <= 0) {
        setNotifiedAt(null);
        timerRef.current = null;
        return;
      }

      const nextTick = remaining <= 60_000 ? 1000 : 60_000;
      timerRef.current = setTimeout(update, nextTick);
    };

    update();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notifiedAt]);

  const isNotified = notifiedAt !== null && cooldownMsRemaining > 0;
  const notifyPending = isQuotaMode
    ? notifyParentChildCap.isPending
    : notifyParentSubscribe.isPending;
  const quotaResetLabel = formatResetAt(resetsAt);
  const quotaResetsAt = resetsAt ?? new Date().toISOString();

  const handleNotify = useCallback(async () => {
    try {
      if (isQuotaMode) {
        const result = await notifyParentChildCap.mutateAsync({
          kind: quotaKind,
          resetsAt: quotaResetsAt,
        });
        if (result.sent) {
          const now = Date.now();
          setNotifiedAt(now);
          if (profileId) {
            void SecureStore.setItemAsync(
              getNotifyStorageKey(profileId),
              String(now),
            ).catch(() => undefined);
          }
          platformAlert(
            t('subscription.childPaywall.alerts.sentTitle'),
            t('subscription.childPaywall.alerts.quotaSentBody'),
          );
        } else {
          platformAlert(
            t('subscription.childPaywall.alerts.askParentTitle'),
            t('subscription.childPaywall.alerts.quotaAskParentBody'),
          );
        }
        return;
      }

      const result = await notifyParentSubscribe.mutateAsync();
      if (result.rateLimited) {
        // Server says rate-limited — persist the current timestamp as fallback
        const now = Date.now();
        setNotifiedAt(now);
        if (profileId) {
          void SecureStore.setItemAsync(
            getNotifyStorageKey(profileId),
            String(now),
          ).catch(() => undefined);
        }
      } else if (result.sent) {
        const now = Date.now();
        setNotifiedAt(now);
        if (profileId) {
          void SecureStore.setItemAsync(
            getNotifyStorageKey(profileId),
            String(now),
          ).catch(() => undefined);
        }
        platformAlert(
          t('subscription.childPaywall.alerts.sentTitle'),
          t('subscription.childPaywall.alerts.sentBody'),
        );
      } else {
        platformAlert(
          t('subscription.childPaywall.alerts.askParentTitle'),
          t('subscription.childPaywall.alerts.askParentBody'),
        );
      }
    } catch {
      platformAlert(
        t('subscription.childPaywall.alerts.notifyErrorTitle'),
        t('subscription.childPaywall.alerts.notifyErrorBody'),
      );
    }
  }, [
    isQuotaMode,
    notifyParentChildCap,
    notifyParentSubscribe,
    profileId,
    quotaKind,
    quotaResetsAt,
    t,
  ]);

  const topicsLearned = xpSummary?.topicsCompleted ?? 0;
  const totalXp = xpSummary?.totalXp ?? 0;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="child-paywall"
    >
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => router.replace('/(app)/more')}
          className="me-3 min-w-[44px] min-h-[44px] justify-center items-center"
          accessibilityLabel={t(
            'subscription.childPaywall.backAccessibilityLabel',
          )}
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-semibold">
            {t('subscription.childPaywall.back')}
          </Text>
        </Pressable>
      </View>

      <View className="flex-1 px-5 items-center justify-center">
        <Text className="text-h1 font-bold text-text-primary mb-4 text-center">
          {t('subscription.childPaywall.headline')}
        </Text>
        <Text className="text-body text-text-secondary mb-2 text-center">
          {topicsLearned > 0 || totalXp > 0
            ? t('subscription.childPaywall.xpStats', {
                count: topicsLearned,
                xp: totalXp,
              })
            : t('subscription.childPaywall.greatStart')}
        </Text>
        <Text className="text-body text-text-secondary mb-8 text-center">
          {isQuotaMode
            ? t('subscription.childPaywall.quotaUsedAllQuestions', {
                resetAt: quotaResetLabel,
              })
            : t('subscription.childPaywall.usedAllQuestions')}
        </Text>

        <Pressable
          onPress={handleNotify}
          disabled={notifyPending || isNotified}
          className={`rounded-button py-3.5 px-8 items-center mb-3 w-full ${
            isNotified ? 'bg-muted' : 'bg-primary'
          }`}
          testID="notify-parent-button"
          accessibilityRole="button"
          accessibilityLabel={
            isNotified
              ? t('subscription.childPaywall.notifyButtonAccessibilityNotified')
              : t('subscription.childPaywall.notifyButtonAccessibilityNotify')
          }
        >
          {notifyPending ? (
            <ActivityIndicator
              color={colors.textInverse}
              accessibilityLabel={t('common.loading')}
            />
          ) : (
            <Text
              className={`text-body font-semibold ${
                isNotified ? 'text-text-secondary' : 'text-text-inverse'
              }`}
            >
              {isNotified
                ? t('subscription.childPaywall.notifyButtonNotified')
                : t('subscription.childPaywall.notifyButton')}
            </Text>
          )}
        </Pressable>

        {isNotified && (
          <Text
            className="text-body-sm text-text-secondary text-center mb-3"
            testID="notify-countdown"
          >
            {t('subscription.childPaywall.cooldownReminder', {
              label: formatCooldownLabel(cooldownMsRemaining, t),
            })}
          </Text>
        )}

        {isNotified ? (
          <Text
            className="text-body-sm text-text-secondary text-center mb-4"
            testID="notified-explore-text"
          >
            {t('subscription.childPaywall.notifiedExploreText')}
          </Text>
        ) : (
          <Text className="text-body-sm text-text-secondary text-center mb-4">
            {t('subscription.childPaywall.waitText')}
          </Text>
        )}

        <Pressable
          onPress={() => router.push('/(app)/library')}
          className="bg-surface rounded-button py-3.5 px-8 items-center w-full mb-2"
          testID="browse-library-button"
          accessibilityRole="button"
          accessibilityLabel={t(
            'subscription.childPaywall.browseLibraryAccessibilityLabel',
          )}
        >
          <Text className="text-body font-semibold text-primary">
            {t('subscription.childPaywall.browseLibrary')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(app)/progress')}
          className="bg-surface rounded-button py-3.5 px-8 items-center w-full mb-2"
          testID="see-progress-button"
          accessibilityRole="button"
          accessibilityLabel={t(
            'subscription.childPaywall.seeProgressAccessibilityLabel',
          )}
        >
          <Text className="text-body font-semibold text-primary">
            {t('subscription.childPaywall.seeProgress')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(app)/home')}
          className="bg-surface rounded-button py-3.5 px-8 items-center w-full"
          testID="go-home-button"
          accessibilityRole="button"
          accessibilityLabel={t(
            'subscription.childPaywall.goHomeAccessibilityLabel',
          )}
        >
          <Text className="text-body font-semibold text-primary">
            {t('subscription.childPaywall.goHome')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
