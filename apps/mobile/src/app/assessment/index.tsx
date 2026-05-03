import { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
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

export default function AssessmentScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { subjectId, topicId } = useLocalSearchParams<{
    subjectId?: string;
    topicId?: string;
  }>();

  const createAssessment = useCreateAssessment(subjectId ?? '', topicId ?? '');
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const submitAnswer = useSubmitAnswer(assessmentId ?? '');

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'opening',
      role: 'assistant',
      content: t('assessment.openingMessage'),
    },
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
                content: t('assessment.passedMessage', {
                  mastery: Math.round(evaluation.masteryScore * 100),
                }),
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
          {t('assessment.missingParams')}
        </Text>
        <Button
          variant="primary"
          label={t('common.goBack')}
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          testID="assessment-go-back"
        />
      </View>
    );
  }

  return (
    <ChatShell
      title={t('assessment.title')}
      messages={messages}
      onSend={handleSend}
      isStreaming={isStreaming}
      footer={
        lastError ? (
          <ErrorFallback
            variant="card"
            message={lastError}
            primaryAction={{
              label: t('common.tryAgain'),
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
              label: t('common.goHome'),
              testID: 'assessment-error-home',
              onPress: () => goBackOrReplace(router, '/(app)/home' as const),
            }}
          />
        ) : undefined
      }
    />
  );
}
