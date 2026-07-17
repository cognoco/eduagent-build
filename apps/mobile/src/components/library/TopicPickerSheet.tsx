import { View, Text, Pressable, ScrollView } from 'react-native';
import { BottomSheet } from '../common/BottomSheet';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backdropDismissible
      backdropAccessibilityLabel={t('library.a11yCloseTopicPicker')}
      accessibilityLabel={t('library.chooseTopic')}
      testID="topic-picker-modal"
    >
      <View className="bg-background px-5 pt-5 pb-8">
        {/* Drag handle */}
        <View className="items-center mb-4">
          <View className="w-10 h-1 rounded-full bg-text-secondary/30" />
        </View>

        <Text className="text-h3 font-semibold text-text-primary mb-4">
          {t('library.chooseTopic')}
        </Text>

        {topics.length === 0 ? (
          <View className="items-center py-6" testID="topic-picker-empty">
            <Text className="text-body font-semibold text-text-primary text-center">
              {t('library.topicPickerEmptyTitle')}
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              {t('library.topicPickerEmptyDescription')}
            </Text>
            <Pressable
              onPress={onClose}
              className="mt-5 min-h-[44px] rounded-button bg-primary px-5 py-3 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              testID="topic-picker-empty-close"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('common.close')}
              </Text>
            </Pressable>
          </View>
        ) : (
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
                      ? t('library.topicPicker.a11yTopicWithChapter', {
                          name: topic.name,
                          chapter: topic.chapter,
                        })
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
        )}
      </View>
    </BottomSheet>
  );
}
