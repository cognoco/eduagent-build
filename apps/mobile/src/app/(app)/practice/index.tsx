import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { QuizActivityType, QuizStats } from '@eduagent/schemas';

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

function getActivityCue(
  quizStats: QuizStats[] | undefined,
  activityType: QuizActivityType,
): string | null {
  const stats = quizStats?.find((stat) => stat.activityType === activityType);

  if (!stats) return null;

  if (
    stats.bestScore != null &&
    stats.bestTotal != null &&
    stats.bestTotal > 0
  ) {
    return `Best ${stats.bestScore}/${stats.bestTotal}`;
  }

  if ((stats.roundsPlayed ?? 0) > 0) {
    return `Played ${stats.roundsPlayed}`;
  }

  return null;
}

export default function PracticeScreen(): React.ReactElement {
  const { t } = useTranslation();
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
      ? t('practiceHub.review.topicsReady', { count: reviewDueCount })
      : reviewSummary?.nextUpcomingReviewAt
        ? t('practiceHub.review.allCaughtUp')
        : t('practiceHub.review.completeATopic');
  // [F-034] Aggregate stats across ALL activity types so Guess Who / Vocabulary
  // players also see their stats on the Practice hub card.
  const bestActivity = quizStats
    ?.filter(
      (s) => s.bestScore != null && s.bestTotal != null && s.bestTotal > 0,
    )
    .sort(
      (a, b) =>
        (b.bestScore ?? 0) / (b.bestTotal ?? 1) -
        (a.bestScore ?? 0) / (a.bestTotal ?? 1),
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
          (bestActivity.bestScore / bestActivity.bestTotal) * 100,
        )}%`
      : null;
  const quizSubtitle = statsError
    ? 'Could not load quiz stats'
    : bestPct
      ? [
          bestPct,
          `Played: ${totalRoundsPlayed}`,
          t('practiceHub.xpLabel', { xp: totalXp }),
        ]
          .filter(Boolean)
          .join(' · ')
      : totalRoundsPlayed > 0
        ? [
            `Played: ${totalRoundsPlayed}`,
            t('practiceHub.xpLabel', { xp: totalXp }),
          ].join(' · ')
        : t('practiceHub.quiz.defaultSubtitle', { xp: totalXp });
  const assessmentCount = assessmentTopics?.length ?? 0;
  const assessmentSubtitle = assessmentTopicsError
    ? 'Could not load assessment topics'
    : assessmentCount > 0
      ? t('practiceHub.assessment.topicsReady', { count: assessmentCount })
      : t('practiceHub.assessment.afterFinishTopic');
  const capitalsCue = getActivityCue(quizStats, 'capitals');
  const guessWhoCue = getActivityCue(quizStats, 'guess_who');
  const progressCue =
    totalRoundsPlayed > 0
      ? t('practiceHub.history.roundsPlayed', { count: totalRoundsPlayed })
      : t('practiceHub.history.noRoundsYet');

  const handleBack = () => {
    goBackOrReplace(router, homeHrefForReturnTo(returnTo));
  };

  const openQuiz = () => router.push('/(app)/quiz' as never);

  const openAssessment = () => {
    router.push(
      assessmentCount > 0
        ? ('/(app)/practice/assessment-picker' as never)
        : ('/(app)/library' as never),
    );
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
          accessibilityLabel={t('common.goBack')}
          testID="practice-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {t('practiceHub.title')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('practiceHub.subtitle')}
          </Text>
        </View>
        <View className="ml-3 rounded-full bg-primary-soft px-3 py-1.5">
          <Text className="text-caption font-semibold text-primary">
            {t('practiceHub.xpLabel', { xp: totalXp })}
          </Text>
        </View>
      </View>

      <View className="gap-6">
        <View className="gap-3">
          <Text className="text-caption font-semibold text-text-secondary">
            {t('practiceHub.sections.bestNextStep')}
          </Text>
          <Pressable
            className="rounded-card bg-surface-elevated px-5 py-5 active:opacity-80"
            onPress={() =>
              router.push({
                pathname: '/(app)/topic/relearn',
                params: {
                  ...(returnTo ? { returnTo } : {}),
                },
              } as never)
            }
            accessibilityRole="button"
            accessibilityLabel={t('practiceHub.review.title')}
            accessibilityHint="Opens review topics"
            testID="practice-review"
          >
            <View className="flex-row items-start">
              <View className="mr-4 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-primary-soft">
                <Ionicons
                  name="refresh-outline"
                  size={24}
                  color={colors.primary}
                />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="text-h2 font-bold text-text-primary flex-1">
                    {t('practiceHub.review.title')}
                  </Text>
                  {!reviewError &&
                  hasOverdue &&
                  reviewSummary?.nextReviewTopic ? (
                    <View
                      className="ml-3 rounded-full bg-primary-soft px-2.5 py-1"
                      testID="practice-review-badge"
                    >
                      <Text className="text-caption font-semibold text-primary">
                        {reviewDueCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-body text-text-secondary mt-2">
                  {reviewSubtitle}
                </Text>
                <View className="mt-4 self-start rounded-full bg-primary px-4 py-2">
                  <Text className="text-body-sm font-semibold text-text-inverse">
                    {t('practiceHub.review.startReview')}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
          {!reviewError && !hasOverdue && reviewSummary ? (
            <View
              testID="review-empty-state"
              className="bg-surface-elevated rounded-card px-4 py-4 -mt-1"
            >
              {reviewSummary.nextUpcomingReviewAt ? (
                <>
                  <Text className="text-body font-semibold text-text-primary">
                    {t('practiceHub.review.allCaughtUp')}
                  </Text>
                  <Text className="text-body-sm text-text-secondary mt-1">
                    {t('practiceHub.review.nextReviewIn', {
                      time: formatTimeUntil(reviewSummary.nextUpcomingReviewAt),
                    })}
                  </Text>
                </>
              ) : (
                <Text className="text-body text-text-secondary">
                  {t('practiceHub.review.completeATopic')}
                </Text>
              )}
              <Pressable
                testID="review-empty-browse"
                className="mt-3"
                onPress={() => router.push('/(app)/library' as never)}
              >
                <Text className="text-body-sm text-primary font-semibold">
                  {t('practiceHub.review.browseTopics')}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable
            className="rounded-card bg-surface px-4 py-3 active:opacity-80"
            onPress={openAssessment}
            accessibilityRole="button"
            accessibilityLabel={t('practiceHub.assessment.title')}
            accessibilityHint={
              assessmentCount > 0
                ? 'Opens the assessment picker'
                : 'Opens the library'
            }
            testID="practice-assessment"
          >
            <View className="flex-row items-center">
              <View className="mr-3">
                <Ionicons
                  name="checkmark-circle-outline"
                  size={22}
                  color={colors.primary}
                />
              </View>
              <View className="flex-1">
                <Text className="text-body font-semibold text-text-primary">
                  {t('practiceHub.assessment.title')}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-0.5">
                  {assessmentSubtitle}
                </Text>
              </View>
            </View>
          </Pressable>
        </View>

        <View className="gap-3">
          <Text className="text-caption font-semibold text-text-secondary">
            {t('practiceHub.sections.quiz')}
          </Text>
          <Pressable
            className="rounded-card bg-surface-elevated px-5 py-5 active:opacity-80"
            onPress={openQuiz}
            accessibilityRole="button"
            accessibilityLabel={t('practiceHub.quiz.title')}
            accessibilityHint="Opens quiz choices"
            testID="practice-quiz"
          >
            <View className="flex-row items-start">
              <View className="mr-4 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-primary-soft">
                <Ionicons
                  name="help-circle-outline"
                  size={24}
                  color={colors.secondary}
                />
              </View>
              <View className="flex-1">
                <Text className="text-h2 font-bold text-text-primary">
                  {t('practiceHub.quiz.title')}
                </Text>
                <Text className="text-body text-text-secondary mt-2">
                  {quizSubtitle}
                </Text>
                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    className="flex-1 rounded-card bg-surface px-3 py-3 active:opacity-80"
                    onPress={openQuiz}
                    accessibilityRole="button"
                    accessibilityLabel={t('practiceHub.quiz.capitals')}
                    testID="practice-quiz-capitals"
                  >
                    <Text className="text-body-sm font-semibold text-text-primary">
                      {t('practiceHub.quiz.capitals')}
                    </Text>
                    {capitalsCue ? (
                      <Text className="text-caption text-text-secondary mt-1">
                        {capitalsCue}
                      </Text>
                    ) : null}
                  </Pressable>
                  <Pressable
                    className="flex-1 rounded-card bg-surface px-3 py-3 active:opacity-80"
                    onPress={openQuiz}
                    accessibilityRole="button"
                    accessibilityLabel={t('practiceHub.quiz.guessWho')}
                    testID="practice-quiz-guess-who"
                  >
                    <Text className="text-body-sm font-semibold text-text-primary">
                      {t('practiceHub.quiz.guessWho')}
                    </Text>
                    {guessWhoCue ? (
                      <Text className="text-caption text-text-secondary mt-1">
                        {guessWhoCue}
                      </Text>
                    ) : null}
                  </Pressable>
                </View>
              </View>
            </View>
          </Pressable>
        </View>

        <View className="gap-3">
          <Text className="text-caption font-semibold text-text-secondary">
            {t('practiceHub.sections.otherPractice')}
          </Text>
          <IntentCard
            title={t('practiceHub.recitation.title')}
            subtitle={t('practiceHub.recitation.subtitle')}
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
            title={t('practiceHub.dictation.title')}
            subtitle={t('practiceHub.dictation.subtitle')}
            icon="create-outline"
            onPress={() => router.push('/(app)/dictation' as never)}
            testID="practice-dictation"
          />
        </View>

        <View className="gap-3">
          <Text className="text-caption font-semibold text-text-secondary">
            {t('practiceHub.sections.recentProgress')}
          </Text>
          <Pressable
            className="min-h-[52px] flex-row items-center py-2 active:opacity-80"
            onPress={() => router.push('/(app)/quiz/history' as never)}
            accessibilityRole="button"
            accessibilityLabel={t('practiceHub.history.title')}
            accessibilityHint="Opens quiz history"
            testID="practice-quiz-history"
          >
            <Text className="text-body font-semibold text-text-primary flex-1">
              {t('practiceHub.history.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary">
              {progressCue}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
