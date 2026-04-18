import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ClientQuizQuestion, QuestionResult } from '@eduagent/schemas';
import {
  useCheckAnswer,
  useCompleteRound,
  usePrefetchRound,
} from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useQuizFlow } from './_layout';
import {
  GuessWhoQuestion,
  type GuessWhoResolvedResult,
} from './_components/GuessWhoQuestion';

type AnswerState = 'unanswered' | 'checking' | 'correct' | 'wrong';

export default function QuizPlayScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    round,
    activityType,
    subjectId,
    setPrefetchedRoundId,
    setCompletionResult,
  } = useQuizFlow();
  const completeRound = useCompleteRound();
  const prefetchRound = usePrefetchRound();
  const checkAnswer = useCheckAnswer();
  // [ASSUMP-F10] When completeRound fails we surface an inline retry UI
  // instead of silently fabricating a 0-XP "nice" result and navigating.
  // Users should always know when the server didn't accept their round.
  const [completeError, setCompleteError] = useState<string | null>(null);

  const questions = (round?.questions ?? []) as ClientQuizQuestion[];
  const totalQuestions = round?.total ?? 0;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showContinueHint, setShowContinueHint] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [guessWhoCluesUsed, setGuessWhoCluesUsed] = useState(1);

  const questionStartTimeRef = useRef(Date.now());
  const resultsRef = useRef<QuestionResult[]>([]);
  const continueEnabledAtRef = useRef(0);
  const prefetchTriggeredRef = useRef(false);
  const continueHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const answerSubmittedRef = useRef(false);

  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    if (!round || !currentQuestion) {
      router.replace('/(app)/quiz' as never);
    }
  }, [currentQuestion, round, router]);

  useEffect(() => {
    if (!currentQuestion) return;

    if (currentQuestion.type !== 'guess_who') {
      // [CR-1] Options arrive pre-shuffled from the server with answer fields
      // stripped. Dedup in case the LLM produced a duplicate distractor.
      setShuffledOptions(Array.from(new Set(currentQuestion.options)));
    } else {
      setShuffledOptions([]);
      setGuessWhoCluesUsed(1);
    }

    answerSubmittedRef.current = false;
    setAnswerState('unanswered');
    setSelectedAnswer(null);
    setShowContinueHint(false);
    questionStartTimeRef.current = Date.now();
    setElapsedMs(0);

    const interval = setInterval(() => {
      setElapsedMs(Date.now() - questionStartTimeRef.current);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIndex, currentQuestion]);

  useEffect(() => {
    if (
      prefetchTriggeredRef.current ||
      !activityType ||
      totalQuestions === 0 ||
      currentIndex < Math.floor(totalQuestions / 2)
    ) {
      return;
    }

    prefetchTriggeredRef.current = true;
    prefetchRound.mutate(
      { activityType, subjectId: subjectId ?? undefined },
      {
        onSuccess: (data) => setPrefetchedRoundId(data.id),
      }
    );
  }, [
    activityType,
    currentIndex,
    prefetchRound,
    setPrefetchedRoundId,
    subjectId,
    totalQuestions,
  ]);

  useEffect(() => {
    return () => {
      if (continueHintTimerRef.current) {
        clearTimeout(continueHintTimerRef.current);
      }
    };
  }, []);

  // [ASSUMP-F2] Confirmed exit — ensures mid-round users always have a way
  // out. Quitting routes back to the quiz home; the flow-context resets on
  // the next round launch. Declared BEFORE the early-return so React's
  // rules-of-hooks invariant (no conditional hooks) is respected even though
  // this particular handler is a plain function.
  const handleQuit = () => {
    goBackOrReplace(router, '/(app)/quiz');
  };

  // [CR-1] Callback for server-side answer checking, declared before the
  // early return so the rules-of-hooks invariant is satisfied.
  const roundId = round?.id ?? '';
  const handleCheckGuessWhoAnswer = useCallback(
    async (answerGiven: string): Promise<boolean> => {
      try {
        const result = await checkAnswer.mutateAsync({
          roundId,
          questionIndex: currentIndex,
          answerGiven,
        });
        return result.correct;
      } catch {
        return false;
      }
    },
    [roundId, checkAnswer, currentIndex]
  );

  if (!round || !currentQuestion) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-body text-text-secondary">No round loaded</Text>
      </View>
    );
  }

  // Re-bind as non-nullable locals after the guard so closures in the
  // hoisted function declarations below carry the narrowed type through.
  const question: ClientQuizQuestion = currentQuestion;
  const activeRound = round;

  // [F-015] Malformed round guard: capitals/vocabulary questions REQUIRE a
  // pre-shuffled `options` array from the server. If `options` is missing
  // or empty (e.g. because a stale API version stripped the wrong fields),
  // we must never silently render a dead-end with no choices — every state
  // must have an action per the UX resilience rules.
  const isMalformedMcQuestion =
    (question.type === 'capitals' || question.type === 'vocabulary') &&
    (!Array.isArray(question.options) || question.options.length < 2);

  if (isMalformedMcQuestion) {
    return (
      <View
        className="flex-1 bg-background px-5"
        style={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 20,
        }}
        testID="quiz-play-malformed"
      >
        <View className="flex-row items-center justify-between mb-6">
          <Pressable
            onPress={handleQuit}
            className="min-h-[32px] min-w-[32px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Quit quiz"
            testID="quiz-play-quit"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            This round couldn&apos;t load
          </Text>
          <Text className="text-body text-text-secondary text-center mb-6">
            We didn&apos;t get the answer choices for this question. Try a fresh
            round, or come back in a moment.
          </Text>
          <Pressable
            onPress={handleQuit}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Back to quiz home"
            testID="quiz-play-malformed-back"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Back to quiz home
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // [ASSUMP-F10] Shared submit path so Retry re-uses the same success/error
  // handlers. Previously the onError branch faked a completion result and
  // navigated — violating "silent recovery without escalation is banned".
  function submitRound() {
    setCompleteError(null);
    completeRound.mutate(
      { roundId: activeRound.id, results: resultsRef.current },
      {
        onSuccess: (result) => {
          setCompletionResult(result);
          router.replace('/(app)/quiz/results' as never);
        },
        onError: (err) => {
          setCompleteError(
            err instanceof Error
              ? err.message
              : "We couldn't save your round. Please try again."
          );
        },
      }
    );
  }

  // [CR-1] Answer checking is now async — the server validates via
  // POST /quiz/rounds/:id/check. A ref prevents double-submission during
  // the network round-trip.
  async function handleAnswer(answer: string) {
    if (answerState !== 'unanswered' || answerSubmittedRef.current) return;
    answerSubmittedRef.current = true;

    const timeMs = Date.now() - questionStartTimeRef.current;
    setSelectedAnswer(answer);
    setAnswerState('checking');

    let correct = false;
    try {
      const result = await checkAnswer.mutateAsync({
        roundId: activeRound.id,
        questionIndex: currentIndex,
        answerGiven: answer,
      });
      correct = result.correct;
    } catch {
      // On check failure, assume wrong — server re-validates on complete
      correct = false;
    }

    const nextResult: QuestionResult = {
      questionIndex: currentIndex,
      correct,
      answerGiven: answer,
      timeMs,
    };

    resultsRef.current = [...resultsRef.current, nextResult];
    setAnswerState(correct ? 'correct' : 'wrong');
    setShowContinueHint(false);
    continueEnabledAtRef.current = Date.now() + 250;

    if (continueHintTimerRef.current) {
      clearTimeout(continueHintTimerRef.current);
    }
    continueHintTimerRef.current = setTimeout(() => {
      setShowContinueHint(true);
    }, 4000);

    void Haptics.notificationAsync(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );
  }

  function handleContinue() {
    if (answerState === 'unanswered' || answerState === 'checking') return;
    if (Date.now() < continueEnabledAtRef.current) return;
    if (completeRound.isPending) return;

    if (continueHintTimerRef.current) {
      clearTimeout(continueHintTimerRef.current);
      continueHintTimerRef.current = null;
    }

    if (currentIndex + 1 >= totalQuestions) {
      submitRound();
      return;
    }

    setCurrentIndex((current) => current + 1);
  }

  // [CR-1] Without the correct answer client-side, we highlight only the
  // selected option — green if correct, red if wrong. The correct answer
  // (when wrong) is revealed on the results screen via questionResults.
  function getOptionContainerClass(option: string): string {
    if (answerState === 'unanswered' || answerState === 'checking')
      return 'bg-surface-elevated';
    if (option === selectedAnswer) {
      return answerState === 'correct' ? 'bg-primary' : 'bg-danger';
    }
    return 'bg-surface opacity-60';
  }

  function getOptionTextClass(option: string): string {
    if (answerState === 'unanswered' || answerState === 'checking')
      return 'text-text-primary';
    if (option === selectedAnswer) return 'text-text-inverse';
    return 'text-text-secondary';
  }

  return (
    <Pressable
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}
      onPress={
        answerState !== 'unanswered' &&
        answerState !== 'checking' &&
        !completeError
          ? handleContinue
          : undefined
      }
      testID="quiz-play-screen"
    >
      <View className="mb-6 flex-row items-center justify-between px-5">
        <Pressable
          onPress={handleQuit}
          className="min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Quit quiz"
          testID="quiz-play-quit"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>

        <View className="flex-row items-center gap-3">
          <Text className="text-body-sm font-semibold text-text-secondary">
            {currentIndex + 1} of {totalQuestions}
          </Text>

          <View className="flex-row gap-1">
            {Array.from({ length: totalQuestions }, (_, index) => {
              const state =
                index < currentIndex
                  ? 'past'
                  : index === currentIndex
                  ? 'current'
                  : 'future';
              const dotClass =
                state === 'past'
                  ? 'h-2 w-2 rounded-full bg-primary opacity-60'
                  : state === 'current'
                  ? 'h-2.5 w-2.5 rounded-full bg-primary'
                  : 'h-2 w-2 rounded-full bg-surface-elevated';
              return <View key={index} className={dotClass} />;
            })}
          </View>
        </View>

        <Text className="text-body-sm font-semibold text-text-secondary">
          {Math.floor(elapsedMs / 1000)}s
        </Text>
      </View>

      <View className="mb-8 px-5">
        {currentQuestion.type === 'capitals' ? (
          <>
            <Text className="mb-2 text-body text-text-secondary">
              What is the capital of...
            </Text>
            <Text className="text-display font-bold text-text-primary">
              {currentQuestion.country}?
            </Text>
          </>
        ) : currentQuestion.type === 'vocabulary' ? (
          <>
            <Text className="mb-2 text-body text-text-secondary">
              Translate:
            </Text>
            <Text className="text-display font-bold text-text-primary">
              {currentQuestion.term}
            </Text>
          </>
        ) : answerState === 'unanswered' ? (
          <Text className="text-center text-h3 font-semibold text-text-primary">
            Who is this person?
          </Text>
        ) : null}
      </View>

      {answerState === 'checking' ? (
        <View className="mt-6 items-center gap-2 px-5">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text className="text-center text-body-sm text-text-secondary">
            Checking...
          </Text>
        </View>
      ) : null}

      {question.type !== 'guess_who' ? (
        <View className="gap-3 px-5">
          {shuffledOptions.map((option, index) => (
            <Pressable
              key={`${index}-${option}`}
              onPress={() => handleAnswer(option)}
              disabled={answerState !== 'unanswered'}
              className={`min-h-[64px] items-center justify-center rounded-card px-5 py-4 ${getOptionContainerClass(
                option
              )}`}
              accessibilityRole="button"
              accessibilityLabel={option}
              accessibilityState={{
                selected: option === selectedAnswer,
                disabled: answerState !== 'unanswered',
              }}
              testID={`quiz-option-${index}`}
            >
              <Text
                className={`text-body font-semibold ${getOptionTextClass(
                  option
                )}`}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : answerState === 'unanswered' ? (
        <View className="px-5">
          <GuessWhoQuestion
            question={question}
            onCheckAnswer={handleCheckGuessWhoAnswer}
            onResolved={(result: GuessWhoResolvedResult) => {
              const timeMs = Date.now() - questionStartTimeRef.current;
              resultsRef.current = [
                ...resultsRef.current,
                {
                  questionIndex: currentIndex,
                  correct: result.correct,
                  answerGiven: result.answerGiven,
                  timeMs,
                  cluesUsed: result.cluesUsed,
                  answerMode: result.answerMode,
                },
              ];
              setGuessWhoCluesUsed(result.cluesUsed);
              setSelectedAnswer(result.answerGiven);
              setAnswerState(result.correct ? 'correct' : 'wrong');
              setShowContinueHint(false);
              continueEnabledAtRef.current = Date.now() + 250;
              if (continueHintTimerRef.current) {
                clearTimeout(continueHintTimerRef.current);
              }
              continueHintTimerRef.current = setTimeout(() => {
                setShowContinueHint(true);
              }, 4000);
              void Haptics.notificationAsync(
                result.correct
                  ? Haptics.NotificationFeedbackType.Success
                  : Haptics.NotificationFeedbackType.Error
              );
            }}
          />
        </View>
      ) : null}

      {answerState !== 'unanswered' && answerState !== 'checking' ? (
        <View className="mt-6 px-5">
          {question.type === 'guess_who' ? (
            <View className="mb-3">
              {answerState === 'correct' ? (
                <Text className="text-center text-body-lg font-semibold text-success">
                  You got it in {guessWhoCluesUsed} clue
                  {guessWhoCluesUsed !== 1 ? 's' : ''}!
                </Text>
              ) : (
                <Text className="text-center text-body-lg text-text-primary">
                  Better luck next time!
                </Text>
              )}
            </View>
          ) : null}
          {currentQuestion.funFact ? (
            <View className="rounded-card bg-surface p-4">
              <Text className="text-body-sm text-text-secondary">
                {currentQuestion.funFact}
              </Text>
            </View>
          ) : null}
          <Text className="mt-3 text-center text-caption text-text-secondary">
            {showContinueHint
              ? 'Tap anywhere to continue'
              : answerState === 'correct'
              ? 'Nice work'
              : 'Good try'}
          </Text>
        </View>
      ) : null}

      {completeRound.isPending ? (
        <View className="mt-6 items-center gap-2 px-5">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text className="text-center text-body-sm text-text-secondary">
            Scoring your round...
          </Text>
        </View>
      ) : null}

      {completeError ? (
        <View className="mt-6 px-5" testID="quiz-play-error">
          <View className="rounded-card bg-surface p-4">
            <Text className="text-body-sm font-semibold text-text-primary">
              Couldn&apos;t save your round
            </Text>
            <Text className="mt-1 text-body-sm text-text-secondary">
              {completeError}
            </Text>
            <View className="mt-3 flex-row gap-3">
              <Pressable
                onPress={submitRound}
                className="flex-1 min-h-[44px] items-center justify-center rounded-button bg-primary px-4 py-2"
                accessibilityRole="button"
                accessibilityLabel="Retry"
                testID="quiz-play-retry"
              >
                <Text className="text-body-sm font-semibold text-text-inverse">
                  Retry
                </Text>
              </Pressable>
              <Pressable
                onPress={handleQuit}
                className="flex-1 min-h-[44px] items-center justify-center rounded-button bg-surface-elevated px-4 py-2"
                accessibilityRole="button"
                accessibilityLabel="Exit without saving"
                testID="quiz-play-exit"
              >
                <Text className="text-body-sm font-semibold text-text-primary">
                  Exit
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}
