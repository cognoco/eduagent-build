import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

export function AppealButton({
  onPress,
}: {
  onPress: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('visibility.appeal.label')}
      className="min-h-[48px] items-center justify-center rounded-button bg-surface px-4 py-3"
      onPress={onPress}
      testID="visibility-appeal-button"
    >
      <Text className="text-body font-semibold text-text-primary">
        {t('visibility.appeal.label')}
      </Text>
    </Pressable>
  );
}
