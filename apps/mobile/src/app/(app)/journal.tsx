import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function JournalScreen(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View className="flex-1 bg-background p-5" testID="journal-screen">
      <View className="rounded-lg border border-border bg-surface p-4">
        <Text className="text-h2 font-bold text-text-primary">
          {t('journal.stub.title')}
        </Text>
        <Text className="mt-2 text-body text-text-secondary">
          {t('journal.stub.subtitle')}
        </Text>
      </View>
    </View>
  );
}
