import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CopyRegister } from '../../lib/copy-register';

interface CurrentlyWorkingOnCardProps {
  items: string[];
  register: CopyRegister;
  testID?: string;
}

export function CurrentlyWorkingOnCard({
  items,
  register,
  testID,
}: CurrentlyWorkingOnCardProps): React.ReactElement | null {
  const { t } = useTranslation();
  const visibleItems = items.slice(0, 3);
  const remaining = Math.max(0, items.length - visibleItems.length);

  if (visibleItems.length === 0) return null;

  return (
    <View className="bg-coaching-card rounded-card p-5 mt-4" testID={testID}>
      <Text className="text-h3 font-semibold text-text-primary">
        {t(`progress.register.${register}.currentlyWorkingOnTitle`)}
      </Text>
      <View className="mt-3 gap-3">
        {visibleItems.map((item, index) => (
          <View key={`${item}-${index}`} testID="currently-working-on-item">
            <Text className="text-body font-semibold text-text-primary">
              {item}
            </Text>
            <Text className="text-caption text-text-secondary mt-1">
              {t(`progress.register.${register}.currentlyWorkingOnDetected`)}
            </Text>
          </View>
        ))}
      </View>
      {remaining > 0 ? (
        <Text className="text-caption text-text-secondary mt-3">
          {t('progress.currentlyWorkingOn.andNMore', { count: remaining })}
        </Text>
      ) : null}
    </View>
  );
}
