import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import type { Profile } from '@eduagent/schemas';
import { useProfile } from '../../../../lib/profile';
import { formatApiError } from '../../../../lib/format-api-error';
import {
  clearPreviewState,
  type PreviewOnboardingStateV0,
  type SaveTarget,
} from '../../../../lib/preview-onboarding-state';
import { track } from '../../../../lib/analytics';
import { useThemeColors } from '../../../../lib/theme';

/**
 * Step 3 of the save wizard: confirmation screen + landing handoff.
 *
 * Dual landing keyed off the wizard's `target` flag (Task 0 resolution):
 * - self / both+self_first → navigate to /(app)/session with rawInput so the
 *   session screen handles subject creation and streams the opening message.
 * - child / both+child_first → navigate to /(app)/home where the "Add child"
 *   CTA closes the loop and the saved topic surfaces as a card.
 *
 * Always calls onComplete() after successful landing so the layout's wizard
 * branch exits cleanly ([HIGH-A2]).
 */
export function ConfirmStep({
  target,
  previewState,
  created,
  router,
  onComplete,
}: {
  target: SaveTarget;
  previewState: PreviewOnboardingStateV0;
  created: { parent: Profile; child?: Profile };
  router: ReturnType<typeof useRouter>;
  onComplete: () => void; // [HIGH-A2] layout-level wizard-done signal
}): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { switchProfile } = useProfile();
  const [landing, setLanding] = React.useState(false);
  const [landingError, setLandingError] = React.useState<string | null>(null);

  const isSelfBranch =
    target === 'self' ||
    (target === 'both' && previewState.bothPriority === 'self_first');

  const cta = isSelfBranch ? 'Start lesson' : 'Open parent home';

  const onLand = React.useCallback(async () => {
    if (landing) return;
    setLanding(true);
    try {
      const sw = await switchProfile(created.parent.id);
      if (!sw.success) {
        setLandingError(sw.error ?? 'Could not switch profile.');
        return;
      }

      await clearPreviewState();
      track('save_wizard_completed', {
        target,
        intent: previewState.intent,
        childCreated: Boolean(created.child),
        landing: isSelfBranch ? 'session' : 'home',
      });
      onComplete(); // [HIGH-A2] signal wizard done before navigating

      if (isSelfBranch) {
        // Land in a session for the saved topic. Pass rawInput so the session
        // screen handles subject creation and opens the chat directly.
        router.replace({
          pathname: '/(app)/session',
          params: {
            mode: 'freeform',
            ...(previewState.topicText
              ? { rawInput: previewState.topicText }
              : {}),
          },
        } as import('expo-router').Href);
      } else {
        // Parent branch: "Add child" CTA on home closes the loop.
        router.replace('/(app)/home' as import('expo-router').Href);
      }
    } catch (err) {
      setLandingError(formatApiError(err));
    } finally {
      setLanding(false);
    }
  }, [
    landing,
    switchProfile,
    created.parent.id,
    created.child,
    target,
    previewState.intent,
    isSelfBranch,
    previewState.topicText,
    onComplete,
    router,
  ]);

  return (
    <View>
      <Text className="text-h3 font-semibold text-text-primary mb-2">
        {isSelfBranch
          ? `Your first lesson is ready${previewState.topicText ? `: ${previewState.topicText}` : ''}.`
          : t('saveWizard.confirmChildReady')}
      </Text>
      {landingError && (
        <View className="bg-danger/10 rounded-card px-4 py-3 mb-3">
          <Text className="text-danger text-body-sm">{landingError}</Text>
        </View>
      )}
      <Pressable
        onPress={() => void onLand()}
        disabled={landing}
        className={`rounded-button py-3.5 items-center ${landing ? 'bg-primary/40' : 'bg-primary'}`}
        testID="save-confirm-land"
        accessibilityRole="button"
      >
        {landing ? (
          <ActivityIndicator
            color={colors.textInverse}
            accessibilityLabel={t('common.loading')}
          />
        ) : (
          <Text className="text-body font-semibold text-text-inverse">
            {cta}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
