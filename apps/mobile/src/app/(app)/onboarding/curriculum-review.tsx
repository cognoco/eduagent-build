import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../lib/theme';
import { goBackOrReplace } from '../../../lib/navigation';
import { getOnboardingStepLabels } from '../../../lib/onboarding-step-labels';
import { platformAlert } from '../../../lib/platform-alert';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import {
  useCurriculum,
  useSkipTopic,
  useUnskipTopic,
  useChallengeCurriculum,
  useAddCurriculumTopic,
  useExplainTopic,
} from '../../../hooks/use-curriculum';
import { formatApiError } from '../../../lib/format-api-error';
import { ErrorFallback } from '../../../components/common/ErrorFallback';

const RELEVANCE_BG: Record<string, string> = {
  core: 'bg-primary/20',
  recommended: 'bg-accent/20',
  contemporary: 'bg-warning/20',
  emerging: 'bg-success/20',
};

const RELEVANCE_TEXT: Record<string, string> = {
  core: 'text-primary',
  recommended: 'text-accent',
  contemporary: 'text-warning',
  emerging: 'text-success',
};

const RELEVANCE_LABEL: Record<string, string> = {
  core: 'Essential',
  recommended: 'Recommended',
  contemporary: 'Current',
  emerging: 'Cutting-edge',
};

// [BUG-956] Curriculum generation is async (Inngest). When the user arrives
// from the interview flow, the curriculum may not be persisted yet. Poll every
// 3s while curriculum is null so the screen self-resolves once Inngest finishes.
// Cap polling at 90s to avoid an infinite spinner.
const CURRICULUM_POLL_INTERVAL_MS = 3_000;
const CURRICULUM_POLL_TIMEOUT_MS = 90_000;

export default function CurriculumScreen() {
  const { t } = useTranslation();
  const {
    subjectId,
    subjectName,
    languageCode,
    languageName,
    step: stepParam,
    totalSteps: totalStepsParam,
  } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
    languageCode?: string;
    languageName?: string;
    step?: string;
    totalSteps?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const step = Number(stepParam) || 4;
  const totalSteps = Number(totalStepsParam) || 4;
  const stepLabels = getOnboardingStepLabels(t);

  // [BUG-956] Poll while curriculum is null (Inngest generation in-flight).
  // Stop polling once data arrives or after the 90s timeout.
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [shouldPoll, setShouldPoll] = useState(true);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    data: curriculum,
    isLoading,
    isError,
    refetch,
  } = useCurriculum(subjectId ?? '', {
    refetchInterval:
      !pollTimedOut && shouldPoll ? CURRICULUM_POLL_INTERVAL_MS : false,
  });

  useEffect(() => {
    if (curriculum) setShouldPoll(false);
  }, [curriculum]);

  // Start the 90s polling timeout when we mount (or subjectId changes).
  // Clear it once curriculum data arrives so a stale timeout doesn't fire.
  useEffect(() => {
    if (curriculum) {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      setPollTimedOut(false);
      return;
    }
    setPollTimedOut(false);
    pollTimeoutRef.current = setTimeout(() => {
      setPollTimedOut(true);
    }, CURRICULUM_POLL_TIMEOUT_MS);
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
    // Including `curriculum` is safe: when it transitions undefined → defined,
    // the cleanup clears the timer, then the early-return branch above runs
    // and skips re-arming. react-query's structural sharing keeps the reference
    // stable across refetches with identical data, so no spurious re-runs.
  }, [subjectId, curriculum]);

  const skipTopic = useSkipTopic(subjectId ?? '');
  const unskipTopic = useUnskipTopic(subjectId ?? '');
  const challengeCurriculum = useChallengeCurriculum(subjectId ?? '');
  const addCurriculumTopic = useAddCurriculumTopic(subjectId ?? '');
  const explainTopic = useExplainTopic(subjectId ?? '');
  // [BUG-UX-CURRICULUM-TIMEOUT] Hard 30s UI timeout: if the curriculum query is
  // still loading after 30s the user gets an explicit error panel instead of a
  // silent infinite spinner.
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return undefined;
    }
    const CURRICULUM_UI_TIMEOUT_MS = 30_000;
    const timer = setTimeout(
      () => setLoadingTimedOut(true),
      CURRICULUM_UI_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [isLoading]);

  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [challengeFeedback, setChallengeFeedback] = useState('');
  const [showAddTopicModal, setShowAddTopicModal] = useState(false);
  const [addTopicTitle, setAddTopicTitle] = useState('');
  const [addTopicDescription, setAddTopicDescription] = useState('');
  const [addTopicMinutes, setAddTopicMinutes] = useState('');
  const [addTopicError, setAddTopicError] = useState('');
  const [addTopicPreviewReady, setAddTopicPreviewReady] = useState(false);
  const [showWhyModal, setShowWhyModal] = useState(false);
  const [whyTopicTitle, setWhyTopicTitle] = useState('');
  const [whyExplanation, setWhyExplanation] = useState('');
  const [explainingTopicId, setExplainingTopicId] = useState<string | null>(
    null
  );
  // BUG-692-FOLLOWUP: Guard post-await setShowWhyModal(true) against the user
  // having dismissed the pending "Why?" request via Android back while the LLM
  // call was in flight. Set to true when the user dismisses a pending explain
  // request; reset at the start of each attempt.
  const explainCancelledRef = useRef(false);

  const handleBack = useCallback(() => {
    // BUG-692-FOLLOWUP: Mark any in-flight explain request as cancelled so the
    // post-await setShowWhyModal(true) does not fire after navigation away.
    explainCancelledRef.current = true;
    goBackOrReplace(router, {
      pathname: '/(app)/onboarding/accommodations',
      params: {
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        languageCode: languageCode ?? '',
        languageName: languageName ?? '',
        step: String(Math.max(step - 1, 3)),
        totalSteps: String(totalSteps),
      },
    });
  }, [
    languageCode,
    languageName,
    router,
    step,
    subjectId,
    subjectName,
    totalSteps,
  ]);

  if (!subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-5">
        <Text className="text-text-secondary mb-4">
          {t('onboarding.common.noSubjectSelected')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          className="bg-primary rounded-button px-6 py-3 items-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goHome')}
          testID="curriculum-guard-home"
        >
          <Text className="text-text-inverse text-body font-semibold">
            {t('common.goHome')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const handleChallenge = async () => {
    if (!challengeFeedback.trim()) return;
    try {
      await challengeCurriculum.mutateAsync(challengeFeedback.trim());
      setChallengeFeedback('');
      setShowChallengeModal(false);
    } catch (err: unknown) {
      platformAlert(
        t('onboarding.curriculumReview.updateFailedTitle'),
        formatApiError(err)
      );
    }
  };

  const resetAddTopicModal = () => {
    setAddTopicTitle('');
    setAddTopicDescription('');
    setAddTopicMinutes('');
    setAddTopicError('');
    setAddTopicPreviewReady(false);
  };

  const handlePreviewTopic = async () => {
    if (!addTopicTitle.trim()) return;
    try {
      setAddTopicError('');
      const result = await addCurriculumTopic.mutateAsync({
        mode: 'preview',
        title: addTopicTitle.trim(),
      });
      if (result.mode === 'preview') {
        setAddTopicTitle(result.preview.title);
        setAddTopicDescription(result.preview.description);
        setAddTopicMinutes(String(result.preview.estimatedMinutes));
        setAddTopicPreviewReady(true);
      }
    } catch (err: unknown) {
      setAddTopicError(formatApiError(err));
    }
  };

  const handleCreateTopic = async () => {
    const estimatedMinutes = Number(addTopicMinutes);
    if (
      !addTopicTitle.trim() ||
      !addTopicDescription.trim() ||
      !Number.isFinite(estimatedMinutes)
    ) {
      setAddTopicError(
        t('onboarding.curriculumReview.addTopicValidationError')
      );
      return;
    }

    try {
      setAddTopicError('');
      const result = await addCurriculumTopic.mutateAsync({
        mode: 'create',
        title: addTopicTitle.trim(),
        description: addTopicDescription.trim(),
        estimatedMinutes: Math.max(
          5,
          Math.min(240, Math.round(estimatedMinutes))
        ),
      });
      if (result.mode === 'create') {
        resetAddTopicModal();
        setShowAddTopicModal(false);
      }
    } catch (err: unknown) {
      setAddTopicError(formatApiError(err));
    }
  };

  const handleExplainTopic = async (
    topicId: string,
    topicTitle: string
  ): Promise<void> => {
    // BUG-692-FOLLOWUP: Reset cancellation flag at the start of each attempt so
    // a prior dismiss doesn't permanently suppress future explain requests.
    explainCancelledRef.current = false;
    try {
      setExplainingTopicId(topicId);
      const explanation = await explainTopic.mutateAsync(topicId);
      // BUG-692-FOLLOWUP: User dismissed the pending explain request (Android
      // back while the LLM call was running) — don't open the modal.
      if (explainCancelledRef.current) return;
      setWhyTopicTitle(topicTitle);
      setWhyExplanation(explanation);
      setShowWhyModal(true);
    } catch (err: unknown) {
      // BUG-692-FOLLOWUP: Don't surface error if user already dismissed.
      if (explainCancelledRef.current) return;
      platformAlert('Could not explain the order', formatApiError(err));
    } finally {
      setExplainingTopicId(null);
    }
  };

  const firstAvailableTopic = curriculum?.topics.find((t) => !t.skipped);
  const skippedTopicCount =
    curriculum?.topics.filter((topic) => topic.skipped).length ?? 0;
  const shouldOfferPlacementAssessment =
    !!curriculum &&
    curriculum.topics.length > 0 &&
    skippedTopicCount / curriculum.topics.length > 0.8;
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={handleBack}
            className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
            testID="curriculum-back"
          >
            <Text className="text-primary text-h3">&larr;</Text>
          </Pressable>
          <Text className="text-h2 font-bold text-text-primary flex-1">
            {t('onboarding.curriculumReview.title')}
          </Text>
          <Pressable
            onPress={() => setShowChallengeModal(true)}
            className="bg-surface-elevated rounded-button px-3 py-1.5 min-h-[44px] items-center justify-center"
            testID="challenge-button"
          >
            <Text className="text-body-sm text-primary font-semibold">
              {t('onboarding.curriculumReview.suggestChanges')}
            </Text>
          </Pressable>
        </View>
        <OnboardingStepIndicator
          step={step}
          totalSteps={totalSteps}
          stepLabels={stepLabels}
        />
      </View>

      {isLoading && loadingTimedOut ? (
        // [BUG-UX-CURRICULUM-TIMEOUT] Hard timeout — give the user an escape
        // instead of an infinite spinner.
        <View
          className="flex-1 items-center justify-center px-8"
          testID="curriculum-loading-timeout"
        >
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            {t('onboarding.curriculumReview.loadingTimeout.title')}
          </Text>
          <Text className="text-body text-text-secondary text-center mb-6">
            {t('onboarding.curriculumReview.loadingTimeout.body')}
          </Text>
          <Pressable
            onPress={() => {
              setLoadingTimedOut(false);
              void refetch();
            }}
            className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3 w-full"
            testID="curriculum-timeout-retry"
            accessibilityRole="button"
            accessibilityLabel={t('common.tryAgain')}
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('common.tryAgain')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
            className="bg-surface rounded-button px-6 py-3 items-center min-h-[48px] justify-center w-full"
            testID="curriculum-timeout-home"
            accessibilityRole="button"
            accessibilityLabel={t('common.goHome')}
          >
            <Text className="text-text-primary text-body font-semibold">
              {t('common.goHome')}
            </Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" testID="curriculum-loading" />
          <Text className="text-text-secondary mt-2">
            {t('onboarding.curriculumReview.loadingCurriculum')}
          </Text>
        </View>
      ) : isError ? (
        <View
          className="flex-1 items-center justify-center px-8"
          testID="curriculum-error"
        >
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            {t('onboarding.curriculumReview.loadError.title')}
          </Text>
          <Text className="text-body text-text-secondary text-center mb-6">
            {t('onboarding.curriculumReview.loadError.body')}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3 w-full"
            testID="curriculum-error-retry"
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('common.tryAgain')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
            className="bg-surface rounded-button px-6 py-3 items-center min-h-[48px] justify-center w-full"
            testID="curriculum-error-home"
          >
            <Text className="text-text-primary text-body font-semibold">
              {t('common.goHome')}
            </Text>
          </Pressable>
        </View>
      ) : !curriculum && !pollTimedOut ? (
        // [BUG-956] Curriculum generation is still in-flight (Inngest job
        // running). Show a spinner — the hook polls every 3s and will
        // auto-refresh once data arrives, without any user action.
        <View
          className="flex-1 items-center justify-center px-8"
          testID="curriculum-generating"
        >
          <ActivityIndicator size="large" className="mb-4" />
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            {t('onboarding.curriculumReview.generating.title')}
          </Text>
          <Text className="text-body text-text-secondary text-center">
            {t('onboarding.curriculumReview.generating.body')}
          </Text>
        </View>
      ) : !curriculum ? (
        <View
          className="flex-1 items-center justify-center px-8"
          testID="curriculum-empty"
        >
          <ErrorFallback
            variant="card"
            title={t('onboarding.curriculumReview.noCurriculum.title')}
            message={t('onboarding.curriculumReview.noCurriculum.message')}
            primaryAction={{
              label: t('common.retry'),
              testID: 'curriculum-empty-retry',
              onPress: () => {
                setPollTimedOut(false);
                void refetch();
              },
            }}
            secondaryAction={{
              label: t('common.goHome'),
              testID: 'curriculum-empty-home',
              onPress: () => goBackOrReplace(router, '/(app)/home'),
            }}
          />
        </View>
      ) : curriculum.topics.length === 0 ? (
        // [UX-DEAD-END] Curriculum exists but has zero topics — without an
        // explicit empty state the user lands on a blank list with no path
        // forward. Honor "every AI-driven screen allows human override" by
        // surfacing the same Add-topic / Challenge / Home affordances that
        // the populated screen offers, plus a Retry that re-fetches.
        <View
          className="flex-1 items-center justify-center px-8"
          testID="curriculum-empty-topics"
        >
          <ErrorFallback
            variant="card"
            title={t('onboarding.curriculumReview.noCurriculum.title')}
            message={t('onboarding.curriculumReview.noCurriculum.message')}
            primaryAction={{
              label: t('common.retry'),
              testID: 'curriculum-empty-topics-retry',
              onPress: () => {
                setPollTimedOut(false);
                void refetch();
              },
            }}
            secondaryAction={{
              label: t('common.goHome'),
              testID: 'curriculum-empty-topics-home',
              onPress: () => goBackOrReplace(router, '/(app)/home'),
            }}
          />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <Text className="text-body-sm text-text-secondary mb-4">
            {t('onboarding.curriculumReview.versionInfo', {
              version: curriculum.version,
              count: curriculum.topics.length,
            })}
          </Text>

          {curriculum.topics.map((topic) => (
            <View
              key={topic.id}
              className={`bg-surface rounded-card px-4 py-3 mb-3 ${
                topic.skipped ? 'opacity-50' : ''
              }`}
              testID={`topic-${topic.id}`}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 me-3">
                  <Text className="text-body font-semibold text-text-primary">
                    {topic.sortOrder + 1}. {topic.title}
                  </Text>
                  <Text className="text-body-sm text-text-secondary mt-1">
                    {topic.description}
                  </Text>
                  <Pressable
                    onPress={() =>
                      void handleExplainTopic(topic.id, topic.title)
                    }
                    className="self-start mt-3"
                    testID={`explain-${topic.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'onboarding.curriculumReview.whyOrderLabel',
                      { title: topic.title }
                    )}
                    disabled={explainingTopicId === topic.id}
                  >
                    <Text className="text-body-sm font-semibold text-primary">
                      {explainingTopicId === topic.id
                        ? t('onboarding.curriculumReview.explaining')
                        : t('onboarding.curriculumReview.whyOrder')}
                    </Text>
                  </Pressable>
                  <View className="flex-row mt-2 items-center">
                    <View
                      className={`rounded-full px-2 py-0.5 me-2 ${
                        RELEVANCE_BG[topic.relevance] ?? 'bg-surface-elevated'
                      }`}
                    >
                      <Text
                        className={`text-caption ${
                          RELEVANCE_TEXT[topic.relevance] ??
                          'text-text-secondary'
                        }`}
                      >
                        {RELEVANCE_LABEL[topic.relevance] ?? topic.relevance}
                      </Text>
                    </View>
                    <Text className="text-caption text-text-secondary">
                      ~{topic.estimatedMinutes} min
                    </Text>
                  </View>
                </View>
                {!topic.skipped ? (
                  <Pressable
                    onPress={() =>
                      platformAlert(
                        t('onboarding.curriculumReview.skipTopicTitle'),
                        t('onboarding.curriculumReview.skipTopicBody'),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('onboarding.curriculumReview.skipAction'),
                            style: 'destructive',
                            // [UX-DE-M2] Surface skip errors — silent failure
                            // left the UI optimistically empty with no feedback.
                            onPress: () =>
                              skipTopic.mutate(topic.id, {
                                onError: (err: unknown) =>
                                  platformAlert(
                                    t(
                                      'onboarding.curriculumReview.skipErrorTitle'
                                    ),
                                    formatApiError(err)
                                  ),
                              }),
                          },
                        ]
                      )
                    }
                    className="bg-surface-elevated rounded-button px-3 py-1 min-h-[44px] min-w-[44px] items-center justify-center"
                    testID={`skip-${topic.id}`}
                  >
                    <Text className="text-caption text-text-secondary">
                      {t('onboarding.curriculumReview.skipAction')}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() =>
                      // [UX-DE-M2] Surface unskip errors via alert.
                      unskipTopic.mutate(topic.id, {
                        onError: (err: unknown) =>
                          platformAlert(
                            t('onboarding.curriculumReview.restoreErrorTitle'),
                            formatApiError(err)
                          ),
                      })
                    }
                    className="bg-surface-elevated rounded-button px-3 py-1"
                    testID={`restore-${topic.id}`}
                    accessibilityLabel={t(
                      'onboarding.curriculumReview.restoreLabel',
                      { title: topic.title }
                    )}
                    accessibilityRole="button"
                  >
                    <Text className="text-caption font-medium text-primary">
                      {t('onboarding.curriculumReview.restore')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          <Pressable
            onPress={() => setShowAddTopicModal(true)}
            className="bg-surface-elevated rounded-button py-3 px-4 items-center mb-4"
            testID="add-topic-button"
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.curriculumReview.addTopic')}
          >
            <Text className="text-body font-semibold text-primary">
              {t('onboarding.curriculumReview.addTopic')}
            </Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Next-step actions */}
      {firstAvailableTopic && shouldOfferPlacementAssessment ? (
        <View
          className="px-5 pb-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <View className="bg-surface rounded-card p-4 mb-3">
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('onboarding.curriculumReview.placementCheck.mostSkipped')}
            </Text>
            <Text className="text-body-sm text-text-secondary">
              {t('onboarding.curriculumReview.placementCheck.hint')}
            </Text>
          </View>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/topic/recall-test',
                params: {
                  subjectId,
                  topicId: firstAvailableTopic.id,
                  topicName: firstAvailableTopic.title,
                },
              })
            }
            className="bg-primary rounded-button py-3.5 items-center mb-2"
            testID="placement-check-button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('onboarding.curriculumReview.placementCheck.takePlacement')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/session',
                params: {
                  mode: 'learning',
                  subjectId,
                  topicId: firstAvailableTopic.id,
                  topicName: firstAvailableTopic.title,
                },
              })
            }
            className="border border-border rounded-button py-3 items-center mb-2"
            testID="continue-advanced-button"
          >
            <Text className="text-body font-semibold text-primary">
              {t('onboarding.curriculumReview.placementCheck.continueAdvanced')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/create-subject')}
            className="py-3 items-center"
            testID="choose-different-subject-button"
            accessibilityLabel={t(
              'onboarding.curriculumReview.placementCheck.chooseDifferent'
            )}
            accessibilityRole="button"
          >
            <Text className="text-body text-primary font-semibold">
              {t('onboarding.curriculumReview.placementCheck.chooseDifferent')}
            </Text>
          </Pressable>
        </View>
      ) : firstAvailableTopic ? (
        <View
          className="px-5 pb-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/session',
                params: {
                  mode: 'learning',
                  subjectId,
                  topicId: firstAvailableTopic.id,
                  topicName: firstAvailableTopic.title,
                },
              })
            }
            className="bg-primary rounded-button py-3.5 items-center"
            testID="start-learning-button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('onboarding.curriculumReview.startLearning', {
                title: firstAvailableTopic.title,
              })}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(app)/home')}
            className="py-3 items-center mt-2"
            testID="go-home-button"
            accessibilityLabel={t('onboarding.curriculumReview.exploreFirst')}
            accessibilityRole="button"
          >
            <Text className="text-body text-primary font-semibold">
              {t('onboarding.curriculumReview.exploreFirst')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View
          className="px-5 pb-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <Pressable
            onPress={() => router.replace('/(app)/home')}
            className="bg-primary rounded-button py-3.5 items-center"
            testID="continue-to-home-button"
            accessibilityLabel={t('onboarding.curriculumReview.continueToHome')}
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('onboarding.curriculumReview.continueToHome')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Challenge modal */}
      <Modal visible={showChallengeModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View
            className="bg-background rounded-t-3xl px-5 pt-6 pb-8"
            style={{ paddingBottom: Math.max(insets.bottom, 24) }}
          >
            <Text className="text-h3 font-bold text-text-primary mb-3">
              {t('onboarding.curriculumReview.challengeModal.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              {t('onboarding.curriculumReview.challengeModal.body')}
            </Text>
            <TextInput
              className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
              placeholder={t(
                'onboarding.curriculumReview.challengeModal.placeholder'
              )}
              placeholderTextColor={colors.muted}
              value={challengeFeedback}
              onChangeText={setChallengeFeedback}
              multiline
              maxLength={2000}
              testID="challenge-feedback"
            />
            <View className="flex-row">
              <Pressable
                onPress={() => setShowChallengeModal(false)}
                className="flex-1 rounded-button py-3 items-center bg-surface me-2"
                testID="challenge-cancel"
              >
                <Text className="text-body text-text-primary">
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleChallenge}
                disabled={
                  !challengeFeedback.trim() || challengeCurriculum.isPending
                }
                className={`flex-1 rounded-button py-3 items-center ${
                  challengeFeedback.trim()
                    ? 'bg-primary'
                    : 'bg-surface-elevated'
                }`}
                testID="challenge-submit"
              >
                {challengeCurriculum.isPending ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text
                    className={`text-body font-semibold ${
                      challengeFeedback.trim()
                        ? 'text-text-inverse'
                        : 'text-text-secondary'
                    }`}
                  >
                    {t('onboarding.curriculumReview.challengeModal.regenerate')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAddTopicModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View
            className="bg-background rounded-t-3xl px-5 pt-6 pb-8"
            style={{ paddingBottom: Math.max(insets.bottom, 24) }}
          >
            <Text className="text-h3 font-bold text-text-primary mb-3">
              {t('onboarding.curriculumReview.addTopicModal.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              {t('onboarding.curriculumReview.addTopicModal.body')}
            </Text>

            {addTopicError !== '' && (
              <View
                className="bg-danger/10 rounded-card px-4 py-3 mb-4"
                accessibilityRole="alert"
              >
                <Text className="text-danger text-body-sm">
                  {addTopicError}
                </Text>
              </View>
            )}

            <Text className="text-body-sm font-semibold text-text-secondary mb-1">
              {t('onboarding.curriculumReview.addTopicModal.topicLabel')}
            </Text>
            <TextInput
              className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
              placeholder={t(
                'onboarding.curriculumReview.addTopicModal.topicPlaceholder'
              )}
              placeholderTextColor={colors.muted}
              value={addTopicTitle}
              onChangeText={(text) => {
                setAddTopicTitle(text);
                if (addTopicError) setAddTopicError('');
              }}
              testID="add-topic-title-input"
            />

            {addTopicPreviewReady && (
              <>
                <Text className="text-body-sm font-semibold text-text-secondary mb-1">
                  {t(
                    'onboarding.curriculumReview.addTopicModal.descriptionLabel'
                  )}
                </Text>
                <TextInput
                  className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
                  placeholder={t(
                    'onboarding.curriculumReview.addTopicModal.descriptionPlaceholder'
                  )}
                  placeholderTextColor={colors.muted}
                  value={addTopicDescription}
                  onChangeText={setAddTopicDescription}
                  multiline
                  testID="add-topic-description-input"
                />

                <Text className="text-body-sm font-semibold text-text-secondary mb-1">
                  {t('onboarding.curriculumReview.addTopicModal.minutesLabel')}
                </Text>
                <TextInput
                  className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
                  placeholder={t(
                    'onboarding.curriculumReview.addTopicModal.minutesPlaceholder'
                  )}
                  placeholderTextColor={colors.muted}
                  value={addTopicMinutes}
                  onChangeText={setAddTopicMinutes}
                  keyboardType="number-pad"
                  testID="add-topic-minutes-input"
                />
              </>
            )}

            <View className="flex-row">
              <Pressable
                onPress={() => {
                  resetAddTopicModal();
                  setShowAddTopicModal(false);
                }}
                className="flex-1 rounded-button py-3 items-center bg-surface me-2"
                testID="add-topic-cancel"
              >
                <Text className="text-body text-text-primary">
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={
                  addTopicPreviewReady ? handleCreateTopic : handlePreviewTopic
                }
                disabled={!addTopicTitle.trim() || addCurriculumTopic.isPending}
                className={`flex-1 rounded-button py-3 items-center ${
                  addTopicTitle.trim() ? 'bg-primary' : 'bg-surface-elevated'
                }`}
                testID={
                  addTopicPreviewReady
                    ? 'add-topic-confirm'
                    : 'add-topic-preview'
                }
              >
                {addCurriculumTopic.isPending ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text
                    className={`text-body font-semibold ${
                      addTopicTitle.trim()
                        ? 'text-text-inverse'
                        : 'text-text-secondary'
                    }`}
                  >
                    {addTopicPreviewReady
                      ? t('onboarding.curriculumReview.addTopicModal.addTopic')
                      : t('onboarding.curriculumReview.addTopicModal.preview')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showWhyModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View
            className="bg-background rounded-t-3xl px-5 pt-6 pb-8"
            style={{ paddingBottom: Math.max(insets.bottom, 24) }}
            testID="why-modal"
          >
            <Text className="text-h3 font-bold text-text-primary mb-2">
              {t('onboarding.curriculumReview.whyOrder')}
            </Text>
            <Text className="text-body font-semibold text-text-primary mb-3">
              {whyTopicTitle}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <Text className="text-body text-text-secondary">
                {whyExplanation}
              </Text>
            </ScrollView>
            <Pressable
              onPress={() => setShowWhyModal(false)}
              className="mt-5 rounded-button bg-primary py-3 items-center"
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('common.close')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
