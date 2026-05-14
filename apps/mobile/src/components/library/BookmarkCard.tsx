import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';
import { withOpacity } from '../../lib/color-opacity';
import { formatBookmarkSourceLine } from '../../lib/format-bookmark-source';

interface BookmarkCardProps {
  bookmarkId: string;
  content: string;
  createdAt: string;
  subjectName?: string | null;
  topicTitle?: string | null;
  onPress?: () => void;
  testID?: string;
}

export function BookmarkCard({
  bookmarkId,
  content,
  createdAt,
  subjectName,
  topicTitle,
  onPress,
  testID,
}: BookmarkCardProps): React.ReactElement {
  const themeColors = useThemeColors();
  const cardTestID = testID ?? `bookmark-card-${bookmarkId}`;
  const tint = withOpacity(themeColors.primary, 0.08);
  const tintBorder = withOpacity(themeColors.primary, 0.35);
  const sourceLine = formatBookmarkSourceLine({
    createdAt,
    subjectName,
    topicTitle,
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      testID={cardTestID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Bookmark. ${sourceLine}.`}
      style={{
        marginHorizontal: 20,
        marginBottom: 8,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: tint,
        borderWidth: 1,
        borderColor: tintBorder,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <Ionicons
          name="bookmark"
          size={14}
          color={themeColors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Text
          style={{
            fontSize: 12,
            color: themeColors.primary,
            marginStart: 6,
            flex: 1,
          }}
          numberOfLines={1}
          testID={`${cardTestID}-source`}
        >
          {sourceLine}
        </Text>
      </View>
      <Text
        style={{ fontSize: 14, color: themeColors.textPrimary }}
        numberOfLines={3}
        testID={`${cardTestID}-content`}
      >
        {content}
      </Text>
    </Pressable>
  );
}
