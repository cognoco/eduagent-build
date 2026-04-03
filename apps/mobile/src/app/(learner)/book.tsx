import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Subject } from '@eduagent/schemas';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../components/progress';
import { BrandCelebration } from '../../components/common';
import { useThemeColors } from '../../lib/theme';
import { useSubjects, useUpdateSubject } from '../../hooks/use-subjects';
import { useOverallProgress } from '../../hooks/use-progress';
import { useApiClient } from '../../lib/api-client';
import { useProfile } from '../../lib/profile';
import { combinedSignal } from '../../lib/query-timeout';
import { assertOk } from '../../lib/assert-ok';

interface SubjectRetentionTopic {
  topicId: string;
  topicTitle?: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: string | null;
  lastReviewedAt: string | null;
  xpStatus: 'pending' | 'verified' | 'decayed';
  failureCount: number;
}

interface SubjectRetentionResponse {
  topics: SubjectRetentionTopic[];
  reviewDueCount: number;
}

interface EnrichedTopic {
  topicId: string;
  subjectId: string;
  name: string;
  subjectName: string;
  subjectStatus: Subject['status'];
  retention: RetentionStatus;
  lastReviewedAt: string | null;
  repetitions: number;
  failureCount: number;
}

function formatLastPracticed(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getTopicRetention(topic: SubjectRetentionTopic): RetentionStatus {
  if (topic.failureCount >= 3 || topic.xpStatus === 'decayed') {
    return 'forgotten';
  }
  if (topic.repetitions === 0) {
    return 'weak';
  }
  return topic.easeFactor >= 2.5 ? 'strong' : 'fading';
}

function SubjectStatusPill({
  status,
}: {
  status: Subject['status'];
}): React.ReactElement | null {
  if (status === 'active') return null;

  return (
    <View
      className={
        status === 'paused'
          ? 'rounded-full px-2 py-1 bg-warning/15'
          : 'rounded-full px-2 py-1 bg-text-secondary/15'
      }
    >
      <Text
        className={
          status === 'paused'
            ? 'text-caption font-medium text-warning'
            : 'text-caption font-medium text-text-secondary'
        }
      >
        {status === 'paused' ? 'Paused' : 'Archived'}
      </Text>
    </View>
  );
}

export default function LearningBookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const apiClient = useApiClient();
  const { activeProfile } = useProfile();
  const { subjectId: routeSubjectId } = useLocalSearchParams<{
    subjectId?: string;
  }>();

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    routeSubjectId ?? null
  );
  const [showManageSubjects, setShowManageSubjects] = useState(false);
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null);

  const {
    data: subjects,
    isLoading: subjectsLoading,
    isError: subjectsError,
    refetch: refetchSubjects,
    isRefetching: subjectsRefetching,
  } = useSubjects({ includeInactive: true });
  const {
    data: overallProgress,
    isLoading: progressLoading,
    isError: progressError,
    refetch: refetchProgress,
    isRefetching: progressRefetching,
  } = useOverallProgress();
  const updateSubject = useUpdateSubject();

  useEffect(() => {
    if (routeSubjectId) {
      setSelectedSubjectId(routeSubjectId);
    }
  }, [routeSubjectId]);

  const retentionQueries = useQueries({
    queries: (subjects ?? []).map((subject) => ({
      queryKey: ['retention', 'subject', subject.id, activeProfile?.id],
      queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
        const { signal, cleanup } = combinedSignal(querySignal);
        try {
          const res = await apiClient.subjects[':subjectId'].retention.$get({
            param: { subjectId: subject.id },
            init: { signal },
          } as never);
          await assertOk(res);
          return (await res.json()) as SubjectRetentionResponse;
        } finally {
          cleanup();
        }
      },
      enabled: !!activeProfile && !!subject.id,
      retry: false,
    })),
  });

  const retentionMap = new Map<string, RetentionStatus>();
  if (overallProgress?.subjects) {
    for (const sp of overallProgress.subjects) {
      retentionMap.set(sp.subjectId, sp.retentionStatus);
    }
  }

  const allTopics = useMemo(() => {
    if (!subjects) return [] as EnrichedTopic[];

    return subjects.flatMap((subject, index) => {
      const retentionData = retentionQueries[index]?.data;
      if (!retentionData?.topics) return [];

      return retentionData.topics.map((topic) => ({
        topicId: topic.topicId,
        subjectId: subject.id,
        name: topic.topicTitle ?? topic.topicId,
        subjectName: subject.name,
        subjectStatus: subject.status,
        retention: getTopicRetention(topic),
        lastReviewedAt: topic.lastReviewedAt,
        repetitions: topic.repetitions,
        failureCount: topic.failureCount,
      }));
    });
  }, [retentionQueries, subjects]);

  const filteredTopics = selectedSubjectId
    ? allTopics.filter((topic) => topic.subjectId === selectedSubjectId)
    : allTopics;

  const topicsLoading = retentionQueries.some((query) => query.isLoading);
  const topicsError = retentionQueries.some((query) => query.isError);
  const topicsRefetching = retentionQueries.some((query) => query.isRefetching);
  const isInitialLoading = subjectsLoading || progressLoading;
  const hasBlockingError = subjectsError || progressError;
  const isRefetching =
    subjectsRefetching || progressRefetching || topicsRefetching;
  const subjectCount = subjects?.length ?? 0;
  const selectedSubject =
    subjects?.find((subject) => subject.id === selectedSubjectId) ?? null;
  const progressBySubjectId = new Map(
    (overallProgress?.subjects ?? []).map((subject) => [
      subject.subjectId,
      subject,
    ])
  );
  const subjectsForOverview = selectedSubject
    ? [selectedSubject]
    : subjects ?? [];
  const visibleProgressSubjects = subjectsForOverview
    .map((subject) => progressBySubjectId.get(subject.id))
    .filter((subject) => subject != null);
  const showCurriculumCompleteBanner =
    visibleProgressSubjects.length > 0 &&
    visibleProgressSubjects.every(
      (subject) =>
        subject.topicsTotal > 0 && subject.topicsVerified >= subject.topicsTotal
    );
  const showTopicLoadingState =
    !isInitialLoading &&
    !hasBlockingError &&
    subjectCount > 0 &&
    filteredTopics.length === 0 &&
    topicsLoading;
  const showTopicOverview =
    !isInitialLoading &&
    !hasBlockingError &&
    filteredTopics.length === 0 &&
    subjectCount > 0 &&
    !topicsLoading;

  const handleRetry = (): void => {
    void refetchSubjects();
    void refetchProgress();
    retentionQueries.forEach((query) => {
      void query.refetch();
    });
  };

  const handleSubjectStatusChange = async (
    subject: Subject,
    status: Subject['status']
  ): Promise<void> => {
    setPendingSubjectId(subject.id);
    try {
      await updateSubject.mutateAsync({
        subjectId: subject.id,
        status,
      });

      if (
        selectedSubjectId === subject.id &&
        status !== 'active' &&
        filteredTopics.length === 0
      ) {
        setSelectedSubjectId(null);
      }
    } finally {
      setPendingSubjectId(null);
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-start justify-between">
        <View className="flex-1 me-3">
          <Text className="text-h1 font-bold text-text-primary">
            Learning Book
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {isInitialLoading
              ? 'Loading your subjects...'
              : showTopicLoadingState
              ? 'Loading topic history...'
              : `${allTopics.length} topics across ${subjectCount} subject${
                  subjectCount === 1 ? '' : 's'
                }`}
          </Text>
        </View>
        {subjectCount > 0 && (
          <Pressable
            onPress={() => setShowManageSubjects(true)}
            className="rounded-full bg-surface-elevated px-4 py-2"
            testID="manage-subjects-button"
            accessibilityRole="button"
            accessibilityLabel="Manage subjects"
          >
            <Text className="text-body-sm font-semibold text-primary">
              Manage
            </Text>
          </Pressable>
        )}
      </View>

      {subjects && subjects.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-5 py-2"
          contentContainerStyle={{ gap: 8 }}
          testID="subject-filter-tabs"
        >
          <Pressable
            onPress={() => setSelectedSubjectId(null)}
            className={`rounded-full px-4 py-2 ${
              selectedSubjectId === null ? 'bg-primary' : 'bg-surface-elevated'
            }`}
            testID="filter-all"
          >
            <Text
              className={`text-body-sm font-medium ${
                selectedSubjectId === null
                  ? 'text-text-inverse'
                  : 'text-text-secondary'
              }`}
            >
              All
            </Text>
          </Pressable>
          {subjects.map((subject) => (
            <Pressable
              key={subject.id}
              onPress={() =>
                setSelectedSubjectId(
                  selectedSubjectId === subject.id ? null : subject.id
                )
              }
              className={`rounded-full px-4 py-2 ${
                selectedSubjectId === subject.id
                  ? 'bg-primary'
                  : 'bg-surface-elevated'
              }`}
              testID={`filter-${subject.id}`}
            >
              <View className="flex-row items-center">
                <Text
                  className={`text-body-sm font-medium ${
                    selectedSubjectId === subject.id
                      ? 'text-text-inverse'
                      : 'text-text-secondary'
                  }`}
                >
                  {subject.name}
                </Text>
                {retentionMap.has(subject.id) &&
                  subject.status === 'active' && (
                    <View className="ms-2">
                      <RetentionSignal
                        status={retentionMap.get(subject.id)!}
                        compact
                      />
                    </View>
                  )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        {hasBlockingError ? (
          <View
            className="flex-1 items-center justify-center px-5 py-12"
            testID="book-error"
          >
            <Text className="text-body text-text-secondary text-center mb-4">
              Unable to load your learning book. Please try again.
            </Text>
            <Pressable
              onPress={handleRetry}
              disabled={isRefetching}
              className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
              testID="book-retry-button"
              accessibilityLabel="Retry loading"
              accessibilityRole="button"
            >
              {isRefetching ? (
                <ActivityIndicator
                  size="small"
                  color="white"
                  testID="book-retry-loading"
                />
              ) : (
                <Text className="text-text-inverse text-body font-semibold">
                  Retry
                </Text>
              )}
            </Pressable>
          </View>
        ) : isInitialLoading ? (
          <View className="py-8 items-center" testID="learning-book-loading">
            <ActivityIndicator size="large" color={themeColors.accent} />
            <Text className="text-body-sm text-text-secondary mt-3">
              Loading your learning book...
            </Text>
          </View>
        ) : (
          <>
            {topicsError && (
              <View
                className="bg-warning/10 rounded-card px-4 py-4 mb-3"
                testID="learning-book-topic-warning"
              >
                <Text className="text-body-sm font-semibold text-warning">
                  Some topic details could not be loaded yet.
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  Your subjects are still available below. Pull to retry later
                  or tap retry now.
                </Text>
                <Pressable
                  onPress={handleRetry}
                  disabled={isRefetching}
                  className="self-start mt-3 rounded-button bg-surface-elevated px-4 py-2"
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading topic details"
                >
                  <Text className="text-body-sm font-semibold text-text-primary">
                    {isRefetching ? 'Retrying...' : 'Retry'}
                  </Text>
                </Pressable>
              </View>
            )}

            {showCurriculumCompleteBanner ? (
              <View
                className="bg-surface rounded-card px-4 py-5 mb-3"
                testID="learning-book-curriculum-complete"
              >
                <View className="flex-row items-start">
                  <View className="me-3 mt-1">
                    <BrandCelebration size={36} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-body font-semibold text-text-primary">
                      {selectedSubject
                        ? `You've covered everything in ${selectedSubject.name}!`
                        : "You've covered everything here!"}
                    </Text>
                    <Text className="text-body-sm text-text-secondary mt-2">
                      Add a fresh subject when you want something new, or keep
                      revisiting these topics to make the learning stick.
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => router.push('/create-subject')}
                  className="bg-primary rounded-button py-3 mt-4 items-center"
                  testID="learning-book-add-subject"
                  accessibilityRole="button"
                  accessibilityLabel="Add another subject"
                >
                  <Text className="text-text-inverse text-body font-semibold">
                    Add another subject
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {filteredTopics.length > 0 ? (
              filteredTopics.map((topic) => (
                <Pressable
                  key={`${topic.subjectId}-${topic.topicId}`}
                  onPress={() =>
                    router.push({
                      pathname: `/(learner)/topic/${topic.topicId}`,
                      params: {
                        subjectId: topic.subjectId,
                      },
                    } as never)
                  }
                  className="bg-surface rounded-card px-4 py-3 mb-2"
                  testID={`topic-row-${topic.topicId}`}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 me-3">
                      <Text className="text-body font-medium text-text-primary">
                        {topic.name}
                      </Text>
                      <View className="flex-row items-center mt-1 gap-2">
                        <Text className="text-caption text-text-secondary">
                          {topic.subjectName}
                        </Text>
                        <SubjectStatusPill status={topic.subjectStatus} />
                        {topic.repetitions > 0 && (
                          <Text className="text-caption text-text-secondary">
                            {topic.repetitions}{' '}
                            {topic.repetitions === 1 ? 'session' : 'sessions'}
                          </Text>
                        )}
                      </View>
                      {topic.failureCount >= 3 && (
                        <Text className="text-caption text-warning mt-0.5">
                          Needs attention
                        </Text>
                      )}
                      {formatLastPracticed(topic.lastReviewedAt) && (
                        <Text className="text-caption text-text-tertiary mt-0.5">
                          Last practiced:{' '}
                          {formatLastPracticed(topic.lastReviewedAt)}
                        </Text>
                      )}
                    </View>
                    <RetentionSignal status={topic.retention} />
                  </View>
                </Pressable>
              ))
            ) : showTopicLoadingState ? (
              <View
                className="bg-surface rounded-card px-4 py-6 items-center"
                testID="learning-book-topic-loading"
              >
                <ActivityIndicator size="small" color={themeColors.accent} />
                <Text className="text-body text-text-primary text-center mt-3">
                  Building your book pages...
                </Text>
                <Text className="text-body-sm text-text-secondary text-center mt-1">
                  Your subjects are ready. Topic history is still loading.
                </Text>
              </View>
            ) : showTopicOverview ? (
              <View
                className="bg-surface rounded-card px-4 py-5"
                testID="learning-book-subject-overview"
              >
                <Text className="text-body font-semibold text-text-primary">
                  {selectedSubject
                    ? `${selectedSubject.name} is ready`
                    : 'Your learning book is ready'}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-2">
                  {selectedSubject
                    ? 'This subject has not built out any topic history yet. Start a session and your book will begin filling in here.'
                    : 'Your subjects are connected. Start a session and topic pages will begin filling in here as you learn and review.'}
                </Text>

                <View className="mt-4">
                  {subjectsForOverview.map((subject) => (
                    <View
                      key={subject.id}
                      className="flex-row items-center justify-between py-2"
                    >
                      <View className="flex-row items-center flex-1 me-3">
                        <Text className="text-body-sm font-medium text-text-primary">
                          {subject.name}
                        </Text>
                        <View className="ms-2">
                          <SubjectStatusPill status={subject.status} />
                        </View>
                      </View>
                      {retentionMap.has(subject.id) &&
                        subject.status === 'active' && (
                          <RetentionSignal
                            status={retentionMap.get(subject.id)!}
                            compact
                          />
                        )}
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View
                className="bg-surface rounded-card px-4 py-6 items-center"
                testID="learning-book-empty"
              >
                <Text className="text-body text-text-secondary text-center">
                  {selectedSubjectId
                    ? 'No topics in this subject yet.'
                    : 'No topics yet — add a subject to get started'}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={showManageSubjects}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManageSubjects(false)}
      >
        <View className="flex-1 bg-black/40 justify-end">
          <View
            className="bg-background rounded-t-3xl px-5 pt-5"
            style={{ paddingBottom: Math.max(insets.bottom, 24) }}
          >
            <View className="items-center mb-4">
              <View className="w-10 h-1 rounded-full bg-text-secondary/30" />
            </View>
            <Text className="text-h3 font-semibold text-text-primary mb-2">
              Manage subjects
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              Pause a subject to hide it from active learning, or archive it to
              move it fully out of the way until you restore it.
            </Text>

            <ScrollView style={{ maxHeight: 360 }}>
              {(subjects ?? []).map((subject) => {
                const isPending = pendingSubjectId === subject.id;
                return (
                  <View
                    key={subject.id}
                    className="bg-surface rounded-card px-4 py-4 mb-3"
                  >
                    <View className="flex-row items-center justify-between mb-3">
                      <Text className="text-body font-semibold text-text-primary flex-1 me-3">
                        {subject.name}
                      </Text>
                      <SubjectStatusPill status={subject.status} />
                    </View>

                    <View className="flex-row gap-2">
                      {subject.status === 'active' ? (
                        <>
                          <Pressable
                            onPress={() =>
                              void handleSubjectStatusChange(subject, 'paused')
                            }
                            disabled={isPending}
                            className="flex-1 rounded-button bg-surface-elevated py-2.5 items-center"
                            testID={`pause-subject-${subject.id}`}
                          >
                            <Text className="text-body-sm font-semibold text-text-primary">
                              {isPending ? 'Saving...' : 'Pause'}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              void handleSubjectStatusChange(
                                subject,
                                'archived'
                              )
                            }
                            disabled={isPending}
                            className="flex-1 rounded-button bg-surface-elevated py-2.5 items-center"
                            testID={`archive-subject-${subject.id}`}
                          >
                            <Text className="text-body-sm font-semibold text-text-primary">
                              Archive
                            </Text>
                          </Pressable>
                        </>
                      ) : subject.status === 'paused' ? (
                        <>
                          <Pressable
                            onPress={() =>
                              void handleSubjectStatusChange(subject, 'active')
                            }
                            disabled={isPending}
                            className="flex-1 rounded-button bg-primary py-2.5 items-center"
                            testID={`resume-subject-${subject.id}`}
                          >
                            <Text className="text-body-sm font-semibold text-text-inverse">
                              {isPending ? 'Saving...' : 'Resume'}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              void handleSubjectStatusChange(
                                subject,
                                'archived'
                              )
                            }
                            disabled={isPending}
                            className="flex-1 rounded-button bg-surface-elevated py-2.5 items-center"
                            testID={`archive-subject-${subject.id}`}
                          >
                            <Text className="text-body-sm font-semibold text-text-primary">
                              Archive
                            </Text>
                          </Pressable>
                        </>
                      ) : (
                        <Pressable
                          onPress={() =>
                            void handleSubjectStatusChange(subject, 'active')
                          }
                          disabled={isPending}
                          className="flex-1 rounded-button bg-primary py-2.5 items-center"
                          testID={`restore-subject-${subject.id}`}
                        >
                          <Text className="text-body-sm font-semibold text-text-inverse">
                            {isPending ? 'Saving...' : 'Restore'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => setShowManageSubjects(false)}
              className="items-center py-3"
              accessibilityRole="button"
              accessibilityLabel="Close manage subjects"
            >
              <Text className="text-body font-semibold text-text-secondary">
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
