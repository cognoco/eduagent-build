import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCallback, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { CelebrationLevel } from '@eduagent/schemas';

import { useProfile } from '../../../lib/profile';
import {
  useCelebrationLevel,
  useChildCelebrationLevel,
  useUpdateCelebrationLevel,
  useUpdateChildCelebrationLevel,
} from '../../../hooks/use-settings';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';
import { LearningModeOption } from '../../../components/more/settings-rows';

export default function CelebrationsScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { activeProfile, profiles } = useProfile();
  const { childProfileId } = useLocalSearchParams<{
    childProfileId?: string;
  }>();
  const isChildMode = !!childProfileId;
  const childProfile = isChildMode
    ? profiles.find((p) => p.id === childProfileId)
    : undefined;
  const canEditChildPreferences =
    isChildMode &&
    activeProfile?.isOwner === true &&
    childProfile?.isOwner === false;

  const selfCelebration = useCelebrationLevel();
  const childCelebration = useChildCelebrationLevel(
    canEditChildPreferences ? childProfileId : undefined,
  );
  const celebrationQuery = canEditChildPreferences
    ? childCelebration
    : selfCelebration;
  const celebrationLevel =
    celebrationQuery.data ?? (canEditChildPreferences ? 'big_only' : 'all');
  const updateSelfCelebration = useUpdateCelebrationLevel();
  const updateChildCelebration = useUpdateChildCelebrationLevel();
  const celebrationPending = canEditChildPreferences
    ? updateChildCelebration.isPending
    : updateSelfCelebration.isPending;

  useEffect(() => {
    if (!activeProfile) return;
    if (isChildMode && !canEditChildPreferences) {
      router.replace('/(app)/more' as Href);
    }
  }, [activeProfile, canEditChildPreferences, isChildMode, router]);

  const fallbackHref =
    canEditChildPreferences && childProfileId
      ? (`/(app)/more/accommodation?childProfileId=${childProfileId}` as Href)
      : ('/(app)/more/accommodation' as Href);

  const handleBack = useCallback(() => {
    goBackOrReplace(router, fallbackHref);
  }, [fallbackHref, router]);

  const handleSelectCelebrationLevel = (next: CelebrationLevel): void => {
    if (celebrationLevel === next) return;
    if (canEditChildPreferences && childProfileId) {
      updateChildCelebration.mutate(
        { childProfileId, celebrationLevel: next },
        {
          onError: () => {
            platformAlert(
              t('more.errors.couldNotSaveSetting'),
              t('more.errors.tryAgain'),
            );
          },
        },
      );
      return;
    }

    updateSelfCelebration.mutate(next, {
      onError: () => {
        platformAlert(
          t('more.errors.couldNotSaveSetting'),
          t('more.errors.tryAgain'),
        );
      },
    });
  };

  const title = canEditChildPreferences
    ? t('more.celebrations.childScreenTitle', {
        name: childProfile?.displayName,
      })
    : t('more.celebrations.screenTitle');

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={handleBack}
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="celebrations-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text
          className="text-h2 font-bold text-text-primary flex-1"
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        testID="celebrations-scroll"
      >
        <Text className="text-body-sm text-text-secondary mb-4">
          {t('more.celebrations.screenDescription')}
        </Text>
        <LearningModeOption
          title={t('more.celebrations.allTitle')}
          description={t('more.celebrations.allDescription')}
          selected={celebrationLevel === 'all'}
          disabled={celebrationQuery.isLoading || celebrationPending}
          onPress={() => handleSelectCelebrationLevel('all')}
          testID="celebration-level-all"
        />
        <LearningModeOption
          title={t('more.celebrations.bigOnlyTitle')}
          description={t('more.celebrations.bigOnlyDescription')}
          selected={celebrationLevel === 'big_only'}
          disabled={celebrationQuery.isLoading || celebrationPending}
          onPress={() => handleSelectCelebrationLevel('big_only')}
          testID="celebration-level-big-only"
        />
        <LearningModeOption
          title={t('more.celebrations.offTitle')}
          description={t('more.celebrations.offDescription')}
          selected={celebrationLevel === 'off'}
          disabled={celebrationQuery.isLoading || celebrationPending}
          onPress={() => handleSelectCelebrationLevel('off')}
          testID="celebration-level-off"
        />
      </ScrollView>
    </View>
  );
}
