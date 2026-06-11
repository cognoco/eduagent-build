import { useState, useCallback, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type {
  AssessmentEvaluation,
  AssessmentRecord,
  AssessmentStatus,
  VerificationDepth,
} from '@eduagent/schemas';
import {
  ChatShell,
  animateResponse,
  type ChatMessage,
} from '../../../../components/session';
import {
  useActiveAssessment,
  useCreateAssessment,
  useDeclineAssessmentRefresh,
  useSubmitAnswer,
} from '../../../../hooks/use-assessments';
import {
  classifyApiError,
  formatApiError,
  recoveryActions,
} from '../../../../lib/format-api-error';
import { goBackOrReplace } from '../../../../lib/navigation';
import { platformAlert } from '../../../../lib/platform-alert';
import type { Translate } from '../../../../i18n';
import { Button } from '../../../../components/common/Button';
import { ErrorFallback } from '../../../../components/common/ErrorFallback';
import { RewardBurst } from '../../../../components/common/RewardBurst';
import { hapticSuccess } from '../../../../lib/haptics';
// [BUG-138 / BUG-227] Underscore-prefixed helpers so Expo Router does NOT
// treat them as route files in /(app)/practice/assessment/. Per AGENTS.md
// Repo-Specific Guardrails rule 16: any non-route helper file inside the
// app/ tree must be `_` prefixed (or live in a `_components` / `_hooks`
// folder), otherwise Expo Router registers it as a phantom route.
import { isAssessmentReadinessReply } from './_assessment-readiness';
import {
  assessmentFeedbackNeedsPrompt,
  buildAssessmentFirstQuestion,
  buildAssessmentNextActionPrompt,
  buildAssessmentOpeningMessage,
} from './_assessment-copy';

function buildAssessmentChatMessages(input: {
  openingMessage: string;
  exchangeHistory?: AssessmentRecord['exchangeHistory'];
  status?: AssessmentStatus;
  t: Translate;
  topicTitle: string | null;
  topicDescription: string | null;
  pedagogyMode: string | null;
  languageCode: string | null;
}): ChatMessage[] {
  const exchangeHistory = input.exchangeHistory ?? [];
  const messages: ChatMessage[] = [
    {
      id: 'opening',
      role: 'assistant',
      content: input.openingMessage,
    },
    ...exchangeHistory.map((exchange, index) => ({
      id: `persisted-${index}`,
      role: exchange.role,
      content: exchange.content,
    })),
  ];
  const lastMessage = messages[messages.length - 1];
  if (
    exchangeHistory.length > 0 &&
    lastMessage?.role === 'assistant' &&
    assessmentFeedbackNeedsPrompt({
      feedback: lastMessage.content,
      status: input.status ?? 'in_progress',
    })
  ) {
    messages.push({
      id: 'persisted-next-action',
      role: 'assistant',
      content: buildAssessmentNextActionPrompt({
        t: input.t,
        topicTitle: input.topicTitle,
        topicDescription: input.topicDescription,
        pedagogyMode: input.pedagogyMode,
        languageCode: input.languageCode,
      }),
    });
  }
  return messages;
}

export default function AssessmentScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    subjectId,
    topicId,
    topicTitle,
    topicDescription,
    pedagogyMode,
    languageCode,
  } = useLocalSearchParams<{
    subjectId?: string;
    topicId?: string;
    topicTitle?: string;
    topicDescription?: string;
    pedagogyMode?: string;
    languageCode?: string;
  }>();
  const scopedTopicTitle =
    typeof topicTitle === 'string' && topicTitle.trim().length > 0
      ? topicTitle.trim()
      : null;
  const scopedTopicDescription =
    typeof topicDescription === 'string' && topicDescription.trim().length > 0
      ? topicDescription.trim()
      : null;
  const scopedPedagogyMode =
    typeof pedagogyMode === 'string' && pedagogyMode.trim().length > 0
      ? pedagogyMode.trim()
      : null;
  const scopedLanguageCode =
    typeof languageCode === 'string' && languageCode.trim().length > 0
      ? languageCode.trim()
      : null;
  const openingMessage = buildAssessmentOpeningMessage({
    t,
    topicTitle: scopedTopicTitle,
    topicDescription: scopedTopicDescription,
    pedagogyMode: scopedPedagogyMode,
    languageCode: scopedLanguageCode,
  });

  const createAssessment = useCreateAssessment(subjectId ?? '', topicId ?? '');
  const activeAssessment = useActiveAssessment(subjectId ?? '', topicId ?? '');
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const submitAnswer = useSubmitAnswer(assessmentId ?? '');
  const declineRefresh = useDeclineAssessmentRefresh(assessmentId ?? '');
  const [terminalResult, setTerminalResult] = useState<{
    evaluation: AssessmentEvaluation;
    status: AssessmentStatus;
  } | null>(null);
  // Track the depth at which this assessment session concluded so we can
  // surface it in the result card. Captured from the active assessment record
  // when synced (covers resumed sessions). New sessions default to 'recall'
  // which is intentionally hidden (no chip rendered at recall depth).
  const [finalDepth, setFinalDepth] = useState<VerificationDepth | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    buildAssessmentChatMessages({
      openingMessage,
      t,
      topicTitle: scopedTopicTitle,
      topicDescription: scopedTopicDescription,
      pedagogyMode: scopedPedagogyMode,
      languageCode: scopedLanguageCode,
    }),
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<unknown | null>(null);
  const [lastUserText, setLastUserText] = useState<string | null>(null);

  useEffect(() => {
    const assessment = activeAssessment.data;
    if (!assessment || assessmentId || terminalResult || isStreaming) return;
    if (messages.some((message) => message.role === 'user')) return;

    setAssessmentId(assessment.id);
    setFinalDepth(assessment.verificationDepth);
    setMessages(
      buildAssessmentChatMessages({
        openingMessage,
        exchangeHistory: assessment.exchangeHistory,
        status: assessment.status,
        t,
        topicTitle: scopedTopicTitle,
        topicDescription: scopedTopicDescription,
        pedagogyMode: scopedPedagogyMode,
        languageCode: scopedLanguageCode,
      }),
    );
  }, [
    activeAssessment.data,
    assessmentId,
    isStreaming,
    messages,
    openingMessage,
    scopedPedagogyMode,
    scopedLanguageCode,
    scopedTopicDescription,
    scopedTopicTitle,
    t,
    terminalResult,
  ]);

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
          buildAssessmentFirstQuestion({
            t,
            topicTitle: scopedTopicTitle,
            topicDescription: scopedTopicDescription,
            pedagogyMode: scopedPedagogyMode,
            languageCode: scopedLanguageCode,
          }),
          setMessages,
          setIsStreaming,
        );
        return;
      }

      setLastUserText(text);

      try {
        let currentAssessmentId = assessmentId ?? activeAssessment.data?.id;
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
        const nextActionPrompt = assessmentFeedbackNeedsPrompt({
          feedback,
          status: result.status,
        })
          ? buildAssessmentNextActionPrompt({
              t,
              topicTitle: scopedTopicTitle,
              topicDescription: scopedTopicDescription,
              pedagogyMode: scopedPedagogyMode,
              languageCode: scopedLanguageCode,
            })
          : null;
        const terminalStatus = result.status !== 'in_progress';

        animateResponse(feedback, setMessages, setIsStreaming, () => {
          if (nextActionPrompt) {
            animateResponse(nextActionPrompt, setMessages, setIsStreaming);
            return;
          }
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
        // [UX-DE-H4] Do NOT inject server error text into the chat thread —
        // the AI did not "say" this. Surface the error only in the footer
        // ErrorFallback (rendered below via lastError), which carries a
        // retry + go-home pair. Reset streaming so input/retry re-enable.
        setIsStreaming(false);
        setLastError(err);
      }
    },
    [
      isStreaming,
      subjectId,
      topicId,
      messages,
      assessmentId,
      activeAssessment.data,
      createAssessment,
      submitAnswer,
      t,
      scopedTopicTitle,
      scopedTopicDescription,
      scopedPedagogyMode,
      scopedLanguageCode,
    ],
  );

  const passedAssessment = terminalResult?.status === 'passed';
  const isReviewLoading = activeAssessment.isLoading && !assessmentId;

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
  const focusTopics = terminalResult?.evaluation.weakAreas ?? [];

  // Quality rating chip: show when present and non-zero (0 = not rated).
  const qualityRating =
    terminalResult != null &&
    terminalResult.evaluation.qualityRating != null &&
    terminalResult.evaluation.qualityRating > 0
      ? terminalResult.evaluation.qualityRating
      : null;

  // Depth chip: only surface elevated depths (explain / transfer). 'recall' is
  // the default baseline — labelling it adds noise without signal.
  const showDepthChip = finalDepth === 'explain' || finalDepth === 'transfer';

  // Show the chip row on passed / borderline branches (not on failed_exhausted).
  const showChips =
    terminalResult !== null &&
    terminalResult.status !== 'failed_exhausted' &&
    (qualityRating !== null || showDepthChip);
  const classifiedLastError = lastError ? classifyApiError(lastError) : null;
  const assessmentErrorActions = classifiedLastError
    ? classifiedLastError.category === 'quota'
      ? {
          primaryAction: {
            label: t('session.quota.upgradePlan'),
            testID: 'assessment-error-upgrade',
            onPress: () => router.push('/(app)/subscription'),
          },
          secondaryAction: {
            label: t('common.goHome'),
            testID: 'assessment-error-home',
            onPress: () => goBackOrReplace(router, '/(app)/home' as const),
          },
        }
      : (() => {
          const actions = recoveryActions(classifiedLastError, {
            retry: lastUserText
              ? () => {
                  void handleSend(lastUserText);
                }
              : undefined,
            goBack: () => goBackOrReplace(router, '/(app)/practice' as const),
            goHome: () => goBackOrReplace(router, '/(app)/home' as const),
          });
          return {
            primaryAction: actions.primary
              ? {
                  ...actions.primary,
                  testID:
                    classifiedLastError.recovery === 'go-back'
                      ? 'assessment-error-back'
                      : actions.primary.testID === 'recovery-go-home'
                        ? 'assessment-error-home'
                        : 'assessment-error-retry',
                }
              : undefined,
            secondaryAction: actions.secondary
              ? {
                  ...actions.secondary,
                  testID: 'assessment-error-home',
                }
              : undefined,
          };
        })()
    : null;

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
      {showChips ? (
        <View className="flex-row flex-wrap gap-2">
          {qualityRating !== null ? (
            <View
              testID="assessment-quality-rating"
              className="bg-surface rounded-full px-3 py-1 border border-border"
            >
              <Text className="text-caption font-medium text-text-secondary">
                {t('assessment.qualityRating', { rating: qualityRating })}
              </Text>
            </View>
          ) : null}
          {showDepthChip ? (
            <View
              testID="assessment-depth-label"
              className="bg-accent/15 rounded-full px-3 py-1"
            >
              <Text className="text-caption font-semibold text-accent">
                {finalDepth === 'transfer'
                  ? t('assessment.depthTransfer')
                  : t('assessment.depthExplain')}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
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
                    gaps: JSON.stringify(focusTopics),
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
        inputDisabled={isReviewLoading || !!terminalResult}
        disabledReason={
          isReviewLoading ? t('assessment.loadingReview') : undefined
        }
        footer={
          resultCard ??
          (classifiedLastError && assessmentErrorActions ? (
            <ErrorFallback
              variant="card"
              message={classifiedLastError.message}
              primaryAction={
                assessmentErrorActions.primaryAction
                  ? {
                      ...assessmentErrorActions.primaryAction,
                      disabled:
                        assessmentErrorActions.primaryAction.testID ===
                        'assessment-error-retry'
                          ? isStreaming
                          : false,
                    }
                  : undefined
              }
              secondaryAction={assessmentErrorActions.secondaryAction}
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
