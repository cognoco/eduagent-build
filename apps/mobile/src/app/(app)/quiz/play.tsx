import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { QuestionResult, QuizQuestion } from '@eduagent/schemas';
import { useCompleteRound, usePrefetchRound } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useQuizFlow } from './_layout';

type AnswerState = 'unanswered' | 'correct' | 'wrong';

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = shuffled[i];
    const replacement = shuffled[j];
    if (current === undefined || replacement === undefined) continue;
    shuffled[i] = replacement;
    shuffled[j] = current;
  }
  return shuffled;
}

function isCorrectOption(question: QuizQuestion, answer: string): boolean {
  const normalized = answer.toLowerCase();
  if (question.correctAnswer.toLowerCase() === normalized) return true;
  if (question.type === 'capitals') {
    return question.acceptedAliases.some(
      (alias) => alias.toLowerCase() === normalized
    );
  }
  if (question.type === 'vocabulary') {
    return question.acceptedAnswers.some(
      (acceptedAnswer) => acceptedAnswer.toLowerCase() === normalized
    );
  }
  return false;
}

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
  // [ASSUMP-F10] When completeRound fails we surface an inline retry UI
  // instead of silently fabricating a 0-XP "nice" result and navigating.
  // Users should always know when the server didn't accept their round.
  const [completeError, setCompleteError] = useState<string | null>(null);

  const questions = (round?.questions ?? []) as QuizQuestion[];
  const totalQuestions = round?.total ?? 0;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showContinueHint, setShowContinueHint] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);

  const questionStartTimeRef = useRef(Date.now());
  const resultsRef = useRef<QuestionResult[]>([]);
  const continueEnabledAtRef = useRef(0);
  const prefetchTriggeredRef = useRef(false);
  const continueHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    if (!round || !currentQuestion) {
      router.replace('/(app)/quiz' as never);
    }
  }, [currentQuestion, round, router]);

  useEffect(() => {
    if (!currentQuestion) return;

    // Dedup before shuffling in case the LLM produces a distractor that
    // collides with the correct answer. Without this, React would warn on
    // duplicate keys and the "wrong distractor is also correct" edge case
    // would render as a silent win/loss mismatch.
    const uniqueOptions = Array.from(
      new Set([currentQuestion.correctAnswer, ...currentQuestion.distractors])
    );
    setShuffledOptions(shuffle(uniqueOptions));
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

  if (!round || !currentQuestion) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-body text-text-secondary">No round loaded</Text>
      </View>
    );
  }

  // Re-bind as non-nullable locals after the guard so closures in the
  // hoisted function declarations below carry the narrowed type through.
  const question: QuizQuestion = currentQuestion;
  const activeRound = round;

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
              : 'We couldn\u2019t save your round. Please try again.'
          );
        },
      }
    );
  }

  function handleAnswer(answer: string) {
    if (answerState !== 'unanswered') return;

    const timeMs = Date.now() - questionStartTimeRef.current;
    const correct = isCorrectOption(question, answer);
    const nextResult: QuestionResult = {
      questionIndex: currentIndex,
      correct,
      answerGiven: answer,
      timeMs,
    };

    resultsRef.current = [...resultsRef.current, nextResult];
    setSelectedAnswer(answer);
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
    if (answerState === 'unanswered') return;
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

  function getOptionContainerClass(option: string): string {
    if (answerState === 'unanswered') return 'bg-surface-elevated';
    if (isCorrectOption(question, option)) return 'bg-primary';
    if (option === selectedAnswer) return 'bg-danger';
    return 'bg-surface opacity-60';
  }

  function getOptionTextClass(option: string): string {
    if (answerState === 'unanswered') return 'text-text-primary';
    if (isCorrectOption(question, option) || option === selectedAnswer) {
      return 'text-text-inverse';
    }
    return 'text-text-secondary';
  }

  return (
    <Pressable
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}
      onPress={
        answerState !== 'unanswered' && !completeError
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
              // Three-state dots so "current" is visually distinct from
              // "past" — otherwise the user loses the you-are-here signal.
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
        ) : null}
      </View>

      <View className="gap-3 px-5">
        {shuffledOptions.map((option, index) => (
          <Pressable
            // Key/testID use a positional index so apostrophes/spaces in
            // capital names (e.g. "N'Djamena", "St. John's") don't break
            // Detox selectors or React reconciliation.
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

      {answerState !== 'unanswered' ? (
        <View className="mt-6 px-5">
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
        <View className="mt-6 px-5">
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
