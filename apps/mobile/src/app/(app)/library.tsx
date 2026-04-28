import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { platformAlert } from '../../lib/platform-alert';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Subject, RetentionStatus } from '@eduagent/schemas';
import {
  BookPageFlipAnimation,
  BrandCelebration,
  ErrorFallback,
} from '../../components/common';
import { goBackOrReplace } from '../../lib/navigation';
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

interface LibraryRetentionResponse {
  subjects: Array<{
    subjectId: string;
    topics: SubjectRetentionTopic[];
    reviewDueCount: number;
  }>;
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

  // [M19] Timeout escape for subjects/progress loading spinner
  const isSubjectsLoading = subjectsQuery.isLoading || progressQuery.isLoading;
  const [subjectsLoadTimedOut, setSubjectsLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!isSubjectsLoading) {
      setSubjectsLoadTimedOut(false);
      return;
    }
    const t = setTimeout(() => setSubjectsLoadTimedOut(true), 15_000);
    return () => clearTimeout(t);
  }, [isSubjectsLoading]);

  const updateSubject = useUpdateSubject();
  const allBooksQuery = useAllBooks();

  // [IMP-3] Timeout escape for books-tab loading spinner (mirrors subjects pattern)
  const [booksLoadTimedOut, setBooksLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!allBooksQuery.isLoading) {
      setBooksLoadTimedOut(false);
      return;
    }
    const t = setTimeout(() => setBooksLoadTimedOut(true), 15_000);
    return () => clearTimeout(t);
  }, [allBooksQuery.isLoading]);
  const noteTopicIdsQuery = useNoteTopicIds();
  const noteIdSet = useMemo(
    () => new Set(noteTopicIdsQuery.data?.topicIds ?? []),
    [noteTopicIdsQuery.data]
  );

  // [BUG-732 / PERF-2] Single aggregate /library/retention call instead of
  // N parallel /subjects/:id/retention calls. The mapping below preserves
  // the per-subject array shape so the existing index-based consumers
  // (`retentionQueries[index]?.data`) keep working without churn.
  const libraryRetentionQuery = useQuery({
    queryKey: ['library', 'retention', activeProfile?.id],
    queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await apiClient.library.retention.$get(
          {},
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as LibraryRetentionResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    retry: false,
  });

  const retentionDataBySubjectId = useMemo(() => {
    const map = new Map<string, SubjectRetentionResponse>();
    for (const s of libraryRetentionQuery.data?.subjects ?? []) {
      map.set(s.subjectId, {
        topics: s.topics,
        reviewDueCount: s.reviewDueCount,
      });
    }
    return map;
  }, [libraryRetentionQuery.data]);

  const retentionQueries = useMemo(
    () =>
      subjects.map((subject) => ({
        data: retentionDataBySubjectId.get(subject.id),
        isLoading: libraryRetentionQuery.isLoading,
        isError: libraryRetentionQuery.isError,
        refetch: () => libraryRetentionQuery.refetch(),
      })),
    [subjects, retentionDataBySubjectId, libraryRetentionQuery]
  );

  // BUG-486: Build bookId→title lookup from already-fetched books data
  const bookTitleMap = useMemo(
    () => new Map(allBooksQuery.books.map((b) => [b.book.id, b.book.title])),
    [allBooksQuery.books]
  );

  const allTopics = useMemo<LibFilterEnrichedTopic[]>(() => {
    // [BUG-634 / M-2] Same Array.isArray guard as line 136. TanStack Query's
    // select transform is bypassed when enabled=false, so the raw cache value
    // can be a non-array (stale shape, undefined, prior error payload).
    // flatMap on a non-array throws TypeError and crashes the Library screen.
    if (!Array.isArray(subjectsQuery.data)) return [];
    return subjectsQuery.data.flatMap((subject, index) => {
      const data = retentionQueries[index]?.data;
      // [BUG-818] Defensive guard: an absent or non-array `topics` field
      // (e.g. partial-success payload, schema drift, `topics:null`) must
      // skip this subject rather than crash on `.map`. The previous
      // truthiness check already covered null/undefined; tightening to
      // Array.isArray also catches stale {} or string payloads.
      if (!Array.isArray(data?.topics)) return [];
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

  // Per-book topic counts derived from retention data (single source of truth
  // across book cards, shelf headers, and the library-wide total so the
  // numbers always add up). "Completed" uses the same xpStatus=='verified'
  // signal that BookScreen relies on for its "topics done" indicator.
  const topicCountsByBookId = useMemo(() => {
    const totals = new Map<string, { total: number; completed: number }>();
    retentionQueries.forEach((q) => {
      const topics = q.data?.topics;
      if (!topics) return;
      for (const t of topics) {
        if (!t.bookId) continue;
        const current = totals.get(t.bookId) ?? { total: 0, completed: 0 };
        current.total += 1;
        if (t.xpStatus === 'verified') current.completed += 1;
        totals.set(t.bookId, current);
      }
    });
    return totals;
  }, [retentionQueries]);

  const enrichedBooks = useMemo(() => {
    return allBooksQuery.books.map((b) => {
      const counts = topicCountsByBookId.get(b.book.id);
      if (!counts) return b;
      // [BUG-870] The API marks a book IN_PROGRESS based on session existence,
      // but the badge sits next to the client-derived "X/Y topics" string,
      // which counts xpStatus==='verified' topics. When a child opens a
      // session without verifying any topic, the API returns IN_PROGRESS
      // while the client shows "0/10 topics" — confusing parents about
      // actual progress. Reconcile both signals from the same definition:
      // verified-topic count. The badge follows the visible progress text.
      let status = b.status;
      if (counts.total > 0) {
        if (counts.completed === 0) status = 'NOT_STARTED';
        else if (counts.completed >= counts.total) {
          // Don't downgrade REVIEW_DUE → COMPLETED — the API knows when
          // retention has slipped and the user owes a review.
          if (status !== 'REVIEW_DUE') status = 'COMPLETED';
        } else {
          status = 'IN_PROGRESS';
        }
      }
      return {
        ...b,
        topicCount: counts.total,
        completedCount: counts.completed,
        status,
      };
    });
  }, [allBooksQuery.books, topicCountsByBookId]);

  const totalTopicsAcrossBooks = useMemo(
    () =>
      Array.from(topicCountsByBookId.values()).reduce(
        (sum, c) => sum + c.total,
        0
      ),
    [topicCountsByBookId]
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

  // Badge uses allTopics.length (not totalTopicsAcrossBooks) so the count
  // matches what the Topics tab actually renders — including orphan topics
  // with a null bookId, which totalTopicsAcrossBooks excludes.
  const tabCounts = useMemo(
    () => ({
      shelves: subjectsQuery.data?.length ?? 0,
      books: enrichedBooks.length,
      topics: allTopics.length,
    }),
    [subjectsQuery.data?.length, enrichedBooks.length, allTopics.length]
  );

  const handleRetry = (): void => {
    void subjectsQuery.refetch();
    void progressQuery.refetch();
    allBooksQuery.refetch();
    // [BUG-732] Single retention refetch — the aggregate endpoint covers
    // all subjects in one call, so per-subject refetches would just
    // duplicate work.
    void libraryRetentionQuery.refetch();
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
      platformAlert('Could not update subject', formatApiError(err));
    } finally {
      setPendingSubjectId(null);
    }
  };

  const openTopic = (topicId: string, subjectId: string): void => {
    router.push({
      pathname: '/(app)/topic/[topicId]',
      params: { topicId, subjectId },
    } as never);
  };

  const renderContent = (): React.ReactElement => {
    if (subjectsQuery.isLoading || progressQuery.isLoading) {
      if (subjectsLoadTimedOut) {
        return (
          <ErrorFallback
            variant="centered"
            title="Library is taking too long to load"
            message="Check your connection and try again."
            primaryAction={{
              label: 'Retry',
              onPress: () => {
                void subjectsQuery.refetch();
                void progressQuery.refetch();
              },
              testID: 'library-load-timeout-retry',
            }}
            secondaryAction={{
              label: 'Go Home',
              onPress: () => goBackOrReplace(router, '/(app)/home'),
              testID: 'library-load-timeout-home',
            }}
            testID="library-load-timeout"
          />
        );
      }
      return (
        <View className="py-8 items-center" testID="library-loading">
          <BookPageFlipAnimation size={140} color={themeColors.accent} />
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
    const bookList = enrichedBooks.map((b) => ({
      id: b.book.id,
      title: b.book.title,
      subjectName: b.subjectName,
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
            onAddSubject={() =>
              router.push({
                pathname: '/create-subject',
                params: { returnTo: 'library' },
              } as never)
            }
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
        {activeTab === 'books' &&
          !allBooksQuery.isError &&
          allBooksQuery.isLoading &&
          (booksLoadTimedOut ? (
            <ErrorFallback
              variant="centered"
              title="Books are taking too long to load"
              message="Check your connection and try again."
              primaryAction={{
                label: 'Retry',
                onPress: () => allBooksQuery.refetch(),
                testID: 'books-tab-load-timeout-retry',
              }}
              secondaryAction={{
                label: 'Go Home',
                onPress: () => goBackOrReplace(router, '/(app)/home'),
                testID: 'books-tab-load-timeout-home',
              }}
              testID="books-tab-load-timeout"
            />
          ) : (
            <View className="py-8 items-center" testID="books-tab-loading">
              <ActivityIndicator size="small" />
              <Text className="text-body-sm text-text-secondary mt-3">
                Loading books...
              </Text>
            </View>
          ))}
        {activeTab === 'books' &&
          !allBooksQuery.isError &&
          !allBooksQuery.isLoading && (
            <BooksTab
              books={enrichedBooks}
              subjects={subjectList}
              state={booksTabState}
              onStateChange={setBooksTabState}
              onBookPress={(subjectId, bookId) => {
                router.push({
                  pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
                  params: { subjectId, bookId },
                } as never);
              }}
              onAddSubject={() =>
                router.push({
                  pathname: '/create-subject',
                  params: { returnTo: 'library' },
                } as never)
              }
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
            onTopicPress={(topicId, subjectId) => openTopic(topicId, subjectId)}
            onAddSubject={() =>
              router.push({
                pathname: '/create-subject',
                params: { returnTo: 'library' },
              } as never)
            }
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
                  } subjects${
                    totalTopicsAcrossBooks > 0
                      ? ` · ${totalTopicsAcrossBooks} topics`
                      : ''
                  }`
                : `${subjectsQuery.data?.length ?? 0} subjects${
                    totalTopicsAcrossBooks > 0
                      ? ` · ${totalTopicsAcrossBooks} topics`
                      : ''
                  }`}
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
                onPress={() =>
                  router.push({
                    pathname: '/create-subject',
                    params: { returnTo: 'library' },
                  } as never)
                }
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
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => setShowManageSubjects(false)}
          accessibilityRole="button"
          accessibilityLabel="Close manage subjects"
          testID="manage-subjects-backdrop"
        >
          <Pressable
            className="bg-background rounded-t-3xl px-5 pt-5"
            style={{
              paddingBottom: Math.max(
                insets.bottom,
                Platform.OS === 'web' ? 80 : 24
              ),
            }}
            /* Stop taps on modal content from closing the modal */
            onPress={(e) => e.stopPropagation()}
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
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
