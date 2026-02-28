import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { RetentionSignal, type RetentionStatus } from './RetentionSignal';

interface RemediationCardProps {
  retentionStatus: RetentionStatus;
  failureCount: number;
  cooldownEndsAt?: string;
  onReviewRetest: () => void;
  onRelearnTopic: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '';
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function RemediationCard({
  retentionStatus,
  failureCount,
  cooldownEndsAt,
  onReviewRetest,
  onRelearnTopic,
}: RemediationCardProps) {
  const [remainingMs, setRemainingMs] = useState(() => {
    if (!cooldownEndsAt) return 0;
    return Math.max(0, new Date(cooldownEndsAt).getTime() - Date.now());
  });

  useEffect(() => {
    if (!cooldownEndsAt) return;
    const update = () => {
      const ms = Math.max(0, new Date(cooldownEndsAt).getTime() - Date.now());
      setRemainingMs(ms);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
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
          Practice round {failureCount}
        </Text>
      </View>

      <Text className="text-body-sm text-text-secondary mb-4">
        Don't worry — struggling with a topic is part of learning. You can
        review and try again, or try relearning with a different approach.
      </Text>

      <Pressable
        onPress={onReviewRetest}
        disabled={cooldownActive}
        className={`rounded-button py-3 items-center mb-2 ${
          cooldownActive ? 'bg-surface opacity-50' : 'bg-primary'
        }`}
        testID="review-retest-button"
        accessibilityLabel={
          cooldownActive
            ? `Review available in ${formatCountdown(remainingMs)}`
            : 'Review and re-test'
        }
        accessibilityRole="button"
      >
        <Text
          className={`text-body-sm font-semibold ${
            cooldownActive ? 'text-text-secondary' : 'text-text-inverse'
          }`}
        >
          {cooldownActive
            ? `Available in ${formatCountdown(remainingMs)}`
            : 'Review and Re-test'}
        </Text>
      </Pressable>

      <Pressable
        onPress={onRelearnTopic}
        className="bg-surface rounded-button py-3 items-center"
        testID="relearn-topic-button"
        accessibilityLabel="Relearn topic"
        accessibilityRole="button"
      >
        <Text className="text-body-sm font-semibold text-primary">
          Relearn Topic
        </Text>
      </Pressable>
    </View>
  );
}
