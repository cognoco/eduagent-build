import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';
import { RetentionSignal } from '../progress/RetentionSignal';
import type { RetentionStatus } from '../progress/RetentionSignal';

interface Topic {
  id: string;
  title: string;
  sortOrder: number;
  skipped: boolean;
}

interface CollapsibleChapterProps {
  title: string;
  topics: Topic[];
  completedCount: number;
  initiallyExpanded: boolean;
  suggestedNextId?: string;
  onTopicPress: (topicId: string, topicName: string) => void;
  noteTopicIds?: Set<string>;
  onNotePress?: (topicId: string) => void;
  topicRetention?: Record<string, RetentionStatus>;
}

export function CollapsibleChapter({
  title,
  topics,
  completedCount,
  initiallyExpanded,
  suggestedNextId,
  onTopicPress,
  noteTopicIds,
  onNotePress,
  topicRetention,
}: CollapsibleChapterProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const colors = useThemeColors();

  const totalCount = topics.length;
  const allComplete = completedCount >= totalCount && totalCount > 0;

  const sortedTopics = [...topics].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <View className="mb-4">
      <Pressable
        testID={`chapter-header-${title}`}
        onPress={() => setExpanded((prev) => !prev)}
        className="flex-row items-center justify-between px-4 py-3 bg-surface-elevated rounded-card"
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${completedCount} of ${totalCount} complete`}
        accessibilityState={{ expanded }}
      >
        <View className="flex-row items-center flex-1 me-2">
          {allComplete ? (
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={colors.success}
              style={{ marginRight: 8 }}
            />
          ) : null}
          <Text className="text-body font-semibold text-text-primary flex-1">
            {title}
          </Text>
        </View>

        <View className="flex-row items-center">
          <Text className="text-caption text-text-secondary me-2">
            {completedCount}/{totalCount}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.textSecondary}
          />
        </View>
      </Pressable>

      {expanded && (
        <View className="bg-surface-elevated rounded-card mt-1 overflow-hidden">
          {sortedTopics.map((topic) => {
            const isSuggested = topic.id === suggestedNextId;
            const hasNote = noteTopicIds?.has(topic.id) ?? false;
            const retention = topicRetention?.[topic.id];

            return (
              <Pressable
                key={topic.id}
                onPress={() => onTopicPress(topic.id, topic.title)}
                className={`px-4 py-3 border-b border-border ${
                  isSuggested ? 'bg-primary/5' : ''
                } ${topic.skipped ? 'opacity-50' : ''}`}
                accessibilityRole="button"
                accessibilityLabel={`${topic.sortOrder + 1}. ${topic.title}${
                  isSuggested ? ', suggested next' : ''
                }`}
              >
                <View className="flex-row items-center">
                  <Text className="text-body-sm font-semibold text-text-secondary me-3">
                    {topic.sortOrder + 1}.
                  </Text>
                  <Text className="text-body font-medium text-text-primary flex-1">
                    {topic.title}
                  </Text>

                  {retention && <RetentionSignal status={retention} compact />}

                  {hasNote && (
                    <Pressable
                      testID={`note-icon-${topic.id}`}
                      onPress={() => onNotePress?.(topic.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Note for ${topic.title}`}
                    >
                      <Ionicons
                        name="document-text"
                        size={16}
                        color={colors.primary}
                        style={{ marginLeft: 8 }}
                      />
                    </Pressable>
                  )}

                  {isSuggested && (
                    <Text className="text-caption font-semibold text-primary ms-2">
                      Next
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
