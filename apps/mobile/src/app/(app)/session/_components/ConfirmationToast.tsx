import { View, Text } from 'react-native';

export function ConfirmationToast({
  message,
  insetsBottom,
}: {
  message: string | null;
  insetsBottom: number;
}) {
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
