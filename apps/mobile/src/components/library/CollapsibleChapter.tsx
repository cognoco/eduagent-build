import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface Topic {
  id: string;
  title: string;
  sortOrder: number;
  skipped: boolean;
}

interface CollapsibleChapterProps {
  title: string;
  topics: Topic[];
  totalTopicCount: number;
  chapterState: 'untouched' | 'partial';
  initiallyExpanded: boolean;
  onTopicPress: (topicId: string, topicName: string) => void;
}

export function CollapsibleChapter({
  title,
  topics,
  totalTopicCount,
  chapterState,
  initiallyExpanded,
  onTopicPress,
}: CollapsibleChapterProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const colors = useThemeColors();
  const sortedTopics = [...topics].sort((a, b) => a.sortOrder - b.sortOrder);
  const chapterGlyph = chapterState === 'partial' ? '◐' : '○';

  return (
    <View className="mb-3">
      <Pressable
        testID={`chapter-header-${title}`}
        onPress={() => setExpanded((prev) => !prev)}
        className="flex-row items-center justify-between px-4 py-3 bg-surface-elevated rounded-card"
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${topics.length} of ${totalTopicCount} topics not started`}
        accessibilityState={{ expanded }}
      >
        <View className="flex-row items-center flex-1 me-2">
          <Text
            accessible={false}
            importantForAccessibility="no"
            style={{
              color: colors.textSecondary,
              marginRight: 8,
              fontSize: 14,
            }}
          >
            {chapterGlyph}
          </Text>
          <View className="flex-1">
            <Text className="text-body font-semibold text-text-primary">
              {title}
            </Text>
            <Text className="text-caption text-text-secondary">
              {topics.length} / {totalTopicCount} not started
            </Text>
          </View>
        </View>

        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textSecondary}
        />
      </Pressable>

      {expanded && (
        <View className="bg-surface-elevated rounded-card mt-1 overflow-hidden">
          {sortedTopics.map((topic) => (
            <Pressable
              key={topic.id}
              onPress={() => onTopicPress(topic.id, topic.title)}
              className="border-b border-border px-4 py-3"
              accessibilityRole="button"
              accessibilityLabel={topic.title}
            >
              <Text className="text-body text-text-primary">{topic.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
