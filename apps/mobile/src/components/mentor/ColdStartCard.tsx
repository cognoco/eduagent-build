import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export interface ColdStartCardProps {
  onFill: (text: string) => void;
  onOpenCamera: () => void;
}

const EQUAL_WEIGHT_TOKEN = 'mentorHome.coldStart.equalWeight';

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

export function ColdStartCard({ onFill, onOpenCamera }: ColdStartCardProps) {
  const { t } = useTranslation();
  const [showHomeworkReply, setShowHomeworkReply] = useState(false);

  const fill = (chip: (typeof CHIPS)[number]): void => {
    const text = t(chip.key);
    onFill(text);
    setShowHomeworkReply(chip.id === 'homework');
  };

  return (
    <View
      testID="mentor-cold-start-card"
      className="mt-3 rounded-xl border border-border bg-surface-elevated p-3"
    >
      <Text className="font-bold text-text-primary">
        {t('mentorHome.coldStart.caption')}
      </Text>
      <Text className="mt-3 text-xs text-text-secondary">
        {t('mentorHome.coldStart.orJustType')}
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <Pressable
            key={chip.id}
            testID={`cold-start-chip-${chip.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${t(EQUAL_WEIGHT_TOKEN)}: ${t(chip.key)}`}
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
            accessibilityLabel={t('mentorHome.bar.cameraLabel')}
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
