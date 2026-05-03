import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';

interface StudyCTAProps {
  label: string;
  variant: 'primary' | 'outline';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export function StudyCTA({
  label,
  variant,
  onPress,
  disabled = false,
  testID = 'study-cta',
}: StudyCTAProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const isPrimary = variant === 'primary';

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 12 + insets.bottom,
      }}
    >
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        style={({ pressed }) => ({
          height: 52,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed || disabled ? 0.6 : 1,
          backgroundColor: isPrimary ? colors.primary : 'transparent',
          borderWidth: isPrimary ? 0 : 1.5,
          borderColor: isPrimary ? undefined : colors.primary,
        })}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: isPrimary ? colors.textInverse : colors.primary,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
