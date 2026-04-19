import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChatShell,
  LivingBook,
  type ChatMessage,
} from '../../../components/session';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import {
  useInterviewState,
  useStreamInterviewMessage,
  useForceCompleteInterview,
} from '../../../hooks/use-interview';
import { formatApiError } from '../../../lib/format-api-error';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';

const OPENING_MESSAGE =
  "Hi! I'm your learning mate. I'd like to get to know you a bit before we start. What made you interested in learning this subject?";

export default function InterviewScreen() {
  const {
    subjectId,
    subjectName,
    bookId,
    bookTitle,
    languageCode,
    languageName,
    step: stepParam,
    totalSteps: totalStepsParam,
  } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
    bookId?: string;
    bookTitle?: string;
    languageCode?: string;
    languageName?: string;
    step?: string;
    totalSteps?: string;
  }>();
  const router = useRouter();
  const step = Number(stepParam) || 1;
  const totalSteps = Number(totalStepsParam) || 4;

  // BUG-316: Guard against empty/missing subjectId — hooks receive empty string
  // which triggers a 404 API call. Show error state instead.
  const safeSubjectId = subjectId && subjectId.trim() ? subjectId : undefined;
  const interviewState = useInterviewState(safeSubjectId ?? '');
  const {
    stream: streamInterview,
    abort: abortStream,
    isStreaming: isStreamingSSE,
  } = useStreamInterviewMessage(safeSubjectId ?? '', bookId);
  const forceComplete = useForceCompleteInterview(safeSubjectId ?? '', bookId);

  const openingMessage = bookTitle
    ? `Hi! I'm your learning mate. Let's talk about ${bookTitle}! What do you already know about it, and what are you most curious to learn?`
    : OPENING_MESSAGE;

  const goToNextStep = useCallback(() => {
    if (!subjectId) return;

    const baseParams = {
      subjectId,
      subjectName: subjectName ?? '',
      step: String(Math.min(step + 1, totalSteps)),
      totalSteps: String(totalSteps),
    };

    if (languageCode) {
      router.replace({
        pathname: '/(app)/onboarding/language-setup',
        params: {
          ...baseParams,
          languageCode,
          languageName: languageName ?? '',
        },
      } as never);
      return;
    }

    router.replace({
      pathname: '/(app)/onboarding/analogy-preference',
      params: baseParams,
    } as never);
  }, [
    languageCode,
    languageName,
    router,
    step,
    subjectId,
    subjectName,
    totalSteps,
  ]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'assistant', content: openingMessage },
  ]);
  const isStreaming = isStreamingSSE;
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const seededDraftRef = useRef(false);
  // BUG-317: Store last sent text so Try Again can resend the orphaned message
  const lastSentTextRef = useRef<string | null>(null);

  // R-4: Exclude isAutoSent messages — consistent with session screen (BUG-373).
  // Currently no auto-sends in interview, but this prevents latent bugs.
  const exchangeCount = useMemo(
    () => messages.filter((m) => m.role === 'user' && !m.isAutoSent).length,
    [messages]
  );

  useEffect(() => {
    seededDraftRef.current = false;
    setMessages([
      { id: 'opening', role: 'assistant', content: openingMessage },
    ]);
    setInterviewComplete(false);
    setRestartRequired(false);
    setStreamError(null);
  }, [subjectId, openingMessage]);

  useEffect(() => {
    return () => {
      abortStream();
    };
  }, [abortStream]);

  useEffect(() => {
    if (seededDraftRef.current || interviewState.isLoading) {
      return;
    }

    const state = interviewState.data;
    if (!state) {
      seededDraftRef.current = true;
      return;
    }

    const mappedHistory =
      state.exchangeHistory?.map(
        (exchange, index): ChatMessage => ({
          id: `draft-${index}`,
          role: exchange.role === 'assistant' ? 'assistant' : 'user',
          content: exchange.content
            .replace(/\[INTERVIEW_COMPLETE\]/g, '')
            .trimEnd(),
        })
      ) ?? [];

    if (state.status === 'completed') {
      setMessages(
        mappedHistory.length > 0
          ? mappedHistory
          : [{ id: 'opening', role: 'assistant', content: openingMessage }]
      );
      setInterviewComplete(true);
      seededDraftRef.current = true;
      return;
    }

    if (state.status === 'expired') {
      setMessages([
        {
          id: 'expired',
          role: 'assistant',
          content: state.resumeSummary?.trim()
            ? `This interview expired after 7 days away. ${state.resumeSummary}`
            : 'This interview expired after 7 days away. Restart to begin again.',
        },
      ]);
      setRestartRequired(true);
      seededDraftRef.current = true;
      return;
    }

    if (mappedHistory.length > 0) {
      const resumePrompt =
        state.resumeSummary?.trim() ??
        'Continue your interview? We can pick up where you left off.';
      setMessages([
        ...mappedHistory,
        {
          id: 'resume',
          role: 'assistant',
          content: `Continue your interview? ${resumePrompt}`,
        },
      ]);
    }

    seededDraftRef.current = true;
  }, [interviewState.data, interviewState.isLoading, openingMessage]);

  const handleRestartInterview = useCallback(() => {
    try {
      abortStream();
      setMessages([
        { id: 'opening', role: 'assistant', content: openingMessage },
      ]);
      setInterviewComplete(false);
      setRestartRequired(false);
      setStreamError(null);
      seededDraftRef.current = true;
    } catch (err: unknown) {
      platformAlert('Could not restart interview', formatApiError(err));
    }
  }, [abortStream, openingMessage]);

  // [BUG-464] Client escape: let user skip ahead after 2+ exchanges
  const handleSkipInterview = useCallback(async () => {
    if (interviewComplete || forceComplete.isPending) return;
    try {
      abortStream();
      await forceComplete.mutateAsync();
      setInterviewComplete(true);
    } catch (err: unknown) {
      platformAlert('Could not skip ahead', formatApiError(err));
    }
  }, [interviewComplete, forceComplete, abortStream]);

  const handleSend = useCallback(
    async (text: string, { isRetry = false } = {}) => {
      if (isStreaming || !subjectId || restartRequired) return;
      // BUG-317: Skip streamError guard when called from retry — the caller
      // already cleared the error and removed orphaned messages.
      if (!isRetry && streamError) return;

      lastSentTextRef.current = text;
      const streamMsgId = `ai-${Date.now()}`;
      setStreamError(null);

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: text },
        { id: streamMsgId, role: 'assistant', content: '', streaming: true },
      ]);

      try {
        await streamInterview(
          text,
          (accumulated) => {
            // Strip the [INTERVIEW_COMPLETE] marker so it never appears in the UI
            const clean = accumulated
              .replace(/\[INTERVIEW_COMPLETE\]/g, '')
              .trimEnd();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId ? { ...m, content: clean } : m
              )
            );
          },
          (result) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId
                  ? {
                      ...m,
                      content: m.content
                        .replace(/\[INTERVIEW_COMPLETE\]/g, '')
                        .trimEnd(),
                      streaming: false,
                    }
                  : m
              )
            );
            if (result.isComplete) {
              setInterviewComplete(true);
            }
          }
        );
      } catch (err: unknown) {
        const formattedError = formatApiError(err);
        setStreamError(formattedError);
        // On stream error, replace the streaming placeholder with error text
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamMsgId
              ? { ...m, content: formattedError, streaming: false }
              : m
          )
        );
      }
    },
    [isStreaming, restartRequired, streamError, subjectId, streamInterview]
  );

  // BUG-316: Show error screen when subjectId is missing — hooks already
  // disable themselves with empty string, but the user sees a dead screen.
  if (!subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-5">
        <Text className="text-body text-text-secondary text-center mb-4">
          Missing subject information. Please go back and try again.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          testID="interview-missing-subject-back"
          accessibilityRole="button"
        >
          <Text className="text-text-primary text-body font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ChatShell
      title={
        bookTitle
          ? `Interview: ${bookTitle}`
          : `Interview: ${subjectName ?? 'New Subject'}`
      }
      headerBelow={
        <OnboardingStepIndicator step={step} totalSteps={totalSteps} />
      }
      messages={messages}
      onSend={handleSend}
      isStreaming={isStreaming}
      inputDisabled={interviewComplete || restartRequired || !!streamError}
      rightAction={
        <LivingBook
          exchangeCount={exchangeCount}
          isComplete={interviewComplete}
          isExpressive
          onPress={interviewComplete ? goToNextStep : undefined}
        />
      }
      footer={
        interviewComplete ? (
          <View className="bg-coaching-card rounded-card p-4 mt-2 mb-4">
            <Text className="text-body font-semibold text-text-primary mb-2">
              Ready to start learning!
            </Text>
            <Text className="text-body-sm text-text-secondary mb-3">
              I've built your first learning path. Review it, make any quick
              changes you want, and start learning.
            </Text>
            <Pressable
              onPress={goToNextStep}
              className="bg-primary rounded-button py-3 items-center"
              testID="view-curriculum-button"
              accessibilityLabel="Start learning"
              accessibilityRole="button"
            >
              <Text className="text-text-inverse text-body font-semibold">
                Let's Go
              </Text>
            </Pressable>
          </View>
        ) : streamError ? (
          <View
            className="bg-danger/10 rounded-card p-4 mt-2 mb-4"
            testID="interview-stream-error"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              We hit a problem
            </Text>
            <Text className="text-body-sm text-text-secondary mb-3">
              {streamError}
            </Text>
            <Pressable
              onPress={() => {
                // BUG-317: Resend the orphaned message instead of just clearing
                // the error. Remove the error AI message and the user message
                // that triggered it, then replay.
                const lastText = lastSentTextRef.current;
                setMessages((prev) => {
                  const len = prev.length;
                  // Remove trailing [user, error-assistant] pair
                  if (
                    len >= 2 &&
                    prev[len - 1]?.role === 'assistant' &&
                    prev[len - 2]?.role === 'user'
                  ) {
                    return prev.slice(0, -2);
                  }
                  // Fallback: just remove the error message
                  return prev.slice(0, -1);
                });
                setStreamError(null);
                if (lastText) {
                  void handleSend(lastText, { isRetry: true });
                }
              }}
              className="bg-primary rounded-button py-3 items-center"
              testID="interview-try-again-button"
              accessibilityLabel="Try the interview again"
              accessibilityRole="button"
            >
              <Text className="text-text-inverse text-body font-semibold">
                Try Again
              </Text>
            </Pressable>
          </View>
        ) : !interviewComplete &&
          !streamError &&
          !restartRequired &&
          exchangeCount >= 2 ? (
          <View className="px-2 mt-1 mb-2">
            <Pressable
              onPress={() => void handleSkipInterview()}
              disabled={isStreaming || forceComplete.isPending}
              className="py-2.5 items-center rounded-button"
              testID="skip-interview-button"
              accessibilityLabel="Ready to start learning"
              accessibilityRole="button"
            >
              <Text className="text-body-sm text-primary font-medium">
                {forceComplete.isPending
                  ? 'Setting up your curriculum...'
                  : "I'm ready to start learning"}
              </Text>
            </Pressable>
          </View>
        ) : restartRequired ? (
          <View className="bg-coaching-card rounded-card p-4 mt-2 mb-4">
            <Text className="text-body font-semibold text-text-primary mb-2">
              Interview expired
            </Text>
            <Text className="text-body-sm text-text-secondary mb-3">
              After 7 days away, we start fresh so your curriculum still matches
              where you are now.
            </Text>
            <Pressable
              onPress={handleRestartInterview}
              className="bg-primary rounded-button py-3 items-center"
              testID="restart-interview-button"
              accessibilityLabel="Restart interview"
              accessibilityRole="button"
            >
              <Text className="text-text-inverse text-body font-semibold">
                Restart Interview
              </Text>
            </Pressable>
          </View>
        ) : undefined
      }
    />
  );
}
