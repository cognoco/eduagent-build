import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../../components/progress';
import { useTopicProgress } from '../../../hooks/use-progress';
import { useTopicRetention } from '../../../hooks/use-retention';
import { useTopicParkingLot } from '../../../hooks/use-sessions';
import { useThemeColors } from '../../../lib/theme';

function deriveRetentionStatus(
  card:
    | {
        easeFactor: number;
        repetitions: number;
        xpStatus: string;
        nextReviewAt?: string | null;
        failureCount?: number;
      }
    | null
    | undefined
): RetentionStatus {
  if (!card) return 'weak';
  if ((card.failureCount ?? 0) >= 3 || card.xpStatus === 'decayed')
    return 'forgotten';
  if (card.repetitions === 0) return 'weak';
  // Use server-computed SM-2 schedule (matches computeRetentionStatus)
  if (!card.nextReviewAt) return 'weak';
  const now = Date.now();
  const reviewAt = new Date(card.nextReviewAt).getTime();
  const daysUntilReview = (reviewAt - now) / (1000 * 60 * 60 * 24);
  if (daysUntilReview > 3) return 'strong';
  if (daysUntilReview > 0) return 'fading';
  return 'weak';
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
  needs_deepening: 'Exploring further',
  blocked: 'Paused \u2014 needs a different approach',
};

export default function TopicDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { subjectId, topicId } = useLocalSearchParams<{
    subjectId: string;
    topicId: string;
  }>();

  const {
    data: topicProgress,
    isLoading: progressLoading,
    isError: progressError,
    refetch: refetchProgress,
  } = useTopicProgress(subjectId ?? '', topicId ?? '');
  const {
    data: retentionCard,
    isLoading: retentionLoading,
    isError: retentionError,
    refetch: refetchRetention,
  } = useTopicRetention(topicId ?? '');
  const { data: parkedQuestions, isLoading: parkingLotLoading } =
    useTopicParkingLot(subjectId ?? '', topicId ?? '');

  const isLoading = progressLoading || retentionLoading || parkingLotLoading;

  if (!subjectId || !topicId) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={colors.muted} />
      </View>
    );
  }

  if ((progressError || retentionError) && !isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          We couldn't load this topic
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          Please try again, or go back to your library.
        </Text>
        <Pressable
          onPress={() => {
            void refetchProgress();
            void refetchRetention();
          }}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mb-3"
          accessibilityRole="button"
          accessibilityLabel="Retry loading topic"
          testID="topic-detail-retry"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Retry
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          className="bg-surface rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="topic-detail-go-back"
        >
          <Text className="text-body font-semibold text-text-primary">
            Go back
          </Text>
        </Pressable>
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
  const failureCount = retentionCard?.failureCount ?? 0;
  const showRelearn =
    failureCount >= 3 || topicProgress?.struggleStatus === 'needs_deepening';

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
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
          <ActivityIndicator size="large" color={colors.muted} />
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
          <Pressable
            onPress={() => router.back()}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mt-6"
            testID="topic-detail-empty-back"
            accessibilityRole="button"
            accessibilityLabel="Back to previous screen"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Go back
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
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
                  Learning path
                </Text>
                <Text className="text-body-sm font-medium text-info">
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
                <Text className="text-body-sm font-medium text-text-primary">
                  {topicProgress.xpStatus === 'verified'
                    ? 'XP earned \u2713'
                    : topicProgress.xpStatus === 'decayed'
                    ? 'XP needs refresh'
                    : topicProgress.xpStatus === 'pending'
                    ? 'Complete to earn XP'
                    : topicProgress.xpStatus}
                </Text>
              </View>
            )}
          </View>

          {/* Retention card */}
          <View
            className="bg-surface rounded-card p-4 mb-3"
            testID="retention-card"
          >
            <Text className="text-body-sm font-semibold text-text-primary mb-3">
              Retention
            </Text>
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-body-sm text-text-secondary">
                Memory strength
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
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-body-sm text-text-secondary">
                    Reviews
                  </Text>
                  <Text className="text-body-sm font-medium text-text-primary">
                    {retentionCard.repetitions}
                  </Text>
                </View>
                {failureCount > 0 && (
                  <View className="flex-row justify-between items-center">
                    <Text className="text-body-sm text-text-secondary">
                      Practice rounds
                    </Text>
                    <Text
                      className={`text-body-sm font-medium ${
                        failureCount >= 3 ? 'text-info' : 'text-text-primary'
                      }`}
                    >
                      {failureCount}
                    </Text>
                  </View>
                )}
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

          <View className="bg-surface rounded-card p-4 mb-3">
            <Text className="text-body-sm font-semibold text-text-primary mb-2">
              Parking Lot
            </Text>
            {parkedQuestions && parkedQuestions.length > 0 ? (
              parkedQuestions.map((item) => (
                <View key={item.id} className="flex-row items-start mt-1">
                  <Text className="text-body text-text-secondary me-2">
                    {'\u2022'}
                  </Text>
                  <Text className="text-body-sm text-text-primary flex-1">
                    {item.question}
                  </Text>
                </View>
              ))
            ) : (
              <Text className="text-body-sm text-text-secondary">
                No parked questions for this topic yet.
              </Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Action buttons */}
      {topicProgress && (
        <View
          className="px-5 pb-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          {topicProgress.completionStatus === 'not_started' ? (
            /* not_started: primary "Start Learning", no secondary */
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(app)/session',
                  params: {
                    mode: 'freeform',
                    subjectId,
                    topicId,
                  },
                })
              }
              className="bg-primary rounded-button py-3.5 items-center mb-2"
              testID="start-learning-button"
              accessibilityLabel="Start learning"
              accessibilityRole="button"
            >
              <Text className="text-text-inverse text-body font-semibold">
                Start Learning
              </Text>
            </Pressable>
          ) : topicProgress.completionStatus === 'in_progress' ? (
            /* in_progress: primary "Continue Learning" + secondary "Start Review Session" */
            <>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(app)/session',
                    params: {
                      mode: 'freeform',
                      subjectId,
                      topicId,
                    },
                  })
                }
                className="bg-primary rounded-button py-3.5 items-center mb-2"
                testID="continue-learning-button"
                accessibilityLabel="Continue learning"
                accessibilityRole="button"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  Continue Learning
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(app)/session',
                    params: {
                      mode: 'practice',
                      subjectId,
                      topicId,
                    },
                  })
                }
                className="border border-border rounded-button py-3 items-center mb-2"
                testID="start-review-button"
                accessibilityLabel="Start review session"
                accessibilityRole="button"
              >
                <Text className="text-body font-semibold text-primary">
                  Start Review Session
                </Text>
              </Pressable>
            </>
          ) : (
            /* completed / verified / stable: primary "Start Review Session" + secondary "Continue Learning" */
            <>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(app)/session',
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
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(app)/session',
                    params: {
                      mode: 'freeform',
                      subjectId,
                      topicId,
                    },
                  })
                }
                className="border border-border rounded-button py-3 items-center mb-2"
                testID="continue-learning-button"
                accessibilityLabel="Continue learning"
                accessibilityRole="button"
              >
                <Text className="text-body font-semibold text-primary">
                  Continue Learning
                </Text>
              </Pressable>
            </>
          )}
          <View className="flex-row">
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(app)/topic/recall-test',
                  params: {
                    subjectId,
                    topicId,
                  },
                })
              }
              className="flex-1 bg-surface-elevated rounded-button py-3 items-center me-2"
              testID="request-retest-button"
              accessibilityLabel={
                failureCount >= 3 ? 'Review and re-test' : 'Recall check'
              }
              accessibilityRole="button"
            >
              <Text className="text-body-sm font-medium text-text-primary">
                {failureCount >= 3 ? 'Review and Re-test' : 'Recall Check'}
              </Text>
            </Pressable>
            {showRelearn && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(app)/topic/relearn',
                    params: {
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
            )}
          </View>
        </View>
      )}
    </View>
  );
}
