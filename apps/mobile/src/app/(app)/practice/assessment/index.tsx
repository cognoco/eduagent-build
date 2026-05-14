import { useState, useCallback, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AssessmentEvaluation, AssessmentStatus } from '@eduagent/schemas';
import {
  ChatShell,
  animateResponse,
  type ChatMessage,
} from '../../../../components/session';
import {
  useCreateAssessment,
  useDeclineAssessmentRefresh,
  useSubmitAnswer,
} from '../../../../hooks/use-assessments';
import { formatApiError } from '../../../../lib/format-api-error';
import { goBackOrReplace } from '../../../../lib/navigation';
import { platformAlert } from '../../../../lib/platform-alert';
import { Button } from '../../../../components/common/Button';
import { ErrorFallback } from '../../../../components/common/ErrorFallback';
import { RewardBurst } from '../../../../components/common/RewardBurst';
import { hapticSuccess } from '../../../../lib/haptics';
import { isAssessmentReadinessReply } from './assessment-readiness';

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
  const declineRefresh = useDeclineAssessmentRefresh(assessmentId ?? '');
  const [terminalResult, setTerminalResult] = useState<{
    evaluation: AssessmentEvaluation;
    status: AssessmentStatus;
  } | null>(null);

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
      const isFirstLearnerTurn = !messages.some(
        (message) => message.role === 'user',
      );
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: text },
      ]);

      if (isFirstLearnerTurn && isAssessmentReadinessReply(text)) {
        animateResponse(
          t('assessment.firstQuestion'),
          setMessages,
          setIsStreaming,
        );
        return;
      }

      setLastUserText(text);

      try {
        let currentAssessmentId = assessmentId;
        if (!currentAssessmentId) {
          const created = await createAssessment.mutateAsync();
          currentAssessmentId = created.assessment.id;
          setAssessmentId(currentAssessmentId);
        }

        const result = await submitAnswer.mutateAsync({
          assessmentId: currentAssessmentId,
          answer: text,
        });
        const evaluation = result.evaluation;
        const feedback = evaluation.feedback;
        const terminalStatus = result.status !== 'in_progress';

        animateResponse(feedback, setMessages, setIsStreaming, () => {
          if (terminalStatus) {
            setTerminalResult(result);
          }
          if (result.status === 'passed') {
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
      messages,
      assessmentId,
      createAssessment,
      submitAnswer,
      t,
    ],
  );

  const passedAssessment = terminalResult?.status === 'passed';

  useEffect(() => {
    if (passedAssessment) {
      hapticSuccess();
    }
  }, [passedAssessment]);

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

  const masteryPercent = terminalResult
    ? Math.round(terminalResult.evaluation.masteryScore * 100)
    : 0;
  const bandLabel =
    masteryPercent >= 90
      ? t('assessment.bands.excellent')
      : masteryPercent >= 80
        ? t('assessment.bands.good')
        : masteryPercent >= 70
          ? t('assessment.bands.meetsBar')
          : masteryPercent >= 60
            ? t('assessment.bands.coreIdeas')
            : t('assessment.bands.needsReview');
  const weakAreas = terminalResult?.evaluation.weakAreas ?? [];

  const resultCard = terminalResult ? (
    <View
      testID="assessment-result-card"
      className="bg-surface-elevated rounded-card px-4 py-4 gap-3"
    >
      <Text className="text-body font-semibold text-text-primary">
        {t('assessment.resultSummary', {
          mastery: masteryPercent,
          band: bandLabel,
        })}
      </Text>
      {terminalResult.status === 'borderline' ? (
        <>
          <Text className="text-body-sm text-text-secondary">
            {t('assessment.borderlineBody')}
          </Text>
          <View className="gap-2">
            <Button
              label={t('assessment.gapFillAction')}
              testID="assessment-gap-fill"
              onPress={() =>
                router.push({
                  pathname: '/(app)/session',
                  params: {
                    subjectId,
                    topicId,
                    mode: 'gap_fill',
                    gaps: JSON.stringify(weakAreas),
                  },
                } as Href)
              }
            />
            <Button
              variant="secondary"
              label={t('assessment.declineRefreshAction')}
              testID="assessment-decline-refresh"
              loading={declineRefresh.isPending}
              onPress={async () => {
                try {
                  await declineRefresh.mutateAsync();
                  goBackOrReplace(router, '/(app)/practice' as const);
                } catch (err: unknown) {
                  platformAlert(
                    t('assessment.declineRefreshAction'),
                    formatApiError(err),
                  );
                }
              }}
            />
          </View>
        </>
      ) : terminalResult.status === 'failed_exhausted' ? (
        <>
          <Text className="text-body-sm text-text-secondary">
            {t('assessment.failedExhaustedBody')}
          </Text>
          <View className="gap-2">
            <Button
              label={t('assessment.startSessionAction')}
              testID="assessment-start-session"
              onPress={() =>
                router.push({
                  pathname: '/(app)/session',
                  params: { subjectId, topicId, mode: 'learning' },
                } as Href)
              }
            />
            <Button
              variant="secondary"
              label={t('assessment.notNowAction')}
              testID="assessment-not-now"
              onPress={() =>
                goBackOrReplace(router, '/(app)/practice' as const)
              }
            />
          </View>
        </>
      ) : (
        <>
          <Text className="text-body-sm text-text-secondary">
            {t('assessment.topicPassedNote')}
          </Text>
          <Button
            variant="secondary"
            label={t('common.done')}
            testID="assessment-done"
            onPress={() => goBackOrReplace(router, '/(app)/practice' as const)}
          />
        </>
      )}
    </View>
  ) : null;

  return (
    <View className="flex-1">
      <ChatShell
        title={t('assessment.title')}
        messages={messages}
        onSend={handleSend}
        isStreaming={isStreaming}
        inputDisabled={!!terminalResult}
        footer={
          resultCard ??
          (lastError ? (
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
          ) : undefined)
        }
      />
      {passedAssessment ? (
        <RewardBurst
          variant="assessment"
          intensity="hero"
          message={t('assessment.passedMessage', { mastery: masteryPercent })}
          testID="assessment-pass-celebration"
        />
      ) : null}
    </View>
  );
}
