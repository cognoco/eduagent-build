import { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChatShell,
  animateResponse,
  type ChatMessage,
} from '../../../components/session';
import { useSendInterviewMessage } from '../../../hooks/use-interview';

const OPENING_MESSAGE =
  "Hi! I'm your learning coach. I'd like to get to know you a bit before we start. What made you interested in learning this subject?";

export default function InterviewScreen() {
  const { subjectId, subjectName } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
  }>();
  const router = useRouter();
  const sendInterview = useSendInterviewMessage(subjectId ?? '');

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'ai', content: OPENING_MESSAGE },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming || !subjectId) return;

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: text },
      ]);

      try {
        const result = await sendInterview.mutateAsync(text);
        animateResponse(result.response, setMessages, setIsStreaming, () => {
          if (result.isComplete) {
            setInterviewComplete(true);
          }
        });
      } catch {
        animateResponse(
          "I'm having trouble connecting right now. Please try again.",
          setMessages,
          setIsStreaming
        );
      }
    },
    [isStreaming, subjectId, sendInterview]
  );

  return (
    <ChatShell
      title={`Interview: ${subjectName ?? 'New Subject'}`}
      messages={messages}
      onSend={handleSend}
      isStreaming={isStreaming}
      inputDisabled={interviewComplete}
      footer={
        interviewComplete ? (
          <View className="bg-coaching-card rounded-card p-4 mt-2 mb-4">
            <Text className="text-body font-semibold text-text-primary mb-2">
              Interview complete!
            </Text>
            <Text className="text-body-sm text-text-secondary mb-3">
              Your personalized curriculum is ready.
            </Text>
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: '/(learner)/onboarding/curriculum-review',
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
        ) : undefined
      }
    />
  );
}
