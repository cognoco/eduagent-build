import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IntentCard } from '../../../components/home/IntentCard';
import { useQuizStats } from '../../../hooks/use-quiz';
import { goBackOrReplace, homeHrefForReturnTo } from '../../../lib/navigation';
import { useReviewSummary } from '../../../hooks/use-progress';
import { useThemeColors } from '../../../lib/theme';
import { useParentProxy } from '../../../hooks/use-parent-proxy';
import { useAssessmentEligibleTopics } from '../../../hooks/use-assessments';

function formatTimeUntil(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();

  if (diff <= 0) return 'soon';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'less than an hour';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export default function PracticeScreen(): React.ReactElement {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isParentProxy } = useParentProxy();
  const { data: reviewSummary, isError: reviewError } = useReviewSummary();
  const { data: quizStats, isError: statsError } = useQuizStats();
  const { data: assessmentTopics, isError: assessmentTopicsError } =
    useAssessmentEligibleTopics();

  const reviewDueCount = reviewSummary?.totalOverdue ?? 0;
  const hasOverdue = reviewDueCount > 0;
  const reviewSubtitle = reviewError
    ? 'Could not load review status'
    : hasOverdue
    ? `${reviewDueCount} ${
        reviewDueCount === 1 ? 'topic' : 'topics'
      } ready for review`
    : 'Nothing to review right now';
  // [F-034] Aggregate stats across ALL activity types so Guess Who / Vocabulary
  // players also see their stats on the Practice hub card.
  const bestActivity = quizStats
    ?.filter(
      (s) => s.bestScore != null && s.bestTotal != null && s.bestTotal > 0
    )
    .sort(
      (a, b) =>
        (b.bestScore ?? 0) / (b.bestTotal ?? 1) -
        (a.bestScore ?? 0) / (a.bestTotal ?? 1)
    )[0];
  const totalRoundsPlayed =
    quizStats?.reduce((sum, s) => sum + (s.roundsPlayed ?? 0), 0) ?? 0;
  // [F-035] Surface totalXp — the main gamification metric is earned but never shown.
  const totalXp = quizStats?.reduce((sum, s) => sum + (s.totalXp ?? 0), 0) ?? 0;
  // [F-Q-11] Show best as a percentage so cross-activity comparisons are
  // meaningful (4/8 = 50% vs 3/4 = 75%) instead of misleading raw fractions.
  const bestPct =
    bestActivity &&
    bestActivity.bestScore != null &&
    bestActivity.bestTotal != null &&
    bestActivity.bestTotal > 0
      ? `Best: ${Math.round(
          (bestActivity.bestScore / bestActivity.bestTotal) * 100
        )}%`
      : null;
  const quizSubtitle = statsError
    ? 'Could not load quiz stats'
    : bestPct
    ? [
        bestPct,
        `Played: ${totalRoundsPlayed}`,
        totalXp > 0 ? `${totalXp} XP` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : totalRoundsPlayed > 0
    ? [`Played: ${totalRoundsPlayed}`, totalXp > 0 ? `${totalXp} XP` : null]
        .filter(Boolean)
        .join(' · ')
    : 'Test yourself with multiple choice questions';
  const assessmentCount = assessmentTopics?.length ?? 0;
  const assessmentSubtitle = assessmentTopicsError
    ? 'Could not load assessment topics'
    : assessmentCount > 0
    ? `${assessmentCount} ${
        assessmentCount === 1 ? 'topic' : 'topics'
      } ready to test`
    : 'Study a topic first';

  const handleBack = () => {
    goBackOrReplace(router, homeHrefForReturnTo(returnTo));
  };

  if (isParentProxy) return <Redirect href="/(app)/home" />;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="practice-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={handleBack}
          className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="practice-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            Practice for a test
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            Refresh what is fading, then check yourself.
          </Text>
        </View>
      </View>

      <View className="gap-4">
        <IntentCard
          title="Refresh topics"
          subtitle={reviewSubtitle}
          icon="refresh-outline"
          // Keep the badge aligned with the review-summary API, but let the
          // relearn screen own topic selection and empty states.
          badge={
            !reviewError && hasOverdue && reviewSummary?.nextReviewTopic
              ? reviewDueCount
              : undefined
          }
          onPress={() =>
            router.push({
              pathname: '/(app)/topic/relearn',
              params: {
                ...(returnTo ? { returnTo } : {}),
              },
            } as never)
          }
          testID="practice-review"
        />
        {!reviewError && !hasOverdue && reviewSummary ? (
          <View
            testID="review-empty-state"
            className="bg-surface-elevated rounded-card px-4 py-4 -mt-1"
          >
            {reviewSummary.nextUpcomingReviewAt ? (
              <>
                <Text className="text-body font-semibold text-text-primary">
                  All caught up
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  Your next review is in{' '}
                  {formatTimeUntil(reviewSummary.nextUpcomingReviewAt)}
                </Text>
              </>
            ) : (
              <Text className="text-body text-text-secondary">
                Complete some topics first to unlock review
              </Text>
            )}
            <Pressable
              testID="review-empty-browse"
              className="mt-3"
              onPress={() => router.push('/(app)/library' as never)}
            >
              <Text className="text-body-sm text-primary font-semibold">
                Browse your topics
              </Text>
            </Pressable>
          </View>
        ) : null}
        <IntentCard
          title="Recite from memory (Beta)"
          subtitle="Recite a poem or text from memory"
          icon="mic-outline"
          onPress={() =>
            router.push({
              pathname: '/(app)/session',
              params: { mode: 'recitation' },
            } as never)
          }
          testID="practice-recitation"
        />
        <IntentCard
          title="Dictation"
          subtitle="Practice writing what you hear"
          icon="create-outline"
          onPress={() => router.push('/(app)/dictation' as never)}
          testID="practice-dictation"
        />
        <IntentCard
          title="Quiz yourself"
          subtitle={quizSubtitle}
          icon="help-circle-outline"
          onPress={() => router.push('/(app)/quiz' as never)}
          testID="practice-quiz"
        />
        <IntentCard
          title="Prove I know this"
          subtitle={assessmentSubtitle}
          icon="checkmark-circle-outline"
          onPress={() =>
            router.push('/(app)/practice/assessment-picker' as never)
          }
          testID="practice-assessment"
        />
        <IntentCard
          title="Quiz history"
          subtitle="View past quiz rounds"
          icon="time-outline"
          onPress={() => router.push('/(app)/quiz/history' as never)}
          testID="practice-quiz-history"
        />
      </View>
    </ScrollView>
  );
}
