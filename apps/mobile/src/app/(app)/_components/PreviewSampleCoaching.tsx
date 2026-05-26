import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function PreviewSampleCoaching({
  onDismiss,
}: {
  onDismiss: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="preview-sample-coaching"
    >
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={onDismiss}
          className="me-3 min-w-[44px] min-h-[44px] justify-center items-center"
          accessibilityLabel={t('tabs.previewSampleCoaching.backLabel')}
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-semibold">
            {t('common.back')}
          </Text>
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          {t('tabs.previewSampleCoaching.title')}
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View className="bg-coaching-card rounded-card p-5 mt-4">
          <Text className="text-h3 font-semibold text-text-primary mb-2">
            {t('tabs.previewSampleCoaching.homeworkCardTitle')}
          </Text>
          <Text className="text-body text-text-secondary mb-4">
            {t('tabs.previewSampleCoaching.homeworkCardBody')}
          </Text>
          <View className="bg-surface rounded-button py-3 px-4 mb-2 items-center">
            <Text className="text-body font-semibold text-primary">
              {t('tabs.previewSampleCoaching.homeworkHelp')}
            </Text>
          </View>
          <View className="bg-surface rounded-button py-3 px-4 mb-2 items-center">
            <Text className="text-body font-semibold text-primary">
              {t('tabs.previewSampleCoaching.practiceTest')}
            </Text>
          </View>
        </View>

        <View className="bg-surface rounded-card p-4 mt-4">
          <Text className="text-body font-semibold text-text-primary mb-2">
            {t('tabs.previewSampleCoaching.howMentorHelps')}
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            {t('tabs.previewSampleCoaching.howMentorHelpsBody')}
          </Text>
          <View className="flex-row items-start mb-2">
            <Text className="text-body me-2">{'\u{1F4F7}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              {t('tabs.previewSampleCoaching.snapPhoto')}
            </Text>
          </View>
          <View className="flex-row items-start mb-2">
            <Text className="text-body me-2">{'\u{1F9E0}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              {t('tabs.previewSampleCoaching.mentorRemembers')}
            </Text>
          </View>
          <View className="flex-row items-start">
            <Text className="text-body me-2">{'\u{1F4C8}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              {t('tabs.previewSampleCoaching.trackProgress')}
            </Text>
          </View>
        </View>

        <Text className="text-caption text-text-muted text-center mt-6">
          {t('tabs.previewSampleCoaching.previewDisclaimer')}
        </Text>
      </ScrollView>
    </View>
  );
}
