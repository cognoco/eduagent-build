import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { RetentionSignal, type RetentionStatus } from './RetentionSignal';

interface RemediationCardProps {
  retentionStatus: RetentionStatus;
  failureCount: number;
  cooldownEndsAt?: string;
  onReviewRetest: () => void;
  onRelearnTopic: () => void;
  /** Persona-aware — caller passes this from layout/route context. */
  isLearner: boolean;
  /** Navigation callback for Learning Book link during cooldown. */
  onBookPress?: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '';
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Persona-aware cooldown message (Story 10.9). */
function getCooldownMessage(remainingMs: number, isLearner: boolean): string {
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);

  if (isLearner) {
    if (hours < 1) {
      return `You can try again in ${totalMinutes} minutes — go do something fun!`;
    }
    if (hours <= 4) {
      return `You can try again in about ${hours} hours — your brain needs a real break!`;
    }
    return 'Come back tomorrow and try fresh!';
  }

  // Teen copy
  return `Your brain needs a break — try again in ${formatCountdown(
    remainingMs
  )}`;
}

export function RemediationCard({
  retentionStatus,
  failureCount,
  cooldownEndsAt,
  onReviewRetest,
  onRelearnTopic,
  isLearner,
  onBookPress,
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

  // Persona-keyed labels (Story 10.9)
  const roundLabel = isLearner
    ? "Let's try something new!"
    : `Attempt ${failureCount}`;

  const encouragement = isLearner
    ? "Don't worry — it's totally normal to need another go. Let's find what works for you!"
    : "Don't worry — struggling with a topic is part of learning. You can review and try again, or try relearning with a different approach.";

  const primaryLabel = isLearner
    ? 'Try a different way'
    : cooldownActive
    ? `Available in ${formatCountdown(remainingMs)}`
    : 'Review and try again';

  const secondaryLabel = isLearner
    ? 'Or try again later'
    : 'Try a different approach';

  return (
    <View
      className="bg-surface-elevated rounded-card p-4 mt-4"
      testID="remediation-card"
    >
      <View className="flex-row items-center justify-between mb-3">
        <RetentionSignal status={retentionStatus} />
        <Text className="text-body-sm font-medium text-text-secondary">
          {roundLabel}
        </Text>
      </View>

      <Text className="text-body-sm text-text-secondary mb-2">
        {encouragement}
      </Text>

      {cooldownActive && (
        <Text className="text-body-sm text-text-secondary mb-4">
          {getCooldownMessage(remainingMs, isLearner)}
        </Text>
      )}

      {isLearner ? (
        // Learner: single primary CTA → relearn, secondary text link
        <>
          <Pressable
            onPress={onRelearnTopic}
            className="bg-primary rounded-button py-3 items-center mb-2"
            testID="relearn-topic-button"
            accessibilityLabel="Try a different way"
            accessibilityRole="button"
          >
            <Text className="text-body-sm font-semibold text-text-inverse">
              {primaryLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={cooldownActive ? undefined : onReviewRetest}
            disabled={cooldownActive}
            className="py-3 items-center"
            testID="review-retest-button"
            accessibilityLabel={secondaryLabel}
            accessibilityRole="button"
          >
            <Text
              className={`text-body-sm ${
                cooldownActive
                  ? 'text-text-secondary opacity-50'
                  : 'text-primary font-medium'
              }`}
            >
              {secondaryLabel}
            </Text>
          </Pressable>
        </>
      ) : (
        // Teen: both buttons remain
        <>
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
                : 'Review and try again'
            }
            accessibilityRole="button"
          >
            <Text
              className={`text-body-sm font-semibold ${
                cooldownActive ? 'text-text-secondary' : 'text-text-inverse'
              }`}
            >
              {primaryLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={onRelearnTopic}
            className="bg-surface rounded-button py-3 items-center"
            testID="relearn-topic-button"
            accessibilityLabel="Try a different approach"
            accessibilityRole="button"
          >
            <Text className="text-body-sm font-semibold text-primary">
              {secondaryLabel}
            </Text>
          </Pressable>
        </>
      )}

      {/* During cooldown, offer something to do */}
      {cooldownActive && onBookPress && (
        <Pressable
          onPress={onBookPress}
          className="mt-2 py-2 items-center"
          testID="remediation-book-link"
          accessibilityLabel="Check out your Learning Book"
          accessibilityRole="link"
        >
          <Text className="text-body-sm text-primary">
            While you wait, check out your Learning Book
          </Text>
        </Pressable>
      )}
    </View>
  );
}
