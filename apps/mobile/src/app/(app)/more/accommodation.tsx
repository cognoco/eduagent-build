import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AccommodationMode, CelebrationLevel } from '@eduagent/schemas';

import { useProfile } from '../../../lib/profile';
import {
  useChildLearnerProfile,
  useLearnerProfile,
  useUpdateAccommodationMode,
} from '../../../hooks/use-learner-profile';
import {
  useCelebrationLevel,
  useChildCelebrationLevel,
  useUpdateCelebrationLevel,
  useUpdateChildCelebrationLevel,
} from '../../../hooks/use-settings';
import {
  ACCOMMODATION_GUIDE,
  ACCOMMODATION_OPTIONS,
} from '../../../lib/accommodation-options';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';
import { LearningModeOption } from '../../../components/more/settings-rows';

export default function AccommodationScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { activeProfile, profiles } = useProfile();
  const [showGuide, setShowGuide] = useState(false);

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
  const childName = childProfile?.displayName;

  const selfLearner = useLearnerProfile();
  const childLearner = useChildLearnerProfile(
    canEditChildPreferences ? childProfileId : undefined,
  );
  const learnerQuery = canEditChildPreferences ? childLearner : selfLearner;
  const {
    data: learnerProfile,
    isError: learnerProfileError,
    refetch: refetchLearnerProfile,
  } = learnerQuery;

  const updateAccommodation = useUpdateAccommodationMode();

  const selfCelebration = useCelebrationLevel();
  const childCelebration = useChildCelebrationLevel(
    canEditChildPreferences ? childProfileId : undefined,
  );
  const celebrationQuery = canEditChildPreferences
    ? childCelebration
    : selfCelebration;
  const { data: celebrationLevel = 'big_only', isLoading: celebrationLoading } =
    celebrationQuery;

  const updateSelfCelebration = useUpdateCelebrationLevel();
  const updateChildCelebration = useUpdateChildCelebrationLevel();

  const currentMode = learnerProfile?.accommodationMode ?? 'none';

  useEffect(() => {
    if (isChildMode && !canEditChildPreferences) {
      router.replace('/(app)/more' as never);
    }
  }, [canEditChildPreferences, isChildMode, router]);

  const handleBack = useCallback(() => {
    goBackOrReplace(router, '/(app)/more/learning-preferences' as const);
  }, [router]);

  const handleSelectAccommodation = useCallback(
    (mode: AccommodationMode) => {
      if (mode === currentMode) return;
      updateAccommodation.mutate(
        {
          accommodationMode: mode,
          ...(canEditChildPreferences ? { childProfileId } : {}),
        },
        {
          onError: () => {
            platformAlert(
              t('more.errors.couldNotSaveSetting'),
              t('more.errors.tryAgain'),
            );
          },
        },
      );
    },
    [
      currentMode,
      updateAccommodation,
      t,
      canEditChildPreferences,
      childProfileId,
    ],
  );

  const handleSelectCelebrationLevel = (next: CelebrationLevel): void => {
    if (celebrationLevel === next) return;
    if (canEditChildPreferences) {
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
    } else {
      updateSelfCelebration.mutate(next, {
        onError: () => {
          platformAlert(
            t('more.errors.couldNotSaveSetting'),
            t('more.errors.tryAgain'),
          );
        },
      });
    }
  };

  const celebrationPending = canEditChildPreferences
    ? updateChildCelebration.isPending
    : updateSelfCelebration.isPending;

  const title = canEditChildPreferences
    ? t('more.accommodation.childScreenTitle', { name: childName })
    : t('more.accommodation.sectionHeader');

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={handleBack}
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="accommodation-back"
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
        testID="accommodation-scroll"
      >
        {!learnerProfile ? (
          learnerProfileError ? (
            <View className="bg-surface rounded-card px-4 py-4 mb-2">
              <Text className="text-body-sm text-text-secondary">
                {t('session.mentorMemory.loadError')}
              </Text>
              <Pressable
                onPress={() => void refetchLearnerProfile()}
                className="self-start mt-3"
                accessibilityRole="button"
                testID="accommodation-mode-retry"
              >
                <Text className="text-caption font-semibold text-primary">
                  {t('common.retry')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="bg-surface rounded-card px-4 py-4 mb-2">
              <Text className="text-body-sm text-text-secondary">
                {t('common.loading')}
              </Text>
            </View>
          )
        ) : (
          <>
            {learnerProfileError ? (
              <Pressable
                onPress={() => void refetchLearnerProfile()}
                className="self-start mb-3"
                accessibilityRole="button"
                testID="accommodation-mode-retry-stale"
              >
                <Text className="text-caption font-semibold text-primary">
                  {t('common.retry')}
                </Text>
              </Pressable>
            ) : null}
            {ACCOMMODATION_OPTIONS.map((opt) => {
              const selected = currentMode === opt.mode;
              const showsCelebrationFollowup =
                selected &&
                (opt.mode === 'short-burst' || opt.mode === 'predictable');

              return (
                <View key={opt.mode}>
                  <LearningModeOption
                    title={opt.title}
                    description={opt.description}
                    selected={selected}
                    disabled={updateAccommodation.isPending}
                    onPress={() => handleSelectAccommodation(opt.mode)}
                    testID={`accommodation-mode-${opt.mode}`}
                  />
                  {showsCelebrationFollowup ? (
                    <View
                      className="ml-4 mb-2 border-l-2 border-primary/30 pl-3"
                      testID={`celebration-followup-${opt.mode}`}
                    >
                      <Text className="text-caption font-semibold text-text-primary mb-2">
                        {t('more.celebrations.inlinePrompt')}
                      </Text>
                      <LearningModeOption
                        title={t('more.celebrations.allTitle')}
                        description={t('more.celebrations.allDescription')}
                        selected={celebrationLevel === 'all'}
                        disabled={celebrationLoading || celebrationPending}
                        onPress={() => handleSelectCelebrationLevel('all')}
                        testID="celebration-level-all"
                      />
                      <LearningModeOption
                        title={t('more.celebrations.bigOnlyTitle')}
                        description={t('more.celebrations.bigOnlyDescription')}
                        selected={celebrationLevel === 'big_only'}
                        disabled={celebrationLoading || celebrationPending}
                        onPress={() => handleSelectCelebrationLevel('big_only')}
                        testID="celebration-level-big-only"
                      />
                      <LearningModeOption
                        title={t('more.celebrations.offTitle')}
                        description={t('more.celebrations.offDescription')}
                        selected={celebrationLevel === 'off'}
                        disabled={celebrationLoading || celebrationPending}
                        onPress={() => handleSelectCelebrationLevel('off')}
                        testID="celebration-level-off"
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}

            <Pressable
              onPress={() => setShowGuide((v) => !v)}
              className="flex-row items-center mt-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel={t('more.accommodation.notSureWhichToPick')}
              testID="accommodation-guide-toggle"
            >
              <Ionicons
                name={showGuide ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.textSecondary}
              />
              <Text className="text-body-sm text-text-secondary ms-1">
                {t('more.accommodation.notSureWhichToPick')}
              </Text>
            </Pressable>
            {showGuide ? (
              <View
                className="bg-surface rounded-card px-4 py-3 mb-3"
                testID="accommodation-guide-content"
              >
                {ACCOMMODATION_GUIDE.map((row) => {
                  const isActive = row.recommendation === currentMode;
                  const guideTitle =
                    ACCOMMODATION_OPTIONS.find(
                      (o) => o.mode === row.recommendation,
                    )?.title ?? row.recommendation;
                  return (
                    <Pressable
                      key={row.recommendation}
                      onPress={() => {
                        handleSelectAccommodation(row.recommendation);
                        setShowGuide(false);
                      }}
                      className="flex-row items-center justify-between py-2"
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      testID={`guide-pick-${row.recommendation}`}
                    >
                      <Text className="text-body-sm text-text-secondary flex-1 me-3">
                        {row.condition}
                      </Text>
                      <Text className="text-primary text-body-sm font-semibold">
                        {guideTitle}
                        {isActive
                          ? ` · ${t('more.accommodation.guideActive')}`
                          : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
