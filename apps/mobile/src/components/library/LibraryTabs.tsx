import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import type { LibraryTab } from '../../lib/library-filters';

interface LibraryTabsProps {
  activeTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  counts: Record<LibraryTab, number>;
  reviewBadge?: number;
}

const TAB_CONFIG: Array<{ key: LibraryTab; label: string }> = [
  { key: 'shelves', label: 'Shelves' },
  { key: 'books', label: 'Books' },
  { key: 'topics', label: 'Topics' },
];

export function LibraryTabs({
  activeTab,
  onTabChange,
  counts,
  reviewBadge,
}: LibraryTabsProps): React.ReactElement {
  return (
    <View className="flex-row items-center mb-4 gap-2">
      {TAB_CONFIG.map(({ key, label }) => {
        const isActive = activeTab === key;
        const showReviewBadge = key === 'topics' && (reviewBadge ?? 0) > 0;
        const tabLabel = key === 'topics' ? label : `${label} (${counts[key]})`;
        return (
          <Pressable
            key={key}
            onPress={() => onTabChange(key)}
            className={`rounded-full px-4 py-2 ${
              isActive ? 'bg-primary' : 'bg-surface-elevated'
            }`}
            style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
            testID={`library-tab-${key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <View className="flex-row items-center gap-2">
              <Text
                className={`text-body-sm font-semibold ${
                  isActive ? 'text-text-inverse' : 'text-text-secondary'
                }`}
              >
                {tabLabel}
              </Text>
              {showReviewBadge ? (
                <View
                  className={`rounded-full px-2 py-0.5 ${
                    isActive ? 'bg-text-inverse/20' : 'bg-primary-soft'
                  }`}
                  testID="library-tab-topics-review-badge"
                >
                  <Text
                    className={`text-caption font-semibold ${
                      isActive ? 'text-text-inverse' : 'text-primary'
                    }`}
                  >
                    {reviewBadge}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
