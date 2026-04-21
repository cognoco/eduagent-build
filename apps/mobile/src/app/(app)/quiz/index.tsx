import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IntentCard } from '../../../components/home/IntentCard';
import { useQuizStats } from '../../../hooks/use-quiz';
import { useSubjects } from '../../../hooks/use-subjects';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useQuizFlow } from './_layout';

function getLanguageDisplayName(
  code: string | null | undefined
): string | null {
  if (!code) return null;

  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'language' }).of(
        code.toLowerCase()
      ) ?? null
    );
  } catch {
    return null;
  }
}

export default function QuizIndexScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    data: stats,
    isError: statsError,
    refetch: refetchStats,
  } = useQuizStats();
  const {
    data: allSubjects,
    isError: subjectsError,
    refetch: refetchSubjects,
  } = useSubjects();
  const hasLoadError = statsError || subjectsError;
  const {
    setActivityType,
    setSubjectId,
    setLanguageName,
    setRound,
    setPrefetchedRoundId,
    setCompletionResult,
  } = useQuizFlow();
  const languageSubjects =
    allSubjects?.filter(
      (subject) =>
        subject.pedagogyMode === 'four_strands' &&
        subject.languageCode &&
        subject.status === 'active'
    ) ?? [];

  const capitalsStats = stats?.find((stat) => stat.activityType === 'capitals');
  const capitalsSubtitle =
    capitalsStats &&
    capitalsStats.bestScore != null &&
    capitalsStats.bestTotal != null
      ? `Best: ${capitalsStats.bestScore}/${capitalsStats.bestTotal} · Played: ${capitalsStats.roundsPlayed}`
      : capitalsStats
      ? `Played: ${capitalsStats.roundsPlayed}`
      : 'Test yourself on world capitals';

  const guessWhoStats = stats?.find(
    (stat) => stat.activityType === 'guess_who'
  );
  const guessWhoSubtitle =
    guessWhoStats &&
    guessWhoStats.bestScore != null &&
    guessWhoStats.bestTotal != null
      ? `Best: ${guessWhoStats.bestScore}/${guessWhoStats.bestTotal} · Played: ${guessWhoStats.roundsPlayed}`
      : guessWhoStats
      ? `Played: ${guessWhoStats.roundsPlayed}`
      : 'Name the famous person from clues';

  const handleSelectVocabulary = (subjectId: string, languageName: string) => {
    setActivityType('vocabulary');
    setSubjectId(subjectId);
    setLanguageName(languageName);
    setRound(null);
    setPrefetchedRoundId(null);
    setCompletionResult(null);
    router.push('/(app)/quiz/launch' as never);
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="quiz-index-screen"
    >
      <View className="mb-6 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/practice')}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="quiz-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="flex-1 text-h2 font-bold text-text-primary">Quiz</Text>
      </View>

      {hasLoadError ? (
        <View className="mb-4 gap-3">
          <Pressable
            onPress={() => {
              void refetchStats();
              void refetchSubjects();
            }}
            className="rounded-card bg-surface p-4"
            accessibilityRole="button"
            accessibilityLabel="Retry loading quiz data"
            testID="quiz-load-retry"
          >
            <Text className="text-body-sm text-text-secondary">
              Couldn&apos;t load quiz data.{' '}
              <Text className="font-semibold text-primary">Tap to retry.</Text>
            </Text>
          </Pressable>
          <Pressable
            onPress={() => goBackOrReplace(router, '/(app)/practice')}
            className="min-h-[44px] items-center justify-center rounded-button bg-surface-elevated px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="quiz-error-back"
          >
            <Text className="text-body-sm font-semibold text-text-primary">
              Go back
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-4">
          <IntentCard
            title="Capitals"
            subtitle={capitalsSubtitle}
            onPress={() => {
              setActivityType('capitals');
              setSubjectId(null);
              setLanguageName(null);
              setRound(null);
              setPrefetchedRoundId(null);
              setCompletionResult(null);
              router.push('/(app)/quiz/launch' as never);
            }}
            testID="quiz-capitals"
          />
          {languageSubjects.map((subject) => {
            const displayLanguage =
              getLanguageDisplayName(subject.languageCode) ??
              subject.name ??
              'Language';
            const vocabStats = stats?.find(
              (stat) => stat.activityType === 'vocabulary'
            );
            const statsSubtitle =
              vocabStats &&
              vocabStats.bestScore != null &&
              vocabStats.bestTotal != null
                ? `Best: ${vocabStats.bestScore}/${vocabStats.bestTotal} · Played: ${vocabStats.roundsPlayed}`
                : vocabStats
                ? `Played: ${vocabStats.roundsPlayed}`
                : 'New!';
            const subtitle =
              subject.name && subject.name !== displayLanguage
                ? `${subject.name} · ${statsSubtitle}`
                : statsSubtitle;

            return (
              <IntentCard
                key={subject.id}
                title={`Vocabulary: ${displayLanguage}`}
                subtitle={subtitle}
                onPress={() =>
                  handleSelectVocabulary(subject.id, displayLanguage)
                }
                testID={`quiz-vocabulary-${subject.id}`}
              />
            );
          })}
          <IntentCard
            title="Guess Who"
            subtitle={guessWhoSubtitle}
            onPress={() => {
              setActivityType('guess_who');
              setSubjectId(null);
              setLanguageName(null);
              setRound(null);
              setPrefetchedRoundId(null);
              setCompletionResult(null);
              router.push('/(app)/quiz/launch' as never);
            }}
            testID="quiz-guess-who"
          />
          {/* [F-Q-15] When no language subjects exist, show a dimmed card
              nudging the user to add one so they can discover vocabulary
              quizzes. Without this, the feature is invisible to 100% of
              users who haven't set up a four_strands subject. */}
          {languageSubjects.length === 0 && (
            <View className="opacity-60">
              <IntentCard
                title="Vocabulary"
                subtitle="Add a language subject to unlock vocabulary quizzes"
                onPress={() => router.push('/(app)/library' as never)}
                testID="quiz-vocab-locked"
              />
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
