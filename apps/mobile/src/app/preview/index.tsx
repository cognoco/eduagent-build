import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MentomateLogo } from '../../components/MentomateLogo';

export default function PreviewLandingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="preview-landing"
    >
      <Pressable
        onPress={() => router.replace('/(auth)/sign-in')}
        className="self-start min-h-[44px] justify-center mb-4"
        testID="preview-landing-back"
        accessibilityRole="button"
        accessibilityLabel={t('common.goBackAction')}
      >
        <Text className="text-body-sm font-semibold text-primary">
          {t('preview.backToSignIn')}
        </Text>
      </Pressable>
      <MentomateLogo size="lg" />
      <Text className="text-h1 font-bold text-text-primary mt-8 mb-3 text-center">
        {t('preview.tryMentomate')}
      </Text>
      <Text className="text-body text-text-secondary mb-10 text-center">
        {t('preview.seeHowItWorks')}
      </Text>
      <Pressable
        onPress={() => router.push('/preview/intent')}
        className="bg-primary rounded-button py-3.5 px-10 items-center w-full"
        testID="preview-landing-continue"
        accessibilityRole="button"
        accessibilityLabel={t('common.continue')}
      >
        <Text className="text-body font-semibold text-text-inverse">
          {t('common.continue')}
        </Text>
      </Pressable>
    </View>
  );
}
