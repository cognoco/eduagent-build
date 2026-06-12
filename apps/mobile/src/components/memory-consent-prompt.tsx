import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';

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
        <Pressable
          onPress={onGrant}
          disabled={isPending}
          className="flex-1 bg-primary rounded-button px-4 py-3 items-center"
          accessibilityRole="button"
          accessibilityLabel={t('memoryConsent.a11yEnable')}
          testID="memory-consent-grant"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {isPending ? t('common.saving') : t('memoryConsent.grant')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDecline}
          disabled={isPending}
          className="flex-1 bg-background rounded-button px-4 py-3 items-center border border-border"
          accessibilityRole="button"
          accessibilityLabel={t('memoryConsent.a11yDecline')}
          testID="memory-consent-decline"
        >
          <Text className="text-body font-semibold text-text-primary">
            {t('common.notNow')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
