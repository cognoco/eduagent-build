import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatRelativeDate } from '../../lib/format-relative-date';
import { useThemeColors } from '../../lib/theme';

interface InlineNoteCardProps {
  topicTitle: string;
  content: string;
  updatedAt: string;
  defaultExpanded?: boolean;
  testID?: string;
}

export function InlineNoteCard({
  topicTitle,
  content,
  updatedAt,
  defaultExpanded = false,
  testID,
}: InlineNoteCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const themeColors = useThemeColors();

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      className="mx-5 mb-2 bg-surface rounded-card px-4 py-3"
      accessibilityRole="button"
      accessibilityLabel={`Note for ${topicTitle}. Tap to ${
        expanded ? 'collapse' : 'expand'
      }.`}
      testID={testID}
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text
          className="text-caption font-semibold text-text-secondary flex-1 me-2"
          numberOfLines={1}
        >
          {topicTitle}
        </Text>
        <Text className="text-caption text-text-tertiary me-1">
          {formatRelativeDate(updatedAt)}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={themeColors.textSecondary}
        />
      </View>
      <Text
        className="text-body-sm text-text-primary"
        numberOfLines={expanded ? undefined : 2}
        testID={testID ? `${testID}-content` : undefined}
      >
        {content}
      </Text>
    </Pressable>
  );
}
