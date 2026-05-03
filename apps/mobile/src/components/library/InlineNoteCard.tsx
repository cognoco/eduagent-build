import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';
import { withOpacity } from '../../lib/color-opacity';

interface InlineNoteCardProps {
  noteId: string;
  topicTitle: string;
  content: string;
  sourceLine: string;
  updatedAt: string;
  defaultExpanded?: boolean;
  onLongPress?: (noteId: string) => void;
  testID?: string;
}

export function InlineNoteCard({
  noteId,
  topicTitle,
  content,
  sourceLine,
  updatedAt: _updatedAt,
  defaultExpanded = false,
  onLongPress,
  testID,
}: InlineNoteCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const themeColors = useThemeColors();

  const cardTestID = testID ?? `note-card-${noteId}`;
  const accentBg = withOpacity(themeColors.accent, 0.08);
  const accentBorder = withOpacity(themeColors.accent, 0.35);

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      onLongPress={() => onLongPress?.(noteId)}
      testID={cardTestID}
      accessibilityRole="button"
      accessibilityLabel={`Note for ${topicTitle}. ${sourceLine}. Tap to ${
        expanded ? 'collapse' : 'expand'
      }.`}
      style={{
        marginHorizontal: 20,
        marginBottom: 8,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: accentBg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: accentBorder,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            color: themeColors.textSecondary,
            flex: 1,
            marginEnd: 8,
          }}
          numberOfLines={1}
        >
          {sourceLine}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={themeColors.textSecondary}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>
      <Text
        style={{ fontSize: 14, color: themeColors.textPrimary }}
        numberOfLines={expanded ? undefined : 2}
      >
        {content}
      </Text>
    </Pressable>
  );
}
