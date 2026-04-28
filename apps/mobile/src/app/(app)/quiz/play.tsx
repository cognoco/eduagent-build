import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticError, hapticLight, hapticSuccess } from '../../../lib/haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ClientQuizQuestion, QuestionResult } from '@eduagent/schemas';
import {
  useCheckAnswer,
  useCompleteRound,
  usePrefetchRound,
} from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { formatApiError } from '../../../lib/format-api-error';
import { useThemeColors } from '../../../lib/theme';
import { Sentry } from '../../../lib/sentry';
import { useQuizFlow } from './_layout';
import {
  GuessWhoQuestion,
  type GuessWhoResolvedResult,
} from '../../../components/quiz/GuessWhoQuestion';

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
  // [IMP-7] Show non-blocking warning when answer-check API call fails so the
  // user knows the result may be inaccurate. Cleared on each new question.
  const [answerCheckFailed, setAnswerCheckFailed] = useState(false);
  // [BUG-469] Track which question indices the user has disputed
  const [disputedIndices, setDisputedIndices] = useState<Set<number>>(
    new Set()
  );

  const questions = (round?.questions ?? []) as ClientQuizQuestion[];
  const totalQuestions = round?.total ?? 0;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  // [F-Q-02/F-Q-07] Server reveals correctAnswer on wrong submissions so the
  // client can highlight the right option and show the person's name.
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [showContinueHint, setShowContinueHint] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  // [F-Q-13] elapsedMs is computed for analytics (timeMs in QuestionResult)
  // but no longer displayed. Prefixed with _ to satisfy no-unused-vars.
  const [_elapsedMs, setElapsedMs] = useState(0);
  const [guessWhoCluesUsed, setGuessWhoCluesUsed] = useState(1);
  const [freeTextAnswer, setFreeTextAnswer] = useState('');

  const questionStartTimeRef = useRef(Date.now());
  const resultsRef = useRef<QuestionResult[]>([]);
  const continueEnabledAtRef = useRef(0);
  const prefetchTriggeredRef = useRef(false);
  const continueHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const answerSubmittedRef = useRef(false);
  // [F-Q-07] Tracks whether correctAnswer was captured via handleCheckGuessWhoAnswer
  // so the onResolved skip-path only fires a background check when needed.
  const correctAnswerCapturedRef = useRef(false);

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
    correctAnswerCapturedRef.current = false;
    setAnswerState('unanswered');
    setSelectedAnswer(null);
    setCorrectAnswer(null);
    setShowContinueHint(false);
    setFreeTextAnswer('');
    setAnswerCheckFailed(false);
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
    // [BUG-542] Use .mutate (stable ref) instead of whole mutation result
  }, [
    activityType,
    currentIndex,
    prefetchRound.mutate,
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
  // [F-Q-08] Show a confirmation dialog before discarding in-progress answers.
  const handleQuit = () => {
    platformAlert('Quit this round?', 'Your progress will not be saved.', [
      { text: 'Keep playing', style: 'cancel' },
      {
        text: 'Quit',
        style: 'destructive',
        onPress: () => goBackOrReplace(router, '/(app)/quiz'),
      },
    ]);
  };

  // [CR-1] Callback for server-side answer checking, declared before the
  // early return so the rules-of-hooks invariant is satisfied.
  // [F-Q-07] When the answer is wrong, capture correctAnswer from the server
  // response so it can be shown in the post-answer feedback panel.
  const roundId = round?.id ?? '';
  // [BUG-542] Use checkAnswer.mutateAsync (stable ref in TanStack Query v5)
  // instead of the whole checkAnswer object, which creates a new reference on
  // every mutation state transition (idle → pending → success → idle).
  const checkAnswerMutateAsync = checkAnswer.mutateAsync;
  const handleCheckGuessWhoAnswer = useCallback(
    async (answerGiven: string): Promise<boolean> => {
      try {
        const result = await checkAnswerMutateAsync({
          roundId,
          questionIndex: currentIndex,
          answerGiven,
        });
        if (!result.correct && result.correctAnswer) {
          correctAnswerCapturedRef.current = true;
          setCorrectAnswer(result.correctAnswer);
        }
        return result.correct;
      } catch (err) {
        // [BUG-799] State-flag-only feedback is invisible if the JSX consumer
        // misses it (unmount during failure, flag cleared by another render).
        // Surface the failure visibly + capture for triage. Without this, the
        // user thinks their answer was validated when in fact it never was.
        setAnswerCheckFailed(true);
        Sentry.captureException(err);
        platformAlert("Couldn't check your answer", formatApiError(err));
        return false;
      }
    },
    [roundId, checkAnswerMutateAsync, currentIndex, setAnswerCheckFailed]
  );

  // [BUG-542] Extract onResolved from inline JSX to a stable useCallback.
  // The previous inline arrow created a new function reference every render,
  // compounding with the unstable checkAnswer dep to trigger re-render storms.
  const handleGuessWhoResolved = useCallback(
    (result: GuessWhoResolvedResult) => {
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
      if (result.correct) {
        hapticSuccess();
      } else {
        hapticError();
      }
      // [F-Q-07] If the answer was wrong and we don't already have the
      // correct answer (e.g. skip path bypasses onCheckAnswer), fire a
      // background check to get it for the feedback panel.
      if (!result.correct && !correctAnswerCapturedRef.current) {
        void checkAnswerMutateAsync({
          roundId,
          questionIndex: currentIndex,
          answerGiven: result.answerGiven,
        })
          .then((checkResult) => {
            if (checkResult.correctAnswer) {
              setCorrectAnswer(checkResult.correctAnswer);
            }
          })
          .catch((err) => {
            Sentry.captureException(err, {
              tags: {
                component: 'quiz/play',
                action: 'background_check_answer',
              },
              extra: { roundId, questionIndex: currentIndex },
            });
          });
      }
    },
    [checkAnswerMutateAsync, currentIndex, roundId]
  );

  if (!round || !currentQuestion) {
    // [UX-DE-H1] Render an actionable error state instead of a dead plain-text
    // fallback. The useEffect redirect may not fire (e.g. stale router ref),
    // so we always give the user a way out.
    return (
      <View
        className="flex-1 bg-background px-5 items-center justify-center"
        testID="quiz-play-no-round"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          No round loaded
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          Something went wrong loading the quiz round. You can try again or go
          back to the quiz home.
        </Text>
        <View className="flex-row gap-3 w-full">
          <Pressable
            onPress={() => router.replace('/(app)/quiz' as never)}
            className="flex-1 bg-primary rounded-button px-4 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Retry"
            testID="quiz-play-no-round-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Retry
            </Text>
          </Pressable>
          <Pressable
            onPress={() => goBackOrReplace(router, '/(app)/quiz')}
            className="flex-1 bg-surface-elevated rounded-button px-4 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Go Home"
            testID="quiz-play-no-round-home"
          >
            <Text className="text-body font-semibold text-text-primary">
              Go Home
            </Text>
          </Pressable>
        </View>
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
  // [BUG-812] Account for de-duplication: server-side options may contain
  // duplicates (e.g. an LLM produced the same distractor twice). After
  // `new Set(options)` the playable count can drop below 2 even when the
  // raw array length is >=2. Treat that as a malformed round so the user
  // sees an actionable fallback instead of a single-button "MC" question.
  const isMalformedMcQuestion =
    (question.type === 'capitals' || question.type === 'vocabulary') &&
    (!Array.isArray(question.options) || new Set(question.options).size < 2);

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
            className="min-h-[44px] min-w-[44px] items-center justify-center"
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

  // [BUG-469] Dispute a question — marks it so the round submission includes it
  function handleDispute() {
    if (answerState === 'unanswered' || answerState === 'checking') return;
    setDisputedIndices((prev) => new Set(prev).add(currentIndex));
    // Also update the stored result for this question
    resultsRef.current = resultsRef.current.map((r) =>
      r.questionIndex === currentIndex ? { ...r, disputed: true } : r
    );
    hapticLight();
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
          // [BUG-806] formatApiError handles all shapes (typed envelope, Error,
          // string, network failure) — `err instanceof Error` returns false for
          // server-typed error envelopes, hiding the actionable reason behind
          // the generic fallback.
          setCompleteError(formatApiError(err));
          Sentry.captureException(err);
        },
      }
    );
  }

  // [CR-1] Answer checking is now async — the server validates via
  // POST /quiz/rounds/:id/check. A ref prevents double-submission during
  // the network round-trip.
  async function handleAnswer(
    answer: string,
    answerMode: 'free_text' | 'multiple_choice' = 'multiple_choice'
  ) {
    if (answerState !== 'unanswered' || answerSubmittedRef.current) return;
    answerSubmittedRef.current = true;

    // [BUG-819] Capture questionIndex synchronously at call-time and use the
    // local instead of the closure variable everywhere downstream. The
    // mutation `await` and any subsequent state updates run on a separate
    // tick from React render commits, so reading `currentIndex` after the
    // await would risk recording the result against the wrong question if
    // the index has advanced.
    const questionIndex = currentIndex;

    const timeMs = Date.now() - questionStartTimeRef.current;
    setSelectedAnswer(answer);
    setAnswerState('checking');

    let correct = false;
    try {
      const result = await checkAnswer.mutateAsync({
        roundId: activeRound.id,
        questionIndex,
        answerGiven: answer,
      });
      correct = result.correct;
      // [F-Q-02] Server reveals correctAnswer on wrong submissions so the
      // client can highlight the right option without a second round-trip.
      if (!correct && result.correctAnswer) {
        setCorrectAnswer(result.correctAnswer);
      }
    } catch (err) {
      // [BUG-799] On check failure, assume wrong — server re-validates on
      // complete. But surface the network/server reason so the user knows
      // the answer wasn't validated, instead of silently flipping the flag.
      correct = false;
      setAnswerCheckFailed(true);
      Sentry.captureException(err);
      platformAlert("Couldn't check your answer", formatApiError(err));
    }

    const nextResult: QuestionResult = {
      questionIndex,
      correct,
      answerGiven: answer,
      timeMs,
      answerMode,
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

    if (correct) {
      hapticSuccess();
    } else {
      hapticError();
    }
  }

  function handleFreeTextSubmit() {
    const answer = freeTextAnswer.trim();
    if (!answer) return;
    void handleAnswer(answer, 'free_text');
    setFreeTextAnswer('');
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

  // [F-Q-02] The selected wrong option turns red; the correct option turns
  // green so the user immediately sees what they should have picked. All
  // other options are dimmed as before.
  function getOptionContainerClass(option: string): string {
    if (answerState === 'unanswered' || answerState === 'checking')
      return 'bg-surface-elevated';
    if (answerState === 'correct' && option === selectedAnswer) {
      return 'bg-primary';
    }
    if (answerState === 'wrong') {
      if (option === selectedAnswer) return 'bg-danger';
      if (correctAnswer && option === correctAnswer)
        return 'bg-success/20 border border-success';
    }
    return 'bg-surface opacity-60';
  }

  function getOptionTextClass(option: string): string {
    if (answerState === 'unanswered' || answerState === 'checking')
      return 'text-text-primary';
    if (option === selectedAnswer) return 'text-text-inverse';
    if (answerState === 'wrong' && correctAnswer && option === correctAnswer)
      return 'text-success font-semibold';
    return 'text-text-secondary';
  }

  // [BUG-691] The "tap anywhere to continue" affordance must NOT overlap the
  // Quit X button. Previously the entire screen was a Pressable wrapping the
  // header, so on Android a single tap on Quit could bubble to the parent and
  // advance the question while the confirmation dialog opened. Splitting the
  // root into a View + a body-only continue-Pressable removes the overlap.
  const continueActive =
    answerState !== 'unanswered' &&
    answerState !== 'checking' &&
    !completeError;
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}
      testID="quiz-play-screen"
    >
      <View className="mb-6 flex-row items-center justify-between px-5">
        <Pressable
          onPress={handleQuit}
          className="min-h-[44px] min-w-[44px] items-center justify-center"
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

        {/* [F-Q-13] Timer hidden — elapsed time is tracked for analytics
            (feeds timeMs into QuestionResult) but not shown to avoid
            countdown anxiety. */}
        <View className="w-[32px]" />
      </View>

      <Pressable
        className="flex-1"
        onPress={continueActive ? handleContinue : undefined}
        testID="quiz-play-body"
      >
        {/* [IMP-7] Non-blocking warning when answer-check API fails. The quiz
          continues with the result assumed wrong; this banner lets the user
          know so they don't think their connection is fine. */}
        {answerCheckFailed ? (
          <Text className="text-caption text-warning text-center mb-2 px-5">
            Answer check failed — result may be inaccurate
          </Text>
        ) : null}

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
            {question.freeTextEligible ? (
              <View testID="quiz-free-text-input">
                <Text className="mb-2 text-body-sm text-text-secondary">
                  Type your answer
                </Text>
                <TextInput
                  testID="quiz-free-text-field"
                  className="rounded-card bg-surface-elevated px-4 py-4 text-body text-text-primary"
                  placeholder="Type your answer..."
                  placeholderTextColor={colors.textSecondary}
                  value={freeTextAnswer}
                  onChangeText={setFreeTextAnswer}
                  editable={answerState === 'unanswered'}
                  autoCorrect={false}
                  autoCapitalize="words"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleFreeTextSubmit}
                />
                <Pressable
                  testID="quiz-free-text-submit"
                  className={`mt-3 min-h-[48px] items-center justify-center rounded-button px-6 py-3 ${
                    freeTextAnswer.trim() && answerState === 'unanswered'
                      ? 'bg-primary'
                      : 'bg-surface-elevated opacity-60'
                  }`}
                  onPress={handleFreeTextSubmit}
                  disabled={
                    !freeTextAnswer.trim() || answerState !== 'unanswered'
                  }
                >
                  <Text
                    className={`text-body font-semibold ${
                      freeTextAnswer.trim() && answerState === 'unanswered'
                        ? 'text-text-inverse'
                        : 'text-text-secondary'
                    }`}
                  >
                    Submit
                  </Text>
                </Pressable>
              </View>
            ) : (
              shuffledOptions.map((option, index) => (
                <Pressable
                  key={`${index}-${option}`}
                  onPress={() => handleAnswer(option, 'multiple_choice')}
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
              ))
            )}
          </View>
        ) : answerState === 'unanswered' ? (
          <View className="px-5">
            <GuessWhoQuestion
              question={question}
              onCheckAnswer={handleCheckGuessWhoAnswer}
              onResolved={handleGuessWhoResolved}
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
                  <>
                    <Text className="text-center text-body-lg text-text-primary">
                      Better luck next time!
                    </Text>
                    {/* [F-Q-07] Reveal the person's name after wrong/skip */}
                    {correctAnswer ? (
                      <Text className="mt-1 text-center text-body-sm text-text-secondary">
                        The answer was{' '}
                        <Text className="font-bold text-success">
                          {correctAnswer}
                        </Text>
                      </Text>
                    ) : null}
                  </>
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
                ? 'Correct'
                : 'Not quite'}
            </Text>
            {/* [BUG-469] Dispute button — lets user flag LLM's judgment as wrong */}
            {!disputedIndices.has(currentIndex) ? (
              <Pressable
                onPress={handleDispute}
                className="mt-2 items-center py-1"
                testID="quiz-dispute-button"
                accessibilityRole="button"
                accessibilityLabel="Dispute this answer"
              >
                <Text className="text-caption text-text-secondary underline">
                  Not quite right?
                </Text>
              </Pressable>
            ) : (
              <Text
                className="mt-2 text-center text-caption text-text-secondary"
                testID="quiz-dispute-noted"
              >
                Noted — we'll review this
              </Text>
            )}
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
    </View>
  );
}
