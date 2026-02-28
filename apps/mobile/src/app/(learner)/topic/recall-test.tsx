import { useState, useCallback, useRef } from 'react';
import { View, Text } from 'react-native';
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

const OPENING_MESSAGE: ChatMessage = {
  id: 'ai-opening',
  role: 'ai',
  content:
    "What comes to mind about this topic? Just share what you remember \u2014 there's no wrong answer.",
};

function deriveStatus(retentionStatus?: string): RetentionStatus {
  if (retentionStatus === 'strong') return 'strong';
  if (retentionStatus === 'fading') return 'fading';
  if (retentionStatus === 'forgotten') return 'forgotten';
  return 'weak';
}

export default function RecallTestScreen() {
  const router = useRouter();
  const { topicId, subjectId } = useLocalSearchParams<{
    topicId: string;
    subjectId: string;
  }>();

  const submitRecallTest = useSubmitRecallTest();

  const [messages, setMessages] = useState<ChatMessage[]>([OPENING_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [remediationData, setRemediationData] = useState<{
    failureCount: number;
    cooldownEndsAt?: string;
    retentionStatus: RetentionStatus;
  } | null>(null);

  const cleanupRef = useRef<(() => void) | null>(null);

  const handleSend = useCallback(
    (text: string) => {
      if (!topicId) return;

      // Add user message
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);

      submitRecallTest.mutate(
        { topicId, answer: text },
        {
          onSuccess: (result) => {
            if (result.passed) {
              // Success — animate a congratulatory response
              cleanupRef.current = animateResponse(
                "Nice \u2014 your memory of this is solid! Head back to your Learning Book whenever you're ready.",
                setMessages,
                setIsStreaming,
                () => {
                  setInputDisabled(true);
                }
              );
            } else if (result.failureAction === 'feedback_only') {
              // Under 3 failures — encourage retry
              cleanupRef.current = animateResponse(
                "Not quite there yet, but that's okay! Think about the key concepts and try explaining again. What stands out most to you?",
                setMessages,
                setIsStreaming
              );
            } else if (result.failureAction === 'redirect_to_learning_book') {
              // 3+ failures — show remediation card
              cleanupRef.current = animateResponse(
                "It looks like this topic needs some more work. Don't worry — that's completely normal! Let's find a better approach for you.",
                setMessages,
                setIsStreaming,
                () => {
                  setInputDisabled(true);
                  setRemediationData({
                    failureCount: result.failureCount,
                    cooldownEndsAt: result.remediation?.cooldownEndsAt,
                    retentionStatus: deriveStatus(
                      result.remediation?.retentionStatus
                    ),
                  });
                }
              );
            }
          },
          onError: () => {
            cleanupRef.current = animateResponse(
              'Something went wrong while checking your recall. Please try again.',
              setMessages,
              setIsStreaming
            );
          },
        }
      );
    },
    [topicId, submitRecallTest]
  );

  const handleReviewRetest = useCallback(() => {
    // Reset state and try again
    setMessages([OPENING_MESSAGE]);
    setInputDisabled(false);
    setRemediationData(null);
  }, []);

  const handleRelearnTopic = useCallback(() => {
    if (!topicId || !subjectId) return;
    router.push({
      pathname: '/(learner)/topic/relearn',
      params: { topicId, subjectId },
    });
  }, [router, topicId, subjectId]);

  const footer = remediationData ? (
    <RemediationCard
      retentionStatus={remediationData.retentionStatus}
      failureCount={remediationData.failureCount}
      cooldownEndsAt={remediationData.cooldownEndsAt}
      onReviewRetest={handleReviewRetest}
      onRelearnTopic={handleRelearnTopic}
    />
  ) : inputDisabled ? (
    <View className="mt-4 items-center">
      <Text className="text-body-sm text-text-secondary">
        Head back to your Learning Book whenever you're ready.
      </Text>
    </View>
  ) : undefined;

  return (
    <ChatShell
      title="Recall Check"
      subtitle="Test your memory"
      messages={messages}
      onSend={handleSend}
      isStreaming={isStreaming}
      inputDisabled={inputDisabled}
      footer={footer}
      placeholder="Explain what you remember..."
    />
  );
}
