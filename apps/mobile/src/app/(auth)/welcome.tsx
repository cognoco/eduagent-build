import React from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  WelcomeIntro,
  type WelcomeIntroStageColors,
  type WelcomeAudience,
} from '../../components/welcome/WelcomeIntro';
import { GateContent, LightBulbAnimation } from '../../components/common';
import { markPreAuthIntroSeenSync } from '../../lib/intro-state';
import { markPreAuthAudienceSync } from '../../lib/pre-auth-audience';
import { track } from '../../lib/analytics';
import { tokens } from '../../lib/design-tokens';

// Pre-auth welcome route. Owns the chooser → cards → LightBulb-bridge mini
// state machine that sits in front of /(auth)/sign-up and /(auth)/sign-in.
//
// The chooser tailors the intro by audience (learner vs parent), but the
// branch is storytelling only: both decks converge on the same bridge and
// the same single auth + profile-setup flow underneath. Picking an audience
// here does NOT fork the account model.
//
// Back behaviour: bridge → final card (route-owned handler); first card →
// chooser (WelcomeIntro calls onBackFromFirstCard); deeper cards step back
// one at a time (WelcomeIntro-owned). Both bridge CTAs mark the device-scoped
// intro flag seen and replace into the chosen auth route.
//
// Spec: docs/plans/2026-05-27-pre-auth-welcome-flow.md
type Step = 'choose' | 'cards' | 'bridge';

// brand-intent: welcome dark stage. This route is the pre-auth brand moment,
// so it injects a fixed intro palette at the screen boundary while the shared
// WelcomeIntro component stays token-driven by default.
const darkStageColors = tokens.dark.colors;
export const WELCOME_DARK_STAGE_COLORS = {
  background: darkStageColors.background,
  surface: darkStageColors.surface,
  surfaceElevated: darkStageColors.surfaceElevated,
  textPrimary: darkStageColors.textPrimary,
  textSecondary: darkStageColors.textSecondary,
  textInverse: darkStageColors.textInverse,
  primary: darkStageColors.primary,
  primarySoft: darkStageColors.primarySoft,
  secondary: darkStageColors.secondary,
  accent: darkStageColors.accent,
  border: darkStageColors.border,
  muted: darkStageColors.muted,
  practiceDarkTeal: darkStageColors.practiceDarkTeal,
  shadow: darkStageColors.background,
} as const satisfies WelcomeIntroStageColors;

export default function PreAuthWelcomeRoute(): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = React.useState<Step>('choose');
  const [audience, setAudience] = React.useState<WelcomeAudience>('learner');

  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('intro_started', {});
  }, []);

  const handleChoose = React.useCallback((picked: WelcomeAudience) => {
    track('intro_audience_selected', { audience: picked });
    // Persist the choice so first-profile setup honours it after the signup
    // wall — parent skips the Study/Family picker and lands on add-a-child.
    markPreAuthAudienceSync(picked);
    setAudience(picked);
    setStep('cards');
  }, []);

  const handleCardsComplete = React.useCallback(() => {
    track('intro_completed', {});
    setStep('bridge');
  }, []);

  const handleCardAdvanced = React.useCallback((cardIndex: number) => {
    track('intro_card_advanced', { card: cardIndex });
  }, []);

  const handleBackToChooser = React.useCallback(() => {
    setStep('choose');
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
  // back would pop the (auth) stack back to /sign-in, breaking the "back from
  // bridge returns to the final card" guarantee. (Cards-step back is owned by
  // WelcomeIntro: deeper cards step back one at a time, card 1 → chooser via
  // onBackFromFirstCard.)
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
        audience={audience}
        onComplete={handleCardsComplete}
        onCardAdvanced={handleCardAdvanced}
        stageColors={WELCOME_DARK_STAGE_COLORS}
        onBackFromFirstCard={handleBackToChooser}
      />
    );
  }

  if (step === 'bridge') {
    return (
      <View
        className="flex-1 items-center justify-center px-6"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: WELCOME_DARK_STAGE_COLORS.background,
        }}
        testID="pre-auth-bridge"
      >
        <GateContent>
          <View className="items-center mb-8">
            <LightBulbAnimation size={120} testID="pre-auth-bridge-bulb" />
          </View>
          <Text
            className="text-h1 font-bold mb-3 text-center leading-tight"
            style={{ color: WELCOME_DARK_STAGE_COLORS.textPrimary }}
            testID="pre-auth-bridge-headline"
          >
            {t(
              audience === 'learner'
                ? 'welcomeIntro.bridge.headline'
                : 'welcomeIntro.bridge.parentHeadline',
            )}
          </Text>
          <Text
            className="text-body text-center mb-10"
            style={{ color: WELCOME_DARK_STAGE_COLORS.textSecondary }}
          >
            {t(
              audience === 'learner'
                ? 'welcomeIntro.bridge.supporting'
                : 'welcomeIntro.bridge.parentSupporting',
            )}
          </Text>
          <Pressable
            onPress={handleCreateAccount}
            className="rounded-button py-3.5 px-8 items-center w-full"
            style={{
              minHeight: 48,
              backgroundColor: WELCOME_DARK_STAGE_COLORS.primary,
            }}
            testID="pre-auth-bridge-primary"
            accessibilityRole="button"
            accessibilityLabel={t('welcomeIntro.a11y.bridgePrimary')}
          >
            <Text
              className="text-body font-semibold"
              style={{ color: WELCOME_DARK_STAGE_COLORS.textInverse }}
            >
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
            <Text
              className="text-caption text-center underline"
              style={{ color: WELCOME_DARK_STAGE_COLORS.muted }}
            >
              {t('welcomeIntro.bridge.secondaryCta')}
            </Text>
          </Pressable>
        </GateContent>
      </View>
    );
  }

  // step === 'choose' — audience picker. One tap routes into the tailored deck.
  return (
    <View
      className="flex-1 justify-center px-6"
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: WELCOME_DARK_STAGE_COLORS.background,
      }}
      testID="welcome-chooser"
    >
      <GateContent>
        <Text
          className="text-h1 font-bold mb-8 text-center leading-tight"
          style={{ color: WELCOME_DARK_STAGE_COLORS.textPrimary }}
        >
          {t('welcomeIntro.chooser.question')}
        </Text>

        <Pressable
          onPress={() => handleChoose('learner')}
          className="rounded-2xl p-5 mb-4 flex-row items-center"
          style={{ backgroundColor: WELCOME_DARK_STAGE_COLORS.surfaceElevated }}
          testID="welcome-chooser-learner"
          accessibilityRole="button"
          accessibilityLabel={t('welcomeIntro.chooser.learnerCta')}
        >
          <Ionicons
            name="school-outline"
            size={28}
            color={WELCOME_DARK_STAGE_COLORS.accent}
            style={{ marginRight: 14 }}
          />
          <View className="flex-1">
            <Text
              className="text-body font-semibold"
              style={{ color: WELCOME_DARK_STAGE_COLORS.textPrimary }}
            >
              {t('welcomeIntro.chooser.learnerCta')}
            </Text>
            <Text
              className="text-body-sm mt-0.5"
              style={{ color: WELCOME_DARK_STAGE_COLORS.textSecondary }}
            >
              {t('welcomeIntro.chooser.learnerHint')}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => handleChoose('parent')}
          className="rounded-2xl p-5 flex-row items-center"
          style={{ backgroundColor: WELCOME_DARK_STAGE_COLORS.surfaceElevated }}
          testID="welcome-chooser-parent"
          accessibilityRole="button"
          accessibilityLabel={t('welcomeIntro.chooser.parentCta')}
        >
          <Ionicons
            name="home-outline"
            size={28}
            color={WELCOME_DARK_STAGE_COLORS.accent}
            style={{ marginRight: 14 }}
          />
          <View className="flex-1">
            <Text
              className="text-body font-semibold"
              style={{ color: WELCOME_DARK_STAGE_COLORS.textPrimary }}
            >
              {t('welcomeIntro.chooser.parentCta')}
            </Text>
            <Text
              className="text-body-sm mt-0.5"
              style={{ color: WELCOME_DARK_STAGE_COLORS.textSecondary }}
            >
              {t('welcomeIntro.chooser.parentHint')}
            </Text>
          </View>
        </Pressable>
      </GateContent>
    </View>
  );
}
