import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const isPrimary = variant === 'primary';

  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-background border-t border-border px-5 pt-3"
      style={{ paddingBottom: 12 + insets.bottom }}
    >
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        className={`h-[52px] rounded-xl items-center justify-center ${
          isPrimary ? 'bg-primary' : 'border-[1.5px] border-primary'
        }`}
        style={({ pressed }) => ({
          opacity: pressed || disabled ? 0.6 : 1,
        })}
      >
        <Text
          className={`text-base font-semibold ${
            isPrimary ? 'text-text-inverse' : 'text-primary'
          }`}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
