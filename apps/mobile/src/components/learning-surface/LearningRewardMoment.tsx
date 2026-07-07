import type { ReactElement, ReactNode } from 'react';
import { Text, View } from 'react-native';

interface LearningRewardMomentProps {
  activityLabel: string;
  headline: string;
  answer?: string | null;
  fallbackAnswerLabel: string;
  reinforcement: string;
  motif?: ReactNode;
  testID?: string;
  activityTestID?: string;
  answerTestID?: string;
}

export function LearningRewardMoment({
  activityLabel,
  headline,
  answer,
  fallbackAnswerLabel,
  reinforcement,
  motif,
  testID,
  activityTestID,
  answerTestID,
}: LearningRewardMomentProps): ReactElement {
  const displayAnswer = answer?.trim() ? answer : fallbackAnswerLabel;

  return (
    <View
      className="rounded-card border border-primary/30 bg-surface p-4"
      testID={testID}
    >
      <View className="flex-row items-start gap-3">
        {motif ? (
          <View className="-my-3 -ml-2 h-20 w-20 items-center justify-center">
            {motif}
          </View>
        ) : null}
        <View className="min-w-0 flex-1">
          <Text
            className="text-caption font-semibold uppercase text-primary"
            testID={activityTestID}
          >
            {activityLabel}
          </Text>
          <Text className="mt-1 text-h3 font-bold text-text-primary">
            {headline}
          </Text>
          <Text
            className="mt-1 text-h2 font-bold text-text-primary"
            testID={answerTestID}
          >
            {displayAnswer}
          </Text>
          <Text className="mt-2 text-body-sm text-text-secondary">
            {reinforcement}
          </Text>
        </View>
      </View>
    </View>
  );
}
