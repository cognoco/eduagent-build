import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../../components/progress';
import {
  useTopicProgress,
  useActiveSessionForTopic,
  useResolveTopicSubject,
} from '../../../hooks/use-progress';
import {
  useTopicRetention,
  useEvaluateEligibility,
} from '../../../hooks/use-retention';
import { useTopicParkingLot } from '../../../hooks/use-sessions';
import { useGetTopicNote } from '../../../hooks/use-notes';
import { useThemeColors } from '../../../lib/theme';
import { goBackOrReplace } from '../../../lib/navigation';

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

/**
 * FR90: Time-based decay visualization. Shows how much of the SM-2 interval
 * has elapsed since the last review. The bar fills from left (fresh) to right
 * (due/overdue), with color shifting from retention-strong → fading → weak.
 */
function DecayBar({
  lastReviewedAt,
  intervalDays,
  nextReviewAt,
}: {
  lastReviewedAt: string | null | undefined;
  intervalDays: number;
  nextReviewAt: string | null | undefined;
}) {
  const colors = useThemeColors();

  if (!lastReviewedAt || intervalDays <= 0) return null;

  const now = Date.now();
  const lastReview = new Date(lastReviewedAt).getTime();
  const elapsed = (now - lastReview) / (1000 * 60 * 60 * 24);
  const fraction = Math.min(elapsed / intervalDays, 1.2); // cap at 120% for overdue
  const percent = Math.min(fraction * 100, 100);

  // Determine bar color based on decay fraction
  let barColor: string;
  let label: string;
  if (fraction >= 1) {
    barColor = colors.retentionWeak;
    label = 'Due for review';
  } else if (fraction >= 0.7) {
    barColor = colors.retentionFading;
    const daysLeft = nextReviewAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(nextReviewAt).getTime() - now) / (1000 * 60 * 60 * 24)
          )
        )
      : Math.max(0, Math.ceil(intervalDays - elapsed));
    label = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  } else {
    barColor = colors.retentionStrong;
    const daysLeft = nextReviewAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(nextReviewAt).getTime() - now) / (1000 * 60 * 60 * 24)
          )
        )
      : Math.max(0, Math.ceil(intervalDays - elapsed));
    label = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  }

  return (
    <View className="mt-1 mb-2" testID="decay-bar">
      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-caption text-text-tertiary">Memory decay</Text>
        <Text className="text-caption text-text-tertiary">{label}</Text>
      </View>
      <View
        className="h-1.5 rounded-full bg-surface-elevated overflow-hidden"
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(percent),
        }}
      >
        <View
          style={{
            width: `${percent}%`,
            backgroundColor: barColor,
          }}
          className="h-full rounded-full"
        />
      </View>
    </View>
  );
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
  const { subjectId: paramSubjectId, topicId } = useLocalSearchParams<{
    subjectId: string;
    topicId: string;
  }>();

  // [F-009] Resolve subjectId when deep-linked with topicId only
  const needsResolve = !paramSubjectId && !!topicId;
  const { data: resolved, isLoading: resolveLoading } = useResolveTopicSubject(
    needsResolve ? topicId : undefined
  );
  const subjectId = paramSubjectId || resolved?.subjectId;

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
  // FR128-129: Evaluate (Devil's Advocate) eligibility
  const { data: evaluateEligibility } = useEvaluateEligibility(topicId ?? '');
  // FR68: "Your Words" topic note
  const { data: noteData } = useGetTopicNote(subjectId, topicId);
  // F-4: Resume active/paused session instead of creating a new one
  const { data: activeSession } = useActiveSessionForTopic(topicId);
  const [showSecondary, setShowSecondary] = useState(false);

  const isLoading = progressLoading || retentionLoading || parkingLotLoading;
  // Data-critical queries only — parking lot is secondary and should not suppress errors
  const isCriticalLoading = progressLoading || retentionLoading;
  const retentionStatus = deriveRetentionStatus(retentionCard);
  const nextReviewDate = retentionCard?.nextReviewAt
    ? new Date(retentionCard.nextReviewAt).toLocaleDateString()
    : null;
  const masteryPercent = topicProgress?.masteryScore
    ? Math.round(topicProgress.masteryScore * 100)
    : null;
  const failureCount = retentionCard?.failureCount ?? 0;
  const topicName = topicProgress?.title ?? '';
  const primaryAction = useMemo(() => {
    if (!topicProgress) return null;

    const isStruggling =
      failureCount >= 3 || topicProgress.struggleStatus === 'needs_deepening';
    if (isStruggling) {
      return {
        label: 'Relearn',
        onPress: () =>
          router.push({
            pathname: '/(app)/topic/relearn',
            params: { subjectId, topicId, topicName },
          } as never),
      };
    }

    // [BUG-540] Use 'learning' mode for consistency with home screen Continue
    if (topicProgress.completionStatus === 'not_started') {
      return {
        label: 'Start learning',
        onPress: () =>
          router.push({
            pathname: '/(app)/session',
            params: {
              mode: 'learning',
              subjectId,
              topicId,
              topicName,
            },
          } as never),
      };
    }

    const isOverdue =
      !!retentionCard?.nextReviewAt &&
      new Date(retentionCard.nextReviewAt).getTime() < Date.now();
    if (
      isOverdue &&
      ['completed', 'verified', 'stable'].includes(
        topicProgress.completionStatus
      )
    ) {
      return {
        label: 'Review',
        onPress: () =>
          router.push({
            pathname: '/(app)/session',
            params: {
              mode: 'practice',
              subjectId,
              topicId,
              topicName,
            },
          } as never),
      };
    }

    // [BUG-540] Use 'learning' mode to match the top-level Continue button
    // on the home screen (LearnerScreen). Previously 'freeform' here caused
    // different AI pedagogy for the same topic depending on entry point.
    return {
      label: 'Continue learning',
      onPress: () =>
        router.push({
          pathname: '/(app)/session',
          params: {
            mode: 'learning',
            subjectId,
            topicId,
            topicName,
            ...(activeSession?.sessionId && {
              sessionId: activeSession.sessionId,
            }),
          },
        } as never),
    };
  }, [
    activeSession?.sessionId,
    failureCount,
    retentionCard?.nextReviewAt,
    router,
    subjectId,
    topicId,
    topicName,
    topicProgress,
  ]);
  const secondaryActions = useMemo(() => {
    if (!topicProgress) return [];

    const actions: Array<{
      label: string;
      explanation: string;
      testID: string;
      onPress: () => void;
    }> = [];

    if (topicProgress.completionStatus !== 'not_started') {
      actions.push({
        label: 'Recall Check',
        explanation: 'Test your memory without hints',
        testID: 'secondary-recall-check',
        onPress: () =>
          router.push({
            pathname: '/(app)/topic/recall-test',
            params: { subjectId, topicId, topicName },
          } as never),
      });
    }

    if (evaluateEligibility?.eligible) {
      actions.push({
        label: 'Challenge yourself',
        explanation: 'Test yourself with tough questions',
        testID: 'secondary-challenge',
        onPress: () =>
          router.push({
            pathname: '/(app)/session',
            params: {
              subjectId,
              topicId,
              topicName,
              verificationType: 'evaluate',
            },
          } as never),
      });
    }

    if (
      retentionCard &&
      retentionCard.repetitions > 0 &&
      Number(retentionCard.easeFactor) >= 2.3
    ) {
      actions.push({
        label: 'Teach it back',
        explanation: 'Explain this topic in your own words',
        testID: 'secondary-teach-back',
        onPress: () =>
          router.push({
            pathname: '/(app)/session',
            params: {
              subjectId,
              topicId,
              topicName,
              verificationType: 'teach_back',
            },
          } as never),
      });
    }

    return actions;
  }, [
    evaluateEligibility?.eligible,
    retentionCard,
    router,
    subjectId,
    topicId,
    topicName,
    topicProgress,
  ]);

  // [F-009] Show loading while resolving subjectId from deep-link
  if (needsResolve && resolveLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!subjectId || !topicId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          Topic not found
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          This topic could not be opened. Please go back and try again.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/library' as const)}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="topic-detail-missing-params-back"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  if ((progressError || retentionError) && !isCriticalLoading) {
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
          onPress={() => goBackOrReplace(router, '/(app)/library' as const)}
          className="bg-surface rounded-button px-6 py-3 min-h-[48px] items-center justify-center mb-3"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="topic-detail-go-back"
        >
          <Text className="text-body font-semibold text-text-primary">
            Go back
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(app)')}
          className="py-2 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go home"
          testID="topic-detail-go-home"
        >
          <Text className="text-body-sm text-primary">Go Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/library' as const)}
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
            onPress={() => goBackOrReplace(router, '/(app)/library' as const)}
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

          {/* Retention card — hide for not-started topics (no retention to show) */}
          {topicProgress.completionStatus !== 'not_started' && (
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
              {/* FR90: Time-based decay visualization */}
              {retentionCard && retentionCard.lastReviewedAt && (
                <DecayBar
                  lastReviewedAt={retentionCard.lastReviewedAt}
                  intervalDays={retentionCard.intervalDays}
                  nextReviewAt={retentionCard.nextReviewAt}
                />
              )}
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
          )}

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

          {/* FR68: Your Words — topic note */}
          {noteData?.note && (
            <View
              className="bg-surface rounded-card p-4 mb-3"
              testID="your-words-card"
            >
              <Text className="text-body-sm font-semibold text-text-primary mb-2">
                Your Words
              </Text>
              <Text className="text-body-sm text-text-secondary">
                {noteData.note.content}
              </Text>
              <Text className="text-caption text-text-tertiary mt-2">
                Updated {new Date(noteData.note.updatedAt).toLocaleDateString()}
              </Text>
            </View>
          )}

          {/* Parking lot — only show when there are parked questions */}
          {parkedQuestions && parkedQuestions.length > 0 && (
            <View className="bg-surface rounded-card p-4 mb-3">
              <Text className="text-body-sm font-semibold text-text-primary mb-2">
                Parking Lot
              </Text>
              {parkedQuestions.map((item) => (
                <View key={item.id} className="flex-row items-start mt-1">
                  <Text className="text-body text-text-secondary me-2">
                    {'\u2022'}
                  </Text>
                  <Text className="text-body-sm text-text-primary flex-1">
                    {item.question}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Action buttons */}
      {topicProgress && primaryAction ? (
        <View
          className="px-5 pb-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <Pressable
            onPress={primaryAction.onPress}
            className="bg-primary rounded-button py-3.5 items-center"
            testID="primary-action-button"
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              {primaryAction.label}
            </Text>
          </Pressable>
          {secondaryActions.length > 0 ? (
            <View className="mt-3">
              <Pressable
                testID="more-ways-toggle"
                className="flex-row items-center justify-center py-2"
                onPress={() => setShowSecondary((prev) => !prev)}
                accessibilityRole="button"
              >
                <Text className="text-body-sm text-text-secondary mr-1">
                  More ways to practice
                </Text>
                <Ionicons
                  name={showSecondary ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.muted}
                />
              </Pressable>
              {showSecondary ? (
                <View className="gap-2 mt-1">
                  {secondaryActions.map((action) => (
                    <Pressable
                      key={action.testID}
                      testID={action.testID}
                      className="bg-surface-elevated rounded-card px-4 py-3 flex-row items-center"
                      onPress={action.onPress}
                      accessibilityRole="button"
                    >
                      <View className="flex-1">
                        <Text className="text-body font-semibold text-text-primary">
                          {action.label}
                        </Text>
                        <Text className="text-body-sm text-text-secondary">
                          {action.explanation}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.muted}
                      />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
