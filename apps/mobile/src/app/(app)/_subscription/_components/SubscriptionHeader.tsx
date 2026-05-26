import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export function SubscriptionHeader(): React.ReactElement {
  const router = useRouter();
  return (
    <View className="px-5 pt-4 pb-2 flex-row items-center">
      <Pressable
        onPress={() => router.replace('/(app)/more')}
        className="me-3 min-w-[44px] min-h-[44px] justify-center items-center"
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Text className="text-primary text-body font-semibold">Back</Text>
      </Pressable>
      <Text className="text-h2 font-bold text-text-primary">Subscription</Text>
    </View>
  );
}
