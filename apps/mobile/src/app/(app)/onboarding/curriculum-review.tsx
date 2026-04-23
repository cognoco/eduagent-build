import { useCallback, useState } from 'react';
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
import { useThemeColors } from '../../../lib/theme';
import { goBackOrReplace } from '../../../lib/navigation';
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

export default function CurriculumScreen() {
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
  const {
    data: curriculum,
    isLoading,
    isError,
    refetch,
  } = useCurriculum(subjectId ?? '');
  const skipTopic = useSkipTopic(subjectId ?? '');
  const unskipTopic = useUnskipTopic(subjectId ?? '');
  const challengeCurriculum = useChallengeCurriculum(subjectId ?? '');
  const addCurriculumTopic = useAddCurriculumTopic(subjectId ?? '');
  const explainTopic = useExplainTopic(subjectId ?? '');
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

  const handleBack = useCallback(() => {
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
        <Text className="text-text-secondary mb-4">No subject selected</Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          className="bg-primary rounded-button px-6 py-3 items-center"
          accessibilityRole="button"
          accessibilityLabel="Go home"
          testID="curriculum-guard-home"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Go home
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
      platformAlert('Curriculum update failed', formatApiError(err));
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
      setAddTopicError('Add a title, description, and estimated minutes.');
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
    try {
      setExplainingTopicId(topicId);
      const explanation = await explainTopic.mutateAsync(topicId);
      setWhyTopicTitle(topicTitle);
      setWhyExplanation(explanation);
      setShowWhyModal(true);
    } catch (err: unknown) {
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
            Your Curriculum
          </Text>
          <Pressable
            onPress={() => setShowChallengeModal(true)}
            className="bg-surface-elevated rounded-button px-3 py-1.5 min-h-[44px] items-center justify-center"
            testID="challenge-button"
          >
            <Text className="text-body-sm text-primary font-semibold">
              Suggest changes
            </Text>
          </Pressable>
        </View>
        <OnboardingStepIndicator step={step} totalSteps={totalSteps} />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" testID="curriculum-loading" />
          <Text className="text-text-secondary mt-2">
            Loading curriculum...
          </Text>
        </View>
      ) : isError ? (
        <View
          className="flex-1 items-center justify-center px-8"
          testID="curriculum-error"
        >
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            Couldn't load curriculum
          </Text>
          <Text className="text-body text-text-secondary text-center mb-6">
            Check your connection and try again.
          </Text>
          <Pressable
            onPress={() => void refetch()}
            className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3 w-full"
            testID="curriculum-error-retry"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Try again
            </Text>
          </Pressable>
          <Pressable
            onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
            className="bg-surface rounded-button px-6 py-3 items-center min-h-[48px] justify-center w-full"
            testID="curriculum-error-home"
          >
            <Text className="text-text-primary text-body font-semibold">
              Go home
            </Text>
          </Pressable>
        </View>
      ) : !curriculum ? (
        <View
          className="flex-1 items-center justify-center px-8"
          testID="curriculum-empty"
        >
          <ErrorFallback
            variant="card"
            title="No curriculum yet"
            message="Complete the assessment interview to generate your learning path."
            primaryAction={{
              label: 'Retry',
              testID: 'curriculum-empty-retry',
              onPress: () => void refetch(),
            }}
            secondaryAction={{
              label: 'Go Home',
              testID: 'curriculum-empty-home',
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
            Version {curriculum.version} — {curriculum.topics.length} topics
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
                    accessibilityLabel={`Why is ${topic.title} in this order`}
                    disabled={explainingTopicId === topic.id}
                  >
                    <Text className="text-body-sm font-semibold text-primary">
                      {explainingTopicId === topic.id
                        ? 'Explaining...'
                        : 'Why this order?'}
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
                        'Skip this topic?',
                        'You can always bring it back later.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Skip',
                            style: 'destructive',
                            onPress: () => skipTopic.mutate(topic.id),
                          },
                        ]
                      )
                    }
                    className="bg-surface-elevated rounded-button px-3 py-1 min-h-[44px] min-w-[44px] items-center justify-center"
                    testID={`skip-${topic.id}`}
                  >
                    <Text className="text-caption text-text-secondary">
                      Skip
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => unskipTopic.mutate(topic.id)}
                    className="bg-surface-elevated rounded-button px-3 py-1"
                    testID={`restore-${topic.id}`}
                    accessibilityLabel={`Restore ${topic.title}`}
                    accessibilityRole="button"
                  >
                    <Text className="text-caption font-medium text-primary">
                      Restore
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
            accessibilityLabel="Add topic"
          >
            <Text className="text-body font-semibold text-primary">
              Add topic
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
              You skipped most of this curriculum
            </Text>
            <Text className="text-body-sm text-text-secondary">
              Want a faster path? You can take a placement check, continue with
              the remaining advanced topics, or switch to a different subject.
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
              Take placement check
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
              Continue with advanced topics
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/create-subject')}
            className="py-3 items-center"
            testID="choose-different-subject-button"
            accessibilityLabel="Choose a different subject"
            accessibilityRole="button"
          >
            <Text className="text-body text-primary font-semibold">
              Choose a different subject
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
              Start learning: {firstAvailableTopic.title}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(app)/home')}
            className="py-3 items-center mt-2"
            testID="go-home-button"
            accessibilityLabel="Go to home screen"
            accessibilityRole="button"
          >
            <Text className="text-body text-primary font-semibold">
              Explore first
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
            accessibilityLabel="Continue to home"
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Continue to home
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
              Change your topics
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              Tell us what you'd change and we'll regenerate your learning path.
            </Text>
            <TextInput
              className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
              placeholder="e.g. I already know the basics, skip intro topics..."
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
                <Text className="text-body text-text-primary">Cancel</Text>
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
                    Regenerate
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
              Add a topic
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              Add something the generated curriculum missed. We'll suggest a
              clean title first, then you can edit before saving.
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
              Topic
            </Text>
            <TextInput
              className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
              placeholder="e.g. Trigonometry, The French Revolution"
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
                  Description
                </Text>
                <TextInput
                  className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
                  placeholder="Short description"
                  placeholderTextColor={colors.muted}
                  value={addTopicDescription}
                  onChangeText={setAddTopicDescription}
                  multiline
                  testID="add-topic-description-input"
                />

                <Text className="text-body-sm font-semibold text-text-secondary mb-1">
                  Estimated minutes
                </Text>
                <TextInput
                  className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
                  placeholder="30"
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
                <Text className="text-body text-text-primary">Cancel</Text>
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
                    {addTopicPreviewReady ? 'Add topic' : 'Preview'}
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
          >
            <Text className="text-h3 font-bold text-text-primary mb-2">
              Why this order?
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
              accessibilityLabel="Close explanation"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
