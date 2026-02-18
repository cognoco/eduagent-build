import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RetentionSignal } from '../../components/RetentionSignal';
import { useTopicProgress } from '../../hooks/use-progress';
import { useTopicRetention } from '../../hooks/use-retention';

type RetentionStatus = 'strong' | 'fading' | 'weak' | 'forgotten';

function deriveRetentionStatus(
  card:
    | {
        easeFactor: number;
        repetitions: number;
        xpStatus: string;
      }
    | null
    | undefined
): RetentionStatus {
  if (!card) return 'weak';
  if (card.xpStatus === 'decayed') return 'forgotten';
  if (card.repetitions === 0) return 'weak';
  return card.easeFactor >= 2.5 ? 'strong' : 'fading';
}

const COMPLETION_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  verified: 'Verified',
  stable: 'Stable',
};

const STRUGGLE_LABELS: Record<string, string> = {
  normal: 'Normal',
  needs_deepening: 'Needs deepening',
  blocked: 'Blocked',
};

export default function TopicDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { subjectId, topicId } = useLocalSearchParams<{
    subjectId: string;
    topicId: string;
  }>();

  const { data: topicProgress, isLoading: progressLoading } = useTopicProgress(
    subjectId ?? '',
    topicId ?? ''
  );
  const { data: retentionCard, isLoading: retentionLoading } =
    useTopicRetention(topicId ?? '');

  const isLoading = progressLoading || retentionLoading;

  if (!subjectId || !topicId) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-text-secondary">No topic selected</Text>
      </View>
    );
  }

  const retentionStatus = deriveRetentionStatus(retentionCard);
  const nextReviewDate = retentionCard?.nextReviewAt
    ? new Date(retentionCard.nextReviewAt).toLocaleDateString()
    : null;
  const masteryPercent = topicProgress?.masteryScore
    ? Math.round(topicProgress.masteryScore * 100)
    : null;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          testID="topic-detail-back"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-primary text-h3">&larr;</Text>
        </Pressable>
        <Text
          className="text-h2 font-bold text-text-primary flex-1"
          numberOfLines={1}
        >
          {topicProgress?.title ?? 'Topic Detail'}
        </Text>
      </View>

      {isLoading ? (
        <View
          className="flex-1 items-center justify-center"
          testID="topic-detail-loading"
        >
          <ActivityIndicator size="large" />
          <Text className="text-text-secondary mt-2">Loading topic...</Text>
        </View>
      ) : !topicProgress ? (
        <View
          className="flex-1 items-center justify-center px-8"
          testID="topic-detail-empty"
        >
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            Topic not found
          </Text>
          <Text className="text-body text-text-secondary text-center">
            This topic may have been removed from your curriculum.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          {/* Description */}
          {topicProgress.description ? (
            <Text className="text-body text-text-secondary mb-4">
              {topicProgress.description}
            </Text>
          ) : null}

          {/* Status cards */}
          <View className="bg-surface rounded-card p-4 mb-3">
            <Text className="text-body-sm font-semibold text-text-primary mb-3">
              Progress
            </Text>
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-body-sm text-text-secondary">Status</Text>
              <Text className="text-body-sm font-medium text-text-primary">
                {COMPLETION_LABELS[topicProgress.completionStatus] ??
                  topicProgress.completionStatus}
              </Text>
            </View>
            {topicProgress.struggleStatus !== 'normal' && (
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-body-sm text-text-secondary">
                  Struggle
                </Text>
                <Text className="text-body-sm font-medium text-warning">
                  {STRUGGLE_LABELS[topicProgress.struggleStatus] ??
                    topicProgress.struggleStatus}
                </Text>
              </View>
            )}
            {masteryPercent !== null && (
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-body-sm text-text-secondary">
                  Mastery
                </Text>
                <Text className="text-body-sm font-medium text-text-primary">
                  {masteryPercent}%
                </Text>
              </View>
            )}
            {topicProgress.xpStatus && (
              <View className="flex-row justify-between items-center">
                <Text className="text-body-sm text-text-secondary">
                  XP Status
                </Text>
                <Text className="text-body-sm font-medium text-text-primary capitalize">
                  {topicProgress.xpStatus}
                </Text>
              </View>
            )}
          </View>

          {/* Retention card */}
          <View className="bg-surface rounded-card p-4 mb-3">
            <Text className="text-body-sm font-semibold text-text-primary mb-3">
              Retention
            </Text>
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-body-sm text-text-secondary">
                Retention
              </Text>
              <RetentionSignal status={retentionStatus} />
            </View>
            {nextReviewDate && (
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-body-sm text-text-secondary">
                  Next review
                </Text>
                <Text className="text-body-sm font-medium text-text-primary">
                  {nextReviewDate}
                </Text>
              </View>
            )}
            {retentionCard && (
              <>
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-body-sm text-text-secondary">
                    Interval
                  </Text>
                  <Text className="text-body-sm font-medium text-text-primary">
                    {retentionCard.intervalDays} day
                    {retentionCard.intervalDays === 1 ? '' : 's'}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-body-sm text-text-secondary">
                    Reviews
                  </Text>
                  <Text className="text-body-sm font-medium text-text-primary">
                    {retentionCard.repetitions}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Summary excerpt */}
          {topicProgress.summaryExcerpt && (
            <View className="bg-surface rounded-card p-4 mb-3">
              <Text className="text-body-sm font-semibold text-text-primary mb-2">
                Your summary
              </Text>
              <Text className="text-body-sm text-text-secondary italic">
                {topicProgress.summaryExcerpt}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Action buttons */}
      {topicProgress && (
        <View
          className="px-5 pb-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/session',
                params: {
                  mode: 'practice',
                  subjectId,
                  topicId,
                },
              })
            }
            className="bg-primary rounded-button py-3.5 items-center mb-2"
            testID="start-review-button"
            accessibilityLabel="Start review session"
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Start Review Session
            </Text>
          </Pressable>
          <View className="flex-row">
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/assessment',
                  params: {
                    subjectId,
                    topicId,
                  },
                })
              }
              className="flex-1 bg-surface-elevated rounded-button py-3 items-center mr-2"
              testID="request-retest-button"
              accessibilityLabel="Request re-test"
              accessibilityRole="button"
            >
              <Text className="text-body-sm font-medium text-text-primary">
                Request Re-test
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/session',
                  params: {
                    mode: 'learning',
                    subjectId,
                    topicId,
                  },
                })
              }
              className="flex-1 bg-surface-elevated rounded-button py-3 items-center"
              testID="relearn-button"
              accessibilityLabel="Relearn topic"
              accessibilityRole="button"
            >
              <Text className="text-body-sm font-medium text-text-primary">
                Relearn Topic
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
