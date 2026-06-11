import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export function SubscriptionHeader(): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <View className="px-5 pt-4 pb-2 flex-row items-center">
      <Pressable
        onPress={() => router.replace('/(app)/more')}
        className="me-3 min-w-[44px] min-h-[44px] justify-center items-center"
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Text className="text-primary text-body font-semibold">
          {t('common.back')}
        </Text>
      </Pressable>
      <Text className="text-h2 font-bold text-text-primary">
        {t('subscription.headerTitle')}
      </Text>
    </View>
  );
}
