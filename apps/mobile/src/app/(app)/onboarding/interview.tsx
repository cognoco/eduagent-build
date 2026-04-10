import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChatShell,
  LivingBook,
  type ChatMessage,
} from '../../../components/session';
import {
  useInterviewState,
  useStreamInterviewMessage,
} from '../../../hooks/use-interview';
import { formatApiError } from '../../../lib/format-api-error';

const OPENING_MESSAGE =
  "Hi! I'm your learning mate. I'd like to get to know you a bit before we start. What made you interested in learning this subject?";

export default function InterviewScreen() {
  const { subjectId, subjectName, bookId, bookTitle } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
    bookId?: string;
    bookTitle?: string;
  }>();
  const router = useRouter();
  const interviewState = useInterviewState(subjectId ?? '');
  const {
    stream: streamInterview,
    abort: abortStream,
    isStreaming: isStreamingSSE,
  } = useStreamInterviewMessage(subjectId ?? '', bookId);

  const openingMessage = bookTitle
    ? `Hi! I'm your learning mate. Let's talk about ${bookTitle}! What do you already know about it, and what are you most curious to learn?`
    : OPENING_MESSAGE;

  const goToCurriculum = useCallback(() => {
    router.replace({
      pathname: '/(app)/onboarding/curriculum-review',
      params: {
        subjectId,
        ...(bookId ? { bookId } : {}),
      },
    } as never);
  }, [bookId, router, subjectId]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'assistant', content: openingMessage },
  ]);
  const isStreaming = isStreamingSSE;
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const seededDraftRef = useRef(false);

  // Count user messages for the Living Book page counter
  const exchangeCount = useMemo(
    () => messages.filter((m) => m.role === 'user').length,
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
  }, [interviewState.data, interviewState.isLoading]);

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
      Alert.alert('Could not restart interview', formatApiError(err));
    }
  }, [abortStream, openingMessage]);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming || !subjectId || restartRequired || streamError) return;

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

  return (
    <ChatShell
      title={
        bookTitle
          ? `Interview: ${bookTitle}`
          : `Interview: ${subjectName ?? 'New Subject'}`
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
          onPress={interviewComplete ? goToCurriculum : undefined}
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
              onPress={goToCurriculum}
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
              onPress={() => setStreamError(null)}
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
