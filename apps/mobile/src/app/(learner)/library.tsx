import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Subject, CurriculumTopic } from '@eduagent/schemas';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../components/progress';
import { BrandCelebration } from '../../components/common';
import { ShelfView } from '../../components/library/ShelfView';
import { ChapterTopicList } from '../../components/library/ChapterTopicList';
import { useThemeColors } from '../../lib/theme';
import { useSubjects, useUpdateSubject } from '../../hooks/use-subjects';
import { useOverallProgress } from '../../hooks/use-progress';
import { useCurriculum } from '../../hooks/use-curriculum';
import {
  useBooks,
  useBookWithTopics,
  useGenerateBookTopics,
} from '../../hooks/use-books';
import { useApiClient } from '../../lib/api-client';
import { useProfile } from '../../lib/profile';
import { combinedSignal } from '../../lib/query-timeout';
import { assertOk } from '../../lib/assert-ok';

interface SubjectRetentionTopic {
  topicId: string;
  topicTitle?: string;
  easeFactor: number;
  repetitions: number;
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
  const diffDays = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getTopicRetention(topic: SubjectRetentionTopic): RetentionStatus {
  if (topic.failureCount >= 3 || topic.xpStatus === 'decayed')
    return 'forgotten';
  if (topic.repetitions === 0) return 'weak';
  return topic.easeFactor >= 2.5 ? 'strong' : 'fading';
}

function findSuggestedNext(topics: CurriculumTopic[]): string | undefined {
  return [...topics]
    .filter((topic) => !topic.skipped)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id;
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

function TopicRows({
  topics,
  onTopicPress,
}: {
  topics: EnrichedTopic[];
  onTopicPress: (topic: EnrichedTopic) => void;
}): React.ReactElement {
  if (topics.length === 0) {
    return (
      <View
        className="bg-surface rounded-card px-4 py-6 items-center"
        testID="library-empty"
      >
        <Text className="text-body text-text-secondary text-center">
          No topics have shown up here yet.
        </Text>
      </View>
    );
  }

  return (
    <>
      {topics.map((topic) => (
        <Pressable
          key={`${topic.subjectId}-${topic.topicId}`}
          onPress={() => onTopicPress(topic)}
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
                  Last practiced: {formatLastPracticed(topic.lastReviewedAt)}
                </Text>
              )}
            </View>
            <RetentionSignal status={topic.retention} />
          </View>
        </Pressable>
      ))}
    </>
  );
}

export default function LibraryScreen() {
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
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [showManageSubjects, setShowManageSubjects] = useState(false);
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null);

  const subjectsQuery = useSubjects({ includeInactive: true });
  const progressQuery = useOverallProgress();
  const updateSubject = useUpdateSubject();
  const booksQuery = useBooks(selectedSubjectId ?? undefined);
  const curriculumQuery = useCurriculum(selectedSubjectId ?? '');
  const bookQuery = useBookWithTopics(
    selectedSubjectId ?? undefined,
    selectedBookId ?? undefined
  );
  const generateBookTopics = useGenerateBookTopics(
    selectedSubjectId ?? undefined,
    selectedBookId ?? undefined
  );

  useEffect(() => {
    if (routeSubjectId) {
      setSelectedSubjectId(routeSubjectId);
      setSelectedBookId(null);
      setShowAllTopics(false);
    }
  }, [routeSubjectId]);

  // Auto-generate topics when selecting an un-generated book
  useEffect(() => {
    if (!selectedSubjectId || !selectedBookId) return;
    const book = booksQuery.data?.find((entry) => entry.id === selectedBookId);
    if (book && !book.topicsGenerated && !generateBookTopics.isPending) {
      generateBookTopics.mutate({});
    }
  }, [selectedSubjectId, selectedBookId, booksQuery.data]);

  const retentionQueries = useQueries({
    queries: (subjectsQuery.data ?? []).map((subject) => ({
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

  const allTopics = useMemo(() => {
    if (!subjectsQuery.data) return [] as EnrichedTopic[];
    return subjectsQuery.data.flatMap((subject, index) => {
      const data = retentionQueries[index]?.data;
      if (!data?.topics) return [];
      return data.topics.map((topic) => ({
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
  }, [retentionQueries, subjectsQuery.data]);

  const progressBySubjectId = new Map(
    (progressQuery.data?.subjects ?? []).map((subject) => [
      subject.subjectId,
      subject,
    ])
  );
  const selectedSubject =
    subjectsQuery.data?.find((subject) => subject.id === selectedSubjectId) ??
    null;
  const selectedBook =
    booksQuery.data?.find((book) => book.id === selectedBookId) ?? null;
  // Guard against stale generateBookTopics data from a previously selected book
  const generatedBook =
    generateBookTopics.data?.book.id === selectedBookId
      ? generateBookTopics.data
      : null;
  const activeBook = bookQuery.data ?? generatedBook ?? null;
  const flatSubjectTopics =
    curriculumQuery.data?.topics
      ?.filter((topic) => !topic.bookId)
      .sort((a, b) => a.sortOrder - b.sortOrder) ?? [];
  const canGoBack = showAllTopics || selectedSubjectId !== null;
  const headerTitle = selectedBookId
    ? activeBook?.book.title ?? selectedBook?.title ?? 'Book'
    : selectedSubjectId
    ? selectedSubject?.name ?? 'Shelf'
    : showAllTopics
    ? 'All Topics'
    : 'Library';

  const handleRetry = (): void => {
    void subjectsQuery.refetch();
    void progressQuery.refetch();
    retentionQueries.forEach((query) => void query.refetch());
    void booksQuery.refetch();
    void bookQuery.refetch();
  };

  const handleBack = (): void => {
    if (selectedBookId) {
      setSelectedBookId(null);
      return;
    }
    if (selectedSubjectId) {
      setSelectedSubjectId(null);
      setShowAllTopics(false);
      return;
    }
    setShowAllTopics(false);
  };

  const handleSubjectStatusChange = async (
    subject: Subject,
    status: Subject['status']
  ): Promise<void> => {
    setPendingSubjectId(subject.id);
    try {
      await updateSubject.mutateAsync({ subjectId: subject.id, status });
    } finally {
      setPendingSubjectId(null);
    }
  };

  const openTopic = (topicId: string, subjectId: string): void => {
    router.push({
      pathname: '/(learner)/session',
      params: { mode: 'learning', subjectId, topicId },
    } as never);
  };

  const renderSubjectCards = (): React.ReactElement => (
    <>
      <View className="flex-row items-center mb-4 gap-2">
        <Pressable
          onPress={() => setShowAllTopics(false)}
          className={`rounded-full px-4 py-2 ${
            !showAllTopics ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          testID="library-view-shelves"
        >
          <Text
            className={`text-body-sm font-semibold ${
              !showAllTopics ? 'text-text-inverse' : 'text-text-secondary'
            }`}
          >
            Shelves
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setShowAllTopics(true)}
          className={`rounded-full px-4 py-2 ${
            showAllTopics ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          testID="library-view-all-topics"
        >
          <Text
            className={`text-body-sm font-semibold ${
              showAllTopics ? 'text-text-inverse' : 'text-text-secondary'
            }`}
          >
            All Topics
          </Text>
        </Pressable>
      </View>

      {(subjectsQuery.data ?? []).map((subject) => {
        const progress = progressBySubjectId.get(subject.id);
        const progressLabel =
          progress && progress.topicsTotal > 0
            ? `${progress.topicsCompleted}/${progress.topicsTotal} topics`
            : 'Shelf ready to explore';

        return (
          <Pressable
            key={subject.id}
            onPress={() => {
              setSelectedSubjectId(subject.id);
              setSelectedBookId(null);
              setShowAllTopics(false);
            }}
            className="bg-surface rounded-card px-4 py-4 mb-3"
            testID={`subject-card-${subject.id}`}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 me-3">
                <View className="flex-row items-center mb-1">
                  <Text className="text-body font-semibold text-text-primary">
                    {subject.name}
                  </Text>
                  <View className="ms-2">
                    <SubjectStatusPill status={subject.status} />
                  </View>
                </View>
                <Text className="text-body-sm text-text-secondary">
                  {progressLabel}
                </Text>
                {progress?.lastSessionAt && (
                  <Text className="text-caption text-text-tertiary mt-2">
                    Last session: {formatLastPracticed(progress.lastSessionAt)}
                  </Text>
                )}
              </View>

              <View className="items-end">
                {progress && subject.status === 'active' && (
                  <RetentionSignal status={progress.retentionStatus} compact />
                )}
                <Text className="text-caption text-primary mt-3">
                  Open shelf
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </>
  );

  const renderContent = (): React.ReactElement => {
    if (subjectsQuery.isLoading || progressQuery.isLoading) {
      return (
        <View className="py-8 items-center" testID="library-loading">
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text className="text-body-sm text-text-secondary mt-3">
            Loading your subjects...
          </Text>
        </View>
      );
    }

    if (
      subjectsQuery.isError ||
      progressQuery.isError ||
      booksQuery.isError ||
      bookQuery.isError
    ) {
      return (
        <View
          className="flex-1 items-center justify-center px-5 py-12"
          testID="book-error"
        >
          <Text className="text-body text-text-secondary text-center mb-4">
            Unable to load your library. Please try again.
          </Text>
          <Pressable
            onPress={handleRetry}
            className="bg-primary rounded-button px-6 py-3 items-center"
            testID="book-retry-button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Retry
            </Text>
          </Pressable>
        </View>
      );
    }

    if (
      selectedBookId &&
      (generateBookTopics.isPending || (bookQuery.isLoading && !activeBook))
    ) {
      return (
        <View
          className="bg-surface rounded-card px-4 py-8 items-center"
          testID="book-building"
        >
          <Text className="text-5xl mb-4">{selectedBook?.emoji ?? '📘'}</Text>
          <Text className="text-body font-semibold text-text-primary text-center">
            Building your {selectedBook?.title ?? 'book'}...
          </Text>
          {!!selectedBook?.description && (
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              {selectedBook.description}
            </Text>
          )}
          <ActivityIndicator
            size="small"
            color={themeColors.accent}
            style={{ marginTop: 16 }}
          />
        </View>
      );
    }

    if (selectedBookId && activeBook && selectedSubjectId) {
      return (
        <ChapterTopicList
          topics={activeBook.topics}
          suggestedNextId={findSuggestedNext(activeBook.topics)}
          onTopicPress={(topicId) => openTopic(topicId, selectedSubjectId)}
        />
      );
    }

    if (selectedSubjectId && booksQuery.isLoading) {
      return (
        <View className="py-8 items-center" testID="library-topic-loading">
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text className="text-body-sm text-text-secondary mt-3">
            Loading this shelf...
          </Text>
        </View>
      );
    }

    if (selectedSubjectId && booksQuery.data && booksQuery.data.length > 0) {
      return (
        <ShelfView
          books={booksQuery.data}
          suggestedBookId={
            booksQuery.data.find((book) => !book.topicsGenerated)?.id ??
            booksQuery.data[0]?.id
          }
          summaries={
            selectedBook && activeBook
              ? {
                  [selectedBook.id]: {
                    status: activeBook.status,
                    topicCount: activeBook.topics.filter(
                      (topic) => !topic.skipped
                    ).length,
                  },
                }
              : undefined
          }
          onBookPress={(bookId) => {
            setSelectedBookId(bookId);
          }}
        />
      );
    }

    if (selectedSubjectId && flatSubjectTopics.length > 0) {
      return (
        <ChapterTopicList
          topics={flatSubjectTopics}
          suggestedNextId={findSuggestedNext(flatSubjectTopics)}
          onTopicPress={(topicId) => openTopic(topicId, selectedSubjectId)}
        />
      );
    }

    if (showAllTopics) {
      return (
        <TopicRows
          topics={allTopics}
          onTopicPress={(topic) => openTopic(topic.topicId, topic.subjectId)}
        />
      );
    }

    if ((subjectsQuery.data?.length ?? 0) === 0) {
      return (
        <View
          className="bg-surface rounded-card px-4 py-6 items-center"
          testID="library-empty"
        >
          <Text className="text-body text-text-secondary text-center">
            No topics yet — add a subject to get started
          </Text>
        </View>
      );
    }

    return renderSubjectCards();
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 me-3">
          {canGoBack && (
            <Pressable
              onPress={handleBack}
              className="me-3 p-2 -ms-2"
              accessibilityLabel="Back"
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={themeColors.accent}
              />
            </Pressable>
          )}
          <View className="flex-1">
            <Text className="text-h1 font-bold text-text-primary">
              {headerTitle}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {selectedBookId
                ? `${activeBook?.topics.length ?? 0} topics`
                : selectedSubjectId
                ? booksQuery.data && booksQuery.data.length > 0
                  ? `${booksQuery.data.length} books`
                  : `${flatSubjectTopics.length} topics`
                : `${subjectsQuery.data?.length ?? 0} subjects`}
            </Text>
          </View>
        </View>

        {(subjectsQuery.data?.length ?? 0) > 0 && !selectedBookId && (
          <Pressable
            onPress={() => setShowManageSubjects(true)}
            className="rounded-full bg-surface-elevated px-4 py-2"
            testID="manage-subjects-button"
          >
            <Text className="text-body-sm font-semibold text-primary">
              Manage
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        {!selectedSubjectId &&
          !showAllTopics &&
          !!progressQuery.data?.subjects.length &&
          progressQuery.data.subjects.every(
            (subject) =>
              subject.topicsTotal > 0 &&
              subject.topicsVerified >= subject.topicsTotal
          ) && (
            <View
              className="bg-surface rounded-card px-4 py-5 mb-3"
              testID="library-curriculum-complete"
            >
              <View className="flex-row items-start">
                <View className="me-3 mt-1">
                  <BrandCelebration size={36} />
                </View>
                <View className="flex-1">
                  <Text className="text-body font-semibold text-text-primary">
                    You&apos;ve covered everything here!
                  </Text>
                  <Text className="text-body-sm text-text-secondary mt-2">
                    Add a fresh subject when you want something new, or keep
                    revisiting these topics.
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => router.push('/create-subject')}
                className="bg-primary rounded-button py-3 mt-4 items-center"
                testID="library-add-subject"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  Add another subject
                </Text>
              </Pressable>
            </View>
          )}

        {renderContent()}
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
              Pause a subject to hide it from active learning, or archive it
              until you restore it.
            </Text>

            <ScrollView style={{ maxHeight: 360 }}>
              {(subjectsQuery.data ?? []).map((subject) => {
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
