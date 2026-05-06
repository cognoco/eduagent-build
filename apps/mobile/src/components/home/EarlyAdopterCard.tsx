import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
      className="bg-primary-soft rounded-card mx-5 mt-3 flex-row items-center"
      testID="early-adopter-card"
      accessibilityRole="alert"
    >
      <Pressable
        onPress={openFeedback}
        className="flex-1 flex-row items-center px-3 py-2 min-h-[44px]"
        accessibilityRole="button"
        accessibilityLabel="Send feedback — your input shapes MentoMate"
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
        <Text className="text-body-sm font-semibold text-text-primary ms-2 flex-1">
          Early user — your feedback shapes MentoMate
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </Pressable>
      <Pressable
        onPress={handleDismiss}
        className="min-h-[44px] min-w-[44px] items-center justify-center pe-2"
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={4}
        testID="early-adopter-dismiss"
      >
        {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
        <View
          testID="early-adopter-dismiss-icon"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </View>
      </Pressable>
    </View>
  );
}
