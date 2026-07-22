import { useCallback } from 'react';
import {
  BackHandler,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from '../../../components/common/ErrorFallback';
import { TimeoutLoader } from '../../../components/common/TimeoutLoader';
import { useRecentRounds } from '../../../hooks/use-quiz';
import { extractLanguageFromTheme } from '../../../lib/extract-vocabulary-language';
import {
  goBackOrReplace,
  PRACTICE_HREF,
  PRACTICE_RETURN_TO,
} from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useScreenTopInset } from '../../../lib/use-screen-top-inset';
import { useRelativeDate } from '../../../hooks/use-time-format';
import { toLocalDateString } from '../../../lib/local-date';

export default function QuizHistoryScreen() {
  const { t } = useTranslation();
  const relativeDate = useRelativeDate();
  const router = useRouter();
  const { returnTo, practiceReturnTo } = useLocalSearchParams<{
    returnTo?: string | string[];
    practiceReturnTo?: string | string[];
  }>();
  const returnToken = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const practiceReturnToken = Array.isArray(practiceReturnTo)
    ? practiceReturnTo[0]
    : practiceReturnTo;
  const colors = useThemeColors();
  // [BUG-933] On web, useSafeAreaInsets returns top:0 — useScreenTopInset
  // applies a 24px minimum so the header doesn't sit flush against the
  // browser URL bar. Native devices pass through unchanged.
  const insets = useScreenTopInset();
  const { data: rounds, isLoading, isError, refetch } = useRecentRounds();
  const isPracticeReturn = returnToken === PRACTICE_RETURN_TO;
  const backHref = isPracticeReturn ? PRACTICE_HREF : '/(app)/quiz';
  const returnParams = isPracticeReturn
    ? {
        returnTo: returnToken,
        ...(practiceReturnToken
          ? { practiceReturnTo: practiceReturnToken }
          : {}),
      }
    : {};

  const handleBack = useCallback(() => {
    if (isPracticeReturn) {
      if (practiceReturnToken) {
        router.navigate({
          pathname: PRACTICE_HREF,
          params: { returnTo: practiceReturnToken },
        } as Href);
        return;
      }
      router.navigate(PRACTICE_HREF as Href);
      return;
    }
    goBackOrReplace(router, backHref as Href);
  }, [backHref, isPracticeReturn, practiceReturnToken, router]);

  // History is a Quiz-stack child reached from the sibling Practice tab.
  // Without a focused handler, Android hardware Back follows the synthesized
  // native stack to Home instead of honoring the same route-aware contract as
  // the visible Back control.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web' || !isPracticeReturn) return undefined;

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          handleBack();
          return true;
        },
      );
      return () => subscription.remove();
    }, [handleBack, isPracticeReturn]),
  );

  const keyExtractor = useCallback(
    (section: { date: string }) => section.date,
    [],
  );

  const renderItem = useCallback(
    ({
      item: section,
    }: {
      item: { date: string; items: NonNullable<typeof rounds> };
    }) => (
      <View className="mb-4">
        <Text className="text-on-surface-muted px-4 py-2 text-sm font-medium">
          {relativeDate(`${section.date}T00:00:00`)}
        </Text>
        {section.items.map((round) => {
          const activityLabelMap: Record<string, string> = {
            capitals: t('quiz.history.activityLabels.capitals'),
            guess_who: t('quiz.history.activityLabels.guessWho'),
            vocabulary: t('quiz.history.activityLabels.vocabulary'),
          };
          const baseLabel =
            activityLabelMap[round.activityType] ??
            round.activityType.replace(/_/g, ' ');
          // [BUG-930] Vocabulary rounds are otherwise indistinguishable
          // by language at a glance — quiz_rounds has no languageCode
          // column yet, so we extract the language word from the theme
          // when one is detectable. Falls back to plain "Vocabulary"
          // when no known language prefix is found, so we never invent
          // a language attribution for non-language quizzes.
          const detectedLanguage =
            round.activityType === 'vocabulary'
              ? extractLanguageFromTheme(round.theme)
              : null;
          const label = detectedLanguage
            ? `${baseLabel}: ${detectedLanguage}`
            : baseLabel;
          return (
            <Pressable
              key={round.id}
              testID={`quiz-history-row-${round.id}`}
              className="bg-surface-elevated mx-4 mb-2 rounded-xl p-4"
              onPress={() =>
                router.push({
                  pathname: '/(app)/quiz/[roundId]',
                  params: { roundId: round.id },
                } as Href)
              }
              accessibilityRole="button"
              accessibilityLabel={t('quiz.history.rowLabel', {
                label,
                theme: round.theme,
                score: round.score,
                total: round.total,
              })}
            >
              <Text className="text-on-surface font-semibold">{label}</Text>
              <Text className="text-on-surface-muted text-sm">
                {round.theme}
              </Text>
              <Text className="text-on-surface mt-1">
                {t('quiz.history.score', {
                  score: round.score,
                  total: round.total,
                  xp: round.xpEarned,
                })}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ),
    [t, router, relativeDate],
  );

  if (isLoading) {
    return (
      <View
        testID="quiz-history-loading-screen"
        className="flex-1 bg-background"
      >
        <View
          className="flex-row items-center px-4 pb-4"
          style={{ paddingTop: insets.top + 16 }}
        >
          <Pressable
            testID="quiz-history-loading-back"
            onPress={handleBack}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('quiz.history.goBack')}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text className="text-on-surface ml-4 text-xl font-bold">
            {t('quiz.history.title')}
          </Text>
        </View>
        <TimeoutLoader
          isLoading
          testID="quiz-history-loading"
          loadingLabel={t('quiz.history.loadingText')}
          title={t('quiz.history.errorTitle')}
          message={t('quiz.history.errorMessage')}
          primaryAction={{
            label: t('common.retry'),
            onPress: () => void refetch(),
            testID: 'quiz-history-timeout-retry',
          }}
          secondaryAction={{
            label: t('common.goBack'),
            onPress: handleBack,
            testID: 'quiz-history-timeout-go-back',
          }}
        />
      </View>
    );
  }

  // [H7] Show actionable error state instead of falling through to empty.
  if (isError && !rounds) {
    return (
      <ErrorFallback
        variant="centered"
        title={t('quiz.history.errorTitle')}
        message={t('quiz.history.errorMessage')}
        primaryAction={{
          label: t('common.retry'),
          onPress: () => void refetch(),
          testID: 'quiz-history-retry',
        }}
        secondaryAction={{
          label: t('common.goBack'),
          onPress: handleBack,
          testID: 'quiz-history-go-back',
        }}
        testID="quiz-history-error"
      />
    );
  }

  if (!rounds || rounds.length === 0) {
    return (
      <View testID="quiz-history-screen" className="flex-1">
        <View
          className="flex-row items-center px-4 pb-4"
          style={{ paddingTop: insets.top + 16 }}
        >
          <Pressable
            testID="quiz-history-back"
            onPress={handleBack}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('quiz.history.goBack')}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text className="text-on-surface ml-4 text-xl font-bold">
            {t('quiz.history.title')}
          </Text>
        </View>
        <View
          testID="quiz-history-empty"
          className="flex-1 items-center justify-center p-6"
        >
          <Text className="text-on-surface text-lg font-semibold">
            {t('quiz.history.emptyTitle')}
          </Text>
          <Text className="text-on-surface-muted mt-2 text-center">
            {t('quiz.history.emptyMessage')}
          </Text>
          <Pressable
            testID="quiz-history-try-quiz"
            className="bg-primary mt-4 rounded-xl px-6 py-3"
            onPress={() =>
              router.push({
                pathname: '/(app)/quiz',
                params: returnParams,
              } as Href)
            }
          >
            <Text className="text-on-primary font-semibold">
              {t('quiz.history.tryQuiz')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const grouped = new Map<string, typeof rounds>();
  for (const round of rounds) {
    // Local getters, not UTC slice — rounds near midnight group under the correct local day.
    const dateKey = toLocalDateString(new Date(round.completedAt));
    const group = grouped.get(dateKey) ?? [];
    group.push(round);
    grouped.set(dateKey, group);
  }

  const sections = Array.from(grouped.entries()).map(([date, items]) => ({
    date,
    items,
  }));

  return (
    <View testID="quiz-history-screen" className="flex-1">
      <View
        className="flex-row items-center px-4 pb-4"
        style={{ paddingTop: insets.top + 16 }}
      >
        <Pressable
          // [QUIZ-09] Honor the same backHref that loading/empty/error states use.
          // Hardcoding '/(app)/quiz' was ignoring returnTo=practice from Practice.
          testID="quiz-history-back"
          onPress={handleBack}
          className="min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('quiz.history.goBack')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-on-surface ml-4 text-xl font-bold">
          {t('quiz.history.title')}
        </Text>
      </View>
      <FlatList
        data={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
      />
    </View>
  );
}
