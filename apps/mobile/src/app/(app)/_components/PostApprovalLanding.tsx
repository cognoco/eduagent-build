import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function PostApprovalLanding({
  onContinue,
}: {
  onContinue: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="post-approval-landing"
    >
      <Text
        className="text-4xl mb-6"
        accessibilityLabel={t('tabs.postApproval.celebrationLabel')}
      >
        {'\u{1F389}'}
      </Text>
      <Text
        className="text-h1 font-bold text-text-primary mb-4 text-center"
        accessibilityRole="header"
      >
        {t('tabs.postApproval.title')}
      </Text>
      <Text className="text-body text-text-secondary mb-2 text-center">
        {t('tabs.postApproval.parentApproved')}
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        {t('tabs.postApproval.setupSubject')}
      </Text>

      <Pressable
        onPress={onContinue}
        className="bg-primary rounded-button py-3.5 px-8 items-center w-full"
        testID="post-approval-continue"
        accessibilityRole="button"
        accessibilityLabel={t('tabs.postApproval.letsGo')}
      >
        <Text className="text-body font-semibold text-text-inverse">
          {t('tabs.postApproval.letsGo')}
        </Text>
      </Pressable>
    </View>
  );
}
