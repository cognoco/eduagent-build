import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface BookmarkCardProps {
  bookmarkId: string;
  content: string;
  sourceLine: string;
  onPress?: () => void;
  testID?: string;
}

export function BookmarkCard({
  bookmarkId,
  content,
  sourceLine,
  onPress,
  testID,
}: BookmarkCardProps): React.ReactElement {
  const cardTestID = testID ?? `bookmark-card-${bookmarkId}`;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      testID={cardTestID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Saved from chat. ${sourceLine}.`}
      className="mx-5 mb-2 rounded-card bg-surface px-4 py-3 border border-surface-elevated"
    >
      <View className="flex-row items-start">
        <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center me-3 mt-0.5">
          <Ionicons name="bookmark" size={16} className="text-primary" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-body-sm text-text-primary" numberOfLines={3}>
            {content}
          </Text>
          <Text className="text-caption text-text-tertiary mt-1">
            {sourceLine}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
