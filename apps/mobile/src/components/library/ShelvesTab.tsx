import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Subject } from '@eduagent/schemas';
import { LibrarySearchBar } from './LibrarySearchBar';
import {
  SortFilterBar,
  type SortOption,
  type FilterGroup,
} from './SortFilterBar';
import { LibraryEmptyState } from './LibraryEmptyState';
import { RetentionSignal } from '../progress';
import {
  formatLastPracticed,
  searchShelves,
  filterShelves,
  sortShelves,
  type ShelfItem,
  type ShelvesSortKey,
  type ShelvesFilters,
} from '../../lib/library-filters';

// ---------------------------------------------------------------------------
// State types (exported for parent to own)
// ---------------------------------------------------------------------------

export interface ShelvesTabState {
  search: string;
  sortKey: ShelvesSortKey;
  filters: ShelvesFilters;
}

export const SHELVES_TAB_INITIAL_STATE: ShelvesTabState = {
  search: '',
  sortKey: 'name-asc',
  filters: { status: [], retention: [] },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ShelvesTabProps {
  shelves: ShelfItem[];
  state: ShelvesTabState;
  onStateChange: (state: ShelvesTabState) => void;
  onShelfPress: (subjectId: string) => void;
  onAddSubject: () => void;
}

// ---------------------------------------------------------------------------
// Sort / filter constants
// ---------------------------------------------------------------------------

const SORT_OPTIONS: SortOption[] = [
  { key: 'name-asc', label: 'Name (A-Z)' },
  { key: 'name-desc', label: 'Name (Z-A)' },
  { key: 'last-practiced-recent', label: 'Last practiced (recent)' },
  { key: 'last-practiced-oldest', label: 'Last practiced (oldest)' },
  { key: 'progress', label: 'Progress' },
  { key: 'retention', label: 'Retention status' },
];

// ---------------------------------------------------------------------------
// SubjectStatusPill (small inline helper)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ShelvesTab
// ---------------------------------------------------------------------------

export function ShelvesTab({
  shelves,
  state,
  onStateChange,
  onShelfPress,
  onAddSubject,
}: ShelvesTabProps): React.ReactElement {
  // ---- Derived data -------------------------------------------------------

  const filtered = useMemo(() => {
    const searched = searchShelves(shelves, state.search);
    const filtered_ = filterShelves(searched, state.filters);
    return sortShelves(filtered_, state.sortKey);
  }, [shelves, state.search, state.filters, state.sortKey]);

  // ---- Filter state helpers -----------------------------------------------

  const activeFilterCount =
    state.filters.status.length + state.filters.retention.length;

  const hasSearch = state.search.length > 0;
  const hasFilters = activeFilterCount > 0;

  const filterGroups: FilterGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { key: 'active', label: 'Active' },
        { key: 'paused', label: 'Paused' },
        { key: 'archived', label: 'Archived' },
      ],
      selected: state.filters.status,
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
  ];

  // ---- Handlers -----------------------------------------------------------

  const handleSearchChange = (text: string): void => {
    onStateChange({ ...state, search: text });
  };

  const handleSortChange = (key: string): void => {
    onStateChange({ ...state, sortKey: key as ShelvesSortKey });
  };

  const handleFilterChange = (groupKey: string, optionKey: string): void => {
    const group = groupKey as keyof ShelvesFilters;
    const current = state.filters[group] as string[];
    const next = current.includes(optionKey)
      ? current.filter((k) => k !== optionKey)
      : [...current, optionKey];
    onStateChange({ ...state, filters: { ...state.filters, [group]: next } });
  };

  // ---- Clear action (CR-9) -----------------------------------------------

  const clearAction = useMemo(() => {
    if (hasSearch && hasFilters) {
      return {
        label: 'Clear all',
        handler: () => onStateChange(SHELVES_TAB_INITIAL_STATE),
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
            filters: { status: [], retention: [] },
          }),
      };
    }
    return null;
  }, [hasSearch, hasFilters, state, onStateChange]);

  // ---- Empty / no-content states ------------------------------------------

  if (shelves.length === 0) {
    return (
      <View>
        <LibraryEmptyState variant="no-content" onAddSubject={onAddSubject} />
      </View>
    );
  }

  // ---- Render item --------------------------------------------------------

  const renderShelfCard = ({
    item,
  }: {
    item: ShelfItem;
  }): React.ReactElement => {
    const { subject, progress } = item;
    // BUG-[NOTION-3468bce9]: Library shows `topicsCompleted` (learning content
    // finished) while Progress shows `mastered` (retention-verified). Same
    // "X/Y topics" string hid the semantic difference. Labelled explicitly.
    const progressLabel =
      progress && progress.topicsTotal > 0
        ? `${progress.topicsCompleted}/${progress.topicsTotal} topics completed`
        : 'Shelf ready to explore';
    const reviewLabel =
      item.reviewDueCount && item.reviewDueCount > 0
        ? `${item.reviewDueCount} to review`
        : null;

    return (
      <Pressable
        onPress={() => onShelfPress(subject.id)}
        className="bg-surface rounded-card px-4 py-4 mb-3"
        accessibilityRole="button"
        accessibilityLabel={`${subject.name}. ${
          subject.status !== 'active'
            ? `${subject.status === 'paused' ? 'Paused' : 'Archived'}. `
            : ''
        }${progressLabel}.`}
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
            {reviewLabel ? (
              <Text
                className="text-caption text-primary mt-1"
                testID={`subject-review-due-${subject.id}`}
              >
                {reviewLabel}
              </Text>
            ) : null}
            {progress?.lastSessionAt && (
              <Text className="text-caption text-text-secondary mt-2">
                Last session: {formatLastPracticed(progress.lastSessionAt)}
              </Text>
            )}
          </View>

          <View className="items-end">
            {progress && subject.status === 'active' && (
              <RetentionSignal
                status={
                  progress.retentionStatus as
                    | 'strong'
                    | 'fading'
                    | 'weak'
                    | 'forgotten'
                }
                compact
              />
            )}
            <Text className="text-caption text-primary mt-3">Open shelf</Text>
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
        placeholder="Search shelves..."
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
          entityName="shelves"
          onClear={clearAction.handler}
          clearLabel={clearAction.label}
        />
      ) : (
        <View testID="shelves-list">
          {filtered.map((item) => (
            <React.Fragment key={item.subject.id}>
              {renderShelfCard({ item })}
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}
