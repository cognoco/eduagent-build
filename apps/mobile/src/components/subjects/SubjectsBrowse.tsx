import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SubjectStatus } from '@eduagent/schemas';

import { BookPageFlipAnimation } from '../common/BookPageFlipAnimation';
import { ShimmerSkeleton } from '../common/ShimmerSkeleton';
import {
  LibrarySearchResults,
  type EnrichedSubjectResult,
} from '../library/LibrarySearchResults';
import { useLibrarySearch } from '../../hooks/use-library-search';
import type { SubjectIndexItem } from '../../hooks/use-subjects-index';

interface SubjectsBrowseProps {
  subjects: readonly SubjectIndexItem[];
  onOpenSubject: (subjectId: string) => void;
  onCreateSubject: () => void;
  isLoading?: boolean;
  /** Navigation handlers for cross-entity search results (books, topics, notes, sessions). */
  onBookPress?: (subjectId: string, bookId: string) => void;
  onTopicPress?: (topicId: string, subjectId: string, bookId: string) => void;
  onNotePress?: (topicId: string, subjectId: string, bookId: string) => void;
  onSessionPress?: (
    sessionId: string,
    subjectId: string,
    topicId: string | null,
  ) => void;
}

// Render order for the status groups; empty groups are omitted at render time.
const STATUS_ORDER: SubjectStatus[] = ['active', 'paused', 'archived'];

// No-op stub for optional navigation handlers — avoids creating a new function
// reference on every render while keeping the call-site props truly optional.
const noop = (): void => {
  return;
};

export function SubjectsBrowse({
  subjects,
  onOpenSubject,
  onCreateSubject,
  isLoading = false,
  onBookPress,
  onTopicPress,
  onNotePress,
  onSessionPress,
}: SubjectsBrowseProps): React.ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input — 300 ms, matching the library.tsx pattern.
  const handleSearchChange = useCallback((text: string) => {
    setQuery(text);
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

  // Server-side cross-entity search. Disabled automatically inside the hook
  // when debouncedQuery is empty (enabled: trimmed.length >= 1).
  const searchResult = useLibrarySearch(debouncedQuery);
  const isSearching = debouncedQuery.trim().length > 0;

  // Enrich server-matched subjects with locally available stats
  // (mastered/learning/total/dueReviews). Retention status is unavailable at
  // this level and defaults to null — ShelfRow handles the null case.
  const enrichedSubjectResults = useMemo<EnrichedSubjectResult[]>(() => {
    if (!searchResult.data) return [];
    return searchResult.data.subjects.map((s) => {
      const sub = subjects.find((item) => item.subjectId === s.id);
      const total = sub?.total ?? 0;
      const mastered = sub?.mastered ?? 0;
      return {
        id: s.id,
        name: s.name,
        bookCount: sub?.books.length ?? 0,
        topicsMastered: mastered,
        topicsLearning: sub?.learning ?? 0,
        topicsTotal: total,
        retentionStatus: null,
        reviewDueCount: sub?.dueReviews ?? 0,
        isFinished: total > 0 && mastered >= total,
        isPaused: (sub?.status ?? 'active') !== 'active',
        status: sub?.status,
        urgencyBoostUntil: sub?.urgencyBoostUntil,
      };
    });
  }, [searchResult.data, subjects]);

  // Client-side name filter used for the local subject list when NOT searching
  // via the API (empty query). Kept so the subject list still filters as the
  // user types before the debounce fires.
  const filteredSubjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return subjects;
    return subjects.filter((subject) =>
      subject.subjectName.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [query, subjects]);

  // Group by status in STATUS_ORDER; within each group, non-expired
  // urgency-boost subjects sort first (stable — Array.sort preserves order for
  // equal keys, so non-urgent peers keep their incoming order).
  // `now` is captured at memo time (deps: filteredSubjects); a boost that expires
  // while the screen sits idle re-evaluates on the next list change / remount —
  // acceptable, since subjects don't mutate under a stationary viewer.
  const groups = useMemo(() => {
    const now = Date.now();
    const isUrgent = (subject: SubjectIndexItem) =>
      subject.urgencyBoostUntil != null &&
      Date.parse(subject.urgencyBoostUntil) > now;
    return STATUS_ORDER.map((status) => ({
      status,
      items: filteredSubjects
        .filter((subject) => subject.status === status)
        .slice()
        .sort((a, b) => Number(isUrgent(b)) - Number(isUrgent(a))),
    })).filter((group) => group.items.length > 0);
  }, [filteredSubjects]);

  // Literal t() calls per status (not a dynamic map lookup) so the i18n
  // orphan-key AST walker sees every section key statically.
  const sectionLabel = (status: SubjectStatus): string => {
    switch (status) {
      case 'active':
        return t('subjectsBrowse.sectionActive');
      case 'paused':
        return t('subjectsBrowse.sectionPaused');
      case 'archived':
        return t('subjectsBrowse.sectionArchived');
    }
  };

  return (
    <ScrollView className="flex-1 bg-bg px-5 py-4">
      <Text className="text-h2 font-semibold text-text-primary">
        {t('subjectsBrowse.title')}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('subjectsBrowse.subtitle')}
      </Text>

      {isLoading ? (
        <View
          testID="subjects-browse-skeleton"
          accessibilityRole="progressbar"
          accessibilityLabel={t('common.loading')}
          className="mt-4 gap-3"
        >
          <ShimmerSkeleton testID="subjects-browse-skeleton-shimmer">
            {[0, 1, 2].map((row) => (
              <View
                key={row}
                className="mb-3 rounded-card bg-coaching-card p-4"
              >
                <View className="h-5 w-1/2 rounded bg-border" />
                <View className="mt-2 h-4 w-3/4 rounded bg-border" />
              </View>
            ))}
          </ShimmerSkeleton>
        </View>
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={handleSearchChange}
            placeholder={t('subjectsBrowse.searchPlaceholder')}
            className="mt-4 rounded-card border border-border bg-surface px-4 py-3 text-body text-text-primary"
            testID="subjects-browse-search"
          />

          {isSearching ? (
            /* ── Search-active branch: show cross-entity results ─────────── */
            <>
              {searchResult.isLoading && (
                <View
                  testID="subjects-browse-search-loading"
                  className="mt-4 flex-row items-center px-1"
                >
                  <ActivityIndicator
                    size="small"
                    accessibilityLabel={t('common.loading')}
                  />
                  <Text className="ml-2 text-body-sm text-text-secondary">
                    {t('subjectsBrowse.searching')}
                  </Text>
                </View>
              )}
              {!searchResult.isLoading && (
                <LibrarySearchResults
                  data={searchResult.data ?? undefined}
                  isLoading={false}
                  isError={searchResult.isError}
                  query={debouncedQuery}
                  enrichedSubjects={enrichedSubjectResults}
                  onSubjectPress={onOpenSubject}
                  onBookPress={onBookPress ?? noop}
                  onTopicPress={onTopicPress ?? noop}
                  onNotePress={onNotePress ?? noop}
                  onSessionPress={onSessionPress ?? noop}
                  onClear={() => {
                    setQuery('');
                    setDebouncedQuery('');
                  }}
                  onRetry={() => void searchResult.refetch()}
                />
              )}
            </>
          ) : (
            /* ── No query: full subject list ─────────────────────────────── */
            <>
              <Text className="mt-4 text-body font-semibold text-text-secondary">
                {t('subjectsBrowse.showEverything')}
              </Text>

              {subjects.length === 0 ? (
                <View
                  className="mt-8 rounded-card bg-coaching-card p-5"
                  testID="subjects-browse-empty"
                >
                  <View className="items-center" pointerEvents="none">
                    <BookPageFlipAnimation
                      size={112}
                      testID="subjects-browse-empty-book-animation"
                    />
                  </View>
                  <Text className="text-h3 font-semibold text-text-primary">
                    {t('subjectsBrowse.emptyTitle')}
                  </Text>
                  <Text className="mt-2 text-body text-text-secondary">
                    {t('subjectsBrowse.emptyMessage')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('subjectsBrowse.createSubject')}
                    className="mt-4 min-h-[48px] justify-center rounded-button bg-primary px-4"
                    onPress={onCreateSubject}
                    testID="subjects-browse-create"
                  >
                    <Text className="text-center text-body font-semibold text-text-inverse">
                      {t('subjectsBrowse.createSubject')}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {groups.map((group) => (
                    <View
                      key={group.status}
                      className="mt-5"
                      testID={`subjects-browse-status-group-${group.status}`}
                    >
                      <Text
                        testID={`subjects-browse-section-${group.status}`}
                        className="text-caption font-semibold uppercase text-text-secondary"
                      >
                        {sectionLabel(group.status)}
                      </Text>
                      <View className="mt-3 gap-3">
                        {group.items.map((subject) => (
                          <Pressable
                            key={subject.subjectId}
                            accessibilityRole="button"
                            accessibilityLabel={
                              subject.subjectName
                                ? t('subjectsBrowse.openSubjectNamed', {
                                    subject: subject.subjectName,
                                  })
                                : t('subjectsBrowse.openSubject')
                            }
                            className="rounded-card bg-coaching-card p-4"
                            onPress={() => onOpenSubject(subject.subjectId)}
                            testID={`subjects-browse-row-${subject.subjectId}`}
                          >
                            <Text className="text-h3 font-semibold text-text-primary">
                              {subject.subjectName}
                            </Text>
                            <Text className="mt-1 text-body text-text-secondary">
                              {t('subjectsBrowse.subjectProgress', {
                                mastered: subject.mastered,
                                learning: subject.learning,
                                total: subject.total,
                              })}
                            </Text>
                            <Text className="mt-1 text-caption text-text-secondary">
                              {t('subjectsBrowse.bookCount', {
                                count: subject.books.length,
                              })}
                            </Text>
                            {subject.dueReviews > 0 ? (
                              <Text className="mt-2 text-caption font-semibold text-warning">
                                {t('subjectsBrowse.reviewsDue', {
                                  count: subject.dueReviews,
                                })}
                              </Text>
                            ) : null}
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                  {/* Add-subject affordance on the populated path: without it a
                      learner with >=1 subject has no way to start a second one
                      without going back through onboarding (WI-1119). Same
                      testID/handler as the empty state — only one branch renders
                      per state, so it is never a dup. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('subjectsBrowse.createSubject')}
                    className="mt-4 min-h-[48px] justify-center rounded-card border border-border bg-surface px-4"
                    onPress={onCreateSubject}
                    testID="subjects-browse-create"
                  >
                    <Text className="text-center text-body font-semibold text-primary">
                      {t('subjectsBrowse.createSubject')}
                    </Text>
                  </Pressable>
                </>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
