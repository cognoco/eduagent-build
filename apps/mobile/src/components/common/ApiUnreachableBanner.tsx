import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface ApiUnreachableBannerProps {
  onRetry: () => Promise<void>;
}

/**
 * Banner displayed when the API server cannot be reached.
 * Shows a clear message and a retry button.
 */
export function ApiUnreachableBanner({
  onRetry,
}: ApiUnreachableBannerProps): React.ReactElement {
  const colors = useThemeColors();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = useCallback(async (): Promise<void> => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }, [onRetry]);

  return (
    <View
      className="bg-warning/10 border border-warning/30 rounded-card px-4 py-3 flex-row items-center"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="api-unreachable-banner"
    >
      <Ionicons name="cloud-offline-outline" size={20} color={colors.warning} />
      <View className="flex-1 ms-3">
        <Text className="text-body-sm font-semibold text-text-primary">
          Can't reach the server
        </Text>
        <Text className="text-caption text-text-secondary mt-0.5">
          Check your connection or try again shortly.
        </Text>
      </View>
      <Pressable
        onPress={handleRetry}
        disabled={retrying}
        className="ms-2 bg-warning/20 rounded-button px-3 py-2 min-h-[36px] min-w-[36px] items-center justify-center"
        testID="api-retry-button"
        accessibilityLabel="Retry connection"
        accessibilityRole="button"
      >
        {retrying ? (
          <ActivityIndicator size="small" color={colors.warning} />
        ) : (
          <Ionicons name="refresh" size={16} color={colors.warning} />
        )}
      </Pressable>
    </View>
  );
}
