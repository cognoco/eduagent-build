import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { RetentionSignal, type RetentionStatus } from './RetentionSignal';

interface RemediationCardProps {
  retentionStatus: RetentionStatus;
  cooldownEndsAt?: string;
  onReviewRetest: () => void;
  onRelearnTopic: () => void;
  onBookPress?: () => void;
}

function getCooldownMessage(remainingMs: number): string {
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);

  if (hours < 1) {
    return `You can try again in ${totalMinutes} minutes — go do something fun!`;
  }
  if (hours <= 4) {
    return `You can try again in about ${hours} hours — your brain needs a real break!`;
  }
  return 'Come back tomorrow and try fresh!';
}

export function RemediationCard({
  retentionStatus,
  cooldownEndsAt,
  onReviewRetest,
  onRelearnTopic,
  onBookPress,
}: RemediationCardProps) {
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

  return (
    <View
      className="bg-surface-elevated rounded-card p-4 mt-4"
      testID="remediation-card"
    >
      <View className="flex-row items-center justify-between mb-3">
        <RetentionSignal status={retentionStatus} />
        <Text className="text-body-sm font-medium text-text-secondary">
          Let&apos;s try something new!
        </Text>
      </View>

      <Text className="text-body-sm text-text-secondary mb-2">
        Don&apos;t worry — it&apos;s totally normal to need another go.
        Let&apos;s find what works for you!
      </Text>

      {cooldownActive && (
        <Text className="text-body-sm text-text-secondary mb-4">
          {getCooldownMessage(remainingMs)}
        </Text>
      )}

      <Pressable
        onPress={onRelearnTopic}
        className="bg-primary rounded-button py-3 items-center mb-2"
        testID="relearn-topic-button"
        accessibilityLabel="Try a different way"
        accessibilityRole="button"
      >
        <Text className="text-body-sm font-semibold text-text-inverse">
          Try a different way
        </Text>
      </Pressable>
      <Pressable
        onPress={cooldownActive ? undefined : onReviewRetest}
        disabled={cooldownActive}
        className="py-3 items-center"
        testID="review-retest-button"
        accessibilityLabel="Or try again later"
        accessibilityRole="button"
      >
        <Text
          className={`text-body-sm ${
            cooldownActive
              ? 'text-text-secondary opacity-50'
              : 'text-primary font-medium'
          }`}
        >
          Or try again later
        </Text>
      </Pressable>

      {cooldownActive && onBookPress && (
        <Pressable
          onPress={onBookPress}
          className="mt-2 py-2 items-center"
          testID="remediation-book-link"
          accessibilityLabel="Check out your Library"
          accessibilityRole="link"
        >
          <Text className="text-body-sm text-primary">
            While you wait, check out your Library
          </Text>
        </Pressable>
      )}
    </View>
  );
}
