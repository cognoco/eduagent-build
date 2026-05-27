import React from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WelcomeIntro } from '../../components/welcome/WelcomeIntro';
import { GateContent, LightBulbAnimation } from '../../components/common';
import { markPreAuthIntroSeenSync } from '../../lib/intro-state';
import { track } from '../../lib/analytics';

// Pre-auth welcome route. Owns the cards → LightBulb-bridge mini state
// machine that sits in front of /(auth)/sign-up and /(auth)/sign-in. Both
// bridge CTAs mark the device-scoped intro flag seen and replace into the
// chosen auth route. Hardware-back from the bridge returns to the final
// card; back from the cards is absorbed by <WelcomeIntro> (card-by-card).
//
// Spec: docs/plans/2026-05-27-pre-auth-welcome-flow.md
type Step = 'cards' | 'bridge';

export default function PreAuthWelcomeRoute(): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = React.useState<Step>('cards');

  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('intro_started', {});
  }, []);

  const handleCardsComplete = React.useCallback(() => {
    track('intro_completed', {});
    setStep('bridge');
  }, []);

  const handleCardAdvanced = React.useCallback((cardIndex: number) => {
    track('intro_card_advanced', { card: cardIndex });
  }, []);

  const handleCreateAccount = React.useCallback(() => {
    markPreAuthIntroSeenSync();
    track('intro_bridge_signup', {});
    router.replace('/(auth)/sign-up');
  }, [router]);

  const handleExistingAccount = React.useCallback(() => {
    markPreAuthIntroSeenSync();
    track('intro_bridge_signin', {});
    router.replace('/(auth)/sign-in');
  }, [router]);

  // Hardware-back on the bridge returns to the cards. Without this, Android
  // back would either close the app or pop the (auth) stack back to /sign-in,
  // breaking the "back from bridge returns to card 4" UX guarantee.
  React.useEffect(() => {
    if (step !== 'bridge') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('cards');
      return true;
    });
    return () => sub.remove();
  }, [step]);

  if (step === 'cards') {
    return (
      <WelcomeIntro
        onComplete={handleCardsComplete}
        onCardAdvanced={handleCardAdvanced}
      />
    );
  }

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="pre-auth-bridge"
    >
      <GateContent>
        <View className="items-center mb-8">
          <LightBulbAnimation size={120} testID="pre-auth-bridge-bulb" />
        </View>
        <Text
          className="text-h1 font-bold text-text-primary mb-3 text-center leading-tight"
          testID="pre-auth-bridge-headline"
        >
          {t('welcomeIntro.bridge.headline')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-10">
          {t('welcomeIntro.bridge.supporting')}
        </Text>
        <Pressable
          onPress={handleCreateAccount}
          className="bg-primary rounded-button py-3.5 px-8 items-center w-full"
          style={{ minHeight: 48 }}
          testID="pre-auth-bridge-primary"
          accessibilityRole="button"
          accessibilityLabel={t('welcomeIntro.a11y.bridgePrimary')}
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('welcomeIntro.bridge.primaryCta')}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleExistingAccount}
          className="mt-6 py-2 items-center"
          testID="pre-auth-bridge-secondary"
          accessibilityRole="button"
          accessibilityLabel={t('welcomeIntro.a11y.bridgeSecondary')}
        >
          <Text className="text-caption text-text-muted text-center underline">
            {t('welcomeIntro.bridge.secondaryCta')}
          </Text>
        </Pressable>
      </GateContent>
    </View>
  );
}
