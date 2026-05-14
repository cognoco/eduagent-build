import { View, Text, Pressable, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { i18next } from '../../../i18n';
import { useRecentRounds } from '../../../hooks/use-quiz';
import { useThemeColors } from '../../../lib/theme';
import { QueryStateView } from '../../../components/common';
import { extractLanguageFromTheme } from '../../../lib/extract-vocabulary-language';
import { useScreenTopInset } from '../../../lib/use-screen-top-inset';

// [F-037] Friendly date label — "Today" / "Yesterday" / locale long date.
function formatDateHeader(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return i18next.t('quiz.history.dateToday');
  if (diffDays === 1) return i18next.t('quiz.history.dateYesterday');

  return d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export default function QuizHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const colors = useThemeColors();
  // [BUG-933] On web, useSafeAreaInsets returns top:0 — useScreenTopInset
  // applies a 24px minimum so the header doesn't sit flush against the
  // browser URL bar. Native devices pass through unchanged.
  const insets = useScreenTopInset();
  const { data: rounds, isLoading, isError, refetch } = useRecentRounds();
  const isPracticeReturn = returnTo === 'practice';
  const backHref = isPracticeReturn ? '/(app)/practice' : '/(app)/quiz';
  const returnParams = isPracticeReturn ? { returnTo } : {};

  const grouped = new Map<string, typeof rounds>();
  for (const round of rounds ?? []) {
    const dateKey = round.completedAt.slice(0, 10);
    const group = grouped.get(dateKey) ?? [];
    group.push(round);
    grouped.set(dateKey, group);
  }

  const sections = Array.from(grouped.entries()).map(([date, items]) => ({
    date,
    items,
  }));

  return (
    <QueryStateView
      isLoading={isLoading}
      error={isError && !rounds ? true : undefined}
      errorTitle={t('quiz.history.errorTitle')}
      errorMessage={t('quiz.history.errorMessage')}
      retry={{
        label: t('common.retry'),
        onPress: () => void refetch(),
        testID: 'quiz-history-retry',
      }}
      back={{
        label: t('common.goBack'),
        onPress: () => router.replace(backHref as never),
        testID: 'quiz-history-go-back',
      }}
      loadingFallback={
        <View
          testID="quiz-history-loading"
          className="flex-1 items-center justify-center"
        >
          <Text className="text-on-surface-muted">
            {t('quiz.history.loadingText')}
          </Text>
        </View>
      }
      testID="quiz-history-error"
    >
      {!rounds || rounds.length === 0 ? (
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
              } as never)
            }
          >
            <Text className="text-on-primary font-semibold">
              {t('quiz.history.tryQuiz')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View testID="quiz-history-screen" className="flex-1">
          <View
            className="flex-row items-center px-4 pb-4"
            style={{ paddingTop: insets.top + 16 }}
          >
            <Pressable
              testID="quiz-history-back"
              onPress={() => router.replace(backHref as never)}
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
            keyExtractor={(section) => section.date}
            renderItem={({ item: section }) => (
              <View className="mb-4">
                <Text className="text-on-surface-muted px-4 py-2 text-sm font-medium">
                  {formatDateHeader(section.date)}
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
                          params: { roundId: round.id, ...returnParams },
                        } as never)
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
            )}
          />
        </View>
      )}
    </QueryStateView>
  );
}
