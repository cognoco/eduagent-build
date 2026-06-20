import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { TranslateKey } from '../../i18n';

export interface ColdStartCardProps {
  onFill: (text: string) => void;
  onSubmitText: (text: string) => void;
  onOpenCamera: () => void;
  /** Rotation cadence for the placeholder examples (ms). Test seam. */
  placeholderRotationIntervalMs?: number;
}

const EQUAL_WEIGHT_TOKEN = 'mentorHome.coldStart.equalWeight';

// Rotating placeholder examples teach that the box both ASKS and GOES PLACES —
// `.three` is the navigational example ("Try: show my progress"). Deterministic
// rotation: index advances on a fixed interval, cycling the catalog.
const PLACEHOLDER_KEYS = [
  'mentorHome.coldStart.placeholderRotation.one',
  'mentorHome.coldStart.placeholderRotation.two',
  'mentorHome.coldStart.placeholderRotation.three',
] as const;

const DEFAULT_PLACEHOLDER_ROTATION_MS = 4000;

const CHIPS = [
  {
    id: 'homework',
    key: 'mentorHome.coldStart.chipHomework',
  },
  {
    id: 'learn',
    key: 'mentorHome.coldStart.chipLearn',
  },
  {
    id: 'ask',
    key: 'mentorHome.coldStart.chipAsk',
  },
] as const;

export function ColdStartCard({
  onFill,
  onSubmitText,
  onOpenCamera,
  placeholderRotationIntervalMs = DEFAULT_PLACEHOLDER_ROTATION_MS,
}: ColdStartCardProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [showHomeworkReply, setShowHomeworkReply] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PLACEHOLDER_KEYS.length);
    }, placeholderRotationIntervalMs);
    return () => clearInterval(timer);
  }, [placeholderRotationIntervalMs]);

  const placeholder = t(PLACEHOLDER_KEYS[placeholderIndex] as TranslateKey);

  const fill = (chip: (typeof CHIPS)[number]): void => {
    const text = t(chip.key);
    setValue(text);
    onFill(text);
    if (chip.id === 'homework') {
      setShowHomeworkReply(true);
    }
  };

  const submit = (): void => {
    const text = value.trim();
    if (text) {
      onSubmitText(text);
    }
  };

  return (
    <View
      testID="mentor-cold-start-card"
      className="rounded-2xl border border-border bg-surface p-4"
    >
      <Text className="font-bold text-text-primary">
        {t('mentorHome.coldStart.caption')}
      </Text>
      <TextInput
        testID="cold-start-input"
        accessibilityLabel={t(EQUAL_WEIGHT_TOKEN)}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder={placeholder}
        className="mt-3 min-h-11 rounded-xl border border-border px-3 text-text-primary"
        returnKeyType="send"
      />
      <Text className="mt-3 text-xs text-text-secondary">
        {t('mentorHome.coldStart.orJustType')}
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <Pressable
            key={chip.id}
            testID={`cold-start-chip-${chip.id}`}
            accessibilityRole="button"
            accessibilityLabel={t(EQUAL_WEIGHT_TOKEN)}
            onPress={() => fill(chip)}
            className="rounded-xl border border-border px-3 py-2"
          >
            <Text className="text-sm text-primary">{t(chip.key)}</Text>
          </Pressable>
        ))}
      </View>
      {showHomeworkReply ? (
        <View
          testID="cold-start-homework-reply"
          className="mt-3 rounded-xl border border-border p-3"
        >
          <Pressable
            testID="cold-start-homework-camera"
            accessibilityRole="button"
            onPress={onOpenCamera}
            className="mb-2 rounded-xl bg-primary px-3 py-2"
          >
            <Text className="text-text-inverse">
              {t('mentorHome.bar.cameraLabel')}
            </Text>
          </Pressable>
          <Text className="text-sm text-text-primary">
            {t('mentorHome.coldStart.homeworkReply')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
