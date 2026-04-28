import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import type { KnowledgeInventory } from '@eduagent/schemas';
import * as SecureStore from '../../lib/secure-storage';
import { useProfile } from '../../lib/profile';
import { useThemeColors } from '../../lib/theme';
import { useFeedbackContext } from '../feedback/FeedbackProvider';

const MAX_SESSIONS = 5;

const DISMISSED_KEY = (profileId: string) =>
  `earlyAdopterDismissed_${profileId}`;

export function EarlyAdopterCard(): React.ReactElement | null {
  const { activeProfile } = useProfile();
  const { openFeedback } = useFeedbackContext();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  const profileId = activeProfile?.id;

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    (async () => {
      try {
        const value = await SecureStore.getItemAsync(DISMISSED_KEY(profileId));
        if (!cancelled) setDismissed(value === 'true');
      } catch {
        if (!cancelled) setDismissed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    if (profileId) {
      void SecureStore.setItemAsync(DISMISSED_KEY(profileId), 'true').catch(
        () => {
          /* non-fatal */
        }
      );
    }
  }, [profileId]);

  const cachedInventory = queryClient.getQueryData<KnowledgeInventory>([
    'progress',
    'inventory',
    profileId,
  ]);
  const totalSessions = cachedInventory?.global.totalSessions ?? 0;

  if (dismissed === null || dismissed || totalSessions >= MAX_SESSIONS) {
    return null;
  }

  return (
    <View
      className="bg-primary-soft rounded-card px-5 py-4 mb-4"
      testID="early-adopter-card"
      accessibilityRole="alert"
    >
      <View className="flex-row items-start">
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary mb-1">
            You&apos;re one of our first users!
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            Your feedback shapes MentoMate. If something feels off, let us know.
          </Text>
          <Pressable
            onPress={openFeedback}
            className="flex-row items-center self-start"
            accessibilityRole="button"
            accessibilityLabel="Send feedback"
            testID="early-adopter-feedback-cta"
          >
            {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
            <View
              testID="early-adopter-feedback-icon"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons
                name="chatbubble-outline"
                size={16}
                color={colors.primary}
              />
            </View>
            <Text className="text-body-sm font-semibold text-primary ml-1.5">
              Send feedback
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={handleDismiss}
          className="min-h-[32px] min-w-[32px] items-center justify-center -mt-1 -mr-1"
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={8}
          testID="early-adopter-dismiss"
        >
          {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
          <View
            testID="early-adopter-dismiss-icon"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </View>
        </Pressable>
      </View>
      {Platform.OS !== 'web' && (
        <Text className="text-caption text-text-muted mt-2">
          On your phone, shake it anytime to report a problem.
        </Text>
      )}
    </View>
  );
}
