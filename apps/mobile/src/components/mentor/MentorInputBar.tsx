import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export interface MentorInputBarProps {
  unavailable?: boolean;
  onSubmitText: (text: string) => void;
  onOpenCamera: () => void;
  onOpenHomework: () => void;
  onTranscript: (text: string) => void;
}

export function MentorInputBar({
  unavailable = false,
  onSubmitText,
  onOpenCamera,
  onOpenHomework,
}: MentorInputBarProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  const submit = (): void => {
    const text = value.trim();
    if (text) {
      onSubmitText(text);
    }
  };

  return (
    <View
      testID="mentor-input-bar"
      className="border-t border-border bg-surface px-4 py-3"
    >
      {unavailable ? (
        <Text className="mb-2 text-xs text-text-secondary">
          {t('mentorHome.bar.unavailable')}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Pressable
          testID="mentor-bar-camera"
          accessibilityRole="button"
          accessibilityLabel={t('mentorHome.bar.cameraLabel')}
          onPress={onOpenCamera}
          className="rounded-full border border-border px-3 py-2"
        >
          <Text className="text-text-primary">
            {t('mentorHome.bar.cameraLabel')}
          </Text>
        </Pressable>
        <TextInput
          testID="mentor-bar-input"
          value={value}
          onChangeText={setValue}
          onSubmitEditing={submit}
          placeholder={t('mentorHome.bar.placeholder')}
          className="min-h-11 flex-1 rounded-xl border border-border px-3 text-text-primary"
          returnKeyType="send"
        />
        <Pressable
          testID="mentor-bar-mic"
          accessibilityRole="button"
          accessibilityLabel={t('mentorHome.bar.micLabel')}
          disabled
          accessibilityState={{ disabled: true }}
          className="rounded-full border border-border px-3 py-2"
        >
          <Text className="text-text-primary">
            {t('mentorHome.bar.micLabel')}
          </Text>
        </Pressable>
      </View>
      <Pressable
        testID="mentor-bar-homework-chip"
        accessibilityRole="button"
        onPress={onOpenHomework}
        className="mt-2 self-start rounded-full border border-border px-3 py-2"
      >
        <Text className="text-sm font-semibold text-primary">
          {t('mentorHome.bar.homeworkChip')}
        </Text>
      </Pressable>
    </View>
  );
}
