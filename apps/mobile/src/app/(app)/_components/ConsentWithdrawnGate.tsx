import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useClerk, useUser } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeAgeBracket } from '@eduagent/schemas';
import { useProfile } from '../../../lib/profile';
import { signOutWithCleanup } from '../../../lib/sign-out';
import { platformAlert } from '../../../lib/platform-alert';
import { GateContent } from '../../../components/common';
import { getConsentWithdrawnCopy } from '../../../lib/consent-copy';
import {
  canSwitchFromConsentGate,
  buildSwitchProfileConfirmation,
} from '../_lib/consent-gate-helpers';
import { useThemeColors } from '../../../lib/theme';

/**
 * Gate shown when a parent has withdrawn consent.
 * Child's access is fully blocked during the 7-day deletion grace period.
 * Different messaging from ConsentPendingGate — this is about account deletion.
 */
export function ConsentWithdrawnGate(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { profiles, activeProfile, switchProfile } = useProfile();
  const [refreshing, setRefreshing] = React.useState(false);

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

  // BUG-114: Allow child to re-check consent status (e.g. parent cancelled deletion)
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['consent-status'] });
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } finally {
      setRefreshing(false);
    }
  };
  const ageBracket = activeProfile?.birthYear
    ? computeAgeBracket(activeProfile.birthYear)
    : 'adult';
  const copy = getConsentWithdrawnCopy(ageBracket);

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="consent-withdrawn-gate"
    >
      <GateContent>
        <Text
          className="text-h1 font-bold text-text-primary mb-4 text-center"
          accessibilityRole="header"
        >
          {copy.title}
        </Text>
        <Text className="text-body text-text-secondary mb-2 text-center">
          {copy.message}
        </Text>
        <Text className="text-body text-text-secondary mb-2 text-center">
          {copy.details}
        </Text>
        <Text className="text-body-sm text-text-muted mb-8 text-center">
          {copy.help}
        </Text>

        {/* BUG-114: Refresh button so child can re-check if consent was restored */}
        <Pressable
          onPress={() => void handleRefresh()}
          disabled={refreshing}
          className="bg-primary rounded-button py-3.5 px-8 items-center mb-3 w-full"
          testID="withdrawn-refresh-status"
          accessibilityRole="button"
          accessibilityLabel={t('tabs.consentWithdrawn.refreshStatus')}
        >
          {refreshing ? (
            <ActivityIndicator
              size="small"
              color={colors.textInverse}
              accessibilityLabel={t('common.loading')}
            />
          ) : (
            <Text className="text-body font-semibold text-text-inverse">
              {t('tabs.consentWithdrawn.refreshStatus')}
            </Text>
          )}
        </Pressable>

        {canSwitchFromConsentGate(activeProfile, profiles) && (
          <Pressable
            onPress={() => {
              // [BUG-776] Confirm destination by name before switching.
              const prompt = buildSwitchProfileConfirmation({
                activeProfile,
                profiles,
                t,
              });
              if (!prompt) return;
              platformAlert(prompt.title, prompt.message, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('tabs.switchProfile.switchButton'),
                  onPress: () => {
                    void switchProfile(prompt.target.id).catch(() => {
                      platformAlert(
                        t('tabs.switchProfile.errorTitle'),
                        t('tabs.switchProfile.errorMessage'),
                      );
                    });
                  },
                },
              ]);
            }}
            className="bg-surface rounded-button py-3.5 px-8 items-center mb-3 w-full"
            testID="withdrawn-switch-profile"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.consentGate.switchProfile')}
          >
            <Text className="text-body font-semibold text-text-secondary">
              {t('tabs.consentGate.switchProfile')}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => void handleSignOut()}
          className="py-3.5 px-8 items-center w-full"
          testID="withdrawn-sign-out"
          accessibilityRole="button"
          accessibilityLabel={t('tabs.consentGate.signOut')}
        >
          <Text className="text-body font-semibold text-primary">
            {t('tabs.consentGate.signOut')}
          </Text>
        </Pressable>
      </GateContent>
    </View>
  );
}
