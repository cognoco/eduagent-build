import React, { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandCelebration } from '../../../components/common/BrandCelebration';
import { useFetchRound } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useQuizFlow } from './_layout';

export default function QuizResultsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    activityType,
    completionResult,
    prefetchedRoundId,
    round,
    setCompletionResult,
    setPrefetchedRoundId,
    setRound,
    clear,
  } = useQuizFlow();
  // [Q-13] Eagerly hydrate the prefetched round into the query cache as soon
  // as the results screen mounts so "Play Again" is instantaneous. For users
  // who tap Done we pay one extra GET /quiz/rounds/:id, which is intentional:
  // the server-side round is already generated and persisted during mid-round
  // prefetch, and the cached response warms the hook so the transition from
  // results → play renders without a loading state. Deferring the fetch to
  // the Play Again press would add a perceptible wait on the hot path.
  const prefetchedRound = useFetchRound(prefetchedRoundId);

  // [MIN-6] Guard against direct navigation with cleared context — redirect
  // to practice rather than rendering a meaningless "0/0" screen.
  useEffect(() => {
    if (!completionResult) {
      goBackOrReplace(router, '/(app)/practice');
    }
  }, [completionResult, router]);

  if (!completionResult) {
    return <View className="flex-1 bg-background" />;
  }

  const { score, total, xpEarned, celebrationTier, questionResults } =
    completionResult;

  const tierConfig = {
    perfect: {
      icon: 'trophy' as const,
      title: 'Perfect round!',
      color: colors.warning,
    },
    great: {
      icon: 'star' as const,
      title: 'Great round!',
      color: colors.primary,
    },
    nice: {
      icon: 'thumbs-up' as const,
      title: 'Nice effort!',
      color: colors.textSecondary,
    },
  };

  const config = tierConfig[celebrationTier];

  // [F-040] Build missed-question list from completion data + round questions
  const missed = questionResults.filter((qr) => !qr.correct);

  function questionPrompt(questionIndex: number): string {
    const q = round?.questions[questionIndex];
    if (!q) return 'Question';
    switch (q.type) {
      case 'capitals':
        return `Capital of ${q.country}`;
      case 'vocabulary':
        return q.term;
      case 'guess_who':
        // [F-Q-04] Use the first clue as the prompt — it's the hardest/most
        // vague, making it spoiler-safe. Falls back to 'Guess Who' only if
        // clues are unexpectedly absent.
        return q.clues[0] ?? 'Guess Who';
    }
  }

  function handlePlayAgain() {
    // [F-Q-09] Navigate FIRST, then clear completionResult. Clearing first
    // triggers the useEffect guard at the top of this screen (which fires when
    // completionResult becomes null) and causes an unintended redirect to
    // /practice before our explicit replace() runs. By navigating first we
    // leave the results screen before the null-check effect can react.
    if (prefetchedRound.data) {
      setRound(prefetchedRound.data);
      setPrefetchedRoundId(null);
      router.replace('/(app)/quiz/play' as never);
      setCompletionResult(null);
      return;
    }

    // [ASSUMP-F3] If the prefetched round id was set but its fetch failed,
    // clear it here. Otherwise the stale id lingers in context and could
    // confuse a future handler that assumes a non-null id implies a fetchable
    // round.
    if (prefetchedRoundId) {
      setPrefetchedRoundId(null);
    }

    if (!activityType) {
      goBackOrReplace(router, '/(app)/practice');
      return;
    }

    router.replace('/(app)/quiz/launch' as never);
    setCompletionResult(null);
  }

  function handleDone() {
    clear();
    goBackOrReplace(router, '/(app)/practice');
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: missed.length > 0 ? 'flex-start' : 'center',
        paddingHorizontal: 24,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
      }}
      testID="quiz-results-screen"
    >
      {(celebrationTier === 'perfect' || celebrationTier === 'great') && (
        <View className="mb-6">
          <BrandCelebration size={96} />
        </View>
      )}

      <Ionicons name={config.icon} size={56} color={config.color} />
      <Text className="mt-4 text-center text-h1 font-bold text-text-primary">
        {config.title}
      </Text>
      <Text className="mt-6 text-display font-bold text-text-primary">
        {score}/{total}
      </Text>
      {activityType === 'guess_who' ? (
        <Text className="mt-1 text-body-sm text-text-secondary">
          {score} of {total} people identified
        </Text>
      ) : null}

      {round?.theme ? (
        <Text className="mt-2 text-center text-body text-text-secondary">
          {round.theme}
        </Text>
      ) : null}

      {xpEarned > 0 ? (
        <View className="mt-4 rounded-full bg-primary-soft px-4 py-2">
          <Text className="text-body-sm font-semibold text-primary">
            +{xpEarned} XP
          </Text>
        </View>
      ) : null}

      {/* [F-040] Show missed questions with the user's wrong answer, the
          correct answer, and the fun fact (if any). Red-muted for the
          wrong answer, green for the correct one — reinforces the
          correction without shaming. */}
      {missed.length > 0 && (
        <View className="mt-8 w-full" testID="quiz-results-missed-section">
          <Text className="mb-3 text-body-sm font-semibold uppercase tracking-wide text-text-secondary">
            What you missed
          </Text>
          {missed.map((qr) => {
            // Defensive: skip cards where the server didn't send a
            // correctAnswer (shouldn't happen post-Task 1, but keeps the
            // screen from rendering a meaningless blank row).
            if (!qr.correctAnswer) return null;
            const prompt = questionPrompt(qr.questionIndex);
            const question = round?.questions[qr.questionIndex];
            return (
              <View
                key={qr.questionIndex}
                className="mb-2 rounded-card bg-surface p-3"
                testID={`quiz-results-missed-item-${qr.questionIndex}`}
                accessibilityRole="text"
                accessibilityLabel={`${prompt}. ${
                  qr.answerGiven && qr.answerGiven !== '[skipped]'
                    ? `You said ${qr.answerGiven}`
                    : qr.answerGiven === '[skipped]'
                    ? 'You skipped this question'
                    : "You didn't answer"
                }. Correct answer ${qr.correctAnswer}.`}
              >
                <Text className="text-body-sm text-text-secondary">
                  {prompt}
                </Text>
                {/* [F-Q-03] Three-way guard: real answer, skipped, or missing */}
                {qr.answerGiven && qr.answerGiven !== '[skipped]' ? (
                  <Text className="mt-1 text-body text-danger opacity-70">
                    You said: {qr.answerGiven}
                  </Text>
                ) : qr.answerGiven === '[skipped]' ? (
                  <Text className="mt-1 text-body text-text-secondary opacity-70">
                    You skipped this question
                  </Text>
                ) : (
                  <Text className="mt-1 text-body text-text-secondary opacity-70">
                    {"You didn't answer"}
                  </Text>
                )}
                <Text className="mt-0.5 text-body font-semibold text-success">
                  {qr.correctAnswer}
                </Text>
                {question?.funFact ? (
                  <Text className="mt-1 text-caption text-text-secondary opacity-70">
                    {question.funFact}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <View className="mt-10 w-full gap-3">
        <Pressable
          onPress={handlePlayAgain}
          className="min-h-[48px] items-center justify-center rounded-button bg-primary px-6 py-3"
          testID="quiz-results-play-again"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Play Again
          </Text>
        </Pressable>

        <Pressable
          onPress={handleDone}
          className="min-h-[48px] items-center justify-center rounded-button bg-surface-elevated px-6 py-3"
          testID="quiz-results-done"
        >
          <Text className="text-body font-semibold text-text-primary">
            Done
          </Text>
        </Pressable>

        <Pressable
          testID="quiz-results-history"
          onPress={() => router.push('/(app)/quiz/history')}
        >
          <Text className="text-primary mt-2">View History</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
