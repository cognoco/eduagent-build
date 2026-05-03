import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { useThemeColors } from '../../lib/theme';

interface TopicOption {
  topicId: string;
  name: string;
  chapter: string | null;
}

interface TopicPickerSheetProps {
  visible: boolean;
  topics: TopicOption[];
  defaultTopicId?: string;
  onSelect: (topicId: string) => void;
  onClose: () => void;
}

export function TopicPickerSheet({
  visible,
  topics,
  defaultTopicId,
  onSelect,
  onClose,
}: TopicPickerSheetProps): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID="topic-picker-modal"
    >
      {/* Semi-transparent backdrop — tapping it dismisses the sheet */}
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close topic picker"
      >
        {/* Sheet content — stop touch propagation so taps inside don't close */}
        <Pressable
          className="bg-background rounded-t-3xl px-5 pt-5 pb-8"
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="none"
        >
          {/* Drag handle */}
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-text-secondary/30" />
          </View>

          <Text className="text-h3 font-semibold text-text-primary mb-4">
            Choose a topic
          </Text>

          <ScrollView
            style={{ maxHeight: 320 }}
            showsVerticalScrollIndicator={false}
          >
            {topics.map((topic) => {
              const isSelected = topic.topicId === defaultTopicId;
              return (
                <Pressable
                  key={topic.topicId}
                  testID={`topic-picker-${topic.topicId}`}
                  onPress={() => onSelect(topic.topicId)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    topic.chapter
                      ? `${topic.name}, ${topic.chapter}`
                      : topic.name
                  }
                  accessibilityState={{ selected: isSelected }}
                  className="rounded-card px-4 py-3 mb-2"
                  style={{
                    backgroundColor: isSelected
                      ? colors.primarySoft
                      : colors.surface,
                  }}
                >
                  <Text
                    style={{ fontSize: 15 }}
                    className="font-semibold text-text-primary"
                  >
                    {topic.name}
                  </Text>
                  {topic.chapter !== null && (
                    <Text
                      style={{ fontSize: 12 }}
                      className="text-text-secondary mt-1"
                    >
                      {topic.chapter}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
