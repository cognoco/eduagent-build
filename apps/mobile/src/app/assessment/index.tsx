import { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChatShell,
  animateResponse,
  type ChatMessage,
} from '../../components/session';
import {
  useCreateAssessment,
  useSubmitAnswer,
} from '../../hooks/use-assessments';
import { formatApiError } from '../../lib/format-api-error';
import { goBackOrReplace } from '../../lib/navigation';
import { Button } from '../../components/common/Button';
import { ErrorFallback } from '../../components/common/ErrorFallback';

const OPENING_MESSAGE =
  "Let's see what you've picked up so far. I'll ask a few questions — just do your best, and I'll help fill in any gaps.";

export default function AssessmentScreen() {
  const router = useRouter();
  const { subjectId, topicId } = useLocalSearchParams<{
    subjectId?: string;
    topicId?: string;
  }>();

  const createAssessment = useCreateAssessment(subjectId ?? '', topicId ?? '');
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const submitAnswer = useSubmitAnswer(assessmentId ?? '');

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'assistant', content: OPENING_MESSAGE },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastUserText, setLastUserText] = useState<string | null>(null);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming || !subjectId || !topicId) return;

      setLastError(null);
      setLastUserText(text);
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: text },
      ]);

      try {
        let currentAssessmentId = assessmentId;
        if (!currentAssessmentId) {
          const created = await createAssessment.mutateAsync();
          currentAssessmentId = created.assessment.id;
          setAssessmentId(currentAssessmentId);
        }

        const result = await submitAnswer.mutateAsync({ answer: text });
        const evaluation = result.evaluation;
        const feedback = evaluation.feedback;
        const passed = evaluation.passed;

        animateResponse(feedback, setMessages, setIsStreaming, () => {
          if (passed) {
            setMessages((prev) => [
              ...prev,
              {
                id: `assessment-done-${Date.now()}`,
                role: 'assistant',
                content: `You've got a solid grasp of most of this — ${Math.round(
                  evaluation.masteryScore * 100
                )}% mastery! The areas to revisit will show up in your Library.`,
              },
            ]);
          }
        });
      } catch (err: unknown) {
        const errorMessage = formatApiError(err);
        animateResponse(errorMessage, setMessages, setIsStreaming);
        setLastError(errorMessage);
      }
    },
    [
      isStreaming,
      subjectId,
      topicId,
      assessmentId,
      createAssessment,
      submitAnswer,
    ]
  );

  if (!subjectId || !topicId) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <Text className="text-text-primary text-body mb-4">
          This assessment can't be started — missing required information.
        </Text>
        <Button
          variant="primary"
          label="Go back"
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          testID="assessment-go-back"
        />
      </View>
    );
  }

  return (
    <ChatShell
      title="Knowledge Check"
      messages={messages}
      onSend={handleSend}
      isStreaming={isStreaming}
      footer={
        lastError ? (
          <ErrorFallback
            variant="card"
            title="Something went wrong"
            message={lastError}
            primaryAction={{
              label: 'Try again',
              testID: 'assessment-error-retry',
              // [UX-DE-H3] Disable retry while streaming to prevent double-submit
              // on rapid taps during an in-flight answer check.
              disabled: isStreaming,
              onPress: () => {
                if (lastUserText) {
                  void handleSend(lastUserText);
                } else {
                  setLastError(null);
                }
              },
            }}
            secondaryAction={{
              label: 'Go Home',
              testID: 'assessment-error-home',
              onPress: () => goBackOrReplace(router, '/(app)/home' as const),
            }}
          />
        ) : undefined
      }
    />
  );
}
