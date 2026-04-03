import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
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
  const { subjectId, subjectName } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
  }>();
  const router = useRouter();
  const interviewState = useInterviewState(subjectId ?? '');
  const {
    stream: streamInterview,
    abort: abortStream,
    isStreaming: isStreamingSSE,
  } = useStreamInterviewMessage(subjectId ?? '');

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'ai', content: OPENING_MESSAGE },
  ]);
  const isStreaming = isStreamingSSE;
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const seededDraftRef = useRef(false);

  // Count user messages for the Living Book page counter
  const exchangeCount = useMemo(
    () => messages.filter((m) => m.role === 'user').length,
    [messages]
  );

  useEffect(() => {
    seededDraftRef.current = false;
    setMessages([{ id: 'opening', role: 'ai', content: OPENING_MESSAGE }]);
    setInterviewComplete(false);
    setRestartRequired(false);
  }, [subjectId]);

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
          role: exchange.role === 'assistant' ? 'ai' : 'user',
          content: exchange.content,
        })
      ) ?? [];

    if (state.status === 'completed') {
      setMessages(
        mappedHistory.length > 0
          ? mappedHistory
          : [{ id: 'opening', role: 'ai', content: OPENING_MESSAGE }]
      );
      setInterviewComplete(true);
      seededDraftRef.current = true;
      return;
    }

    if (state.status === 'expired') {
      setMessages([
        {
          id: 'expired',
          role: 'ai',
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
          role: 'ai',
          content: `Continue your interview? ${resumePrompt}`,
        },
      ]);
    }

    seededDraftRef.current = true;
  }, [interviewState.data, interviewState.isLoading]);

  const handleRestartInterview = useCallback(() => {
    abortStream();
    setMessages([{ id: 'opening', role: 'ai', content: OPENING_MESSAGE }]);
    setInterviewComplete(false);
    setRestartRequired(false);
    seededDraftRef.current = true;
  }, [abortStream]);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming || !subjectId || restartRequired) return;

      const streamMsgId = `ai-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: text },
        { id: streamMsgId, role: 'ai', content: '', streaming: true },
      ]);

      try {
        await streamInterview(
          text,
          (accumulated) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId ? { ...m, content: accumulated } : m
              )
            );
          },
          (result) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId ? { ...m, streaming: false } : m
              )
            );
            if (result.isComplete) {
              setInterviewComplete(true);
            }
          }
        );
      } catch (err: unknown) {
        // On stream error, replace the streaming placeholder with error text
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamMsgId
              ? { ...m, content: formatApiError(err), streaming: false }
              : m
          )
        );
      }
    },
    [isStreaming, restartRequired, subjectId, streamInterview]
  );

  return (
    <ChatShell
      title={`Interview: ${subjectName ?? 'New Subject'}`}
      messages={messages}
      onSend={handleSend}
      isStreaming={isStreaming}
      inputDisabled={interviewComplete || restartRequired}
      rightAction={
        <LivingBook
          exchangeCount={exchangeCount}
          isComplete={interviewComplete}
          persona="learner"
        />
      }
      footer={
        interviewComplete ? (
          <View className="bg-coaching-card rounded-card p-4 mt-2 mb-4">
            <Text className="text-body font-semibold text-text-primary mb-2">
              Your book is ready!
            </Text>
            <Text className="text-body-sm text-text-secondary mb-3">
              Your personalized curriculum is ready.
            </Text>
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: '/(learner)/onboarding/analogy-preference',
                  params: { subjectId },
                } as never)
              }
              className="bg-primary rounded-button py-3 items-center"
              testID="view-curriculum-button"
              accessibilityLabel="View curriculum"
              accessibilityRole="button"
            >
              <Text className="text-text-inverse text-body font-semibold">
                View Curriculum
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
