import { Pressable, Text, View } from 'react-native';

export interface SessionTopicHeaderProps {
  topicName: string;
  onChangeTopic: () => void;
}

export function SessionTopicHeader({
  topicName,
  onChangeTopic,
}: SessionTopicHeaderProps) {
  return (
    <View
      className="flex-row items-center justify-between gap-2"
      testID="session-topic-header"
    >
      <Text
        className="flex-1 text-body-sm text-text-secondary"
        numberOfLines={1}
      >
        <Text className="font-semibold text-text-primary">Current topic: </Text>
        {topicName}
      </Text>
      <Pressable
        onPress={onChangeTopic}
        className="rounded-full bg-surface-elevated px-3 py-1.5 min-h-[36px] items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={`Change topic from ${topicName}`}
        testID="session-topic-header-change"
      >
        <Text className="text-body-sm font-semibold text-text-secondary">
          Change topic
        </Text>
      </Pressable>
    </View>
  );
}
