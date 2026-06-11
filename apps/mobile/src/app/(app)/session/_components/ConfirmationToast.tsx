import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useAnnounce } from '../../../../hooks/use-announce';

export function ConfirmationToast({
  message,
  insetsBottom,
}: {
  message: string | null;
  insetsBottom: number;
}) {
  const announce = useAnnounce();

  // Event-driven announcement only — no accessibilityLiveRegion on the View.
  // The toast is transient and mount-driven, so a single imperative announce
  // is the documented pattern (use-announce.ts); a live region on top would
  // risk double-announcing the same message on Android.
  useEffect(() => {
    if (message) announce(message);
  }, [message, announce]);

  if (!message) return null;
  return (
    <View
      className="absolute left-4 right-4 z-50 items-center"
      style={{
        pointerEvents: 'none',
        bottom: Math.max(insetsBottom, 16) + 88,
      }}
      testID="session-confirmation-toast"
    >
      <View className="rounded-full bg-text-primary px-4 py-3">
        <Text className="text-body-sm font-semibold text-text-inverse">
          {message}
        </Text>
      </View>
    </View>
  );
}
