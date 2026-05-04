import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { goBackOrReplace } from '../lib/navigation';
import { useThemeColors } from '../lib/theme';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6">
      <Text className="text-body font-bold text-text-primary mb-2">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-body-sm text-text-secondary leading-5 mb-2">
      {children}
    </Text>
  );
}

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const handleBack = () => {
    goBackOrReplace(router, '/(app)/more');
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable
          onPress={handleBack}
          accessibilityLabel={t('common.goBack')}
          accessibilityRole="button"
          className="mr-3 w-10 h-10 items-center justify-center rounded-full bg-surface"
          testID="back-button"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          {t('legal.privacy.title')}
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <Text className="text-caption text-text-secondary mb-4">
          {t('legal.privacy.lastUpdated')}
        </Text>

        <Section title={t('legal.privacy.s1Title')}>
          <Paragraph>{t('legal.privacy.s1Body')}</Paragraph>
        </Section>

        <Section title={t('legal.privacy.s2Title')}>
          <Paragraph>{t('legal.privacy.s2Body1')}</Paragraph>
          <Paragraph>{t('legal.privacy.s2Body2')}</Paragraph>
          <Paragraph>{t('legal.privacy.s2Body3')}</Paragraph>
          <Paragraph>{t('legal.privacy.s2Body4')}</Paragraph>
        </Section>

        <Section title={t('legal.privacy.s3Title')}>
          <Paragraph>{t('legal.privacy.s3Body')}</Paragraph>
        </Section>

        <Section title={t('legal.privacy.s4Title')}>
          <Paragraph>{t('legal.privacy.s4Body1')}</Paragraph>
          <Paragraph>{t('legal.privacy.s4Body2')}</Paragraph>
        </Section>

        <Section title={t('legal.privacy.s5Title')}>
          <Paragraph>{t('legal.privacy.s5Body')}</Paragraph>
        </Section>

        <Section title={t('legal.privacy.s6Title')}>
          <Paragraph>{t('legal.privacy.s6Body1')}</Paragraph>
          <Paragraph>{t('legal.privacy.s6Body2')}</Paragraph>
        </Section>

        <Section title={t('legal.privacy.s7Title')}>
          <Paragraph>{t('legal.privacy.s7Body')}</Paragraph>
        </Section>

        <Section title={t('legal.privacy.s8Title')}>
          <Paragraph>{t('legal.privacy.s8Body1')}</Paragraph>
          <Paragraph>{t('legal.privacy.s8Body2')}</Paragraph>
        </Section>

        <Section title={t('legal.privacy.s9Title')}>
          <Paragraph>{t('legal.privacy.s9Body')}</Paragraph>
        </Section>

        <Section title={t('legal.privacy.s10Title')}>
          <Paragraph>{t('legal.privacy.s10Body')}</Paragraph>
        </Section>
      </ScrollView>
    </View>
  );
}
