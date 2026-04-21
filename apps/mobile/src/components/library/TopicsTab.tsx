import React, { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { LibrarySearchBar } from './LibrarySearchBar';
import {
  SortFilterBar,
  type SortOption,
  type FilterGroup,
} from './SortFilterBar';
import { LibraryEmptyState } from './LibraryEmptyState';
import { RetentionSignal, type RetentionStatus } from '../progress';
import {
  formatLastPracticed,
  searchTopics,
  filterTopics,
  sortTopics,
  type EnrichedTopic,
  type TopicsSortKey,
  type TopicsFilters,
} from '../../lib/library-filters';

// ---------------------------------------------------------------------------
// State types (exported for parent to own)
// ---------------------------------------------------------------------------

export interface TopicsTabState {
  search: string;
  sortKey: TopicsSortKey;
  filters: TopicsFilters;
}

export const TOPICS_TAB_INITIAL_STATE: TopicsTabState = {
  search: '',
  sortKey: 'retention',
  filters: {
    subjectIds: [],
    bookIds: [],
    retention: [],
    needsAttention: false,
    hasNotes: false,
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TopicsTabProps {
  topics: EnrichedTopic[];
  subjects: Array<{ id: string; name: string }>;
  books: Array<{ id: string; title: string; subjectName: string }>;
  noteTopicIds: Set<string>;
  state: TopicsTabState;
  onStateChange: (state: TopicsTabState) => void;
  onTopicPress: (
    topicId: string,
    subjectId: string,
    retention: RetentionStatus,
    topicName: string
  ) => void;
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
  { key: 'last-practiced', label: 'Last practiced' },
  { key: 'retention', label: 'Retention urgency' },
  { key: 'repetitions', label: 'Repetition count' },
];

// ---------------------------------------------------------------------------
// TopicsTab
// ---------------------------------------------------------------------------

export function TopicsTab({
  topics,
  subjects,
  books,
  noteTopicIds,
  state,
  onStateChange,
  onTopicPress,
  onAddSubject,
  isError,
  onRetry,
}: TopicsTabProps): React.ReactElement {
  // ---- Derived data -------------------------------------------------------

  const filtered = useMemo(() => {
    const searched = searchTopics(topics, state.search);
    const filtered_ = filterTopics(searched, state.filters);
    return sortTopics(filtered_, state.sortKey);
  }, [topics, state.search, state.filters, state.sortKey]);

  // ---- Filter state helpers -----------------------------------------------

  const activeFilterCount =
    state.filters.subjectIds.length +
    state.filters.bookIds.length +
    state.filters.retention.length +
    (state.filters.needsAttention ? 1 : 0) +
    (state.filters.hasNotes ? 1 : 0);

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
      key: 'book',
      label: 'Book',
      options: books.map((b) => {
        const hasDuplicate =
          books.filter((other) => other.title === b.title).length > 1;
        return {
          key: b.id,
          label: hasDuplicate ? `${b.title} (${b.subjectName})` : b.title,
        };
      }),
      selected: state.filters.bookIds,
    },
    {
      key: 'retention',
      label: 'Retention',
      options: [
        { key: 'strong', label: 'Strong' },
        { key: 'fading', label: 'Fading' },
        { key: 'weak', label: 'Weak' },
        { key: 'forgotten', label: 'Forgotten' },
      ],
      selected: state.filters.retention,
    },
    {
      key: 'attention',
      label: 'Needs attention',
      options: [{ key: 'yes', label: '3+ failures' }],
      selected: state.filters.needsAttention ? ['yes'] : [],
    },
    {
      key: 'notes',
      label: 'Has notes',
      options: [{ key: 'yes', label: 'Has notes' }],
      selected: state.filters.hasNotes ? ['yes'] : [],
    },
  ];

  // ---- Handlers -----------------------------------------------------------

  const handleSearchChange = (text: string): void => {
    onStateChange({ ...state, search: text });
  };

  const handleSortChange = (key: string): void => {
    onStateChange({ ...state, sortKey: key as TopicsSortKey });
  };

  const handleFilterChange = (groupKey: string, optionKey: string): void => {
    const f = state.filters;
    if (groupKey === 'subject') {
      const next = f.subjectIds.includes(optionKey)
        ? f.subjectIds.filter((k) => k !== optionKey)
        : [...f.subjectIds, optionKey];
      onStateChange({ ...state, filters: { ...f, subjectIds: next } });
    } else if (groupKey === 'book') {
      const next = f.bookIds.includes(optionKey)
        ? f.bookIds.filter((k) => k !== optionKey)
        : [...f.bookIds, optionKey];
      onStateChange({ ...state, filters: { ...f, bookIds: next } });
    } else if (groupKey === 'attention') {
      onStateChange({
        ...state,
        filters: { ...f, needsAttention: !f.needsAttention },
      });
    } else if (groupKey === 'notes') {
      onStateChange({
        ...state,
        filters: { ...f, hasNotes: !f.hasNotes },
      });
    } else {
      // retention
      const next = f.retention.includes(optionKey as RetentionStatus)
        ? f.retention.filter((k) => k !== optionKey)
        : [...f.retention, optionKey as RetentionStatus];
      onStateChange({ ...state, filters: { ...f, retention: next } });
    }
  };

  // ---- Clear action (CR-9) -----------------------------------------------

  const clearAction = useMemo(() => {
    if (hasSearch && hasFilters) {
      return {
        label: 'Clear all',
        handler: () => onStateChange(TOPICS_TAB_INITIAL_STATE),
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
            filters: {
              subjectIds: [],
              bookIds: [],
              retention: [],
              needsAttention: false,
              hasNotes: false,
            },
          }),
      };
    }
    return null;
  }, [hasSearch, hasFilters, state, onStateChange]);

  // ---- Empty / error / no-content states -----------------------------------

  if (topics.length === 0 && isError) {
    return (
      <View
        className="bg-surface rounded-card px-4 py-6 items-center"
        testID="topics-tab-error"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          Unable to load topics. Please try again.
        </Text>
        {onRetry != null ? (
          <Pressable
            onPress={onRetry}
            className="bg-primary rounded-button px-5 py-3 items-center min-h-[48px] justify-center"
            accessibilityRole="button"
            testID="topics-tab-retry"
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

  if (topics.length === 0) {
    return (
      <View>
        <LibraryEmptyState variant="no-content" onAddSubject={onAddSubject} />
      </View>
    );
  }

  // ---- Render item --------------------------------------------------------

  const renderTopicRow = ({
    item,
  }: {
    item: EnrichedTopic;
  }): React.ReactElement => {
    const lastPracticed = formatLastPracticed(item.lastReviewedAt);
    const sessionLabel =
      item.repetitions === 1 ? '1 session' : `${item.repetitions} sessions`;

    return (
      <Pressable
        onPress={() =>
          onTopicPress(item.topicId, item.subjectId, item.retention, item.name)
        }
        className="bg-surface rounded-card px-4 py-3 mb-3"
        accessibilityRole="button"
        accessibilityLabel={`${item.name}. ${item.subjectName}.`}
        testID={`topic-row-${item.topicId}`}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 me-3">
            <Text className="text-body font-medium text-text-primary">
              {item.name}
            </Text>
            <Text className="text-caption text-text-secondary">
              {item.subjectName}
            </Text>
            {item.bookTitle != null && (
              <Text className="text-caption text-text-tertiary">
                {item.bookTitle}
              </Text>
            )}
            {item.chapter != null && (
              <Text className="text-caption text-text-tertiary">
                {item.chapter}
              </Text>
            )}
            {item.repetitions > 0 && (
              <Text className="text-caption text-text-secondary">
                {sessionLabel}
              </Text>
            )}
            {item.failureCount >= 3 && (
              <Text className="text-caption text-warning">Needs attention</Text>
            )}
            {item.hasNote && (
              <Text className="text-caption text-primary">Has notes</Text>
            )}
            {lastPracticed != null && (
              <Text className="text-caption text-text-tertiary">
                {lastPracticed}
              </Text>
            )}
          </View>

          <View className="items-end justify-center">
            <RetentionSignal status={item.retention} compact />
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
        placeholder="Search topics..."
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
          entityName="topics"
          onClear={clearAction.handler}
          clearLabel={clearAction.label}
          message={hasSearch ? undefined : 'No topics match your filters'}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.topicId}
          renderItem={renderTopicRow}
          scrollEnabled={false}
          testID="topics-list"
        />
      )}
    </View>
  );
}
