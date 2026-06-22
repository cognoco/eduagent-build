import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChatShell,
  animateResponse,
  type ChatMessage,
} from '../../../components/session/ChatShell';
import {
  RemediationCard,
  type RetentionStatus,
} from '../../../components/progress';
import { useSubmitRecallTest } from '../../../hooks/use-retention';
import { useResolveTopicSubject } from '../../../hooks/use-progress';
import { classifyApiError } from '../../../lib/format-api-error';
import { platformAlert } from '../../../lib/platform-alert';
import { ErrorFallback } from '../../../components/common';
import { goBackOrReplace } from '../../../lib/navigation';
import { useEnsureStudyMode } from '../../../lib/use-mode-switch';

const OPENING_MESSAGE: ChatMessage = {
  id: 'ai-opening',
  role: 'assistant',
  content:
    "What comes to mind about this topic? Just share what you remember \u2014 there's no wrong answer.",
};

const DONT_REMEMBER_FALLBACK_HINT =
  "That's okay — let's see what you do remember. Here's a small hint: think about the main idea or first step tied to this topic. Does anything come back?";

function deriveStatus(retentionStatus?: string): RetentionStatus {
  if (retentionStatus === 'strong') return 'strong';
  if (retentionStatus === 'fading') return 'fading';
  if (retentionStatus === 'forgotten') return 'forgotten';
  return 'weak';
}

export default function RecallTestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    topicId,
    subjectId: paramSubjectId,
    topicName,
  } = useLocalSearchParams<{
    topicId: string;
    subjectId: string;
    topicName?: string;
  }>();

  // [LEARN-14] Recall deep links may omit subjectId. Resolve from topicId so
  // the Relearn CTA can route correctly; matches the F-009 pattern in
  // topic/[topicId].tsx.
  const needsResolve = !paramSubjectId && !!topicId;
  const { data: resolved } = useResolveTopicSubject(
    needsResolve ? topicId : undefined,
  );
  const subjectId = paramSubjectId || resolved?.subjectId;

  const submitRecallTest = useSubmitRecallTest();
  const ensureStudyMode = useEnsureStudyMode();

  // /library belongs to STUDY_TABS. V1 family-mode users would land outside
  // their tab shape if we routed there directly; ensureStudyMode auto-
  // switches them to study mode first so the destination is in their
  // navigation surface.
  const goToLibrary = useCallback(
    () => ensureStudyMode(() => goBackOrReplace(router, '/(app)/library')),
    [ensureStudyMode, router],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([OPENING_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [dontRememberCount, setDontRememberCount] = useState(0);
  const [dontRememberPending, setDontRememberPending] = useState(false);
  const [remediationData, setRemediationData] = useState<{
    cooldownEndsAt?: string;
    retentionStatus: RetentionStatus;
  } | null>(null);
  const [submissionTimedOut, setSubmissionTimedOut] = useState(false);

  const cleanupRef = useRef<(() => void) | null>(null);
  const dontRememberPendingRef = useRef(false);
  const submissionInFlightRef = useRef(false);
  // [F-172] Single shared gate that prevents handleSend and handleDontRemember
  // from racing each other. Both handlers check and set this before firing.
  const anySubmissionInFlightRef = useRef(false);
  const releaseSubmissionBlock = useCallback(() => {
    submissionInFlightRef.current = false;
    anySubmissionInFlightRef.current = false;
  }, []);
  const releaseDontRememberBlock = useCallback(() => {
    dontRememberPendingRef.current = false;
    anySubmissionInFlightRef.current = false;
  }, []);
  // Token bumped whenever the user abandons an in-flight submission (timeout
  // retry). Callbacks captured by an older mutate() check this before applying
  // state so a late-arriving response cannot mutate the UI the user has
  // already left behind.
  const submissionTokenRef = useRef(0);

  // Hard timeout: if a submission stays pending beyond 30s the network or
  // backend is hung — surface an actionable timeout state so the user is
  // never stuck waiting for a reply that never arrives.
  useEffect(() => {
    if (!submitRecallTest.isPending) return;
    const timer = setTimeout(() => setSubmissionTimedOut(true), 30_000);
    return () => clearTimeout(timer);
  }, [submitRecallTest.isPending]);

  // [PERF-879] Cancel any in-flight animateResponse interval on unmount so it
  // cannot tick setMessages/setIsStreaming after the screen is gone (leak +
  // state-update-after-unmount warning). Capture the ref object so the cleanup
  // reads the latest stored cleanup fn at teardown.
  useEffect(() => {
    const ref = cleanupRef;
    return () => ref.current?.();
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (!topicId) return;
      if (
        anySubmissionInFlightRef.current ||
        submissionInFlightRef.current ||
        isStreaming
      )
        return;
      anySubmissionInFlightRef.current = true;
      submissionInFlightRef.current = true;

      // Add user message
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);

      const token = ++submissionTokenRef.current;
      submitRecallTest.mutate(
        { topicId, answer: text },
        {
          onSuccess: (result) => {
            if (token !== submissionTokenRef.current) return;
            if (result.passed) {
              // Success — animate a congratulatory response
              cleanupRef.current = animateResponse(
                t('topic.recallTest.successMessage'),
                setMessages,
                setIsStreaming,
                () => {
                  setInputDisabled(true);
                  releaseSubmissionBlock();
                },
              );
            } else if (result.failureAction === 'feedback_only') {
              // Under 3 failures — encourage retry
              cleanupRef.current = animateResponse(
                t('topic.recallTest.partialResult'),
                setMessages,
                setIsStreaming,
                releaseSubmissionBlock,
              );
            } else if (result.failureAction === 'redirect_to_library') {
              // 3+ failures — show remediation card
              cleanupRef.current = animateResponse(
                t('topic.recallTest.needsReview'),
                setMessages,
                setIsStreaming,
                () => {
                  setInputDisabled(true);
                  setRemediationData({
                    cooldownEndsAt: result.remediation?.cooldownEndsAt,
                    retentionStatus: deriveStatus(
                      result.remediation?.retentionStatus,
                    ),
                  });
                  releaseSubmissionBlock();
                },
              );
            }
          },
          onError: (err: Error) => {
            if (token !== submissionTokenRef.current) return;
            releaseSubmissionBlock();
            // UX-DE-L8: error is not an AI reply
            platformAlert(
              t('topic.recallTest.errorTitle'),
              classifyApiError(err).message,
            );
          },
        },
      );
    },
    [isStreaming, releaseSubmissionBlock, submitRecallTest, topicId, t],
  );

  const handleReviewRetest = useCallback(() => {
    // Reset state and try again
    setMessages([OPENING_MESSAGE]);
    setInputDisabled(false);
    setDontRememberCount(0);
    setRemediationData(null);
  }, []);

  const handleRelearnTopic = useCallback(() => {
    if (!topicId) return;
    // [LEARN-14] If subjectId is still unresolved (deep link without it +
    // resolver hasn't returned), route to relearn anyway — the relearn screen
    // falls back to its subject picker phase, giving the user an actionable
    // recovery instead of a silent no-op tap. UX Resilience: never silent.
    router.push({
      pathname: '/(app)/topic/relearn',
      params: {
        topicId,
        ...(subjectId ? { subjectId } : {}),
        ...(topicName ? { topicName } : {}),
      },
    });
  }, [router, topicId, subjectId, topicName]);

  const handleDontRemember = useCallback(() => {
    if (!topicId) return;
    if (
      anySubmissionInFlightRef.current ||
      dontRememberPendingRef.current ||
      isStreaming
    )
      return;
    anySubmissionInFlightRef.current = true;
    dontRememberPendingRef.current = true;
    setDontRememberPending(true);

    const nextCount = dontRememberCount + 1;
    setDontRememberCount(nextCount);

    const userMsg: ChatMessage = {
      id: `user-idr-${Date.now()}`,
      role: 'user',
      content:
        nextCount === 1
          ? t('topic.recallTest.dontRememberFirst')
          : t('topic.recallTest.dontRememberAgain'),
    };
    setMessages((prev) => [...prev, userMsg]);

    const token = ++submissionTokenRef.current;
    submitRecallTest.mutate(
      { topicId, attemptMode: 'dont_remember' },
      {
        onSuccess: (result) => {
          if (token !== submissionTokenRef.current) return;
          setDontRememberPending(false);
          if (
            result.failureAction === 'redirect_to_library' ||
            nextCount >= 2
          ) {
            cleanupRef.current = animateResponse(
              "Thanks for saying that honestly. Let's switch to review so this feels doable again.",
              setMessages,
              setIsStreaming,
              () => {
                setInputDisabled(true);
                setRemediationData({
                  cooldownEndsAt: result.remediation?.cooldownEndsAt,
                  retentionStatus: deriveStatus(
                    result.remediation?.retentionStatus,
                  ),
                });
                releaseDontRememberBlock();
              },
            );
            return;
          }

          cleanupRef.current = animateResponse(
            result.hint ?? DONT_REMEMBER_FALLBACK_HINT,
            setMessages,
            setIsStreaming,
            releaseDontRememberBlock,
          );
        },
        onError: (err: Error) => {
          if (token !== submissionTokenRef.current) return;
          // [F-172] Use releaseDontRememberBlock to also clear the shared
          // anySubmissionInFlightRef gate; manual flag reset was missing it.
          releaseDontRememberBlock();
          setDontRememberPending(false);
          setDontRememberCount((prev) => Math.max(prev - 1, 0));
          // UX-DE-L8: error is not an AI reply
          platformAlert(
            t('topic.recallTest.errorTitle'),
            classifyApiError(err).message,
          );
        },
      },
    );
  }, [
    dontRememberCount,
    isStreaming,
    releaseDontRememberBlock,
    submitRecallTest,
    topicId,
    t,
  ]);

  if (!topicId) {
    return (
      <ErrorFallback
        variant="centered"
        title={t('topic.recallTest.missingTitle')}
        message={t('topic.recallTest.missingMessage')}
        primaryAction={{
          label: t('topic.recallTest.goToLibrary'),
          onPress: goToLibrary,
          testID: 'recall-test-missing-topic',
        }}
      />
    );
  }

  if (submissionTimedOut) {
    return (
      <ErrorFallback
        variant="centered"
        title={t('topic.recallTest.timeoutTitle')}
        message={t('topic.recallTest.timeoutMessage')}
        primaryAction={{
          label: t('common.tryAgain'),
          onPress: () => {
            // Invalidate the hung submission so its late-arriving callbacks
            // cannot mutate state after the user has dismissed the timeout
            // screen and resumed typing.
            submissionTokenRef.current += 1;
            releaseSubmissionBlock();
            releaseDontRememberBlock();
            setDontRememberPending(false);
            submitRecallTest.reset();
            setSubmissionTimedOut(false);
          },
          testID: 'recall-test-timeout-retry',
        }}
        secondaryAction={{
          label: t('topic.recallTest.goToLibrary'),
          onPress: goToLibrary,
          testID: 'recall-test-timeout-back',
        }}
        testID="recall-test-timeout"
      />
    );
  }

  const footer = remediationData ? (
    <RemediationCard
      retentionStatus={remediationData.retentionStatus}
      cooldownEndsAt={remediationData.cooldownEndsAt}
      onReviewRetest={handleReviewRetest}
      onRelearnTopic={handleRelearnTopic}
      onBookPress={() => router.push('/(app)/library')}
    />
  ) : inputDisabled ? (
    <View className="mt-4 items-center px-4">
      <Text className="text-body-sm text-text-secondary text-center mb-3">
        {t('topic.recallTest.successPrompt')}
      </Text>
      <Pressable
        onPress={goToLibrary}
        className="bg-primary rounded-button px-6 py-3 items-center"
        accessibilityRole="button"
        accessibilityLabel={t('topic.recallTest.goToLibrary')}
        testID="recall-test-success-go-library"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {t('topic.recallTest.goToLibrary')}
        </Text>
      </Pressable>
    </View>
  ) : undefined;

  const inputAccessory = !inputDisabled ? (
    <View className="px-4 pt-3 bg-surface border-t border-surface-elevated">
      <Pressable
        onPress={handleDontRemember}
        disabled={dontRememberPending || isStreaming}
        className="self-start rounded-button px-4 py-2 bg-surface-elevated"
        testID="recall-dont-remember-button"
        accessibilityRole="button"
        accessibilityLabel={
          dontRememberCount > 0
            ? t('topic.recallTest.stillStuck')
            : t('topic.recallTest.dontRemember')
        }
      >
        <Text className="text-body-sm font-medium text-text-primary">
          {dontRememberCount > 0
            ? t('topic.recallTest.stillStuck')
            : t('topic.recallTest.dontRemember')}
        </Text>
      </Pressable>
    </View>
  ) : undefined;

  return (
    <View testID="recall-test-screen" style={{ flex: 1 }}>
      <ChatShell
        title={t('topic.recallTest.title')}
        subtitle={t('topic.recallTest.subtitle')}
        messages={messages}
        onSend={handleSend}
        isStreaming={isStreaming}
        inputDisabled={inputDisabled}
        footer={footer}
        inputAccessory={inputAccessory}
        placeholder={t('topic.recallTest.inputPlaceholder')}
        messagesTestID="recall-messages"
        backFallback="/(app)/library"
      />
    </View>
  );
}
