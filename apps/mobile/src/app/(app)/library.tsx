import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Subject, RetentionStatus } from '@eduagent/schemas';
import {
  BookPageFlipAnimation,
  BrandCelebration,
} from '../../components/common';
import type {
  LibraryTab,
  ShelfItem,
  EnrichedTopic as LibFilterEnrichedTopic,
} from '../../lib/library-filters';
import { LibraryTabs } from '../../components/library/LibraryTabs';
import {
  ShelvesTab,
  type ShelvesTabState,
  SHELVES_TAB_INITIAL_STATE,
} from '../../components/library/ShelvesTab';
import {
  BooksTab,
  type BooksTabState,
  BOOKS_TAB_INITIAL_STATE,
} from '../../components/library/BooksTab';
import {
  TopicsTab,
  type TopicsTabState,
  TOPICS_TAB_INITIAL_STATE,
} from '../../components/library/TopicsTab';
import { useAllBooks } from '../../hooks/use-all-books';
import { useThemeColors } from '../../lib/theme';
import { useSubjects, useUpdateSubject } from '../../hooks/use-subjects';
import { useOverallProgress } from '../../hooks/use-progress';
import { useNoteTopicIds } from '../../hooks/use-notes';
import { useApiClient } from '../../lib/api-client';
import { isGuardianProfile, useProfile } from '../../lib/profile';
import { combinedSignal } from '../../lib/query-timeout';
import { assertOk } from '../../lib/assert-ok';
import { formatApiError } from '../../lib/format-api-error';

interface SubjectRetentionTopic {
  topicId: string;
  topicTitle?: string;
  bookId?: string | null;
  easeFactor: number;
  repetitions: number;
  nextReviewAt?: string | null;
  lastReviewedAt: string | null;
  xpStatus: 'pending' | 'verified' | 'decayed';
  failureCount: number;
}

interface SubjectRetentionResponse {
  topics: SubjectRetentionTopic[];
  reviewDueCount: number;
}

function getTopicRetention(topic: SubjectRetentionTopic): RetentionStatus {
  if (topic.failureCount >= 3 || topic.xpStatus === 'decayed')
    return 'forgotten';
  if (topic.repetitions === 0) return 'weak';
  // Use server-computed SM-2 schedule (matches computeRetentionStatus)
  if (!topic.nextReviewAt) return 'weak';
  const now = Date.now();
  const reviewAt = new Date(topic.nextReviewAt).getTime();
  const daysUntilReview = (reviewAt - now) / (1000 * 60 * 60 * 24);
  if (daysUntilReview > 3) return 'strong';
  if (daysUntilReview > 0) return 'fading';
  return 'weak';
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

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const apiClient = useApiClient();
  const { activeProfile, profiles } = useProfile();
  const isGuardian = isGuardianProfile(activeProfile, profiles);

  const [activeTab, setActiveTab] = useState<LibraryTab>('shelves');
  const [shelvesTabState, setShelvesTabState] = useState<ShelvesTabState>(
    SHELVES_TAB_INITIAL_STATE
  );
  const [booksTabState, setBooksTabState] = useState<BooksTabState>(
    BOOKS_TAB_INITIAL_STATE
  );
  const [topicsTabState, setTopicsTabState] = useState<TopicsTabState>(
    TOPICS_TAB_INITIAL_STATE
  );
  const [showManageSubjects, setShowManageSubjects] = useState(false);
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null);

  const subjectsQuery = useSubjects({ includeInactive: true });
  // S-5: Centralized Array.isArray guard — same class as BUG-418.
  // TanStack Query's select can be bypassed when enabled=false.
  const subjects = Array.isArray(subjectsQuery.data) ? subjectsQuery.data : [];
  const progressQuery = useOverallProgress();
  const updateSubject = useUpdateSubject();
  const allBooksQuery = useAllBooks();
  const noteTopicIdsQuery = useNoteTopicIds();
  const noteIdSet = useMemo(
    () => new Set(noteTopicIdsQuery.data?.topicIds ?? []),
    [noteTopicIdsQuery.data]
  );

  const retentionQueries = useQueries({
    queries: subjects.map((subject) => ({
      queryKey: ['retention', 'subject', subject.id, activeProfile?.id],
      queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
        const { signal, cleanup } = combinedSignal(querySignal);
        try {
          const res = await apiClient.subjects[':subjectId'].retention.$get(
            { param: { subjectId: subject.id } },
            { init: { signal } }
          );
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

  // BUG-486: Build bookId→title lookup from already-fetched books data
  const bookTitleMap = useMemo(
    () => new Map(allBooksQuery.books.map((b) => [b.book.id, b.book.title])),
    [allBooksQuery.books]
  );

  const allTopics = useMemo<LibFilterEnrichedTopic[]>(() => {
    if (!subjectsQuery.data) return [];
    return subjectsQuery.data.flatMap((subject, index) => {
      const data = retentionQueries[index]?.data;
      if (!data?.topics) return [];
      return data.topics.map((topic) => ({
        topicId: topic.topicId,
        subjectId: subject.id,
        name: topic.topicTitle ?? topic.topicId,
        subjectName: subject.name,
        subjectStatus: subject.status,
        bookId: topic.bookId ?? null,
        bookTitle: topic.bookId ? bookTitleMap.get(topic.bookId) ?? null : null,
        chapter: null,
        retention: getTopicRetention(topic),
        lastReviewedAt: topic.lastReviewedAt,
        repetitions: topic.repetitions,
        failureCount: topic.failureCount,
        hasNote: noteIdSet.has(topic.topicId),
      }));
    });
  }, [retentionQueries, subjectsQuery.data, noteIdSet, bookTitleMap]);

  const progressBySubjectId = useMemo(
    () =>
      new Map(
        (progressQuery.data?.subjects ?? []).map((s) => [s.subjectId, s])
      ),
    [progressQuery.data?.subjects]
  );

  const shelves = useMemo<ShelfItem[]>(() => {
    const retentionBySubjectId = new Map(
      subjects.map((subject, index) => [
        subject.id,
        retentionQueries[index]?.data,
      ])
    );

    return subjects.map((subject) => ({
      subject,
      progress: progressBySubjectId.get(subject.id),
      reviewDueCount:
        retentionBySubjectId.get(subject.id)?.reviewDueCount ?? undefined,
    }));
  }, [progressBySubjectId, retentionQueries, subjectsQuery.data]);

  const totalOverdue = useMemo(
    () =>
      retentionQueries.reduce(
        (sum, query) => sum + (query.data?.reviewDueCount ?? 0),
        0
      ),
    [retentionQueries]
  );

  const tabCounts = useMemo(
    () => ({
      shelves: subjectsQuery.data?.length ?? 0,
      books: allBooksQuery.books.length,
      topics: allTopics.length,
    }),
    [subjectsQuery.data?.length, allBooksQuery.books.length, allTopics.length]
  );

  const handleRetry = (): void => {
    void subjectsQuery.refetch();
    void progressQuery.refetch();
    allBooksQuery.refetch();
    retentionQueries.forEach((query) => void query.refetch());
  };

  const handleTabChange = (tab: LibraryTab): void => {
    setActiveTab(tab);
    // Clear search on the new tab (per spec: "search text is cleared" on tab switch)
    if (tab === 'shelves')
      setShelvesTabState((prev) => ({ ...prev, search: '' }));
    else if (tab === 'books')
      setBooksTabState((prev) => ({ ...prev, search: '' }));
    else setTopicsTabState((prev) => ({ ...prev, search: '' }));
  };

  const handleSubjectStatusChange = async (
    subject: Subject,
    status: Subject['status']
  ): Promise<void> => {
    setPendingSubjectId(subject.id);
    try {
      await updateSubject.mutateAsync({ subjectId: subject.id, status });
    } catch (err: unknown) {
      Alert.alert('Could not update subject', formatApiError(err));
    } finally {
      setPendingSubjectId(null);
    }
  };

  // BUG-342: Derive session mode from retention — forgotten/weak topics
  // open in relearn mode so the AI uses spaced-repetition pedagogy.
  const openTopic = (
    topicId: string,
    subjectId: string,
    retention?: RetentionStatus,
    topicName?: string
  ): void => {
    const mode =
      retention === 'weak' || retention === 'forgotten'
        ? 'relearn'
        : 'learning';
    router.push({
      pathname: '/(app)/session',
      params: {
        mode,
        subjectId,
        topicId,
        ...(topicName ? { topicName } : {}),
      },
    } as never);
  };

  const renderContent = (): React.ReactElement => {
    if (subjectsQuery.isLoading || progressQuery.isLoading) {
      return (
        <View className="py-8 items-center" testID="library-loading">
          <BookPageFlipAnimation size={80} color={themeColors.accent} />
          <Text className="text-body-sm text-text-secondary mt-3">
            Loading your subjects...
          </Text>
        </View>
      );
    }

    if (subjectsQuery.isError || progressQuery.isError) {
      return (
        <View
          className="flex-1 items-center justify-center px-5 py-12"
          testID="library-error"
        >
          <Text className="text-body text-text-secondary text-center mb-4">
            Unable to load your library. Please try again.
          </Text>
          <Pressable
            onPress={handleRetry}
            className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
            testID="library-retry-button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Retry
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(app)')}
            className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
            testID="library-home-button"
          >
            <Text className="text-text-primary text-body font-semibold">
              Go Home
            </Text>
          </Pressable>
        </View>
      );
    }

    // Top-level library view — three tabs
    const subjectList = subjects.map((s) => ({
      id: s.id,
      name: s.name,
    }));
    const bookList = allBooksQuery.books.map((b) => ({
      id: b.book.id,
      title: b.book.title,
    }));

    return (
      <>
        {activeTab === 'shelves' && (
          <ShelvesTab
            shelves={shelves}
            state={shelvesTabState}
            onStateChange={setShelvesTabState}
            onShelfPress={(subjectId) => {
              router.push({
                pathname: '/(app)/shelf/[subjectId]',
                params: { subjectId },
              } as never);
            }}
            onAddSubject={() => router.push('/create-subject')}
          />
        )}
        {activeTab === 'books' && allBooksQuery.isError && (
          <View
            className="flex-1 items-center justify-center px-5 py-12"
            testID="books-tab-error"
          >
            <Text className="text-body text-text-secondary text-center mb-4">
              Could not load your books. Please try again.
            </Text>
            <Pressable
              onPress={() => allBooksQuery.refetch()}
              className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
              testID="books-tab-retry-button"
            >
              <Text className="text-text-inverse text-body font-semibold">
                Retry
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.replace('/(app)')}
              className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
              testID="books-tab-home-button"
            >
              <Text className="text-body text-text-secondary font-semibold">
                Go Home
              </Text>
            </Pressable>
          </View>
        )}
        {activeTab === 'books' && !allBooksQuery.isError && (
          <BooksTab
            books={allBooksQuery.books}
            subjects={subjectList}
            state={booksTabState}
            onStateChange={setBooksTabState}
            onBookPress={(subjectId, bookId) => {
              router.push({
                pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
                params: { subjectId, bookId },
              } as never);
            }}
            onAddSubject={() => router.push('/create-subject')}
          />
        )}
        {activeTab === 'topics' && (
          <TopicsTab
            topics={allTopics}
            subjects={subjectList}
            books={bookList}
            noteTopicIds={noteIdSet}
            state={topicsTabState}
            onStateChange={setTopicsTabState}
            onTopicPress={(topicId, subjectId, retention, topicName) =>
              openTopic(topicId, subjectId, retention, topicName)
            }
            onAddSubject={() => router.push('/create-subject')}
          />
        )}
      </>
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View
        className="px-5 pt-4 pb-3 flex-row items-center justify-between"
        style={{ zIndex: 2, elevation: 2 }}
      >
        <View className="flex-row items-center flex-1 me-3">
          <View className="flex-1">
            <Text className="text-h1 font-bold text-text-primary">Library</Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {isGuardian
                ? `Your personal library \u00B7 ${
                    subjectsQuery.data?.length ?? 0
                  } subjects`
                : `${subjectsQuery.data?.length ?? 0} subjects`}
            </Text>
          </View>
        </View>

        {(subjectsQuery.data?.length ?? 0) > 0 && (
          <Pressable
            onPress={() => setShowManageSubjects(true)}
            className="rounded-full bg-surface-elevated px-4 py-2"
            style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
            accessibilityRole="button"
            accessibilityLabel="Manage subjects"
            testID="manage-subjects-button"
          >
            <Text className="text-body-sm font-semibold text-primary">
              Manage
            </Text>
          </Pressable>
        )}
      </View>

      {/* Tabs fixed above scroll area to avoid gesture conflicts with nested FlatLists */}
      {!subjectsQuery.isLoading &&
        !subjectsQuery.isError &&
        !progressQuery.isLoading &&
        !progressQuery.isError && (
          <View
            className="px-5"
            style={{ zIndex: 2, position: 'relative', elevation: 2 }}
          >
            <LibraryTabs
              activeTab={activeTab}
              onTabChange={handleTabChange}
              counts={tabCounts}
              reviewBadge={totalOverdue > 0 ? totalOverdue : undefined}
            />
          </View>
        )}

      <ScrollView
        className="flex-1 px-5"
        style={{ zIndex: 0 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
      >
        {!!progressQuery.data?.subjects.length &&
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
                  <BrandCelebration size={56} />
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
              {subjects.map((subject) => {
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
              testID="manage-subjects-close"
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
