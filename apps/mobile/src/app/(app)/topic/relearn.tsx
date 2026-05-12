import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useStartRelearn,
  useTeachingPreference,
} from '../../../hooks/use-retention';
import {
  useOverdueTopics,
  type OverdueSubject,
  type OverdueTopic,
} from '../../../hooks/use-progress';
import { useProfile, personaFromBirthYear } from '../../../lib/profile';
import { goBackOrReplace, homeHrefForReturnTo } from '../../../lib/navigation';
import { formatApiError } from '../../../lib/format-api-error';
import { useParentProxy } from '../../../hooks/use-parent-proxy';
import { firstParam } from '../../../lib/route-params';

const TEACHING_METHODS = [
  {
    id: 'visual_diagrams' as const,
    label: 'Visual Diagrams',
    description: 'Learn through charts, diagrams, and visual representations',
  },
  {
    id: 'step_by_step' as const,
    label: 'Step-by-Step',
    description: 'Break concepts down into clear, sequential steps',
  },
  {
    id: 'real_world_examples' as const,
    label: 'Real-World Examples',
    description: 'Connect concepts to practical, everyday situations',
  },
  {
    id: 'practice_problems' as const,
    label: 'Practice Problems',
    description: 'Learn by working through guided exercises',
  },
];

const TEACHING_METHODS_LEARNER = [
  {
    id: 'visual_diagrams' as const,
    label: 'Show Me Pictures',
    description: 'Learn with pictures, charts, and drawings',
  },
  {
    id: 'step_by_step' as const,
    label: 'Walk Me Through It',
    description: 'Break it down into small, easy steps',
  },
  {
    id: 'real_world_examples' as const,
    label: 'Show Me How It Works',
    description: 'Learn with fun, everyday examples',
  },
  {
    id: 'practice_problems' as const,
    label: 'Let Me Try It',
    description: 'Learn by solving problems with help',
  },
];

const COPY_DEFAULT = {
  topicIntro: 'Pick a topic that feels the shakiest right now.',
  methodIntro: 'Choose a teaching style that feels like your best next step.',
  subjectIntro: 'Which subject would you like to review first?',
  emptyTitle: 'Nothing to relearn right now',
  emptyBody: "You're all caught up on overdue topics. Nice work.",
  errorTitle: "We couldn't load your review topics right now.",
  usualMethod: 'Usual method',
} as const;

const COPY_LEARNER = {
  topicIntro: 'Pick the topic you want to try again.',
  methodIntro: 'How would you like to learn this time?',
  subjectIntro: 'Which subject should we start with?',
  emptyTitle: 'No review topics right now',
  emptyBody: "You're all caught up for now. Great job!",
  errorTitle: "We couldn't load your review topics right now.",
  usualMethod: 'Usual method',
} as const;

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    topicId?: string | string[];
    subjectId?: string | string[];
    topicName?: string | string[];
    subjectName?: string | string[];
    returnTo?: string | string[];
  }>();
  const routeTopicId = firstParam(params.topicId);
  const routeSubjectId = firstParam(params.subjectId);
  const routeTopicName = firstParam(params.topicName);
  const routeSubjectName = firstParam(params.subjectName);
  const returnTo = firstParam(params.returnTo);

  const directEntry = Boolean(routeTopicId && routeSubjectId);
  const startRelearn = useStartRelearn();
  const overdueTopics = useOverdueTopics();
  const { activeProfile } = useProfile();
  const { isParentProxy } = useParentProxy();
  const persona = personaFromBirthYear(activeProfile?.birthYear);
  const isLearner = persona === 'learner';
  const methods = isLearner ? TEACHING_METHODS_LEARNER : TEACHING_METHODS;
  const copy = isLearner ? COPY_LEARNER : COPY_DEFAULT;

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
      router.replace(homeHrefForReturnTo(returnTo) as never);
      return;
    }

    goBackOrReplace(router, '/(app)/library' as const);
  }, [returnTo, router]);

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
            },
          } as never);
        },
        onError: (err: unknown) => {
          setError(formatApiError(err));
        },
        onSettled: () => {
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

  if (isParentProxy) {
    return <Redirect href="/(app)/home" />;
  }

  const renderHeader = () => (
    <View className="px-5 pt-4 pb-3 flex-row items-center">
      <Pressable
        onPress={handleBack}
        className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
        testID="relearn-back"
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={26} className="text-primary" />
      </Pressable>
      <Text className="text-h2 font-bold text-text-primary">Relearn Topic</Text>
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
            accessibilityLabel="Retry"
          >
            <Text className="text-body-sm font-semibold text-primary">
              Retry
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
          <ActivityIndicator size="large" />
          <Text className="mt-3 text-body text-text-secondary">
            Loading review topics...
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
            accessibilityLabel="Retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Retry
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
            accessibilityLabel="Go back"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Go back
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
          <ActivityIndicator size="large" />
          <Text className="mt-3 text-body text-text-secondary">
            Starting relearn session...
          </Text>
          <Pressable
            onPress={() => {
              setIsSubmitting(false);
              setError(null);
            }}
            className="mt-6 min-h-[44px] rounded-button bg-surface-elevated px-6 py-3 items-center justify-center"
            testID="relearn-cancel"
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text className="text-body font-semibold text-text-primary">
              Cancel
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
              accessibilityLabel={`Open ${subject.subjectName}`}
            >
              <Text className="text-body font-semibold text-text-primary">
                {subject.subjectName}
              </Text>
              <Text className="mt-1 text-body-sm text-text-secondary">
                {subject.overdueCount} overdue topic
                {subject.overdueCount === 1 ? '' : 's'}
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
                  accessibilityLabel={`Open ${topic.topicTitle}`}
                >
                  <Text className="text-body font-semibold text-text-primary">
                    {topic.topicTitle}
                  </Text>
                  <Text className="mt-1 text-body-sm text-text-secondary">
                    {topic.overdueDays} day{topic.overdueDays === 1 ? '' : 's'}{' '}
                    overdue
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
                accessibilityLabel={`Learn with ${method.label}`}
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
