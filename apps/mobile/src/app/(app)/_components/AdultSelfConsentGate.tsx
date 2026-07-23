import React from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useClerk, useUser } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile } from '../../../lib/profile';
import { signOutWithCleanup } from '../../../lib/sign-out';
import { platformAlert } from '../../../lib/platform-alert';
import { GateContent } from '../../../components/common';
import { useThemeColors } from '../../../lib/theme';
import { useAdultSelfConsent } from '../../../hooks/use-adult-self-consent';

/**
 * [WI-2547] Blocking gate for an ADULT ACCOUNT OWNER who must record their own
 * processing + AI-disclosure consent before continuing.
 *
 * This is the adult's OWN lawful basis — not a minor/guardian consent surface.
 * It deliberately does not reuse ConsentPendingGate / ConsentWithdrawnGate
 * (both are about a CHILD's consent state and a deletion grace period) and has
 * nothing to do with mentor-memory consent, which is a separate opt-in.
 *
 * Mounting this on the bootstrap's `needsAdultConsent` signal is WI-2411's
 * responsibility; this module only exports the gate.
 */
export function AdultSelfConsentGate(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useClerk();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { profiles } = useProfile();
  const acceptConsent = useAdultSelfConsent();

  // Double-submit suppression, belt and braces: `disabled={isSubmitting}` on
  // the Pressable, plus this ref checked inside the handler. The ref covers the
  // case the disabled prop cannot — two native press events delivered before
  // React commits the isPending re-render — without depending on when that
  // commit lands.
  const submittingRef = React.useRef(false);

  const handleAccept = React.useCallback(() => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    acceptConsent.mutate(undefined, {
      onSettled: () => {
        submittingRef.current = false;
      },
    });
  }, [acceptConsent]);

  const handleSignOut = async () => {
    try {
      await signOutWithCleanup({
        clerkSignOut: signOut,
        queryClient,
        profileIds: profiles.map((p) => p.id),
        clerkUserId: user?.id,
      });
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      platformAlert(
        t('tabs.createProfile.signOutFailedTitle'),
        t('tabs.createProfile.signOutFailedMessage'),
      );
    }
  };

  const isSubmitting = acceptConsent.isPending;
  const hasError = acceptConsent.isError;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="adult-self-consent-gate"
    >
      <ScrollView
        contentContainerClassName="flex-grow items-center justify-center px-6 py-8"
        keyboardShouldPersistTaps="handled"
      >
        <GateContent>
          <Text
            className="text-h1 font-bold text-text-primary mb-4 text-center"
            accessibilityRole="header"
          >
            {t('tabs.adultSelfConsent.title')}
          </Text>
          <Text className="text-body text-text-secondary mb-6 text-center">
            {t('tabs.adultSelfConsent.intro')}
          </Text>

          <View className="w-full mb-4">
            <Text className="text-body font-semibold text-text-primary mb-1">
              {t('tabs.adultSelfConsent.platformUseHeading')}
            </Text>
            <Text className="text-body-sm text-text-secondary">
              {t('tabs.adultSelfConsent.platformUseBody')}
            </Text>
          </View>

          <View className="w-full mb-6">
            <Text className="text-body font-semibold text-text-primary mb-1">
              {t('tabs.adultSelfConsent.llmDisclosureHeading')}
            </Text>
            <Text className="text-body-sm text-text-secondary">
              {t('tabs.adultSelfConsent.llmDisclosureBody')}
            </Text>
          </View>

          {/* Terms + privacy are reachable as two independently focusable
              links rather than inline <Trans> spans, so each carries its own
              accessibility role and label. */}
          <View className="w-full mb-6" testID="adult-self-consent-legal">
            <Text className="text-caption text-text-secondary mb-2 text-center">
              {t('tabs.adultSelfConsent.legalIntro')}
            </Text>
            <Text
              className="text-caption text-primary text-center mb-1"
              onPress={() => router.push('/terms')}
              accessibilityRole="link"
              accessibilityLabel={t('tabs.adultSelfConsent.termsLink')}
              testID="adult-self-consent-terms-link"
            >
              {t('tabs.adultSelfConsent.termsLink')}
            </Text>
            <Text
              className="text-caption text-primary text-center"
              onPress={() => router.push('/privacy')}
              accessibilityRole="link"
              accessibilityLabel={t('tabs.adultSelfConsent.privacyLink')}
              testID="adult-self-consent-privacy-link"
            >
              {t('tabs.adultSelfConsent.privacyLink')}
            </Text>
          </View>

          {hasError && (
            <View
              className="w-full mb-4"
              testID="adult-self-consent-error"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text className="text-body font-semibold text-error mb-1 text-center">
                {t('tabs.adultSelfConsent.errorTitle')}
              </Text>
              <Text className="text-body-sm text-text-secondary text-center">
                {t('tabs.adultSelfConsent.errorBody')}
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleAccept}
            disabled={isSubmitting}
            className="bg-primary rounded-button py-3.5 px-8 items-center mb-3 w-full"
            testID="adult-self-consent-accept"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            accessibilityLabel={
              hasError
                ? t('tabs.adultSelfConsent.retry')
                : t('tabs.adultSelfConsent.accept')
            }
          >
            {isSubmitting ? (
              <ActivityIndicator
                size="small"
                color={colors.textInverse}
                accessibilityLabel={t('tabs.adultSelfConsent.submitting')}
              />
            ) : (
              <Text className="text-body font-semibold text-text-inverse">
                {hasError
                  ? t('tabs.adultSelfConsent.retry')
                  : t('tabs.adultSelfConsent.accept')}
              </Text>
            )}
          </Pressable>

          {/* Cancel path: the only way out while the gate is up. There is no
              route into normal app use from here. */}
          <Pressable
            onPress={() => void handleSignOut()}
            className="py-3.5 px-8 items-center w-full"
            testID="adult-self-consent-sign-out"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.adultSelfConsent.signOut')}
          >
            <Text className="text-body font-semibold text-primary">
              {t('tabs.adultSelfConsent.signOut')}
            </Text>
          </Pressable>
        </GateContent>
      </ScrollView>
    </View>
  );
}
