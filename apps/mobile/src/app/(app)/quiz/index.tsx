import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IntentCard } from '../../../components/home/IntentCard';
import { useQuizStats } from '../../../hooks/use-quiz';
import { useSubjects } from '../../../hooks/use-subjects';
import { useVocabulary } from '../../../hooks/use-vocabulary';
import { goBackOrReplace, homeHrefForReturnTo } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useQuizFlow } from './_layout';

// [BUG-891] Below this threshold the quiz draws from a generic seed list,
// not the learner's own recorded words. Surface that honestly via title +
// subtitle rather than mislabel a stock round as personalised practice.
// SYNC: keep the threshold consistent with the four_strands prompt's
// "known vocabulary" treatment in apps/api/src/services/language-prompts.ts.
const PERSONAL_VOCAB_QUIZ_THRESHOLD = 5;

// [BUG-891] One IntentCard per language subject, with vocab-aware copy.
// Extracted so each card can call useVocabulary(subjectId) without forcing
// the parent screen to fan out N parallel queries that always run.
interface LanguageVocabCardProps {
  subjectId: string;
  displayLanguage: string;
  /** Stats summary line when the round has been played before. */
  playedSubtitle: string | null;
  onSelect: () => void;
}

function LanguageVocabCard({
  subjectId,
  displayLanguage,
  playedSubtitle,
  onSelect,
}: LanguageVocabCardProps): React.ReactElement {
  const { t } = useTranslation();
  const vocabulary = useVocabulary(subjectId);
  const vocabCount = vocabulary.data?.length ?? 0;
  // While the count is loading, default to "starter" labelling — the
  // alternative (claiming personalisation we cannot prove yet) would lie
  // to brand-new language subjects until the round actually opens.
  const isLoadingVocab = vocabulary.isLoading && vocabulary.data === undefined;
  const usingStarterWords =
    isLoadingVocab || vocabCount < PERSONAL_VOCAB_QUIZ_THRESHOLD;

  const title = usingStarterWords
    ? t('quiz.index.vocabBasicsTitle', { language: displayLanguage })
    : t('quiz.index.vocabPersonalisedTitle', { language: displayLanguage });

  // [BUG-891] When the learner has < threshold recorded words the round
  // pulls from a stock seed list, not their own vocabulary. Say so — the
  // previous "Practice new words and phrases" subtitle implied
  // personalisation that wasn't happening for fresh language subjects.
  const subtitle = usingStarterWords
    ? t('quiz.index.vocabStarterSubtitle', {
        threshold: PERSONAL_VOCAB_QUIZ_THRESHOLD,
      })
    : playedSubtitle ?? t('quiz.index.vocabPlayedSubtitleDefault');

  return (
    <IntentCard
      title={title}
      subtitle={subtitle}
      onPress={onSelect}
      testID={`quiz-vocabulary-${subjectId}`}
    />
  );
}

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
  const { t } = useTranslation();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
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
      ? t('quiz.index.bestScore', {
          score: capitalsStats.bestScore,
          total: capitalsStats.bestTotal,
          played: capitalsStats.roundsPlayed,
        })
      : capitalsStats
      ? t('quiz.index.played', { played: capitalsStats.roundsPlayed })
      : t('quiz.index.capitalsDefaultSubtitle');

  const guessWhoStats = stats?.find(
    (stat) => stat.activityType === 'guess_who'
  );
  const guessWhoSubtitle =
    guessWhoStats &&
    guessWhoStats.bestScore != null &&
    guessWhoStats.bestTotal != null
      ? t('quiz.index.bestScore', {
          score: guessWhoStats.bestScore,
          total: guessWhoStats.bestTotal,
          played: guessWhoStats.roundsPlayed,
        })
      : guessWhoStats
      ? t('quiz.index.played', { played: guessWhoStats.roundsPlayed })
      : t('quiz.index.guessWhoDefaultSubtitle');

  const handleSelectVocabulary = (subjectId: string, languageName: string) => {
    setActivityType('vocabulary');
    setSubjectId(subjectId);
    setLanguageName(languageName);
    setRound(null);
    setPrefetchedRoundId(null);
    setCompletionResult(null);
    router.push('/(app)/quiz/launch' as never);
  };
  const handleBack = () => {
    if (returnTo) {
      router.replace(homeHrefForReturnTo(returnTo) as never);
      return;
    }

    goBackOrReplace(router, '/(app)/practice');
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
          onPress={handleBack}
          className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('quiz.index.backLabel')}
          testID="quiz-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="flex-1 text-h2 font-bold text-text-primary">
          {t('quiz.index.title')}
        </Text>
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
            accessibilityLabel={t('quiz.index.retryLabel')}
            testID="quiz-load-retry"
          >
            <Text className="text-body-sm text-text-secondary">
              {t('quiz.index.loadError')}{' '}
              <Text className="font-semibold text-primary">
                {t('quiz.index.tapToRetry')}
              </Text>
            </Text>
          </Pressable>
          <Pressable
            onPress={handleBack}
            className="min-h-[44px] items-center justify-center rounded-button bg-surface-elevated px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel={t('quiz.index.backLabel')}
            testID="quiz-error-back"
          >
            <Text className="text-body-sm font-semibold text-text-primary">
              {t('common.back')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-4">
          <IntentCard
            title={t('quiz.index.capitalsTitle')}
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
            const langStat = stats?.find(
              (s) =>
                s.activityType === 'vocabulary' &&
                s.languageCode === subject.languageCode
            );
            return (
              <LanguageVocabCard
                key={subject.id}
                subjectId={subject.id}
                displayLanguage={displayLanguage}
                playedSubtitle={
                  langStat &&
                  langStat.bestScore != null &&
                  langStat.bestTotal != null
                    ? t('quiz.index.bestScore', {
                        score: langStat.bestScore,
                        total: langStat.bestTotal,
                        played: langStat.roundsPlayed,
                      })
                    : langStat
                    ? t('quiz.index.played', { played: langStat.roundsPlayed })
                    : null
                }
                onSelect={() =>
                  handleSelectVocabulary(subject.id, displayLanguage)
                }
              />
            );
          })}
          <IntentCard
            title={t('quiz.index.guessWhoTitle')}
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
                title={t('quiz.index.vocabLockedTitle')}
                subtitle={t('quiz.index.vocabLockedSubtitle')}
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
