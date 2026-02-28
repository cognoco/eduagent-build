import { Pressable, Text, ActivityIndicator } from 'react-native';
import { useThemeColors } from '../../lib/theme';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary';
type ButtonSize = 'default' | 'small';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}

const variantClasses: Record<
  ButtonVariant,
  { base: string; disabled: string; text: string }
> = {
  primary: {
    base: 'bg-primary',
    disabled: 'bg-surface-elevated',
    text: 'text-text-inverse',
  },
  secondary: {
    base: 'bg-surface-elevated',
    disabled: 'bg-surface-elevated opacity-50',
    text: 'text-text-primary',
  },
  tertiary: {
    base: 'bg-transparent',
    disabled: 'bg-transparent opacity-50',
    text: 'text-primary',
  },
};

const sizeClasses: Record<ButtonSize, { container: string; text: string }> = {
  default: { container: 'py-3 px-6', text: 'text-body' },
  small: { container: 'py-2 px-4', text: 'text-body-sm' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  disabled = false,
  loading = false,
  testID,
}: ButtonProps): React.JSX.Element {
  const colors = useThemeColors();
  const isDisabled = disabled || loading;

  const v = variantClasses[variant];
  const s = sizeClasses[size];
  const bgClass = isDisabled ? v.disabled : v.base;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`rounded-button items-center ${s.container} ${bgClass}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.textInverse : colors.primary}
        />
      ) : (
        <Text className={`font-sans-semibold ${s.text} ${v.text}`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
