// uppercase-allowed: section labels use uppercase for visual hierarchy
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
import {
  Redirect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { Translate } from '../../../i18n';

import type { QuizActivityType, QuizStats } from '@eduagent/schemas';

import { useQuizStats } from '../../../hooks/use-quiz';
import { useSubjects } from '../../../hooks/use-subjects';
import {
  goBackOrReplace,
  homeHrefForReturnTo,
  PRACTICE_RETURN_TO,
} from '../../../lib/navigation';
import { useReviewSummary } from '../../../hooks/use-progress';
import { useParentProxy } from '../../../hooks/use-parent-proxy';
import { useAssessmentEligibleTopics } from '../../../hooks/use-assessments';
import { useTheme, useThemeColors } from '../../../lib/theme';
import { getSubjectTint } from '../../../lib/subject-tints';

const PRACTICE_WEB_MAX_WIDTH = 560;

type PracticeColors = ReturnType<typeof usePracticeColors>;

function usePracticeColors() {
  const { colorScheme } = useTheme();
  const theme = useThemeColors();
  const isDark = colorScheme === 'dark';
  return {
    ink: theme.textPrimary,
    muted: theme.textSecondary,
    line: theme.border,
    surface: theme.surface,
    reviewBg: theme.practiceReviewBg,
    reviewBorder: theme.practiceReviewBorder,
    mint: theme.practiceMint,
    quizBg: theme.practiceQuizBg,
    quizBorder: theme.practiceQuizBorder,
    quiz: theme.practiceQuiz,
    dictationBg: theme.practiceDictationBg,
    dictationBorder: theme.practiceDictationBorder,
    dictation: theme.practiceDictation,
    reciteBg: theme.practiceReciteBg,
    reciteBorder: theme.practiceReciteBorder,
    recite: theme.practiceRecite,
    history: theme.practiceHistory,
    historyBorder: theme.practiceHistoryBorder,
    chipBg: theme.practiceChipBg,
    chipText: theme.textPrimary,
    chipStrongText: theme.textInverse,
    primaryButtonBg: isDark ? theme.textPrimary : theme.practiceDarkTeal,
    xpPillBg: theme.practiceDarkTeal,
    quizOptionBg: theme.practiceQuizOptionBg,
  };
}

function pointerStyle(): StyleProp<ViewStyle> {
  return Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : null;
}

function formatTimeUntil(isoDate: string, t: Translate): string {
  const diff = new Date(isoDate).getTime() - Date.now();

  if (diff <= 0) return t('practiceHub.review.timeSoon');

  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return t('practiceHub.review.timeLessThanAnHour');
  if (hours < 24) return t('practiceHub.review.timeHours', { count: hours });

  const days = Math.floor(hours / 24);
  return t('practiceHub.review.timeDays', { count: days });
}

function getActivityCue(
  quizStats: QuizStats[] | undefined,
  activityType: QuizActivityType,
  t: Translate,
): string | null {
  const stats = quizStats?.find((stat) => stat.activityType === activityType);

  if (!stats) return null;

  if (
    stats.bestScore != null &&
    stats.bestTotal != null &&
    stats.bestTotal > 0
  ) {
    return t('practiceHub.quiz.bestFraction', {
      score: stats.bestScore,
      total: stats.bestTotal,
    });
  }

  if ((stats.roundsPlayed ?? 0) > 0) {
    return t('practiceHub.quiz.playedFraction', {
      count: stats.roundsPlayed,
    });
  }

  return null;
}

function getQuizStatCue(
  stats: QuizStats | undefined,
  t: Translate,
): string | null {
  if (!stats) return null;

  if (
    stats.bestScore != null &&
    stats.bestTotal != null &&
    stats.bestTotal > 0
  ) {
    return t('practiceHub.quiz.bestFraction', {
      score: stats.bestScore,
      total: stats.bestTotal,
    });
  }

  if ((stats.roundsPlayed ?? 0) > 0) {
    return t('practiceHub.quiz.playedFraction', {
      count: stats.roundsPlayed,
    });
  }

  return null;
}

function getLanguageDisplayName(
  code: string | null | undefined,
): string | null {
  if (!code) return null;

  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'language' }).of(
        code.toLowerCase(),
      ) ?? null
    );
  } catch {
    return null;
  }
}

function SectionLabel({ children }: { children: string }): React.ReactElement {
  return (
    <Text
      className="text-caption font-bold text-text-secondary"
      style={styles.sectionLabel}
    >
      {children}
    </Text>
  );
}

function CueChip({
  children,
  strong = false,
  testID,
  colors,
}: {
  children: string;
  strong?: boolean;
  testID?: string;
  colors: PracticeColors;
}): React.ReactElement {
  return (
    <View
      testID={testID}
      style={[
        styles.chip,
        {
          backgroundColor: strong ? colors.mint : colors.chipBg,
          borderColor: strong ? colors.mint : colors.line,
        },
      ]}
    >
      <Text
        className="text-caption font-bold"
        style={{ color: strong ? colors.chipStrongText : colors.chipText }}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? PRACTICE_WEB_MAX_WIDTH : undefined,
  },
  roundButton: {
    borderWidth: 1,
  },
  xpPill: {
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  sectionLabel: {
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  reviewCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  challengeRow: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  quizCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  quizOption: {
    minHeight: 128,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  practiceModeCard: {
    minHeight: 142,
    width: 168,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  practiceSliderContent: {
    gap: 12,
    paddingRight: 20,
  },
  historyRow: {
    borderRadius: 20,
    borderWidth: 1,
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
  chip: {
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 18,
  },
});

export default function PracticeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const { isParentProxy } = useParentProxy();
  const { colorScheme } = useTheme();
  const colors = usePracticeColors();
  const { data: reviewSummary, isError: reviewError } = useReviewSummary();
  const { data: quizStats, isError: statsError } = useQuizStats();
  const { data: allSubjects } = useSubjects();
  const { data: assessmentTopics, isError: assessmentTopicsError } =
    useAssessmentEligibleTopics();

  const reviewDueCount = reviewSummary?.totalOverdue ?? 0;
  const hasOverdue = reviewDueCount > 0;
  const reviewSubtitle = reviewError
    ? t('practiceHub.review.couldNotLoad')
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
      ? t('practiceHub.quiz.bestCue', {
          pct: Math.round(
            (bestActivity.bestScore / bestActivity.bestTotal) * 100,
          ),
        })
      : null;
  const quizSubtitle = statsError
    ? t('practiceHub.quiz.couldNotLoad')
    : bestPct
      ? [
          bestPct,
          t('practiceHub.quiz.playedCue', { count: totalRoundsPlayed }),
          t('practiceHub.xpLabel', { xp: totalXp }),
        ]
          .filter(Boolean)
          .join(' · ')
      : totalRoundsPlayed > 0
        ? [
            t('practiceHub.quiz.playedCue', { count: totalRoundsPlayed }),
            t('practiceHub.xpLabel', { xp: totalXp }),
          ].join(' · ')
        : t('practiceHub.quiz.defaultSubtitle', { xp: totalXp });
  const assessmentCount = assessmentTopics?.length ?? 0;
  const nextStudySubject = allSubjects?.find(
    (subject) => subject.status === 'active',
  );
  const assessmentSubtitle = assessmentTopicsError
    ? t('practiceHub.assessment.couldNotLoad')
    : assessmentCount > 0
      ? t('practiceHub.assessment.topicsReady', { count: assessmentCount })
      : nextStudySubject
        ? t('practiceHub.assessment.studySubjectFirst', {
            subject: nextStudySubject.name,
          })
        : t('practiceHub.assessment.afterFinishTopic');
  const capitalsCue = getActivityCue(quizStats, 'capitals', t);
  const guessWhoCue = getActivityCue(quizStats, 'guess_who', t);
  const languageSubjects =
    allSubjects?.filter(
      (subject) =>
        subject.pedagogyMode === 'four_strands' &&
        subject.languageCode &&
        subject.status === 'active',
    ) ?? [];
  const progressCue =
    totalRoundsPlayed > 0
      ? t('practiceHub.history.roundsPlayed', { count: totalRoundsPlayed })
      : t('practiceHub.history.noRoundsYet');
  const practiceReturnParams = { returnTo: PRACTICE_RETURN_TO } as const;

  const handleBack = () => {
    goBackOrReplace(router, homeHrefForReturnTo(returnTo));
  };

  const openQuiz = () =>
    router.push({
      pathname: '/(app)/quiz',
      params: practiceReturnParams,
    } as Href);

  const openQuizActivity = (activityType: 'capitals' | 'guess_who') => {
    router.push({
      pathname: '/(app)/quiz/launch',
      params: { activityType, ...practiceReturnParams },
    } as Href);
  };

  const openVocabularyQuiz = (
    subjectId: string,
    languageName: string,
  ): void => {
    router.push({
      pathname: '/(app)/quiz/launch',
      params: {
        activityType: 'vocabulary',
        subjectId,
        languageName,
        ...practiceReturnParams,
      },
    } as Href);
  };

  const openAssessment = () => {
    if (assessmentCount > 0) {
      router.push('/(app)/practice/assessment-picker' as Href);
      return;
    }

    if (nextStudySubject) {
      router.push({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: nextStudySubject.id },
      } as Href);
      return;
    }

    router.push('/(app)/library' as Href);
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
            style={[
              styles.roundButton,
              { borderColor: colors.line },
              pointerStyle(),
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="practice-back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
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
            style={[styles.xpPill, { backgroundColor: colors.xpPillBg }]}
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
              style={[
                styles.reviewCard,
                {
                  borderColor: colors.reviewBorder,
                  backgroundColor: colors.reviewBg,
                },
                pointerStyle(),
              ]}
              onPress={() =>
                router.push({
                  pathname: '/(app)/topic/relearn',
                  params: practiceReturnParams,
                } as Href)
              }
              accessibilityRole="button"
              accessibilityLabel={t('practiceHub.review.title')}
              accessibilityHint={t('practiceHub.review.hintOpenReview')}
              testID="practice-review"
            >
              <View className="flex-row items-start">
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: colors.reviewBg },
                  ]}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={28}
                    color={colors.mint}
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
                      <CueChip
                        testID="practice-review-badge"
                        strong
                        colors={colors}
                      >
                        {String(reviewDueCount)}
                      </CueChip>
                    ) : null}
                  </View>
                  <Text className="mt-2 text-body text-text-secondary">
                    {reviewSubtitle}
                  </Text>
                  <View className="mt-4 flex-row flex-wrap gap-2">
                    {!reviewError && hasOverdue ? (
                      <CueChip colors={colors}>
                        {t('practiceHub.review.topicsReady', {
                          count: reviewDueCount,
                        })}
                      </CueChip>
                    ) : null}
                    <CueChip colors={colors}>
                      {t('practiceHub.review.memoryBoost')}
                    </CueChip>
                  </View>
                  <View
                    className="mt-4 items-center justify-center"
                    style={[
                      styles.primaryButton,
                      { backgroundColor: colors.primaryButtonBg },
                    ]}
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
                          t,
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
                  onPress={() => router.push('/(app)/library' as Href)}
                >
                  <Text className="text-body-sm text-primary font-semibold">
                    {t('practiceHub.review.browseTopics')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              className="active:opacity-80"
              style={[
                styles.challengeRow,
                {
                  borderColor: colors.line,
                  backgroundColor: colors.surface,
                },
                pointerStyle(),
              ]}
              onPress={openAssessment}
              accessibilityRole="button"
              accessibilityLabel={t('practiceHub.assessment.title')}
              accessibilityHint={
                assessmentCount > 0
                  ? t('practiceHub.assessment.hintOpenPicker')
                  : t('practiceHub.assessment.hintOpenLibrary')
              }
              testID="practice-assessment"
            >
              <View className="flex-row items-center">
                <View
                  className="mr-3"
                  style={[
                    styles.smallIconCircle,
                    { backgroundColor: colors.mint },
                  ]}
                >
                  <Ionicons
                    name="checkmark"
                    size={24}
                    color={colors.chipStrongText}
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
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.muted}
                />
              </View>
            </Pressable>
          </View>

          <View className="gap-3">
            <SectionLabel>{t('practiceHub.sections.quiz')}</SectionLabel>
            <Pressable
              className="active:opacity-80"
              style={[
                styles.quizCard,
                {
                  borderColor: colors.quizBorder,
                  backgroundColor: colors.quizBg,
                },
                pointerStyle(),
              ]}
              onPress={openQuiz}
              accessibilityRole="button"
              accessibilityLabel={t('practiceHub.quiz.title')}
              accessibilityHint={t('practiceHub.quiz.hintOpenQuiz')}
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
                  <CueChip strong testID="practice-quiz-xp" colors={colors}>
                    {t('practiceHub.xpLabel', { xp: totalXp })}
                  </CueChip>
                ) : null}
              </View>
              <View className="mt-4 flex-row gap-3">
                <Pressable
                  className="flex-1 active:opacity-80"
                  style={[
                    styles.quizOption,
                    {
                      borderColor: colors.quizBorder,
                      backgroundColor: colors.quizOptionBg,
                    },
                    pointerStyle(),
                  ]}
                  onPress={(event) => {
                    event?.stopPropagation?.();
                    openQuizActivity('capitals');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('practiceHub.quiz.capitals')}
                  testID="practice-quiz-capitals"
                >
                  <View className="flex-row items-start justify-between">
                    <View
                      style={[
                        styles.smallIconCircle,
                        { backgroundColor: colors.quiz },
                      ]}
                    >
                      <Text className="text-body font-bold text-text-inverse">
                        ?
                      </Text>
                    </View>
                    {capitalsCue ? (
                      <CueChip colors={colors}>{capitalsCue}</CueChip>
                    ) : null}
                  </View>
                  <View className="mt-3">
                    <Text className="text-body font-bold text-text-primary">
                      {t('practiceHub.quiz.capitals')}
                    </Text>
                    <Text className="mt-1 text-caption text-text-secondary">
                      {t('practiceHub.quiz.capitalsDescription')}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  className="flex-1 active:opacity-80"
                  style={[
                    styles.quizOption,
                    {
                      borderColor: colors.quizBorder,
                      backgroundColor: colors.quizOptionBg,
                    },
                    pointerStyle(),
                  ]}
                  onPress={(event) => {
                    event?.stopPropagation?.();
                    openQuizActivity('guess_who');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('practiceHub.quiz.guessWho')}
                  testID="practice-quiz-guess-who"
                >
                  <View className="flex-row items-start justify-between">
                    <View
                      style={[
                        styles.smallIconCircle,
                        { backgroundColor: colors.quiz },
                      ]}
                    >
                      <Text className="text-body font-bold text-text-inverse">
                        W
                      </Text>
                    </View>
                    {guessWhoCue ? (
                      <CueChip colors={colors}>{guessWhoCue}</CueChip>
                    ) : null}
                  </View>
                  <View className="mt-3">
                    <Text className="text-body font-bold text-text-primary">
                      {t('practiceHub.quiz.guessWho')}
                    </Text>
                    <Text className="mt-1 text-caption text-text-secondary">
                      {t('practiceHub.quiz.guessWhoDescription')}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.practiceSliderContent}
              testID="practice-other-practice-slider"
            >
              {languageSubjects.map((subject) => {
                const displayLanguage =
                  getLanguageDisplayName(subject.languageCode) ??
                  subject.name ??
                  'Language';
                const vocabCue = getQuizStatCue(
                  quizStats?.find(
                    (stat) =>
                      stat.activityType === 'vocabulary' &&
                      stat.languageCode === subject.languageCode,
                  ),
                  t,
                );
                const tint = getSubjectTint(subject.id, colorScheme);
                return (
                  <Pressable
                    key={subject.id}
                    className="active:opacity-80"
                    style={[
                      styles.practiceModeCard,
                      {
                        borderColor: tint.solid + '33',
                        backgroundColor: tint.soft,
                      },
                      pointerStyle(),
                    ]}
                    onPress={() =>
                      openVocabularyQuiz(subject.id, displayLanguage)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t('quiz.index.vocabBasicsTitle', {
                      language: displayLanguage,
                    })}
                    testID={`practice-vocabulary-${subject.id}`}
                  >
                    <View className="flex-row items-start justify-between">
                      <View
                        style={[
                          styles.smallIconCircle,
                          { backgroundColor: tint.solid },
                        ]}
                      >
                        <Text className="text-body font-bold text-text-inverse">
                          V
                        </Text>
                      </View>
                      {vocabCue ? (
                        <CueChip colors={colors}>{vocabCue}</CueChip>
                      ) : null}
                    </View>
                    <View className="mt-4">
                      <Text className="text-body font-bold text-text-primary">
                        {t('quiz.index.vocabBasicsTitle', {
                          language: displayLanguage,
                        })}
                      </Text>
                      <Text className="mt-1 text-caption text-text-secondary">
                        {t('quiz.index.vocabPlayedSubtitleDefault')}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable
                className="active:opacity-80"
                style={[
                  styles.practiceModeCard,
                  {
                    borderColor: colors.dictationBorder,
                    backgroundColor: colors.dictationBg,
                  },
                  pointerStyle(),
                ]}
                onPress={() => router.push('/(app)/dictation' as Href)}
                accessibilityRole="button"
                accessibilityLabel={t('practiceHub.dictation.title')}
                testID="practice-dictation"
              >
                <View className="flex-row items-start justify-between">
                  <View
                    style={[
                      styles.smallIconCircle,
                      { backgroundColor: colors.dictation },
                    ]}
                  >
                    <Text className="text-body font-bold text-text-inverse">
                      D
                    </Text>
                  </View>
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
                className="active:opacity-80"
                style={[
                  styles.practiceModeCard,
                  {
                    borderColor: colors.reciteBorder,
                    backgroundColor: colors.reciteBg,
                  },
                  pointerStyle(),
                ]}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/session',
                    params: { mode: 'recitation' },
                  } as Href)
                }
                accessibilityRole="button"
                accessibilityLabel={t('practiceHub.recitation.title')}
                testID="practice-recitation"
              >
                <View className="flex-row items-start justify-between">
                  <View
                    style={[
                      styles.smallIconCircle,
                      { backgroundColor: colors.recite },
                    ]}
                  >
                    <Text className="text-body font-bold text-text-inverse">
                      R
                    </Text>
                  </View>
                  <CueChip colors={colors}>
                    {t('practiceHub.recitation.betaLabel')}
                  </CueChip>
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
            </ScrollView>
          </View>

          <View className="gap-3">
            <SectionLabel>
              {t('practiceHub.sections.recentProgress')}
            </SectionLabel>
            <Pressable
              className="min-h-[56px] flex-row items-center active:opacity-80"
              style={[
                styles.historyRow,
                {
                  borderColor: colors.historyBorder,
                  backgroundColor: colors.surface,
                },
                pointerStyle(),
              ]}
              onPress={() =>
                router.push({
                  pathname: '/(app)/quiz/history',
                  params: practiceReturnParams,
                } as Href)
              }
              accessibilityRole="button"
              accessibilityLabel={t('practiceHub.history.title')}
              accessibilityHint={t('practiceHub.history.hintOpenHistory')}
              testID="practice-quiz-history"
            >
              <View
                style={[
                  styles.smallIconCircle,
                  { backgroundColor: colors.history },
                ]}
              >
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
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
