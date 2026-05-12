import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticError, hapticLight, hapticSuccess } from '../../../lib/haptics';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ClientQuizQuestion,
  CompleteRoundResponse,
  QuestionResult,
} from '@eduagent/schemas';
import {
  useCheckAnswer,
  useCompleteRound,
  usePrefetchRound,
} from '../../../hooks/use-quiz';
import { PolarStar } from '../../../components/common';
import { platformAlert } from '../../../lib/platform-alert';
// platformAlert maps to window.confirm on web for 2-button prompts, which
// blocks the renderer (BUG-892). For the quit-quiz confirmation we use a
// styled in-app Modal — same pattern as parent withdraw-consent (BUG-553).
import { formatApiError } from '../../../lib/format-api-error';
import { useThemeColors } from '../../../lib/theme';
import { Sentry } from '../../../lib/sentry';
import { useQuizFlow } from './_layout';
import {
  GuessWhoQuestion,
  type GuessWhoResolvedResult,
} from '../../../components/quiz/GuessWhoQuestion';
import { RewardBurst } from '../../../components/common/RewardBurst';
import { rewardVariantForActivity } from './_quiz-utils';

type AnswerState = 'unanswered' | 'checking' | 'correct' | 'wrong';

interface SubmitRoundOptions {
  results?: QuestionResult[];
  navigateOnSuccess?: boolean;
}

function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function QuizPlayScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    round,
    activityType,
    returnTo,
    subjectId,
    setPrefetchedRoundId,
    setRound,
    setCompletionResult,
  } = useQuizFlow();
  const exitHref = returnTo === 'practice' ? '/(app)/practice' : '/(app)/quiz';
  const completeRound = useCompleteRound();
  const completeRoundMutate = completeRound.mutate;
  const prefetchRound = usePrefetchRound();
  // [BUG-542] Extract .mutate so the useEffect dep array references a stable
  // variable rather than a member-access expression. ESLint exhaustive-deps
  // treats `prefetchRound.mutate` in a dep array as an undeclared dep on
  // `prefetchRound` (the whole object), which is recreated each render. The
  // extracted local is still the stable TanStack Query .mutate ref.
  const prefetchRoundMutate = prefetchRound.mutate;
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
    new Set(),
  );
  // [BUG-892] Quit confirmation rendered as an in-app Modal so web doesn't
  // hit window.confirm via Alert.alert mapping (which blocks the renderer).
  const [quitConfirmVisible, setQuitConfirmVisible] = useState(false);
  const [roundAutoSaveStarted, setRoundAutoSaveStarted] = useState(false);
  const [roundAutoSaved, setRoundAutoSaved] = useState(false);
  const [correctCelebrationKey, setCorrectCelebrationKey] = useState<
    number | null
  >(null);

  const questions = (round?.questions ?? []) as ClientQuizQuestion[];
  const totalQuestions = round?.total ?? 0;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  // [F-Q-02/F-Q-07] Server reveals correctAnswer on wrong submissions so the
  // client can highlight the right option and show the person's name.
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [showContinueHint, setShowContinueHint] = useState(false);
  // [BUG-928] elapsedMs is shown in the question header and also used for
  // analytics (timeMs in QuestionResult). Spec — docs/flows/learning-path-flows.md
  // Path 7: "Question header: '1 of 7' + dot indicators + elapsed seconds".
  // The previous F-Q-13 carve-out hid this for "countdown anxiety", but it's
  // a count-UP timer, not a deadline — and the spec was updated to require
  // it for motivational feedback ("how fast am I going?").
  const [elapsedMs, setElapsedMs] = useState(0);
  const [guessWhoCluesUsed, setGuessWhoCluesUsed] = useState(1);
  const [freeTextAnswer, setFreeTextAnswer] = useState('');

  const questionStartTimeRef = useRef(Date.now());
  const resultsRef = useRef<QuestionResult[]>([]);
  const continueEnabledAtRef = useRef(0);
  const prefetchTriggeredRef = useRef(false);
  const continueHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const answerSubmittedRef = useRef(false);
  const roundSubmittedRef = useRef(false);
  // [F-Q-07] Tracks whether correctAnswer was captured via handleCheckGuessWhoAnswer
  // so the onResolved skip-path only fires a background check when needed.
  const correctAnswerCapturedRef = useRef(false);

  const currentQuestion = questions[currentIndex];

  // [BUG-STALE-OPTIONS] Derived synchronously from currentQuestion so the
  // same render that shows the prompt already has the correct options. A
  // useEffect would run AFTER the commit, leaving a one-frame window where
  // shuffledOptions still held the previous question's options — a tap in
  // that window would record a stale answerGiven against the new question.
  // Must be defined AFTER currentQuestion (same render pass, deps evaluated
  // at this point in the execution).
  const shuffledOptions = useMemo<string[]>(() => {
    if (!currentQuestion || currentQuestion.type === 'guess_who') {
      return [];
    }
    return Array.from(new Set(currentQuestion.options));
  }, [currentQuestion]);

  useEffect(() => {
    if (!round || !currentQuestion) {
      router.replace(exitHref as never);
    }
  }, [currentQuestion, exitHref, round, router]);

  useEffect(() => {
    if (!currentQuestion) return;

    // [BUG-STALE-OPTIONS] shuffledOptions is now derived via useMemo (above)
    // so it updates synchronously with currentQuestion in the same render.
    // Only side-effecty resets that must run after the new question commits
    // are kept here.
    if (currentQuestion.type === 'guess_who') {
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
    prefetchRoundMutate(
      { activityType, subjectId: subjectId ?? undefined },
      {
        onSuccess: (data) => setPrefetchedRoundId(data.id),
      },
    );
    // [BUG-542] Use extracted .mutate local (stable ref) instead of whole
    // mutation result or member-access expression in the dep array.
  }, [
    activityType,
    currentIndex,
    prefetchRoundMutate,
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
  // [BUG-892] On web, platformAlert with 2 buttons falls back to window.confirm
  // which blocks the renderer. Render a styled in-app Modal instead.
  const handleQuit = () => {
    setQuitConfirmVisible(true);
  };
  const handleConfirmQuit = () => {
    setQuitConfirmVisible(false);
    router.replace(exitHref as never);
  };
  const handleSaveAndQuit = () => {
    if (resultsRef.current.length === 0) return;
    setQuitConfirmVisible(false);
    submitRound();
  };
  const handleSeeResults = () => {
    if (!roundAutoSaved) return;
    router.replace('/(app)/quiz/results' as never);
  };
  const handleOneMore = () => {
    if (!roundAutoSaved) return;
    setRound(null);
    router.replace('/(app)/quiz/launch' as never);
  };

  // [CR-1] Callback for server-side answer checking, declared before the
  // early return so the rules-of-hooks invariant is satisfied.
  // [F-Q-07] When the answer is wrong, capture correctAnswer from the server
  // response so it can be shown in the post-answer feedback panel.
  const roundId = round?.id ?? '';
  const submitRound = useCallback(
    ({
      results = resultsRef.current,
      navigateOnSuccess = true,
    }: SubmitRoundOptions = {}) => {
      if (!roundId || results.length === 0 || roundSubmittedRef.current) {
        return;
      }

      setCompleteError(null);
      roundSubmittedRef.current = true;
      if (!navigateOnSuccess) {
        setRoundAutoSaveStarted(true);
      }
      completeRoundMutate(
        { roundId, results },
        {
          onSuccess: (result: CompleteRoundResponse) => {
            setCompletionResult(result);
            setRoundAutoSaved(true);
            setRoundAutoSaveStarted(false);
            if (navigateOnSuccess) {
              router.replace('/(app)/quiz/results' as never);
            }
          },
          onError: (err) => {
            roundSubmittedRef.current = false;
            setRoundAutoSaveStarted(false);
            // [BUG-806] formatApiError handles all shapes (typed envelope, Error,
            // string, network failure) — `err instanceof Error` returns false for
            // server-typed error envelopes, hiding the actionable reason behind
            // the generic fallback.
            setCompleteError(formatApiError(err));
            Sentry.captureException(err);
          },
        },
      );
    },
    [completeRoundMutate, router, roundId, setCompletionResult],
  );
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
          // guess_who is always free-text input
          answerMode: 'free_text',
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
    [roundId, checkAnswerMutateAsync, currentIndex, setAnswerCheckFailed],
  );

  // [BUG-542] Extract onResolved from inline JSX to a stable useCallback.
  // The previous inline arrow created a new function reference every render,
  // compounding with the unstable checkAnswer dep to trigger re-render storms.
  const handleGuessWhoResolved = useCallback(
    (result: GuessWhoResolvedResult) => {
      const timeMs = Date.now() - questionStartTimeRef.current;
      const nextResults: QuestionResult[] = [
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
      resultsRef.current = nextResults;
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
      if (currentIndex + 1 >= totalQuestions) {
        submitRound({
          results: nextResults,
          navigateOnSuccess: false,
        });
      }
      // [F-Q-07] If the answer was wrong and we don't already have the
      // correct answer (e.g. skip path bypasses onCheckAnswer), fire a
      // background check to get it for the feedback panel.
      if (!result.correct && !correctAnswerCapturedRef.current) {
        void checkAnswerMutateAsync({
          roundId,
          questionIndex: currentIndex,
          answerGiven: result.answerGiven,
          // guess_who background correctAnswer fetch is always free_text
          answerMode: 'free_text',
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
    [
      checkAnswerMutateAsync,
      currentIndex,
      roundId,
      submitRound,
      totalQuestions,
    ],
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
          {t('quiz.play.noRoundTitle')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('quiz.play.noRoundBody')}
        </Text>
        <View className="flex-row gap-3 w-full">
          <Pressable
            onPress={() => router.replace('/(app)/quiz' as never)}
            className="flex-1 bg-primary rounded-button px-4 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            testID="quiz-play-no-round-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.retry')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace(exitHref as never)}
            className="flex-1 bg-surface-elevated rounded-button px-4 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('common.goHome')}
            testID="quiz-play-no-round-home"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('common.goHome')}
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
            accessibilityLabel={t('quiz.play.quitLabel')}
            testID="quiz-play-quit"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            {t('quiz.play.malformedTitle')}
          </Text>
          <Text className="text-body text-text-secondary text-center mb-6">
            {t('quiz.play.malformedBody')}
          </Text>
          <Pressable
            onPress={handleQuit}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('quiz.play.backToQuizHome')}
            testID="quiz-play-malformed-back"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('quiz.play.backToQuizHome')}
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
      r.questionIndex === currentIndex ? { ...r, disputed: true } : r,
    );
    hapticLight();
  }

  // [CR-1] Answer checking is now async — the server validates via
  // POST /quiz/rounds/:id/check. A ref prevents double-submission during
  // the network round-trip.
  async function handleAnswer(
    answer: string,
    answerMode: 'free_text' | 'multiple_choice' = 'multiple_choice',
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
        // [BUG-STALE-OPTIONS] Forward answerMode so the API can verify MC
        // answers are in question.options — defense-in-depth guard.
        answerMode,
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

    const nextResults = [...resultsRef.current, nextResult];
    resultsRef.current = nextResults;
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
      setCorrectCelebrationKey(Date.now());
      hapticSuccess();
    } else {
      hapticError();
    }

    if (questionIndex + 1 >= totalQuestions) {
      submitRound({
        results: nextResults,
        navigateOnSuccess: false,
      });
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
      if (roundAutoSaved) {
        router.replace('/(app)/quiz/results' as never);
        return;
      }
      submitRound();
      return;
    }

    // [BUG-929] Reset answer state in the SAME React batch as setCurrentIndex.
    // Without this, the first commit of Q+1 still carries answerState='correct'
    // (or 'wrong') from Q+0, which means every option Pressable renders with
    // `disabled={answerState !== 'unanswered'}` === true. The reset effect at
    // [currentIndex, currentQuestion] only runs after that commit, leaving a
    // window between paint and the next render in which a user tap lands on
    // disabled Pressables and is silently dropped — exactly the symptom
    // reported (no red/green animation, no /quiz/rounds/:id/check). Doing the
    // reset here closes that window: the first render of Q+1 already shows
    // enabled options. The downstream useEffect's setAnswerState('unanswered')
    // then becomes a no-op (same-value bail-out) instead of a render trigger.
    answerSubmittedRef.current = false;
    correctAnswerCapturedRef.current = false;
    setAnswerState('unanswered');
    setSelectedAnswer(null);
    setCorrectAnswer(null);
    setCorrectCelebrationKey(null);
    setShowContinueHint(false);
    setAnswerCheckFailed(false);
    // [BUG-929] Also reset freeTextAnswer and guessWhoCluesUsed in the same
    // React batch so Q+1's first render never shows Q+0's stale typed text or
    // clue count. The [currentIndex, currentQuestion] useEffect handles these
    // too, but only runs AFTER the commit — this closes the one-frame window.
    setFreeTextAnswer('');
    setGuessWhoCluesUsed(1);
    // [CR-PR129-M4] Reset the per-question timer in the same batch so the
    // first render of Q+1 never shows a stale elapsed time or records stale
    // telemetry. questionStartTimeRef is a ref so it updates synchronously;
    // setElapsedMs(0) batches with the other state setters under React 18
    // automatic batching — no extra render, no one-frame flicker.
    questionStartTimeRef.current = Date.now();
    setElapsedMs(0);
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
  const hasAnsweredQuestions = resultsRef.current.length > 0;
  const isFinalQuestion = currentIndex + 1 >= totalQuestions;
  const quizTitle =
    question.type === 'guess_who'
      ? t('quiz.play.titleGuessWho')
      : question.type === 'capitals'
        ? t('quiz.play.titleCapitals')
        : t('quiz.play.titleVocabulary');
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const elapsedLabel = formatElapsedTime(elapsedMs);
  const revealedAnswer =
    question.type === 'guess_who'
      ? selectedAnswer || correctAnswer
      : selectedAnswer;
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}
      testID="quiz-play-screen"
    >
      {correctCelebrationKey != null ? (
        <RewardBurst
          key={correctCelebrationKey}
          variant={rewardVariantForActivity(activityType)}
          intensity="answer"
          testID="quiz-correct-celebration"
          onComplete={() => setCorrectCelebrationKey(null)}
        />
      ) : null}
      <View className="mb-6 flex-row items-center justify-between px-5">
        <Pressable
          onPress={handleQuit}
          className="min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('quiz.play.quitLabel')}
          testID="quiz-play-quit"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>

        <View className="items-center gap-1">
          <Text className="text-caption font-semibold text-primary">
            {quizTitle}
          </Text>
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
        </View>

        {/* [BUG-928] Elapsed seconds — count UP timer (not countdown), shown
            for motivational feedback per Path 7 spec. The same value drives
            the timeMs analytics field at answer time. Min-width keeps the
            header from reflowing as digits grow. */}
        <Text
          className="text-body-sm font-semibold text-text-secondary text-right"
          style={{ minWidth: 36 }}
          accessibilityLabel={`Elapsed time: ${elapsedSeconds} seconds`}
          testID="quiz-play-elapsed"
        >
          {elapsedLabel}
        </Text>
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
            {t('quiz.play.answerCheckFailed')}
          </Text>
        ) : null}

        <View className="mb-8 px-5">
          {currentQuestion.type === 'capitals' ? (
            <>
              <Text className="mb-2 text-body text-text-secondary">
                {t('quiz.play.capitalPrompt')}
              </Text>
              <Text className="text-display font-bold text-text-primary">
                {currentQuestion.country}?
              </Text>
            </>
          ) : currentQuestion.type === 'vocabulary' ? (
            <>
              <Text className="mb-2 text-body text-text-secondary">
                {t('quiz.play.translatePrompt')}
              </Text>
              <Text className="text-display font-bold text-text-primary">
                {currentQuestion.term}
              </Text>
            </>
          ) : answerState === 'unanswered' ? (
            <Text className="text-center text-h3 font-semibold text-text-primary">
              {t('quiz.play.guessWhoPrompt')}
            </Text>
          ) : null}
        </View>

        {answerState === 'checking' ? (
          <View className="mt-6 items-center gap-2 px-5">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="text-center text-body-sm text-text-secondary">
              {t('quiz.play.checking')}
            </Text>
          </View>
        ) : null}

        {question.type !== 'guess_who' ? (
          <View className="gap-3 px-5">
            {question.freeTextEligible ? (
              <View testID="quiz-free-text-input">
                <Text className="mb-2 text-body-sm text-text-secondary">
                  {t('quiz.play.typeYourAnswer')}
                </Text>
                <TextInput
                  testID="quiz-free-text-field"
                  className="rounded-card bg-surface-elevated px-4 py-4 text-body text-text-primary"
                  placeholder={t('quiz.play.typeYourAnswerPlaceholder')}
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
                    {t('quiz.play.submit')}
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
                    option,
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
                      option,
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
            {answerState === 'correct' ? (
              <View className="mb-4 items-center">
                <View className="-mb-8 -mt-10">
                  <PolarStar testID="quiz-correct-celebration" />
                </View>
                <Text className="mt-3 text-center text-h3 font-bold text-success">
                  {question.type === 'guess_who'
                    ? t('quiz.play.foundThemClues', {
                        count: guessWhoCluesUsed,
                      })
                    : t('quiz.play.discoveredIt')}
                </Text>
                {revealedAnswer ? (
                  <Text
                    className="mt-1 text-center text-h2 font-bold text-text-primary"
                    testID="quiz-revealed-answer"
                  >
                    {revealedAnswer}
                  </Text>
                ) : null}
                <Text className="mt-1 text-center text-body-sm text-text-secondary">
                  {isFinalQuestion
                    ? roundAutoSaved
                      ? t('quiz.play.savedReady')
                      : t('quiz.play.savingResult')
                    : t('quiz.play.lockedIn')}
                </Text>
              </View>
            ) : question.type === 'guess_who' ? (
              <View className="mb-3">
                <Text className="text-center text-h3 font-semibold text-text-primary">
                  {t('quiz.play.goodTry')}
                </Text>
                {/* [F-Q-07] Reveal the person's name after wrong/skip */}
                {correctAnswer ? (
                  <Text className="mt-1 text-center text-body-sm text-text-secondary">
                    {t('quiz.play.theAnswerWas')}
                    <Text className="font-bold text-success">
                      {correctAnswer}
                    </Text>
                  </Text>
                ) : null}
              </View>
            ) : null}
            {currentQuestion.funFact ? (
              <View className="rounded-card bg-surface p-4">
                <Text className="text-body-sm text-text-secondary">
                  {currentQuestion.funFact}
                </Text>
              </View>
            ) : null}
            <Text
              className="mt-3 text-center text-caption text-text-secondary"
              testID="quiz-answer-feedback"
            >
              {showContinueHint
                ? t('quiz.play.readyForNext')
                : answerState === 'correct'
                  ? t('quiz.play.correct')
                  : t('quiz.play.notQuite')}
            </Text>
            {isFinalQuestion && roundAutoSaved ? (
              <View className="mt-4 gap-3">
                <Pressable
                  onPress={(event) => {
                    event?.stopPropagation?.();
                    handleSeeResults();
                  }}
                  className="min-h-[48px] items-center justify-center rounded-button bg-primary px-5 py-3"
                  accessibilityRole="button"
                  accessibilityLabel="See quiz results"
                  testID="quiz-final-see-results"
                >
                  <Text className="text-body font-semibold text-text-inverse">
                    {t('quiz.play.seeResults')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={(event) => {
                    event?.stopPropagation?.();
                    handleOneMore();
                  }}
                  className="min-h-[48px] items-center justify-center rounded-button bg-surface px-5 py-3"
                  accessibilityRole="button"
                  accessibilityLabel="Start one more quiz"
                  testID="quiz-final-one-more"
                >
                  <Text className="text-body font-semibold text-text-primary">
                    {t('quiz.play.oneMore')}
                  </Text>
                </Pressable>
              </View>
            ) : roundAutoSaveStarted ? (
              <Text className="mt-4 text-center text-body-sm text-text-secondary">
                {t('quiz.play.savingRound')}
              </Text>
            ) : !isFinalQuestion ? (
              <Pressable
                onPress={(event) => {
                  event?.stopPropagation?.();
                  handleContinue();
                }}
                className="mt-4 min-h-[48px] items-center justify-center rounded-button bg-primary px-5 py-3"
                accessibilityRole="button"
                accessibilityLabel="Next question"
                testID="quiz-next-question"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('quiz.play.nextQuestion')}
                </Text>
              </Pressable>
            ) : null}
            {/* [BUG-469] Dispute button — lets user flag LLM's judgment as wrong */}
            {/* [BUG-927] Only surface dispute UI on incorrect answers. There's
                nothing to dispute on a correct response, and showing the link
                pollutes triage with noise on clearly-correct answers. */}
            {answerState === 'wrong' && !disputedIndices.has(currentIndex) ? (
              <Pressable
                onPress={handleDispute}
                className="mt-2 items-center py-1"
                testID="quiz-dispute-button"
                accessibilityRole="button"
                accessibilityLabel="Dispute this answer"
              >
                <Text className="text-caption text-text-secondary underline">
                  {t('quiz.play.notQuiteRight')}
                </Text>
              </Pressable>
            ) : answerState === 'wrong' && disputedIndices.has(currentIndex) ? (
              <Text
                className="mt-2 text-center text-caption text-text-secondary"
                testID="quiz-dispute-noted"
              >
                {t('quiz.play.disputeNoted')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {completeRound.isPending ? (
          <View className="mt-6 items-center gap-2 px-5">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="text-center text-body-sm text-text-secondary">
              {t('quiz.play.scoringRound')}
            </Text>
          </View>
        ) : null}

        {completeError ? (
          <View className="mt-6 px-5" testID="quiz-play-error">
            <View className="rounded-card bg-surface p-4">
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('quiz.play.couldNotSave')}
              </Text>
              <Text className="mt-1 text-body-sm text-text-secondary">
                {completeError}
              </Text>
              <View className="mt-3 flex-row gap-3">
                <Pressable
                  onPress={() => submitRound()}
                  className="flex-1 min-h-[44px] items-center justify-center rounded-button bg-primary px-4 py-2"
                  accessibilityRole="button"
                  accessibilityLabel={t('common.retry')}
                  testID="quiz-play-retry"
                >
                  <Text className="text-body-sm font-semibold text-text-inverse">
                    {t('common.retry')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleQuit}
                  className="flex-1 min-h-[44px] items-center justify-center rounded-button bg-surface-elevated px-4 py-2"
                  accessibilityRole="button"
                  accessibilityLabel={t('quiz.play.exit')}
                  testID="quiz-play-exit"
                >
                  <Text className="text-body-sm font-semibold text-text-primary">
                    {t('quiz.play.exit')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </Pressable>

      {/* [BUG-892] Quit confirmation rendered as an in-app Modal so web does
          not hit window.confirm via Alert.alert mapping (which freezes the
          renderer). Mirrors the BUG-553 withdraw-consent pattern. */}
      <Modal
        visible={quitConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQuitConfirmVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-center items-center px-6"
          onPress={() => setQuitConfirmVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          testID="quiz-quit-modal-backdrop"
        >
          <Pressable
            className="bg-background rounded-2xl w-full max-w-sm p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-h3 font-bold text-text-primary text-center">
              {hasAnsweredQuestions
                ? t('quiz.play.pauseHere')
                : t('quiz.play.leaveQuiz')}
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-3 leading-relaxed">
              {hasAnsweredQuestions
                ? t('quiz.play.pauseBody')
                : t('quiz.play.leaveBody')}
            </Text>
            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => setQuitConfirmVisible(false)}
                className="bg-primary rounded-button py-3 items-center min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel={
                  hasAnsweredQuestions
                    ? t('quiz.play.oneMore')
                    : t('quiz.play.keepPlaying')
                }
                testID="quiz-quit-cancel"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {hasAnsweredQuestions
                    ? t('quiz.play.oneMore')
                    : t('quiz.play.keepPlaying')}
                </Text>
              </Pressable>
              {hasAnsweredQuestions ? (
                <Pressable
                  onPress={handleSaveAndQuit}
                  className="bg-surface rounded-button py-3 items-center min-h-[48px] justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Save progress and finish round"
                  testID="quiz-quit-save"
                >
                  <Text className="text-body font-semibold text-text-primary">
                    {t('quiz.play.saveAndFinish')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleConfirmQuit}
                className="rounded-button py-3 items-center min-h-[48px] justify-center bg-surface"
                accessibilityRole="button"
                accessibilityLabel={
                  hasAnsweredQuestions
                    ? t('quiz.play.leaveWithoutSaving')
                    : t('quiz.play.leaveQuizButton')
                }
                testID="quiz-quit-confirm"
              >
                <Text className="text-body font-semibold text-danger">
                  {hasAnsweredQuestions
                    ? t('quiz.play.leaveWithoutSaving')
                    : t('quiz.play.leaveQuizButton')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
