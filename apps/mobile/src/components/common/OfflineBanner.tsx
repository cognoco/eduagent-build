import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

/**
 * Full-width banner shown at the top of the screen when the device is offline.
 * Renders below the status bar using safe area insets.
 */
export function OfflineBanner(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <View
      className="bg-warning px-4 py-2 flex-row items-center justify-center"
      style={{ paddingTop: insets.top + 4, paddingBottom: 6 }}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      testID="offline-banner"
    >
      <Ionicons
        name="cloud-offline-outline"
        size={16}
        color={colors.background}
      />
      <Text
        className="text-caption font-semibold ms-2"
        style={{ color: colors.background }}
      >
        No internet connection
      </Text>
    </View>
  );
}
