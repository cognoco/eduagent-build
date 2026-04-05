import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LibraryTab } from '../../lib/library-filters';

interface LibraryTabsProps {
  activeTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  counts: Record<LibraryTab, number>;
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
}: LibraryTabsProps): React.ReactElement {
  return (
    <View className="flex-row items-center mb-4 gap-2">
      {TAB_CONFIG.map(({ key, label }) => {
        const isActive = activeTab === key;
        return (
          <Pressable
            key={key}
            onPress={() => onTabChange(key)}
            className={`rounded-full px-4 py-2 ${
              isActive ? 'bg-primary' : 'bg-surface-elevated'
            }`}
            testID={`library-tab-${key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              className={`text-body-sm font-semibold ${
                isActive ? 'text-text-inverse' : 'text-text-secondary'
              }`}
            >
              {label} ({counts[key]})
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
