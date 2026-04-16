import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CapitalsQuestion, QuestionResult } from '@eduagent/schemas';
import { useCompleteRound, usePrefetchRound } from '../../../hooks/use-quiz';
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

function isCorrectOption(question: CapitalsQuestion, answer: string): boolean {
  const normalized = answer.toLowerCase();
  return (
    question.correctAnswer.toLowerCase() === normalized ||
    question.acceptedAliases.some((alias) => alias.toLowerCase() === normalized)
  );
}

export default function QuizPlayScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { round, activityType, setPrefetchedRoundId, setCompletionResult } =
    useQuizFlow();
  const completeRound = useCompleteRound();
  const prefetchRound = usePrefetchRound();

  const questions = (round?.questions ?? []) as CapitalsQuestion[];
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

    setShuffledOptions(
      shuffle([currentQuestion.correctAnswer, ...currentQuestion.distractors])
    );
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
      { activityType },
      {
        onSuccess: (data) => setPrefetchedRoundId(data.id),
      }
    );
  }, [
    activityType,
    currentIndex,
    prefetchRound,
    setPrefetchedRoundId,
    totalQuestions,
  ]);

  useEffect(() => {
    return () => {
      if (continueHintTimerRef.current) {
        clearTimeout(continueHintTimerRef.current);
      }
    };
  }, []);

  if (!round || !currentQuestion) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-body text-text-secondary">No round loaded</Text>
      </View>
    );
  }

  // Re-bind as non-nullable locals after the guard so closures in the
  // hoisted function declarations below carry the narrowed type through.
  const question: CapitalsQuestion = currentQuestion;
  const activeRound = round;

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
      completeRound.mutate(
        { roundId: activeRound.id, results: resultsRef.current },
        {
          onSuccess: (result) => {
            setCompletionResult(result);
            router.replace('/(app)/quiz/results' as never);
          },
          onError: () => {
            setCompletionResult({
              score: resultsRef.current.filter((result) => result.correct)
                .length,
              total: totalQuestions,
              xpEarned: 0,
              celebrationTier: 'nice',
            });
            router.replace('/(app)/quiz/results' as never);
          },
        }
      );
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
      onPress={answerState !== 'unanswered' ? handleContinue : undefined}
      testID="quiz-play-screen"
    >
      <View className="mb-6 flex-row items-center justify-between px-5">
        <Text className="text-body-sm font-semibold text-text-secondary">
          {currentIndex + 1} of {totalQuestions}
        </Text>

        <View className="flex-row gap-1">
          {Array.from({ length: totalQuestions }, (_, index) => (
            <View
              key={index}
              className={`h-2 w-2 rounded-full ${
                index <= currentIndex ? 'bg-primary' : 'bg-surface-elevated'
              }`}
            />
          ))}
        </View>

        <Text className="text-body-sm font-semibold text-text-secondary">
          {Math.floor(elapsedMs / 1000)}s
        </Text>
      </View>

      <View className="mb-8 px-5">
        <Text className="mb-2 text-body text-text-secondary">
          What is the capital of...
        </Text>
        <Text className="text-display font-bold text-text-primary">
          {currentQuestion.country}?
        </Text>
      </View>

      <View className="gap-3 px-5">
        {shuffledOptions.map((option) => (
          <Pressable
            key={option}
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
            testID={`quiz-option-${option}`}
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
          <View className="rounded-card bg-surface p-4">
            <Text className="text-body-sm text-text-secondary">
              {currentQuestion.funFact}
            </Text>
          </View>
          <Text className="mt-3 text-center text-caption text-text-secondary">
            {showContinueHint ? 'Tap anywhere to continue' : 'Nice work'}
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
    </Pressable>
  );
}
