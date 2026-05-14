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
import { platformAlert } from '../../lib/platform-alert';
import { useRouter, type Href } from 'expo-router';
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
import {
  useLibraryRetention,
  type LibraryRetentionTopic,
} from '../../hooks/use-library-context';
import { isGuardianProfile, useProfile } from '../../lib/profile';
import { formatApiError } from '../../lib/format-api-error';
import {
  deriveRetentionStatus,
  RETENTION_ORDER,
} from '../../lib/retention-utils';
import { ShelfRow } from '../../components/library/ShelfRow';
import { LibrarySearchBar } from '../../components/library/LibrarySearchBar';
import {
  LibrarySearchResults,
  type EnrichedSubjectResult,
} from '../../components/library/LibrarySearchResults';
import { useLibrarySearch } from '../../hooks/use-library-search';
import { ShimmerSkeleton } from '../../components/common/ShimmerSkeleton';
import { getLearningSubjectTint } from '../../lib/learning-subject-tints';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

/** Per-subject retention view used by computeShelfRetention. */
interface SubjectRetentionResponse {
  topics: LibraryRetentionTopic[];
  reviewDueCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeShelfRetention(
  retentionData: SubjectRetentionResponse | undefined,
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

const SUBJECT_STATUS_ORDER: Record<Subject['status'], number> = {
  active: 0,
  paused: 1,
  archived: 2,
};

function sortSubjectsByStatus<T extends { status: Subject['status'] }>(
  input: readonly T[],
): T[] {
  return input
    .map((subject, index) => ({ subject, index }))
    .sort((a, b) => {
      const statusDelta =
        SUBJECT_STATUS_ORDER[a.subject.status] -
        SUBJECT_STATUS_ORDER[b.subject.status];
      return statusDelta === 0 ? a.index - b.index : statusDelta;
    })
    .map(({ subject }) => subject);
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
  const { activeProfile, profiles } = useProfile();
  const isGuardian = isGuardianProfile(activeProfile, profiles);

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
  const statusUpdateInFlightRef = useRef(false);

  // ---- Data hooks ---------------------------------------------------------
  const subjectsQuery = useSubjects({ includeInactive: true });
  const subjects = useMemo(
    () => (Array.isArray(subjectsQuery.data) ? subjectsQuery.data : []),
    [subjectsQuery.data],
  );
  const sortedSubjects = useMemo(
    () => sortSubjectsByStatus(subjects),
    [subjects],
  );
  const subjectTintsById = useMemo(
    () =>
      new Map(
        sortedSubjects.map((subject, index) => [
          subject.id,
          getLearningSubjectTint(index, themeColors),
        ]),
      ),
    [sortedSubjects, themeColors],
  );

  const progressQuery = useOverallProgress();

  // [M19] Timeout escape for the subject list loading spinner. Progress is
  // optional for this screen; the shelves can render while progress catches up.
  const isSubjectsLoading = subjectsQuery.isLoading;
  const [subjectsLoadTimedOut, setSubjectsLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!isSubjectsLoading) {
      if (subjectsLoadTimedOut) setSubjectsLoadTimedOut(false);
      return;
    }
    const t = setTimeout(() => setSubjectsLoadTimedOut(true), 15_000);
    return () => clearTimeout(t);
  }, [isSubjectsLoading, subjectsLoadTimedOut]);

  const updateSubject = useUpdateSubject();
  const allBooksQuery = useAllBooks();
  const allBooks = allBooksQuery.books;

  // [BUG-732 / PERF-2] Single aggregate /library/retention call
  // [PR-4 / surface-ownership] Inline query replaced by useLibraryRetention()
  // — library is the canonical owner of /library/retention.
  const libraryRetentionQuery = useLibraryRetention();

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
        (progressQuery.data?.subjects ?? []).map((s) => [s.subjectId, s]),
      ),
    [progressQuery.data?.subjects],
  );

  // ---- Books grouped by subjectId -----------------------------------------
  const booksBySubjectId = useMemo(() => {
    const map = new Map<string, typeof allBooks>();
    for (const b of allBooks) {
      const list = map.get(b.subjectId) ?? [];
      list.push(b);
      map.set(b.subjectId, list);
    }
    return map;
  }, [allBooks]);

  // ---- Total topic count for header subtitle ------------------------------
  // [BUG-971] Count ALL retention topics (including those with null bookId,
  // e.g. orphan topics or parking-lot entries) so the header subtitle matches
  // the per-shelf totals served by progressQuery.
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
    for (const s of searchResult.data.sessions) ids.add(s.subjectId);
    return ids;
  }, [searchResult.data]);

  const enrichedSubjectResults = useMemo<EnrichedSubjectResult[]>(() => {
    if (!searchResult.data) return [];
    return searchResult.data.subjects.map((s) => {
      const subject = subjects.find((sub) => sub.id === s.id);
      const retData = retentionDataBySubjectId.get(s.id);
      const retentionStatus = computeShelfRetention(retData);
      const books = booksBySubjectId.get(s.id) ?? [];
      const progress = progressBySubjectId.get(s.id);
      return {
        id: s.id,
        name: s.name,
        bookCount: books.length,
        topicProgress: `${progress?.topicsCompleted ?? 0}/${progress?.topicsTotal ?? 0}`,
        retentionStatus,
        reviewDueCount: retData?.reviewDueCount ?? 0,
        isFinished:
          (progress?.topicsTotal ?? 0) > 0 &&
          (progress?.topicsVerified ?? 0) >= (progress?.topicsTotal ?? 0),
        isPaused: subject?.status !== 'active',
        status: subject?.status ?? 'active',
      };
    });
  }, [
    searchResult.data,
    subjects,
    retentionDataBySubjectId,
    booksBySubjectId,
    progressBySubjectId,
  ]);

  // ---- Handlers -----------------------------------------------------------

  const handleShelfPress = useCallback(
    (subjectId: string) => {
      router.push({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId },
      } as Href);
    },
    [router],
  );

  const handleBookPress = useCallback(
    (subjectId: string, bookId: string) => {
      router.push({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId },
      } as Href);
      router.push({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: { subjectId, bookId },
      } as Href);
    },
    [router],
  );

  const handleTopicPress = useCallback(
    (topicId: string) => {
      router.push({
        pathname: '/(app)/topic/[topicId]',
        params: { topicId },
      } as Href);
    },
    [router],
  );

  const handleNotePress = useCallback(
    (topicId: string) => {
      router.push({
        pathname: '/(app)/topic/[topicId]',
        params: { topicId },
      } as Href);
    },
    [router],
  );

  const handleSessionPress = useCallback(
    (sessionId: string, subjectId: string, topicId: string | null) => {
      router.push({
        pathname: '/session-summary/[sessionId]',
        params: {
          sessionId,
          subjectId,
          ...(topicId ? { topicId } : {}),
        },
      } as Href);
    },
    [router],
  );

  const handleRetry = (): void => {
    void subjectsQuery.refetch();
    void progressQuery.refetch();
    allBooksQuery.refetch();
    void libraryRetentionQuery.refetch();
  };

  const handleSubjectStatusChange = async (
    subject: Subject,
    status: Subject['status'],
  ): Promise<void> => {
    if (statusUpdateInFlightRef.current) return;
    statusUpdateInFlightRef.current = true;
    setPendingSubjectId(subject.id);
    try {
      await updateSubject.mutateAsync({ subjectId: subject.id, status });
    } catch (err: unknown) {
      platformAlert(t('library.manage.updateErrorTitle'), formatApiError(err));
    } finally {
      statusUpdateInFlightRef.current = false;
      setPendingSubjectId(null);
    }
  };

  // ---- Determine which shelves are visible (search filtering) -------------

  const visibleSubjects = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return sortedSubjects;
    return sortedSubjects.filter((s) => {
      const clientMatch = s.name.toLowerCase().includes(q);
      const serverMatch = serverMatchSubjectIds.has(s.id);
      return clientMatch || serverMatch;
    });
  }, [sortedSubjects, debouncedQuery, serverMatchSubjectIds]);

  const nextLearningSubject = useMemo(
    () => visibleSubjects.find((subject) => subject.status === 'active'),
    [visibleSubjects],
  );

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
    if (subjectsQuery.isLoading) {
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

    if (subjectsQuery.isError && !subjectsQuery.data) {
      const libraryLoadError = subjectsQuery.error;
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
          <BookPageFlipAnimation size={150} color={themeColors.accent} />
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
    const showingStaleCachedData =
      (subjectsQuery.isError || progressQuery.isError) && subjects.length > 0;

    return (
      <>
        {/* Stale-data banner — visible when cached data is shown after a refresh failure */}
        {showingStaleCachedData && (
          <Pressable
            onPress={handleRetry}
            className="bg-surface-elevated rounded-card px-4 py-3 mb-3 flex-row items-center"
            testID="library-stale-banner"
          >
            <Text className="text-body-sm text-text-secondary flex-1">
              {t('library.staleBanner.message')}
            </Text>
            <Text className="text-body-sm font-semibold text-primary ms-3">
              {t('common.retry')}
            </Text>
          </Pressable>
        )}

        {/* Curriculum complete banner */}
        {!!progressQuery.data?.subjects.length &&
          progressQuery.data.subjects.every(
            (subject) =>
              subject.topicsTotal > 0 &&
              subject.topicsVerified >= subject.topicsTotal,
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
                  } as Href)
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

        {/* Search results (when query is active) */}
        {isSearching && (
          <>
            {searchResult.isLoading && (
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
            {!searchResult.isLoading && (
              <LibrarySearchResults
                data={searchResult.data ?? undefined}
                isLoading={searchResult.isLoading}
                isError={searchResult.isError}
                query={debouncedQuery}
                enrichedSubjects={enrichedSubjectResults}
                subjectTintsById={subjectTintsById}
                onSubjectPress={handleShelfPress}
                onBookPress={handleBookPress}
                onTopicPress={handleTopicPress}
                onNotePress={handleNotePress}
                onSessionPress={handleSessionPress}
                onClear={() => setSearchQuery('')}
                onRetry={() => void searchResult.refetch()}
              />
            )}
          </>
        )}

        {/* Subject shelf list (hidden when searching) */}
        {!isSearching && (
          <View testID="shelves-list">
            {nextLearningSubject ? (
              <Pressable
                onPress={() => handleShelfPress(nextLearningSubject.id)}
                className="bg-primary-soft rounded-card px-4 py-4 mb-3 flex-row items-center"
                accessibilityRole="button"
                accessibilityLabel={t('library.nextAction.accessibilityLabel', {
                  subject: nextLearningSubject.name,
                })}
                testID="library-next-action"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-body font-semibold text-text-primary">
                    {t('library.nextAction.title', {
                      subject: nextLearningSubject.name,
                    })}
                  </Text>
                  <Text className="text-body-sm text-text-secondary mt-1">
                    {t('library.nextAction.message')}
                  </Text>
                </View>
                <Text className="text-body-sm font-semibold text-primary">
                  {t('library.nextAction.cta')}
                </Text>
              </Pressable>
            ) : null}
            {visibleSubjects.map((subject) => {
              const retData = retentionDataBySubjectId.get(subject.id);
              const books = booksBySubjectId.get(subject.id) ?? [];
              const bookCount = books.length;
              const progress = progressBySubjectId.get(subject.id);
              const topicsTotal = progress?.topicsTotal ?? 0;
              const topicsCompleted = progress?.topicsCompleted ?? 0;
              const topicProgress = `${topicsCompleted}/${topicsTotal}`;
              const isFinished =
                topicsTotal > 0 &&
                (progress?.topicsVerified ?? 0) >= topicsTotal;

              return (
                <ShelfRow
                  key={subject.id}
                  subjectId={subject.id}
                  name={subject.name}
                  bookCount={bookCount}
                  topicProgress={topicProgress}
                  reviewDueCount={retData?.reviewDueCount ?? 0}
                  isFinished={isFinished}
                  status={subject.status}
                  tint={subjectTintsById.get(subject.id)}
                  onPress={handleShelfPress}
                />
              );
            })}
          </View>
        )}
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
                Platform.OS === 'web' ? 80 : 24,
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
              {sortedSubjects.map((subject) => {
                const isPending = pendingSubjectId === subject.id;
                const isSavingAnySubject = pendingSubjectId !== null;
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
                            disabled={isSavingAnySubject}
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
                                'archived',
                              )
                            }
                            disabled={isSavingAnySubject}
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
                            disabled={isSavingAnySubject}
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
                                'archived',
                              )
                            }
                            disabled={isSavingAnySubject}
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
                          disabled={isSavingAnySubject}
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
