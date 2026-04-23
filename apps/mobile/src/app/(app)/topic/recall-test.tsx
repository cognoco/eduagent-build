import { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
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
import { classifyApiError } from '../../../lib/format-api-error';
import { platformAlert } from '../../../lib/platform-alert';
import { ErrorFallback } from '../../../components/common';
import { goBackOrReplace } from '../../../lib/navigation';

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
  const router = useRouter();
  const { topicId, subjectId, topicName } = useLocalSearchParams<{
    topicId: string;
    subjectId: string;
    topicName?: string;
  }>();

  const submitRecallTest = useSubmitRecallTest();

  const [messages, setMessages] = useState<ChatMessage[]>([OPENING_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [dontRememberCount, setDontRememberCount] = useState(0);
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
                "Nice \u2014 your memory of this is solid! Head back to your Library whenever you're ready.",
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
            } else if (result.failureAction === 'redirect_to_library') {
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
          onError: (err: Error) => {
            // UX-DE-L8: error is not an AI reply
            platformAlert(
              'Something went wrong',
              classifyApiError(err).message
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
    setDontRememberCount(0);
    setRemediationData(null);
  }, []);

  const handleRelearnTopic = useCallback(() => {
    if (!topicId || !subjectId) return;
    router.push({
      pathname: '/(app)/topic/relearn',
      params: { topicId, subjectId, ...(topicName ? { topicName } : {}) },
    });
  }, [router, topicId, subjectId, topicName]);

  const handleDontRemember = useCallback(() => {
    if (!topicId) return;

    const nextCount = dontRememberCount + 1;
    setDontRememberCount(nextCount);

    const userMsg: ChatMessage = {
      id: `user-idr-${Date.now()}`,
      role: 'user',
      content: nextCount === 1 ? "I don't remember." : 'Still stuck.',
    };
    setMessages((prev) => [...prev, userMsg]);

    submitRecallTest.mutate(
      { topicId, attemptMode: 'dont_remember' },
      {
        onSuccess: (result) => {
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
                  failureCount: result.failureCount,
                  cooldownEndsAt: result.remediation?.cooldownEndsAt,
                  retentionStatus: deriveStatus(
                    result.remediation?.retentionStatus
                  ),
                });
              }
            );
            return;
          }

          cleanupRef.current = animateResponse(
            result.hint ?? DONT_REMEMBER_FALLBACK_HINT,
            setMessages,
            setIsStreaming
          );
        },
        onError: (err: Error) => {
          setDontRememberCount((prev) => Math.max(prev - 1, 0));
          // UX-DE-L8: error is not an AI reply
          platformAlert('Something went wrong', classifyApiError(err).message);
        },
      }
    );
  }, [dontRememberCount, submitRecallTest, topicId]);

  if (!topicId) {
    return (
      <ErrorFallback
        variant="centered"
        title="Topic not found"
        message="We couldn't load this topic. Head to the library to pick one."
        primaryAction={{
          label: 'Go to Library',
          onPress: () => goBackOrReplace(router, '/(app)/library'),
          testID: 'recall-test-missing-topic',
        }}
      />
    );
  }

  const footer = remediationData ? (
    <RemediationCard
      retentionStatus={remediationData.retentionStatus}
      failureCount={remediationData.failureCount}
      cooldownEndsAt={remediationData.cooldownEndsAt}
      onReviewRetest={handleReviewRetest}
      onRelearnTopic={handleRelearnTopic}
      isLearner
      onBookPress={() => router.push('/(app)/library')}
    />
  ) : inputDisabled ? (
    <View className="mt-4 items-center px-4">
      <Text className="text-body-sm text-text-secondary text-center mb-3">
        Head back to your Library whenever you're ready.
      </Text>
      <Pressable
        onPress={() => goBackOrReplace(router, '/(app)/library')}
        className="bg-primary rounded-button px-6 py-3 items-center"
        accessibilityRole="button"
        accessibilityLabel="Go to Library"
        testID="recall-test-success-go-library"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Go to Library
        </Text>
      </Pressable>
    </View>
  ) : undefined;

  const inputAccessory = !inputDisabled ? (
    <View className="px-4 pt-3 bg-surface border-t border-surface-elevated">
      <Pressable
        onPress={handleDontRemember}
        className="self-start rounded-button px-4 py-2 bg-surface-elevated"
        testID="recall-dont-remember-button"
        accessibilityRole="button"
        accessibilityLabel={
          dontRememberCount > 0 ? 'Still stuck' : "I don't remember"
        }
      >
        <Text className="text-body-sm font-medium text-text-primary">
          {dontRememberCount > 0 ? 'Still stuck' : "I don't remember"}
        </Text>
      </Pressable>
    </View>
  ) : undefined;

  return (
    <View testID="recall-test-screen" style={{ flex: 1 }}>
      <ChatShell
        title="Recall Check"
        subtitle="Test your memory"
        messages={messages}
        onSend={handleSend}
        isStreaming={isStreaming}
        inputDisabled={inputDisabled}
        footer={footer}
        inputAccessory={inputAccessory}
        placeholder="Explain what you remember..."
        messagesTestID="recall-messages"
        backFallback="/(app)/library"
      />
    </View>
  );
}
