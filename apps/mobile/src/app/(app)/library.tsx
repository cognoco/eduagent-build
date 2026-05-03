import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { platformAlert } from '../../lib/platform-alert';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Subject, RetentionStatus } from '@eduagent/schemas';
import {
  BookPageFlipAnimation,
  BrandCelebration,
  ErrorFallback,
} from '../../components/common';
import { goBackOrReplace } from '../../lib/navigation';
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
import {
  deriveRetentionStatus,
  RETENTION_ORDER,
} from '../../lib/retention-utils';
import { ShelfRow } from '../../components/library/ShelfRow';
import { LibrarySearchBar } from '../../components/library/LibrarySearchBar';
import { useLibrarySearch } from '../../hooks/use-library-search';
import type { BookRowData } from '../../components/library/BookRow';
import { ShimmerSkeleton } from '../../components/common/ShimmerSkeleton';

// ---------------------------------------------------------------------------
// Local interfaces (retention API shape)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeShelfRetention(
  retentionData: SubjectRetentionResponse | undefined
): RetentionStatus | null {
  const topics = retentionData?.topics;
  if (!Array.isArray(topics) || topics.length === 0) return null;
  let worst: RetentionStatus = 'strong';
  for (const t of topics) {
    const r = deriveRetentionStatus(t);
    if (RETENTION_ORDER[r] < RETENTION_ORDER[worst]) worst = r;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// SubjectStatusPill
// ---------------------------------------------------------------------------

function SubjectStatusPill({
  status,
}: {
  status: Subject['status'];
}): React.ReactElement | null {
  const { t } = useTranslation();
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
        {status === 'paused'
          ? t('library.statusPaused')
          : t('library.statusArchived')}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// LibraryScreen
// ---------------------------------------------------------------------------

export default function LibraryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const apiClient = useApiClient();
  const { activeProfile, profiles } = useProfile();
  const isGuardian = isGuardianProfile(activeProfile, profiles);

  // ---- Expanded shelves state ---------------------------------------------
  const [expandedShelves, setExpandedShelves] = useState<
    Record<string, boolean>
  >({});
  const navigatingToChild = useRef(false);

  // ---- Search state -------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ---- Manage modal state -------------------------------------------------
  const [showManageSubjects, setShowManageSubjects] = useState(false);
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null);

  // ---- Data hooks ---------------------------------------------------------
  const subjectsQuery = useSubjects({ includeInactive: true });
  const subjects = useMemo(
    () => (Array.isArray(subjectsQuery.data) ? subjectsQuery.data : []),
    [subjectsQuery.data]
  );

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
  const noteTopicIdsQuery = useNoteTopicIds();
  const noteIdSet = useMemo(
    () => new Set(noteTopicIdsQuery.data?.topicIds ?? []),
    [noteTopicIdsQuery.data]
  );

  // [BUG-732 / PERF-2] Single aggregate /library/retention call
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

  // ---- Progress by subject ------------------------------------------------
  const progressBySubjectId = useMemo(
    () =>
      new Map(
        (progressQuery.data?.subjects ?? []).map((s) => [s.subjectId, s])
      ),
    [progressQuery.data?.subjects]
  );

  // ---- Per-book topic counts from retention data --------------------------
  const topicCountsByBookId = useMemo(() => {
    const totals = new Map<string, { total: number; completed: number }>();
    for (const ret of retentionDataBySubjectId.values()) {
      if (!Array.isArray(ret.topics)) continue;
      for (const t of ret.topics) {
        if (!t.bookId) continue;
        const current = totals.get(t.bookId) ?? { total: 0, completed: 0 };
        current.total += 1;
        if (t.xpStatus === 'verified') current.completed += 1;
        totals.set(t.bookId, current);
      }
    }
    return totals;
  }, [retentionDataBySubjectId]);

  // ---- Enriched books (for shelf rows) ------------------------------------
  const enrichedBooks = useMemo(() => {
    return allBooksQuery.books.map((b) => {
      const counts = topicCountsByBookId.get(b.book.id);
      if (!counts) return b;
      let status = b.status;
      if (counts.total > 0) {
        if (counts.completed === 0) status = 'NOT_STARTED';
        else if (counts.completed >= counts.total) {
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

  // ---- Books grouped by subjectId -----------------------------------------
  const booksBySubjectId = useMemo(() => {
    const map = new Map<string, typeof enrichedBooks>();
    for (const b of enrichedBooks) {
      const list = map.get(b.subjectId) ?? [];
      list.push(b);
      map.set(b.subjectId, list);
    }
    return map;
  }, [enrichedBooks]);

  // ---- Total topic count for header subtitle ------------------------------
  // [BUG-971] Count ALL retention topics (including those with null bookId,
  // e.g. orphan topics or parking-lot entries) so the header subtitle matches
  // the per-shelf totals served by progressQuery. topicCountsByBookId stays
  // book-scoped on purpose — book rows must still exclude orphans.
  const totalTopicsAcrossBooks = useMemo(() => {
    let total = 0;
    for (const ret of retentionDataBySubjectId.values()) {
      if (!Array.isArray(ret.topics)) continue;
      total += ret.topics.length;
    }
    return total;
  }, [retentionDataBySubjectId]);

  // ---- Server-side search -------------------------------------------------
  const searchResult = useLibrarySearch(debouncedQuery);

  // Set of subjectIds that match via server search
  const serverMatchSubjectIds = useMemo<Set<string>>(() => {
    if (!searchResult.data) return new Set();
    const ids = new Set<string>();
    for (const s of searchResult.data.subjects) ids.add(s.id);
    for (const b of searchResult.data.books) ids.add(b.subjectId);
    for (const t of searchResult.data.topics) ids.add(t.subjectId);
    for (const n of searchResult.data.notes) ids.add(n.subjectId);
    return ids;
  }, [searchResult.data]);

  // Set of bookIds that match via server search
  const serverMatchBookIds = useMemo<Set<string>>(() => {
    if (!searchResult.data) return new Set();
    const ids = new Set<string>();
    for (const b of searchResult.data.books) ids.add(b.id);
    for (const t of searchResult.data.topics) ids.add(t.bookId);
    for (const n of searchResult.data.notes) ids.add(n.bookId);
    return ids;
  }, [searchResult.data]);

  // ---- Focus effect: reset expansion to most-recently-active subject ------
  // Only resets on tab switches, NOT when returning from a child screen (Book).
  useFocusEffect(
    useCallback(() => {
      if (navigatingToChild.current) {
        navigatingToChild.current = false;
        return;
      }
      if (subjects.length === 0) return;
      const activeSubjects = subjects.filter((s) => s.status === 'active');
      let defaultSubjectId: string | null = null;

      if (activeSubjects.length > 0) {
        let latestTime = -Infinity;
        for (const s of activeSubjects) {
          const prog = progressBySubjectId.get(s.id);
          const t = prog?.lastSessionAt
            ? new Date(prog.lastSessionAt).getTime()
            : -Infinity;
          if (t > latestTime) {
            latestTime = t;
            defaultSubjectId = s.id;
          }
        }
        if (defaultSubjectId === null) {
          defaultSubjectId = activeSubjects[0]?.id ?? null;
        }
      }

      if (defaultSubjectId) {
        setExpandedShelves({ [defaultSubjectId]: true });
      } else {
        setExpandedShelves({});
      }
      setSearchQuery('');
      setDebouncedQuery('');
    }, [subjects, progressBySubjectId])
  );

  // ---- Handlers -----------------------------------------------------------

  const handleToggle = useCallback((subjectId: string) => {
    setExpandedShelves((prev) => ({ ...prev, [subjectId]: !prev[subjectId] }));
  }, []);

  const handleBookPress = useCallback(
    (subjectId: string, bookId: string) => {
      navigatingToChild.current = true;
      // Single deep push: the [subjectId] layout exports
      // `unstable_settings = { initialRouteName: 'index' }`, so this
      // synthesizes a 2-deep stack (shelf index underneath book) without
      // racing two synchronous router.push calls.
      router.push({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: { subjectId, bookId },
      } as never);
    },
    [router]
  );

  const handleRetry = (): void => {
    void subjectsQuery.refetch();
    void progressQuery.refetch();
    allBooksQuery.refetch();
    void libraryRetentionQuery.refetch();
  };

  const handleSubjectStatusChange = async (
    subject: Subject,
    status: Subject['status']
  ): Promise<void> => {
    setPendingSubjectId(subject.id);
    try {
      await updateSubject.mutateAsync({ subjectId: subject.id, status });
    } catch (err: unknown) {
      platformAlert(t('library.manage.updateErrorTitle'), formatApiError(err));
    } finally {
      setPendingSubjectId(null);
    }
  };

  // ---- Build BookRowData per shelf ----------------------------------------

  const buildBookRows = useCallback(
    (subjectId: string, query: string): BookRowData[] => {
      const books = booksBySubjectId.get(subjectId) ?? [];
      const q = query.trim().toLowerCase();
      return books
        .filter((b) => {
          if (!q) return true;
          // client-side name match
          const clientMatch = b.book.title.toLowerCase().includes(q);
          // server match
          const srvMatch = serverMatchBookIds.has(b.book.id);
          return clientMatch || srvMatch;
        })
        .map((b) => {
          const counts = topicCountsByBookId.get(b.book.id);
          const total = counts?.total ?? 0;
          const completed = counts?.completed ?? 0;
          const topicProgress = `${completed}/${total}`;

          // Compute book-level retention from per-topic data
          const retData = retentionDataBySubjectId.get(subjectId);
          let bookRetention: RetentionStatus | null = null;
          if (Array.isArray(retData?.topics)) {
            const bookTopics = retData!.topics.filter(
              (t) => t.bookId === b.book.id
            );
            if (bookTopics.length > 0) {
              let worst: RetentionStatus = 'strong';
              for (const t of bookTopics) {
                const r = deriveRetentionStatus(t);
                if (RETENTION_ORDER[r] < RETENTION_ORDER[worst]) worst = r;
              }
              bookRetention = worst;
            }
          }

          // Check if any topic in this book has a note
          const hasNotes = (() => {
            const retTopics = retData?.topics?.filter(
              (t) => t.bookId === b.book.id
            );
            return (retTopics ?? []).some((t) => noteIdSet.has(t.topicId));
          })();

          return {
            bookId: b.book.id,
            title: b.book.title,
            topicProgress,
            retentionStatus: bookRetention,
            hasNotes,
          } satisfies BookRowData;
        });
    },
    [
      booksBySubjectId,
      topicCountsByBookId,
      retentionDataBySubjectId,
      noteIdSet,
      serverMatchBookIds,
    ]
  );

  // ---- Determine which shelves are visible (search filtering) -------------

  const visibleSubjects = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) => {
      const clientMatch = s.name.toLowerCase().includes(q);
      const serverMatch = serverMatchSubjectIds.has(s.id);
      return clientMatch || serverMatch;
    });
  }, [subjects, debouncedQuery, serverMatchSubjectIds]);

  // Auto-expand shelves that became visible via server search results
  useEffect(() => {
    if (!debouncedQuery.trim() || !searchResult.data) return;
    const toExpand: Record<string, boolean> = {};
    for (const subjectId of serverMatchSubjectIds) {
      toExpand[subjectId] = true;
    }
    if (Object.keys(toExpand).length > 0) {
      setExpandedShelves((prev) => ({ ...prev, ...toExpand }));
    }
  }, [searchResult.data, serverMatchSubjectIds, debouncedQuery]);

  // ---- Shimmer skeleton ---------------------------------------------------

  const renderShimmerSkeleton = (): React.ReactElement => (
    <ShimmerSkeleton testID="library-loading">
      <View>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                backgroundColor: themeColors.border,
                marginRight: 12,
              }}
            />
            <View style={{ flex: 1 }}>
              <View
                style={{
                  height: 14,
                  width: '70%',
                  borderRadius: 4,
                  backgroundColor: themeColors.border,
                  marginBottom: 6,
                }}
              />
              <View
                style={{
                  height: 11,
                  width: '45%',
                  borderRadius: 4,
                  backgroundColor: themeColors.border,
                }}
              />
            </View>
            <View
              style={{
                width: 48,
                height: 20,
                borderRadius: 10,
                backgroundColor: themeColors.border,
              }}
            />
          </View>
        ))}
      </View>
    </ShimmerSkeleton>
  );

  // ---- Main content -------------------------------------------------------

  const renderContent = (): React.ReactElement => {
    if (subjectsQuery.isLoading || progressQuery.isLoading) {
      if (subjectsLoadTimedOut) {
        return (
          <ErrorFallback
            variant="centered"
            title={t('library.loadTimeout.title')}
            message={t('library.loadTimeout.message')}
            primaryAction={{
              label: t('common.retry'),
              onPress: () => {
                void subjectsQuery.refetch();
                void progressQuery.refetch();
              },
              testID: 'library-load-timeout-retry',
            }}
            secondaryAction={{
              label: t('common.goHome'),
              onPress: () => goBackOrReplace(router, '/(app)/home'),
              testID: 'library-load-timeout-home',
            }}
            testID="library-load-timeout"
          />
        );
      }
      return renderShimmerSkeleton();
    }

    if (subjectsQuery.isError || progressQuery.isError) {
      const libraryLoadError = subjectsQuery.error ?? progressQuery.error;
      return (
        <View
          className="flex-1 items-center justify-center px-5 py-12"
          testID="library-error"
        >
          <Text className="text-body text-text-secondary text-center mb-4">
            {libraryLoadError
              ? formatApiError(libraryLoadError)
              : t('library.loadError.message')}
          </Text>
          <Pressable
            onPress={handleRetry}
            className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
            testID="library-retry-button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('common.retry')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(app)')}
            className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
            testID="library-home-button"
          >
            <Text className="text-text-primary text-body font-semibold">
              {t('common.goHome')}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (subjects.length === 0) {
      return (
        <View
          className="items-center justify-center py-16 px-5"
          testID="library-empty"
        >
          <BookPageFlipAnimation size={100} color={themeColors.accent} />
          <Text className="text-h3 font-semibold text-text-primary mt-4 text-center">
            {t('library.empty.title')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-2 text-center">
            {t('library.empty.message')}
          </Text>
          <Pressable
            onPress={() => router.replace('/(app)')}
            className="bg-primary rounded-button px-6 py-3 mt-6 items-center"
            testID="library-empty-go-home"
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('library.empty.goHome')}
            </Text>
          </Pressable>
        </View>
      );
    }

    const isSearching = debouncedQuery.trim().length > 0;

    return (
      <>
        {/* Curriculum complete banner */}
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
                    {t('library.curriculumComplete.title')}
                  </Text>
                  <Text className="text-body-sm text-text-secondary mt-2">
                    {t('library.curriculumComplete.message')}
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
                  {t('library.curriculumComplete.addSubject')}
                </Text>
              </Pressable>
            </View>
          )}

        {/* Server search loading indicator */}
        {isSearching && searchResult.isLoading && (
          <View
            className="flex-row items-center px-1 mb-2"
            testID="library-search-server-loading"
          >
            <ActivityIndicator size="small" />
            <Text className="text-body-sm text-text-secondary ms-2">
              {t('library.search.searching')}
            </Text>
          </View>
        )}

        {/* No search results */}
        {isSearching &&
          visibleSubjects.length === 0 &&
          !searchResult.isLoading && (
            <View className="items-center py-10" testID="library-search-empty">
              <Text className="text-body text-text-secondary text-center">
                {t('library.search.noResults', { query: debouncedQuery })}
              </Text>
              <Pressable
                onPress={() => handleSearchChange('')}
                className="mt-3 px-4 py-2 rounded-button bg-surface-elevated"
                testID="library-search-clear-results"
              >
                <Text className="text-body-sm font-semibold text-text-primary">
                  {t('library.search.clear')}
                </Text>
              </Pressable>
            </View>
          )}

        {/* Shelf list */}
        <View testID="shelves-list">
          {visibleSubjects.map((subject) => {
            const retData = retentionDataBySubjectId.get(subject.id);
            const retentionStatus = computeShelfRetention(retData);
            const books = booksBySubjectId.get(subject.id) ?? [];
            const bookCount = books.length;
            const progress = progressBySubjectId.get(subject.id);
            const topicsTotal = progress?.topicsTotal ?? 0;
            const topicsCompleted = progress?.topicsCompleted ?? 0;
            const topicProgress = `${topicsCompleted}/${topicsTotal}`;

            const bookRows = buildBookRows(subject.id, debouncedQuery);

            return (
              <ShelfRow
                key={subject.id}
                subjectId={subject.id}
                name={subject.name}
                bookCount={bookCount}
                topicProgress={topicProgress}
                retentionStatus={retentionStatus}
                isPaused={subject.status !== 'active'}
                expanded={!!expandedShelves[subject.id]}
                books={bookRows}
                onToggle={handleToggle}
                onBookPress={handleBookPress}
              />
            );
          })}
        </View>
      </>
    );
  };

  // ---- Root render --------------------------------------------------------

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View
        className="px-5 pt-4 pb-3 flex-row items-center justify-between"
        style={{ zIndex: 2, elevation: 2 }}
      >
        <View className="flex-row items-center flex-1 me-3">
          <View className="flex-1">
            <Text className="text-h1 font-bold text-text-primary">
              {t('library.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {isGuardian
                ? totalTopicsAcrossBooks > 0
                  ? t('library.subtitleGuardian', {
                      subjectCount: subjectsQuery.data?.length ?? 0,
                      topicCount: totalTopicsAcrossBooks,
                    })
                  : t('library.subtitleGuardianNoTopics', {
                      subjectCount: subjectsQuery.data?.length ?? 0,
                    })
                : totalTopicsAcrossBooks > 0
                ? t('library.subtitle', {
                    subjectCount: subjectsQuery.data?.length ?? 0,
                    topicCount: totalTopicsAcrossBooks,
                  })
                : t('library.subtitleNoTopics', {
                    subjectCount: subjectsQuery.data?.length ?? 0,
                  })}
            </Text>
          </View>
        </View>

        {(subjectsQuery.data?.length ?? 0) > 0 && (
          <Pressable
            onPress={() => setShowManageSubjects(true)}
            className="rounded-full bg-surface-elevated px-4 py-2"
            style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('library.manage.accessibilityLabel')}
            testID="manage-subjects-button"
          >
            <Text className="text-body-sm font-semibold text-primary">
              {t('library.manage.button')}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Search bar */}
      <View className="px-5" style={{ zIndex: 2 }}>
        <LibrarySearchBar
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder={t('library.search.placeholder')}
        />
      </View>

      {/* Scrollable shelf list */}
      <ScrollView
        className="flex-1 px-5"
        style={{ zIndex: 0 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
      >
        {renderContent()}
      </ScrollView>

      {/* Manage subjects modal */}
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
          accessibilityLabel={t('library.manage.closeAccessibilityLabel')}
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
            onPress={(e) => e.stopPropagation()}
          >
            <View className="items-center mb-4">
              <View className="w-10 h-1 rounded-full bg-text-secondary/30" />
            </View>
            <Text className="text-h3 font-semibold text-text-primary mb-2">
              {t('library.manage.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              {t('library.manage.description')}
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
                              {isPending
                                ? t('library.manage.saving')
                                : t('library.manage.pause')}
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
                              {t('library.manage.archive')}
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
                              {isPending
                                ? t('library.manage.saving')
                                : t('library.manage.resume')}
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
                              {t('library.manage.archive')}
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
                            {isPending
                              ? t('library.manage.saving')
                              : t('library.manage.restore')}
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
              accessibilityLabel={t('library.manage.closeAccessibilityLabel')}
              testID="manage-subjects-close"
            >
              <Text className="text-body font-semibold text-text-secondary">
                {t('common.close')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
