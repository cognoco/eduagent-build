import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RetentionSignal, type RetentionStatus } from './RetentionSignal';

interface RemediationCardProps {
  retentionStatus: RetentionStatus;
  cooldownEndsAt?: string;
  onReviewRetest: () => void;
  onRelearnTopic: () => void;
  onBookPress?: () => void;
}

export function RemediationCard({
  retentionStatus,
  cooldownEndsAt,
  onReviewRetest,
  onRelearnTopic,
  onBookPress,
}: RemediationCardProps) {
  const { t } = useTranslation();
  const [remainingMs, setRemainingMs] = useState(() => {
    if (!cooldownEndsAt) return 0;
    return Math.max(0, new Date(cooldownEndsAt).getTime() - Date.now());
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cooldownEndsAt) return;
    const update = () => {
      const ms = Math.max(0, new Date(cooldownEndsAt).getTime() - Date.now());
      setRemainingMs(ms);
      if (ms <= 0) {
        timerRef.current = null;
        return;
      }
      // Tick every 1s when ≤60s remain so the button re-enables on time;
      // tick every 60s otherwise to avoid unnecessary re-renders.
      const nextTick = ms <= 60_000 ? 1_000 : 60_000;
      timerRef.current = setTimeout(update, nextTick);
    };
    update();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cooldownEndsAt]);

  const cooldownActive = remainingMs > 0;

  function getCooldownMessage(): string {
    const totalMinutes = Math.ceil(remainingMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    if (hours < 1) {
      return t('progress.remediation.cooldownMinutes', {
        minutes: totalMinutes,
      });
    }
    if (hours <= 4) {
      return t('progress.remediation.cooldownHours', { hours });
    }
    return t('progress.remediation.cooldownTomorrow');
  }

  return (
    <View
      className="bg-surface-elevated rounded-card p-4 mt-4"
      testID="remediation-card"
    >
      <View className="flex-row items-center justify-between mb-3">
        <RetentionSignal status={retentionStatus} />
        <Text className="text-body-sm font-medium text-text-secondary">
          {t('progress.remediation.heading')}
        </Text>
      </View>

      <Text className="text-body-sm text-text-secondary mb-2">
        {t('progress.remediation.body')}
      </Text>

      {cooldownActive && (
        <Text className="text-body-sm text-text-secondary mb-4">
          {getCooldownMessage()}
        </Text>
      )}

      <Pressable
        onPress={onRelearnTopic}
        className="bg-primary rounded-button py-3 items-center mb-2"
        testID="relearn-topic-button"
        accessibilityLabel={t('progress.remediation.primaryCtaA11y')}
        accessibilityRole="button"
      >
        <Text className="text-body-sm font-semibold text-text-inverse">
          {t('progress.remediation.primaryCta')}
        </Text>
      </Pressable>
      <Pressable
        onPress={cooldownActive ? undefined : onReviewRetest}
        disabled={cooldownActive}
        accessibilityState={{ disabled: cooldownActive }}
        className="py-3 items-center"
        testID="review-retest-button"
        accessibilityLabel={t('progress.remediation.secondaryCtaA11y')}
        accessibilityRole="button"
      >
        <Text
          className={`text-body-sm ${
            cooldownActive
              ? 'text-text-secondary opacity-50'
              : 'text-primary font-medium'
          }`}
        >
          {t('progress.remediation.secondaryCta')}
        </Text>
      </Pressable>

      {cooldownActive && onBookPress && (
        <Pressable
          onPress={onBookPress}
          className="mt-2 py-2 items-center"
          testID="remediation-book-link"
          accessibilityLabel={t('progress.remediation.libraryLinkA11y')}
          accessibilityRole="link"
        >
          <Text className="text-body-sm text-primary">
            {t('progress.remediation.libraryLink')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
