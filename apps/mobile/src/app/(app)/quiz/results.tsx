import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RewardBurst } from '../../../components/common/RewardBurst';
import { useFetchRound } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useQuizFlow } from './_layout';
import { rewardVariantForActivity } from './_quiz-utils';

export default function QuizResultsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    activityType,
    completionResult,
    prefetchedRoundId,
    returnTo,
    round,
    setPrefetchedRoundId,
    setRound,
  } = useQuizFlow();
  const practiceReturnParams = returnTo === 'practice' ? { returnTo } : {};
  // [BUG-777 / M-15] Pin the FIRST non-null round we see so a "Play Again"
  // press — which sets a NEW round into context BEFORE this screen unmounts
  // — can't cause a render flash where questionPrompt's 'Question' fallback
  // briefly shows for indexes that exist in the old questionResults but not
  // in the new round. Using a ref (vs lazy useState) is deliberate: round
  // can arrive on a render after the first one (parent state propagation),
  // so the ref upgrades from null to the first real round and then stays
  // locked for the lifetime of this screen.
  const pinnedRoundRef = useRef<typeof round>(null);
  if (round && !pinnedRoundRef.current) {
    pinnedRoundRef.current = round;
  }
  const stableRound = pinnedRoundRef.current ?? round;
  // [Q-13] Eagerly hydrate the prefetched round into the query cache as soon
  // as the results screen mounts so "Play Again" is instantaneous. For users
  // who tap Done we pay one extra GET /quiz/rounds/:id, which is intentional:
  // the server-side round is already generated and persisted during mid-round
  // prefetch, and the cached response warms the hook so the transition from
  // results → play renders without a loading state. Deferring the fetch to
  // the Play Again press would add a perceptible wait on the hot path.
  const prefetchedRound = useFetchRound(prefetchedRoundId);

  // [MIN-6] Guard against direct navigation with cleared context — redirect
  // to practice rather than rendering a meaningless "0/0" screen. Only fires
  // on a cold mount with empty state (deep-link / refreshed tab on web); the
  // Play Again / Done handlers below never null completionResult themselves,
  // so this guard cannot race with intentional navigation.
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
      color: colors.reward,
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
    const q = stableRound?.questions[questionIndex];
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
    // [BUG-925 fix] Do NOT mutate completionResult here. On web, setting it
    // null inside the handler causes the QuizFlowProvider re-render to
    // interleave with router.replace's internal state update, and the
    // navigation gets dropped while the screen blanks out.
    //
    // We don't need to clear it: navigating to /quiz/play stays inside the
    // quiz stack and the next round's completion will overwrite this value
    // before the user sees /quiz/results again. Navigating to /quiz/launch
    // does the same.
    if (prefetchedRound.data) {
      setRound(prefetchedRound.data);
      setPrefetchedRoundId(null);
      router.replace('/(app)/quiz/play' as Href);
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
      router.replace('/(app)/practice' as Href);
      return;
    }

    router.replace('/(app)/quiz/launch' as Href);
  }

  function handleDone() {
    // [BUG-925 fix] Always replace to /practice, never router.back(). When
    // canGoBack() is true (the common case after a normal quiz flow),
    // router.back() lands on /quiz/play with stale/null round state, where
    // /quiz/play's own guard re-redirects — the user perceives "Done did
    // nothing". router.replace targets /practice deterministically.
    //
    // Do NOT call clear() here. Navigating out of the quiz stack unmounts
    // QuizFlowProvider, which resets state naturally; calling clear() inside
    // the handler causes the same QuizFlowProvider/router-update interleave
    // that broke Play Again on web.
    router.replace('/(app)/practice' as Href);
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
      <RewardBurst
        variant={rewardVariantForActivity(activityType)}
        intensity={
          celebrationTier === 'perfect' || celebrationTier === 'great'
            ? 'round'
            : 'answer'
        }
        message={config.title}
        testID="quiz-results-celebration"
      />

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

      {stableRound?.theme ? (
        <Text className="mt-2 text-center text-body text-text-secondary">
          {stableRound.theme}
        </Text>
      ) : null}

      {xpEarned > 0 ? (
        <View className="mt-4 rounded-full bg-reward-soft px-4 py-2">
          <Text className="text-body-sm font-semibold text-reward">
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
          <Text className="mb-3 text-body-sm font-semibold tracking-wide text-text-secondary">
            What you missed
          </Text>
          {missed.map((qr) => {
            // Defensive: skip cards where the server didn't send a
            // correctAnswer (shouldn't happen post-Task 1, but keeps the
            // screen from rendering a meaningless blank row).
            if (!qr.correctAnswer) return null;
            const prompt = questionPrompt(qr.questionIndex);
            const question = stableRound?.questions[qr.questionIndex];
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
          onPress={() =>
            router.push({
              pathname: '/(app)/quiz/history',
              params: practiceReturnParams,
            } as Href)
          }
        >
          <Text className="text-primary mt-2">View History</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
