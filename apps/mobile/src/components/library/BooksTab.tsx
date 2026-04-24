import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BookProgressStatus } from '@eduagent/schemas';
import { LibrarySearchBar } from './LibrarySearchBar';
import {
  SortFilterBar,
  type SortOption,
  type FilterGroup,
} from './SortFilterBar';
import { LibraryEmptyState } from './LibraryEmptyState';
import {
  searchBooks,
  filterBooks,
  sortBooks,
  type EnrichedBook,
  type BooksSortKey,
  type BooksFilters,
} from '../../lib/library-filters';

// ---------------------------------------------------------------------------
// State types (exported for parent to own)
// ---------------------------------------------------------------------------

export interface BooksTabState {
  search: string;
  sortKey: BooksSortKey;
  filters: BooksFilters;
}

export const BOOKS_TAB_INITIAL_STATE: BooksTabState = {
  search: '',
  sortKey: 'name-asc',
  filters: { subjectIds: [], completion: [] },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BooksTabProps {
  books: EnrichedBook[];
  subjects: Array<{ id: string; name: string }>;
  state: BooksTabState;
  onStateChange: (state: BooksTabState) => void;
  onBookPress: (subjectId: string, bookId: string) => void;
  onAddSubject: () => void;
  isError?: boolean;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Sort / filter constants
// ---------------------------------------------------------------------------

const SORT_OPTIONS: SortOption[] = [
  { key: 'name-asc', label: 'Name (A-Z)' },
  { key: 'name-desc', label: 'Name (Z-A)' },
  { key: 'progress', label: 'Progress' },
  { key: 'subject', label: 'Subject' },
];

// ---------------------------------------------------------------------------
// Book card status helpers
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<BookProgressStatus, string> = {
  NOT_STARTED: 'bg-surface',
  IN_PROGRESS: 'bg-primary/10',
  COMPLETED: 'bg-success/10',
  REVIEW_DUE: 'bg-warning/10',
};

const STATUS_LABELS: Record<BookProgressStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Complete',
  REVIEW_DUE: 'Review due',
};

// ---------------------------------------------------------------------------
// BooksTab
// ---------------------------------------------------------------------------

export function BooksTab({
  books,
  subjects,
  state,
  onStateChange,
  onBookPress,
  onAddSubject,
  isError,
  onRetry,
}: BooksTabProps): React.ReactElement {
  // ---- Derived data -------------------------------------------------------

  const filtered = useMemo(() => {
    const searched = searchBooks(books, state.search);
    const filtered_ = filterBooks(searched, state.filters);
    return sortBooks(filtered_, state.sortKey);
  }, [books, state.search, state.filters, state.sortKey]);

  // Group filtered books by shelf (subject) so each group renders under a
  // "shelf" header. Groups are ordered alphabetically by subject name for a
  // stable, predictable layout; the user's chosen sort still applies to books
  // *within* each group (sortBooks already ran above).
  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      { subjectId: string; subjectName: string; books: EnrichedBook[] }
    >();
    for (const enriched of filtered) {
      const existing = groups.get(enriched.subjectId);
      if (existing) {
        existing.books.push(enriched);
      } else {
        groups.set(enriched.subjectId, {
          subjectId: enriched.subjectId,
          subjectName: enriched.subjectName,
          books: [enriched],
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.subjectName.localeCompare(b.subjectName)
    );
  }, [filtered]);

  // ---- Filter state helpers -----------------------------------------------

  const activeFilterCount =
    state.filters.subjectIds.length + state.filters.completion.length;

  const hasSearch = state.search.length > 0;
  const hasFilters = activeFilterCount > 0;

  const filterGroups: FilterGroup[] = [
    {
      key: 'subject',
      label: 'Subject',
      options: subjects.map((s) => ({ key: s.id, label: s.name })),
      selected: state.filters.subjectIds,
    },
    {
      key: 'completion',
      label: 'Completion',
      options: [
        { key: 'not-started', label: 'Not started' },
        { key: 'in-progress', label: 'In progress' },
        { key: 'completed', label: 'Completed' },
      ],
      selected: state.filters.completion,
    },
  ];

  // ---- Handlers -----------------------------------------------------------

  const handleSearchChange = (text: string): void => {
    onStateChange({ ...state, search: text });
  };

  const handleSortChange = (key: string): void => {
    onStateChange({ ...state, sortKey: key as BooksSortKey });
  };

  const handleFilterChange = (groupKey: string, optionKey: string): void => {
    if (groupKey === 'subject') {
      const current = state.filters.subjectIds;
      const next = current.includes(optionKey)
        ? current.filter((k) => k !== optionKey)
        : [...current, optionKey];
      onStateChange({
        ...state,
        filters: { ...state.filters, subjectIds: next },
      });
    } else {
      const current = state.filters.completion;
      const next = current.includes(
        optionKey as BooksFilters['completion'][number]
      )
        ? current.filter((k) => k !== optionKey)
        : [...current, optionKey as BooksFilters['completion'][number]];
      onStateChange({
        ...state,
        filters: { ...state.filters, completion: next },
      });
    }
  };

  // ---- Clear action (CR-9) -----------------------------------------------

  const clearAction = useMemo(() => {
    if (hasSearch && hasFilters) {
      return {
        label: 'Clear all',
        handler: () => onStateChange(BOOKS_TAB_INITIAL_STATE),
      };
    }
    if (hasSearch) {
      return {
        label: 'Clear search',
        handler: () => onStateChange({ ...state, search: '' }),
      };
    }
    if (hasFilters) {
      return {
        label: 'Clear filters',
        handler: () =>
          onStateChange({
            ...state,
            filters: { subjectIds: [], completion: [] },
          }),
      };
    }
    return null;
  }, [hasSearch, hasFilters, state, onStateChange]);

  // ---- Empty / error / no-content states -----------------------------------

  if (books.length === 0 && isError) {
    return (
      <View
        className="bg-surface rounded-card px-4 py-6 items-center"
        testID="books-tab-error"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          Unable to load books. Please try again.
        </Text>
        {onRetry != null ? (
          <Pressable
            onPress={onRetry}
            className="bg-primary rounded-button px-5 py-3 items-center min-h-[48px] justify-center"
            accessibilityRole="button"
            testID="books-tab-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Retry
            </Text>
          </Pressable>
        ) : (
          <Text className="text-body-sm text-text-tertiary text-center">
            Pull down to refresh or go back.
          </Text>
        )}
      </View>
    );
  }

  if (books.length === 0) {
    return (
      <View>
        <LibraryEmptyState variant="no-content" onAddSubject={onAddSubject} />
      </View>
    );
  }

  // ---- Render item --------------------------------------------------------

  const renderBookCard = (item: EnrichedBook): React.ReactElement => {
    const { book, subjectName, status, topicCount, completedCount } = item;

    // Per-book topic count: scoped to this specific book, not the shelf total.
    // Falls back to a neutral label when counts aren't available yet.
    const topicsLabel =
      topicCount > 0
        ? `${completedCount}/${topicCount} topics`
        : book.topicsGenerated
        ? 'Ready to open'
        : 'Build this book';

    return (
      <Pressable
        key={book.id}
        onPress={() => onBookPress(item.subjectId, book.id)}
        className={`rounded-card px-4 py-4 mb-3 ${STATUS_STYLES[status]}`}
        accessibilityRole="button"
        accessibilityLabel={`${book.title}, ${subjectName}. ${STATUS_LABELS[status]}. ${topicsLabel}.`}
        testID={`book-card-${book.id}`}
      >
        <View className="flex-row items-start">
          <View className="w-12 h-12 rounded-2xl bg-surface-elevated items-center justify-center me-3">
            <Text className="text-2xl">{book.emoji ?? '📘'}</Text>
          </View>

          <View className="flex-1">
            <View className="flex-row items-start justify-between">
              <Text className="text-body font-semibold text-text-primary flex-1 me-3">
                {book.title}
              </Text>
              <Text className="text-caption font-semibold text-text-secondary">
                {STATUS_LABELS[status]}
              </Text>
            </View>

            {book.description && (
              <Text className="text-body-sm text-text-secondary mt-1">
                {book.description}
              </Text>
            )}

            <Text className="text-caption text-text-tertiary mt-2">
              {topicsLabel}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  // ---- Main render --------------------------------------------------------

  return (
    <View className="flex-1">
      <LibrarySearchBar
        value={state.search}
        onChangeText={handleSearchChange}
        placeholder="Search books..."
      />
      <SortFilterBar
        sortOptions={SORT_OPTIONS}
        activeSortKey={state.sortKey}
        onSortChange={handleSortChange}
        filterGroups={filterGroups}
        onFilterChange={handleFilterChange}
        activeFilterCount={activeFilterCount}
      />

      {filtered.length === 0 && clearAction ? (
        <LibraryEmptyState
          variant="no-results"
          entityName="books"
          onClear={clearAction.handler}
          clearLabel={clearAction.label}
          message={hasSearch ? undefined : `No books match your filters`}
        />
      ) : (
        <View testID="books-list">
          {grouped.map((group) => (
            <View
              key={group.subjectId}
              className="mb-4"
              testID={`books-shelf-group-${group.subjectId}`}
            >
              <View className="flex-row items-end justify-between mt-1 mb-2 px-1">
                <Text
                  className="text-h3 font-semibold text-text-primary"
                  accessibilityRole="header"
                  testID={`books-shelf-heading-${group.subjectId}`}
                >
                  {group.subjectName}
                </Text>
                <Text
                  className="text-caption text-text-secondary"
                  testID={`books-shelf-count-${group.subjectId}`}
                >
                  {(() => {
                    const bookLabel = `${group.books.length} ${
                      group.books.length === 1 ? 'book' : 'books'
                    }`;
                    const topicTotal = group.books.reduce(
                      (sum, b) => sum + b.topicCount,
                      0
                    );
                    return topicTotal > 0
                      ? `${bookLabel} · ${topicTotal} topics`
                      : bookLabel;
                  })()}
                </Text>
              </View>
              {group.books.map((item) => renderBookCard(item))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
