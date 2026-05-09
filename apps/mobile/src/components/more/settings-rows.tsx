import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import { useThemeColors } from '../../lib/theme';

export function SettingsRow({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  testID?: string;
}): React.ReactElement {
  const themeColors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3.5 mb-2"
      style={({ pressed }) => ({
        ...(pressed ? { opacity: 0.6 } : {}),
        ...(Platform.OS === 'web' && onPress ? { cursor: 'pointer' } : {}),
      })}
      accessibilityLabel={label}
      accessibilityRole="button"
      testID={testID}
    >
      <Text className="text-body text-text-primary">{label}</Text>
      <View className="flex-row items-center gap-2">
        {value ? (
          <Text className="text-body-sm text-text-secondary">{value}</Text>
        ) : null}
        {onPress ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={themeColors.textSecondary}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export function ToggleRow({
  label,
  value,
  onToggle,
  disabled,
  testID,
  description,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  testID?: string;
  description?: string;
}): React.ReactElement {
  return (
    <View
      className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
      testID={testID}
    >
      <View className="flex-1 pr-3">
        <Text className="text-body text-text-primary">{label}</Text>
        {description ? (
          <Text className="text-body-sm text-text-secondary mt-1">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        accessibilityLabel={label}
        testID={testID ? `${testID}-switch` : undefined}
      />
    </View>
  );
}

export function LearningModeOption({
  title,
  description,
  selected,
  disabled,
  onPress,
  testID,
}: {
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
        selected ? 'border-2 border-primary' : 'border-2 border-transparent'
      }`}
      accessibilityLabel={`${title}: ${description}`}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      testID={testID}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-body font-semibold text-text-primary">
          {title}
        </Text>
        {selected ? (
          <Text className="text-primary text-body font-semibold">
            {t('more.active')}
          </Text>
        ) : null}
      </View>
      <Text className="text-body-sm text-text-secondary mt-1">
        {description}
      </Text>
    </Pressable>
  );
}

export function SectionHeader({
  children,
  testID,
}: {
  children: React.ReactNode;
  testID?: string;
}): React.ReactElement {
  return (
    <Text
      className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6"
      testID={testID}
    >
      {children}
    </Text>
  );
}
