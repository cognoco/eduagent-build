import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { QuizActivityType, QuizStats } from '@eduagent/schemas';

import { useQuizStats } from '../../../hooks/use-quiz';
import { goBackOrReplace, homeHrefForReturnTo } from '../../../lib/navigation';
import { useReviewSummary } from '../../../hooks/use-progress';
import { useParentProxy } from '../../../hooks/use-parent-proxy';
import { useAssessmentEligibleTopics } from '../../../hooks/use-assessments';

const PRACTICE_WEB_MAX_WIDTH = 560;

const PRACTICE_COLORS = {
  ink: '#16201b',
  muted: '#637067',
  line: '#dbe5dc',
  surface: '#ffffff',
  reviewBg: '#effcf5',
  reviewBorder: '#b9ddc8',
  mint: '#2f9c6a',
  quizBg: '#f2f7ff',
  quizBorder: '#b8ccec',
  quiz: '#386dbe',
  dictationBg: '#fff6df',
  dictationBorder: '#e6c883',
  dictation: '#b46f00',
  reciteBg: '#f4efff',
  reciteBorder: '#c7bdf1',
  recite: '#7058c8',
  history: '#b64a62',
  historyBorder: '#edbdc7',
} as const;

function pointerStyle(): StyleProp<ViewStyle> {
  return Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : null;
}

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

function SectionLabel({ children }: { children: string }): React.ReactElement {
  return (
    <Text
      className="text-caption font-bold uppercase text-text-secondary"
      style={styles.sectionLabel}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? PRACTICE_WEB_MAX_WIDTH : undefined,
  },
  roundButton: {
    borderColor: PRACTICE_COLORS.line,
    borderWidth: 1,
  },
  xpPill: {
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#12352a',
  },
  sectionLabel: {
    letterSpacing: 1.2,
  },
  reviewCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: PRACTICE_COLORS.reviewBorder,
    backgroundColor: PRACTICE_COLORS.reviewBg,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  challengeRow: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PRACTICE_COLORS.reviewBorder,
    backgroundColor: PRACTICE_COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  quizCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: PRACTICE_COLORS.quizBorder,
    backgroundColor: PRACTICE_COLORS.quizBg,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  quizOption: {
    minHeight: 128,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PRACTICE_COLORS.line,
    backgroundColor: 'rgba(255,255,255,0.76)',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  practiceModeCard: {
    minHeight: 142,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  dictationCard: {
    borderColor: PRACTICE_COLORS.dictationBorder,
    backgroundColor: PRACTICE_COLORS.dictationBg,
  },
  reciteCard: {
    borderColor: PRACTICE_COLORS.reciteBorder,
    backgroundColor: PRACTICE_COLORS.reciteBg,
  },
  historyRow: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PRACTICE_COLORS.historyBorder,
    backgroundColor: PRACTICE_COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconCircle: {
    minHeight: 56,
    minWidth: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallIconCircle: {
    height: 40,
    width: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewIconCircle: {
    backgroundColor: '#dff5e9',
  },
  challengeIconCircle: {
    backgroundColor: PRACTICE_COLORS.mint,
  },
  quizIconCircle: {
    backgroundColor: PRACTICE_COLORS.quiz,
  },
  dictationIconCircle: {
    backgroundColor: PRACTICE_COLORS.dictation,
  },
  reciteIconCircle: {
    backgroundColor: PRACTICE_COLORS.recite,
  },
  historyIconCircle: {
    backgroundColor: PRACTICE_COLORS.history,
  },
  chip: {
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PRACTICE_COLORS.line,
    backgroundColor: 'rgba(255,255,255,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipStrong: {
    borderColor: PRACTICE_COLORS.mint,
    backgroundColor: PRACTICE_COLORS.mint,
  },
  chipText: {
    color: PRACTICE_COLORS.ink,
  },
  chipStrongText: {
    color: '#ffffff',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: PRACTICE_COLORS.ink,
  },
});

function CueChip({
  children,
  strong = false,
  testID,
}: {
  children: string;
  strong?: boolean;
  testID?: string;
}): React.ReactElement {
  return (
    <View
      testID={testID}
      style={[styles.chip, strong ? styles.chipStrong : null]}
    >
      <Text
        className="text-caption font-bold"
        style={strong ? styles.chipStrongText : styles.chipText}
      >
        {children}
      </Text>
    </View>
  );
}

export default function PracticeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const insets = useSafeAreaInsets();
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
        paddingBottom: insets.bottom + 112,
        alignItems: 'center',
      }}
      testID="practice-screen"
    >
      <View style={styles.shell}>
        <View className="mb-5 flex-row items-center">
          <Pressable
            onPress={handleBack}
            className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-surface"
            style={[styles.roundButton, pointerStyle()]}
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="practice-back"
          >
            <Ionicons name="arrow-back" size={24} color={PRACTICE_COLORS.ink} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-h1 font-bold text-text-primary">
              {t('practiceHub.title')}
            </Text>
            <Text className="mt-1 text-body-sm text-text-secondary">
              {t('practiceHub.subtitle')}
            </Text>
          </View>
          <View
            className="ml-3 items-center justify-center"
            style={styles.xpPill}
            testID="practice-xp-header"
          >
            <Text className="text-body-sm font-bold text-text-inverse">
              {t('practiceHub.xpLabel', { xp: totalXp })}
            </Text>
          </View>
        </View>

        <View className="gap-5">
          <View className="gap-3">
            <SectionLabel>
              {t('practiceHub.sections.bestNextStep')}
            </SectionLabel>
            <Pressable
              className="active:opacity-80"
              style={[styles.reviewCard, pointerStyle()]}
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
                <View style={[styles.iconCircle, styles.reviewIconCircle]}>
                  <Ionicons
                    name="refresh-outline"
                    size={28}
                    color={PRACTICE_COLORS.mint}
                  />
                </View>
                <View className="ml-4 flex-1">
                  <View className="flex-row items-start">
                    <Text className="flex-1 text-h2 font-bold text-text-primary">
                      {t('practiceHub.review.title')}
                    </Text>
                    {!reviewError &&
                    hasOverdue &&
                    reviewSummary?.nextReviewTopic ? (
                      <CueChip testID="practice-review-badge" strong>
                        {String(reviewDueCount)}
                      </CueChip>
                    ) : null}
                  </View>
                  <Text className="mt-2 text-body text-text-secondary">
                    {reviewSubtitle}
                  </Text>
                  <View className="mt-4 flex-row flex-wrap gap-2">
                    {!reviewError && hasOverdue ? (
                      <CueChip>
                        {t('practiceHub.review.topicsReady', {
                          count: reviewDueCount,
                        })}
                      </CueChip>
                    ) : null}
                    <CueChip>Memory boost</CueChip>
                  </View>
                  <View
                    className="mt-4 items-center justify-center"
                    style={styles.primaryButton}
                  >
                    <Text className="text-body font-bold text-text-inverse">
                      {t('practiceHub.review.startReview')}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
            {!reviewError && !hasOverdue && reviewSummary ? (
              <View
                testID="review-empty-state"
                className="-mt-1 rounded-card bg-surface-elevated px-4 py-4"
              >
                {reviewSummary.nextUpcomingReviewAt ? (
                  <>
                    <Text className="text-body font-semibold text-text-primary">
                      {t('practiceHub.review.allCaughtUp')}
                    </Text>
                    <Text className="text-body-sm text-text-secondary mt-1">
                      {t('practiceHub.review.nextReviewIn', {
                        time: formatTimeUntil(
                          reviewSummary.nextUpcomingReviewAt,
                        ),
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
              className="active:opacity-80"
              style={[styles.challengeRow, pointerStyle()]}
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
                <View
                  className="mr-3"
                  style={[styles.smallIconCircle, styles.challengeIconCircle]}
                >
                  <Ionicons name="checkmark" size={24} color="#ffffff" />
                </View>
                <View className="flex-1">
                  <Text className="text-body font-semibold text-text-primary">
                    {t('practiceHub.assessment.title')}
                  </Text>
                  <Text className="text-body-sm text-text-secondary mt-0.5">
                    {assessmentSubtitle}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={PRACTICE_COLORS.muted}
                />
              </View>
            </Pressable>
          </View>

          <View className="gap-3">
            <SectionLabel>{t('practiceHub.sections.quiz')}</SectionLabel>
            <Pressable
              className="active:opacity-80"
              style={[styles.quizCard, pointerStyle()]}
              onPress={openQuiz}
              accessibilityRole="button"
              accessibilityLabel={t('practiceHub.quiz.title')}
              accessibilityHint="Opens quiz choices"
              testID="practice-quiz"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-h2 font-bold text-text-primary">
                    {t('practiceHub.quiz.title')}
                  </Text>
                  <Text className="mt-2 text-body-sm text-text-secondary">
                    {quizSubtitle}
                  </Text>
                </View>
                {!statsError ? (
                  <CueChip strong testID="practice-quiz-xp">
                    {t('practiceHub.xpLabel', { xp: totalXp })}
                  </CueChip>
                ) : null}
              </View>
              <View className="mt-4 flex-row gap-3">
                <Pressable
                  className="flex-1 active:opacity-80"
                  style={[styles.quizOption, pointerStyle()]}
                  onPress={openQuiz}
                  accessibilityRole="button"
                  accessibilityLabel={t('practiceHub.quiz.capitals')}
                  testID="practice-quiz-capitals"
                >
                  <View className="flex-row items-start justify-between">
                    <View
                      style={[styles.smallIconCircle, styles.quizIconCircle]}
                    >
                      <Text className="text-body font-bold text-text-inverse">
                        ?
                      </Text>
                    </View>
                    {capitalsCue ? <CueChip>{capitalsCue}</CueChip> : null}
                  </View>
                  <View className="mt-3">
                    <Text className="text-body font-bold text-text-primary">
                      {t('practiceHub.quiz.capitals')}
                    </Text>
                    <Text className="mt-1 text-caption text-text-secondary">
                      Countries, capitals, and places.
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  className="flex-1 active:opacity-80"
                  style={[styles.quizOption, pointerStyle()]}
                  onPress={openQuiz}
                  accessibilityRole="button"
                  accessibilityLabel={t('practiceHub.quiz.guessWho')}
                  testID="practice-quiz-guess-who"
                >
                  <View className="flex-row items-start justify-between">
                    <View
                      style={[styles.smallIconCircle, styles.quizIconCircle]}
                    >
                      <Text className="text-body font-bold text-text-inverse">
                        W
                      </Text>
                    </View>
                    {guessWhoCue ? <CueChip>{guessWhoCue}</CueChip> : null}
                  </View>
                  <View className="mt-3">
                    <Text className="text-body font-bold text-text-primary">
                      {t('practiceHub.quiz.guessWho')}
                    </Text>
                    <Text className="mt-1 text-caption text-text-secondary">
                      Guess the person from clues.
                    </Text>
                  </View>
                </Pressable>
              </View>
            </Pressable>
          </View>

          <View className="gap-3">
            <SectionLabel>
              {t('practiceHub.sections.otherPractice')}
            </SectionLabel>
            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 active:opacity-80"
                style={[
                  styles.practiceModeCard,
                  styles.dictationCard,
                  pointerStyle(),
                ]}
                onPress={() => router.push('/(app)/dictation' as never)}
                accessibilityRole="button"
                accessibilityLabel={t('practiceHub.dictation.title')}
                testID="practice-dictation"
              >
                <View className="flex-row items-start justify-between">
                  <View
                    style={[styles.smallIconCircle, styles.dictationIconCircle]}
                  >
                    <Text className="text-body font-bold text-text-inverse">
                      D
                    </Text>
                  </View>
                  <CueChip>{t('practiceHub.xpLabel', { xp: 25 })}</CueChip>
                </View>
                <View className="mt-4">
                  <Text className="text-body font-bold text-text-primary">
                    {t('practiceHub.dictation.title')}
                  </Text>
                  <Text className="mt-1 text-caption text-text-secondary">
                    {t('practiceHub.dictation.subtitle')}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                className="flex-1 active:opacity-80"
                style={[
                  styles.practiceModeCard,
                  styles.reciteCard,
                  pointerStyle(),
                ]}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/session',
                    params: { mode: 'recitation' },
                  } as never)
                }
                accessibilityRole="button"
                accessibilityLabel={t('practiceHub.recitation.title')}
                testID="practice-recitation"
              >
                <View className="flex-row items-start justify-between">
                  <View
                    style={[styles.smallIconCircle, styles.reciteIconCircle]}
                  >
                    <Text className="text-body font-bold text-text-inverse">
                      R
                    </Text>
                  </View>
                  <CueChip>Beta</CueChip>
                </View>
                <View className="mt-4">
                  <Text className="text-body font-bold text-text-primary">
                    {t('practiceHub.recitation.title')}
                  </Text>
                  <Text className="mt-1 text-caption text-text-secondary">
                    {t('practiceHub.recitation.subtitle')}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View className="gap-3">
            <SectionLabel>
              {t('practiceHub.sections.recentProgress')}
            </SectionLabel>
            <Pressable
              className="min-h-[56px] flex-row items-center active:opacity-80"
              style={[styles.historyRow, pointerStyle()]}
              onPress={() => router.push('/(app)/quiz/history' as never)}
              accessibilityRole="button"
              accessibilityLabel={t('practiceHub.history.title')}
              accessibilityHint="Opens quiz history"
              testID="practice-quiz-history"
            >
              <View style={[styles.smallIconCircle, styles.historyIconCircle]}>
                <Text className="text-body font-bold text-text-inverse">H</Text>
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-body font-bold text-text-primary">
                  {t('practiceHub.history.title')}
                </Text>
                <Text className="mt-0.5 text-caption text-text-secondary">
                  {progressCue}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={PRACTICE_COLORS.muted}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
