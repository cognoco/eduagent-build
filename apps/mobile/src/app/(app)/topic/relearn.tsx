import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Redirect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  useStartRelearn,
  useTeachingPreference,
} from '../../../hooks/use-retention';
import {
  useOverdueTopics,
  type OverdueSubject,
  type OverdueTopic,
} from '../../../hooks/use-progress';
import { useLinkedChildren, useProfile } from '../../../lib/profile';
import { computeAgeBracket } from '@eduagent/schemas';
import { goBackOrReplace, homeHrefForReturnTo } from '../../../lib/navigation';
import { formatApiError } from '../../../lib/format-api-error';
import { useEntryGate } from '../../../hooks/use-entry-gate';
import { firstParam } from '../../../lib/route-params';

type TeachingMethodId =
  | 'visual_diagrams'
  | 'step_by_step'
  | 'real_world_examples'
  | 'practice_problems';

type TeachingMethod = {
  id: TeachingMethodId;
  label: string;
  description: string;
};

function buildTeachingMethods(
  t: TFunction,
  isMinor: boolean,
): TeachingMethod[] {
  if (isMinor) {
    return [
      {
        id: 'visual_diagrams',
        label: t('relearn.methodVisualLabelYoung'),
        description: t('relearn.methodVisualDescYoung'),
      },
      {
        id: 'step_by_step',
        label: t('relearn.methodStepsLabelYoung'),
        description: t('relearn.methodStepsDescYoung'),
      },
      {
        id: 'real_world_examples',
        label: t('relearn.methodExamplesLabelYoung'),
        description: t('relearn.methodExamplesDescYoung'),
      },
      {
        id: 'practice_problems',
        label: t('relearn.methodPracticeLabelYoung'),
        description: t('relearn.methodPracticeDescYoung'),
      },
    ];
  }
  return [
    {
      id: 'visual_diagrams',
      label: t('relearn.methodVisualLabel'),
      description: t('relearn.methodVisualDesc'),
    },
    {
      id: 'step_by_step',
      label: t('relearn.methodStepsLabel'),
      description: t('relearn.methodStepsDesc'),
    },
    {
      id: 'real_world_examples',
      label: t('relearn.methodExamplesLabel'),
      description: t('relearn.methodExamplesDesc'),
    },
    {
      id: 'practice_problems',
      label: t('relearn.methodPracticeLabel'),
      description: t('relearn.methodPracticeDesc'),
    },
  ];
}

function buildCopy(t: TFunction, isMinor: boolean) {
  return {
    topicIntro: isMinor
      ? t('relearn.copyTopicIntroYoung')
      : t('relearn.copyTopicIntro'),
    methodIntro: isMinor
      ? t('relearn.copyMethodIntroYoung')
      : t('relearn.copyMethodIntro'),
    subjectIntro: isMinor
      ? t('relearn.copySubjectIntroYoung')
      : t('relearn.copySubjectIntro'),
    emptyTitle: isMinor
      ? t('relearn.copyEmptyTitleYoung')
      : t('relearn.copyEmptyTitle'),
    emptyBody: isMinor
      ? t('relearn.copyEmptyBodyYoung')
      : t('relearn.copyEmptyBody'),
    errorTitle: t('relearn.copyErrorTitle'),
    usualMethod: t('relearn.copyUsualMethod'),
  } as const;
}

type Phase = 'subjects' | 'topics' | 'method';

type SelectedTopic = {
  topicId: string;
  topicTitle: string;
  subjectId: string;
  subjectName?: string;
};

function buildSelectedTopic(
  subject: OverdueSubject,
  topic: OverdueTopic,
): SelectedTopic {
  return {
    topicId: topic.topicId,
    topicTitle: topic.topicTitle,
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
  };
}

export default function RelearnScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    topicId?: string | string[];
    subjectId?: string | string[];
    topicName?: string | string[];
    subjectName?: string | string[];
    returnTo?: string | string[];
    returnId?: string | string[];
    source?: string | string[];
    childProfileId?: string | string[];
  }>();
  const routeTopicId = firstParam(params.topicId);
  const routeSubjectId = firstParam(params.subjectId);
  const routeTopicName = firstParam(params.topicName);
  const routeSubjectName = firstParam(params.subjectName);
  const returnTo = firstParam(params.returnTo);
  const returnId = firstParam(params.returnId);
  const source = firstParam(params.source);
  const sourceChildProfileId = firstParam(params.childProfileId);
  const isParentBridgeSource = source === 'parent_bridge';

  const directEntry = Boolean(routeTopicId && routeSubjectId);
  const startRelearn = useStartRelearn();
  const overdueTopics = useOverdueTopics();
  const { activeProfile } = useProfile();
  const linkedChildren = useLinkedChildren();
  const ageBracket =
    activeProfile?.birthYear != null
      ? computeAgeBracket(activeProfile.birthYear)
      : 'adolescent';
  const isMinor = ageBracket !== 'adult';
  const methods = useMemo(() => buildTeachingMethods(t, isMinor), [isMinor, t]);
  const copy = useMemo(() => buildCopy(t, isMinor), [isMinor, t]);

  const [phase, setPhase] = useState<Phase>(directEntry ? 'method' : 'topics');
  const [selectedSubject, setSelectedSubject] = useState<OverdueSubject | null>(
    null,
  );
  const [selectedTopic, setSelectedTopic] = useState<SelectedTopic | null>(
    directEntry && routeTopicId && routeSubjectId
      ? {
          topicId: routeTopicId,
          topicTitle: routeTopicName ?? 'this topic',
          subjectId: routeSubjectId,
          subjectName: routeSubjectName,
        }
      : null,
  );
  const [isReady, setIsReady] = useState(directEntry);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cancelledRef = useRef(false);
  const startGenerationRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [lastMethodId, setLastMethodId] = useState<string | null>(null);

  const allSubjects = useMemo(
    () => overdueTopics.data?.subjects ?? [],
    [overdueTopics.data?.subjects],
  );
  const shouldStartAtSubjects =
    (overdueTopics.data?.totalOverdue ?? 0) > 10 && allSubjects.length > 1;

  const effectiveSubjectId = selectedSubject?.subjectId ?? routeSubjectId;
  const teachingPreference = useTeachingPreference(effectiveSubjectId);
  const preferredMethod = teachingPreference.data?.method ?? null;
  const sourceChild = useMemo(
    () =>
      sourceChildProfileId
        ? (linkedChildren.find((child) => child.id === sourceChildProfileId) ??
          null)
        : null,
    [linkedChildren, sourceChildProfileId],
  );
  const parentBridgeHeaderText = sourceChild?.displayName
    ? `Added from ${sourceChild.displayName}'s learning.`
    : "Added from a child's learning.";

  useEffect(() => {
    if (
      directEntry ||
      isReady ||
      overdueTopics.isLoading ||
      overdueTopics.isError
    ) {
      return;
    }

    const subjects = overdueTopics.data?.subjects ?? [];
    if (subjects.length === 1) {
      setSelectedSubject(subjects[0] ?? null);
    }

    setPhase(
      (overdueTopics.data?.totalOverdue ?? 0) > 10 && subjects.length > 1
        ? 'subjects'
        : 'topics',
    );
    setIsReady(true);
  }, [
    directEntry,
    isReady,
    overdueTopics.data,
    overdueTopics.isError,
    overdueTopics.isLoading,
  ]);

  const handleLeave = useCallback(() => {
    if (returnTo) {
      router.replace(homeHrefForReturnTo(returnTo, returnId) as Href);
      return;
    }

    goBackOrReplace(router, '/(app)/library' as const);
  }, [returnId, returnTo, router]);

  const handleBack = useCallback(() => {
    setError(null);

    if (phase === 'method' && !directEntry) {
      setPhase('topics');
      return;
    }

    if (phase === 'topics' && shouldStartAtSubjects && selectedSubject) {
      setPhase('subjects');
      setSelectedSubject(null);
      return;
    }

    handleLeave();
  }, [directEntry, handleLeave, phase, selectedSubject, shouldStartAtSubjects]);

  const handleSelectSubject = useCallback((subject: OverdueSubject) => {
    setSelectedSubject(subject);
    setSelectedTopic(null);
    setError(null);
    setPhase('topics');
  }, []);

  const handleSelectTopic = useCallback(
    (subject: OverdueSubject, topic: OverdueTopic) => {
      setSelectedSubject(subject);
      setSelectedTopic(buildSelectedTopic(subject, topic));
      setError(null);
      setPhase('method');
    },
    [],
  );

  const handleStartMethod = useCallback(
    (methodId: string) => {
      const currentTopic =
        selectedTopic ??
        (routeTopicId && routeSubjectId
          ? {
              topicId: routeTopicId,
              topicTitle: routeTopicName ?? 'this topic',
              subjectId: routeSubjectId,
              subjectName: routeSubjectName,
            }
          : null);

      if (!currentTopic) {
        return;
      }

      setError(null);
      cancelledRef.current = false;
      startGenerationRef.current += 1;
      const startGeneration = startGenerationRef.current;
      setLastMethodId(methodId);
      setIsSubmitting(true);

      const input =
        preferredMethod && preferredMethod === methodId
          ? { topicId: currentTopic.topicId, method: 'same' as const }
          : {
              topicId: currentTopic.topicId,
              method: 'different' as const,
              preferredMethod: methodId,
            };

      startRelearn.mutate(input, {
        onSuccess: (result) => {
          if (
            cancelledRef.current ||
            startGeneration !== startGenerationRef.current
          ) {
            return;
          }
          router.push({
            pathname: '/(app)/session',
            params: {
              ...(result.sessionId ? { sessionId: result.sessionId } : {}),
              subjectId: currentTopic.subjectId,
              ...(currentTopic.subjectName
                ? { subjectName: currentTopic.subjectName }
                : {}),
              topicId: currentTopic.topicId,
              ...(currentTopic.topicTitle
                ? { topicName: currentTopic.topicTitle }
                : {}),
              mode: 'relearn',
              ...(result.recap ? { recap: result.recap } : {}),
              ...(returnTo ? { returnTo } : {}),
              ...(returnId ? { returnId } : {}),
            },
          } as Href);
        },
        onError: (err: unknown) => {
          if (
            cancelledRef.current ||
            startGeneration !== startGenerationRef.current
          ) {
            return;
          }
          setError(formatApiError(err));
        },
        onSettled: () => {
          if (startGeneration !== startGenerationRef.current) {
            return;
          }
          setIsSubmitting(false);
        },
      });
    },
    [
      preferredMethod,
      routeSubjectId,
      routeSubjectName,
      routeTopicId,
      routeTopicName,
      returnTo,
      returnId,
      router,
      selectedTopic,
      startRelearn,
    ],
  );

  const topicsToRender = useMemo(() => {
    if (selectedSubject) {
      return [selectedSubject];
    }
    return allSubjects;
  }, [allSubjects, selectedSubject]);

  const blocked = useEntryGate('topic/relearn', {
    for: isParentBridgeSource ? 'child' : 'self',
  });

  if (blocked) {
    return <Redirect href="/(app)/home" />;
  }

  const renderHeader = () => (
    <View className="px-5 pt-4 pb-3 flex-row items-center">
      <Pressable
        onPress={handleBack}
        className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
        testID="relearn-back"
        accessibilityRole="button"
        accessibilityLabel={t('common.goBackAction')}
      >
        <Ionicons name="arrow-back" size={26} className="text-primary" />
      </Pressable>
      <Text className="text-h2 font-bold text-text-primary">
        {t('relearn.title')}
      </Text>
    </View>
  );

  const renderErrorBanner = () =>
    error ? (
      <View
        className="mx-5 mb-4 rounded-card bg-danger/10 px-4 py-3"
        testID="relearn-error"
      >
        <Text className="text-body-sm text-danger">{error}</Text>
        {lastMethodId ? (
          <Pressable
            onPress={() => handleStartMethod(lastMethodId)}
            className="mt-2 self-start min-h-[44px] items-center justify-center px-4"
            testID="relearn-retry"
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text className="text-body-sm font-semibold text-primary">
              {t('common.retry')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    ) : null;

  if (!directEntry && !isReady && overdueTopics.isLoading) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {renderHeader()}
        <View
          className="flex-1 items-center justify-center px-6"
          testID="relearn-overdue-loading"
        >
          <ActivityIndicator
            size="large"
            accessibilityLabel={t('common.loading')}
          />
          <Text className="mt-3 text-body text-text-secondary">
            {t('relearn.loadingReviewTopics')}
          </Text>
        </View>
      </View>
    );
  }

  if (!directEntry && overdueTopics.isError && !overdueTopics.data) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {renderHeader()}
        <View
          className="flex-1 items-center justify-center px-6"
          testID="relearn-overdue-error"
        >
          <Text className="text-h3 font-semibold text-text-primary text-center">
            {copy.errorTitle}
          </Text>
          <Pressable
            onPress={() => overdueTopics.refetch()}
            className="mt-4 min-h-[44px] rounded-button bg-primary px-6 py-3 items-center justify-center"
            testID="relearn-overdue-retry"
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.retry')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (
    !directEntry &&
    isReady &&
    (overdueTopics.data?.totalOverdue ?? 0) === 0
  ) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {renderHeader()}
        <View
          className="flex-1 items-center justify-center px-6"
          testID="relearn-empty-state"
        >
          <Text className="text-h3 font-semibold text-text-primary text-center">
            {copy.emptyTitle}
          </Text>
          <Text className="mt-2 text-body text-text-secondary text-center">
            {copy.emptyBody}
          </Text>
          <Pressable
            onPress={handleLeave}
            className="mt-4 min-h-[44px] rounded-button bg-primary px-6 py-3 items-center justify-center"
            testID="relearn-empty-back"
            accessibilityRole="button"
            accessibilityLabel={t('common.goBackAction')}
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.goBackAction')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isSubmitting) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {renderHeader()}
        <View
          className="flex-1 items-center justify-center px-6"
          testID="relearn-loading"
        >
          <ActivityIndicator
            size="large"
            accessibilityLabel={t('common.loading')}
          />
          <Text className="mt-3 text-body text-text-secondary">
            {t('relearn.startingSession')}
          </Text>
          <Pressable
            onPress={() => {
              cancelledRef.current = true;
              startGenerationRef.current += 1;
              setIsSubmitting(false);
              setError(null);
            }}
            className="mt-6 min-h-[44px] rounded-button bg-surface-elevated px-6 py-3 items-center justify-center"
            testID="relearn-cancel"
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {renderHeader()}
      {renderErrorBanner()}

      {phase === 'subjects' ? (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
          testID="relearn-subjects-phase"
        >
          <Text className="mb-4 text-body text-text-secondary">
            {copy.subjectIntro}
          </Text>
          {allSubjects.map((subject) => (
            <Pressable
              key={subject.subjectId}
              onPress={() => handleSelectSubject(subject)}
              className="mb-3 rounded-card bg-surface p-4"
              testID={`relearn-subject-${subject.subjectId}`}
              accessibilityRole="button"
              accessibilityLabel={t('relearn.a11yOpenSubject', {
                name: subject.subjectName,
              })}
            >
              <Text className="text-body font-semibold text-text-primary">
                {subject.subjectName}
              </Text>
              <Text className="mt-1 text-body-sm text-text-secondary">
                {t('relearn.overdueTopicCount', {
                  count: subject.overdueCount,
                })}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : phase === 'topics' ? (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
          testID="relearn-topics-phase"
        >
          <Text className="mb-4 text-body text-text-secondary">
            {copy.topicIntro}
          </Text>
          {topicsToRender.map((subject) => (
            <View key={subject.subjectId} className="mb-4">
              {topicsToRender.length > 1 || !selectedSubject ? (
                <Text className="mb-2 text-body-sm font-semibold text-text-secondary">
                  {subject.subjectName}
                </Text>
              ) : null}
              {subject.topics.map((topic) => (
                <Pressable
                  key={topic.topicId}
                  onPress={() => handleSelectTopic(subject, topic)}
                  className="mb-3 rounded-card bg-surface p-4"
                  testID={`relearn-topic-${topic.topicId}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('relearn.a11yOpenTopic', {
                    title: topic.topicTitle,
                  })}
                >
                  <Text className="text-body font-semibold text-text-primary">
                    {topic.topicTitle}
                  </Text>
                  <Text className="mt-1 text-body-sm text-text-secondary">
                    {t('relearn.daysOverdue', { count: topic.overdueDays })}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
          testID="relearn-method-phase"
        >
          {isParentBridgeSource ? (
            <View
              className="mb-4 rounded-card border border-primary/20 bg-primary/10 px-4 py-3"
              testID="relearn-parent-bridge-header"
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                {parentBridgeHeaderText}
              </Text>
            </View>
          ) : null}
          <Text className="mb-4 text-body text-text-secondary">
            {copy.methodIntro}
          </Text>
          {methods.map((method) => {
            const isPreferred = preferredMethod === method.id;
            return (
              <Pressable
                key={method.id}
                onPress={() => handleStartMethod(method.id)}
                className={`mb-3 rounded-card p-4 ${
                  isPreferred
                    ? 'bg-primary/10 border border-primary'
                    : 'bg-surface'
                }`}
                testID={`relearn-method-${method.id}`}
                accessibilityRole="button"
                accessibilityLabel={t('relearn.a11yLearnWith', {
                  method: method.label,
                })}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-body font-semibold text-text-primary">
                    {method.label}
                  </Text>
                  {isPreferred ? (
                    <Text className="text-caption font-semibold text-primary">
                      {copy.usualMethod}
                    </Text>
                  ) : null}
                </View>
                <Text className="mt-1 text-body-sm text-text-secondary">
                  {method.description}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
