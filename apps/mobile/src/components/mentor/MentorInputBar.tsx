import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../lib/theme';

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
  const colors = useThemeColors();
  const [value, setValue] = useState('');
  const hasText = value.trim().length > 0;

  const submit = (): void => {
    const text = value.trim();
    if (text) {
      onSubmitText(text);
    }
  };

  return (
    <View
      testID="mentor-input-bar"
      className="rounded-2xl border border-border bg-surface p-4"
    >
      <Text className="mb-3 font-bold text-text-primary">
        {t('mentorHome.bar.title')}
      </Text>
      {unavailable ? (
        <Text className="mb-2 text-xs text-text-secondary">
          {t('mentorHome.bar.unavailable')}
        </Text>
      ) : null}
      <View className="flex-row items-start gap-2">
        <TextInput
          testID="mentor-bar-input"
          value={value}
          onChangeText={setValue}
          onSubmitEditing={submit}
          placeholder={t('mentorHome.bar.placeholder')}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          blurOnSubmit
          className="min-h-16 min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-text-primary"
          returnKeyType="send"
        />
        <Pressable
          testID="mentor-bar-send"
          accessibilityRole="button"
          accessibilityLabel={t('session.chatShell.a11ySendMessage')}
          accessibilityState={{ disabled: !hasText }}
          disabled={!hasText}
          onPress={submit}
          className={`h-16 w-12 items-center justify-center rounded-xl ${
            hasText ? 'bg-primary' : 'bg-surface-elevated'
          }`}
        >
          <Ionicons
            name="send"
            size={18}
            color={hasText ? colors.textInverse : colors.muted}
          />
        </Pressable>
      </View>
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
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
        <Pressable
          testID="mentor-bar-homework-chip"
          accessibilityRole="button"
          onPress={onOpenHomework}
          className="rounded-full border border-border px-3 py-2"
        >
          <Text className="text-sm font-semibold text-primary">
            {t('mentorHome.bar.homeworkChip')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
