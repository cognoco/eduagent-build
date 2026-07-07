import { Pressable, Text, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  accessibilityLabel?: string;
  testID?: string;
}

const variantClasses: Record<
  ButtonVariant,
  { base: string; disabled: string; text: string; disabledText: string }
> = {
  primary: {
    base: 'bg-primary',
    disabled: 'bg-surface-elevated',
    text: 'text-text-inverse',
    disabledText: 'text-muted',
  },
  secondary: {
    base: 'bg-surface-elevated',
    disabled: 'bg-surface-elevated',
    text: 'text-text-primary',
    disabledText: 'text-muted',
  },
  tertiary: {
    base: 'bg-transparent',
    disabled: 'bg-transparent',
    text: 'text-primary',
    disabledText: 'text-muted',
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
  accessibilityLabel,
  testID,
}: ButtonProps): React.JSX.Element {
  const { t } = useTranslation();
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
      style={({ pressed }) => ({
        opacity: pressed && !isDisabled ? 0.8 : 1,
      })}
      accessibilityRole="button"
      // SR loading state lives on the Pressable — it is the accessible element,
      // so focusing the button while loading must surface the busy state, not
      // the (visually hidden to SR) inner ActivityIndicator label.
      accessibilityLabel={
        loading ? t('common.loading') : (accessibilityLabel ?? label)
      }
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.textInverse : colors.primary}
          accessibilityLabel={t('common.loading')}
        />
      ) : (
        <Text
          className={`font-sans-semibold ${s.text} ${
            isDisabled ? v.disabledText : v.text
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
