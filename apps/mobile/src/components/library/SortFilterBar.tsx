import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';

export interface SortOption {
  key: string;
  label: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  options: Array<{ key: string; label: string }>;
  selected: string[];
}

export interface SortFilterBarProps {
  sortOptions: SortOption[];
  activeSortKey: string;
  onSortChange: (key: string) => void;
  filterGroups: FilterGroup[];
  onFilterChange: (groupKey: string, optionKey: string) => void;
  activeFilterCount: number;
}

export function SortFilterBar({
  sortOptions,
  activeSortKey,
  onSortChange,
  filterGroups,
  onFilterChange,
  activeFilterCount,
}: SortFilterBarProps): React.ReactElement {
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  const activeSort = sortOptions.find((o) => o.key === activeSortKey);
  const filterLabel =
    activeFilterCount > 0 ? `Filter (${activeFilterCount})` : 'Filter';

  return (
    <View className="flex-row items-center gap-2 mb-3">
      {/* Sort button */}
      <Pressable
        testID="library-sort-button"
        onPress={() => setShowSort(true)}
        className="flex-row items-center bg-surface rounded-button px-3 py-2 gap-1"
        accessibilityLabel={`Sort by ${activeSort?.label ?? 'default'}`}
        accessibilityRole="button"
      >
        {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
        <View
          testID="library-sort-icon"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons
            name="swap-vertical"
            size={16}
            color={themeColors.textSecondary}
          />
        </View>
        <Text className="text-sm text-text-primary">
          {activeSort?.label ?? 'Sort'}
        </Text>
      </Pressable>

      {/* Filter button */}
      <Pressable
        testID="library-filter-button"
        onPress={() => setShowFilter(true)}
        className="flex-row items-center bg-surface rounded-button px-3 py-2 gap-1"
        accessibilityLabel={filterLabel}
        accessibilityRole="button"
      >
        {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
        <View
          testID="library-filter-icon"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="filter" size={16} color={themeColors.textSecondary} />
        </View>
        <Text className="text-sm text-text-primary">{filterLabel}</Text>
      </Pressable>

      {/* Sort modal */}
      <Modal
        visible={showSort}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSort(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => setShowSort(false)}
          accessibilityLabel="Close sort options"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-background rounded-t-3xl px-5 pt-5"
            style={{ paddingBottom: insets.bottom + 16 }}
            accessibilityViewIsModal
            accessibilityLabel="Sort options"
          >
            <Text className="text-lg font-semibold text-text-primary mb-4">
              Sort by
            </Text>
            {sortOptions.map((option) => {
              const isActive = option.key === activeSortKey;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    onSortChange(option.key);
                    setShowSort(false);
                  }}
                  className="flex-row items-center justify-between py-3 border-b border-border"
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    className={`text-base ${
                      isActive
                        ? 'text-primary font-semibold'
                        : 'text-text-primary'
                    }`}
                  >
                    {option.label}
                  </Text>
                  {isActive && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={themeColors.primary}
                    />
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Filter modal */}
      <Modal
        visible={showFilter}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilter(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => setShowFilter(false)}
          accessibilityLabel="Close filter options"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-background rounded-t-3xl px-5 pt-5"
            style={{ paddingBottom: insets.bottom + 16 }}
            accessibilityViewIsModal
            accessibilityLabel="Filter options"
          >
            <Text className="text-lg font-semibold text-text-primary mb-4">
              Filters
            </Text>
            {filterGroups.map((group) => (
              <View key={group.key} className="mb-4">
                <Text className="text-sm font-medium text-text-secondary mb-2">
                  {group.label}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {group.options.map((option) => {
                    const isSelected = group.selected.includes(option.key);
                    return (
                      <Pressable
                        key={option.key}
                        testID={`filter-chip-${group.key}-${option.key}`}
                        onPress={() => onFilterChange(group.key, option.key)}
                        className={`px-3 py-1.5 rounded-full border ${
                          isSelected
                            ? 'bg-primary border-primary'
                            : 'bg-surface border-border'
                        }`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text
                          className={`text-sm ${
                            isSelected
                              ? 'text-text-inverse font-medium'
                              : 'text-text-primary'
                          }`}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
