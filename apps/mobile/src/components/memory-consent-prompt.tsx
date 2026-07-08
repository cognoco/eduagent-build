import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from './common/Button';

interface MemoryConsentPromptProps {
  childName?: string;
  title?: string;
  description?: string;
  isPending?: boolean;
  onGrant: () => void;
  onDecline: () => void;
}

export function MemoryConsentPrompt({
  childName,
  title,
  description,
  isPending,
  onGrant,
  onDecline,
}: MemoryConsentPromptProps) {
  const { t } = useTranslation();
  return (
    <View className="bg-surface rounded-card p-4 border border-border">
      <Text className="text-body font-semibold text-text-primary mb-1">
        {title ??
          (childName
            ? t('memoryConsent.defaultTitle', { name: childName })
            : t('memoryConsent.defaultTitleNoName'))}
      </Text>
      <Text className="text-body-sm text-text-secondary mb-4">
        {description ?? t('memoryConsent.defaultDescription')}
      </Text>
      <View className="flex-row gap-2">
        <Button
          onPress={onGrant}
          disabled={isPending}
          label={isPending ? t('common.saving') : t('memoryConsent.grant')}
          className="flex-1"
          accessibilityLabel={t('memoryConsent.a11yEnable')}
          testID="memory-consent-grant"
        />
        <Button
          variant="secondary"
          onPress={onDecline}
          disabled={isPending}
          label={t('common.notNow')}
          className="flex-1 border border-border bg-background"
          accessibilityLabel={t('memoryConsent.a11ySkip')}
          testID="memory-consent-decline"
        />
      </View>
    </View>
  );
}
