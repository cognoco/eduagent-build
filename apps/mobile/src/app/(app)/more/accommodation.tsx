import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AccommodationMode, CelebrationLevel } from '@eduagent/schemas';

import { useProfile } from '../../../lib/profile';
import {
  useLearnerProfile,
  useUpdateAccommodationMode,
} from '../../../hooks/use-learner-profile';
import {
  useCelebrationLevel,
  useUpdateCelebrationLevel,
} from '../../../hooks/use-settings';
import {
  ACCOMMODATION_GUIDE,
  ACCOMMODATION_OPTIONS,
} from '../../../lib/accommodation-options';
import { track } from '../../../lib/analytics';
import { FAMILY_HOME_PATH, goBackOrReplace } from '../../../lib/navigation';
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

  const {
    data: learnerProfile,
    isError: learnerProfileError,
    refetch: refetchLearnerProfile,
  } = useLearnerProfile();
  const updateAccommodation = useUpdateAccommodationMode();
  const { data: celebrationLevel = 'big_only', isLoading: celebrationLoading } =
    useCelebrationLevel();
  const updateCelebrationLevel = useUpdateCelebrationLevel();

  const currentMode = learnerProfile?.accommodationMode ?? 'none';
  const linkedChildren = activeProfile?.isOwner
    ? profiles.filter((p) => p.id !== activeProfile.id && !p.isOwner)
    : [];

  const handleBack = useCallback(() => {
    goBackOrReplace(router, '/(app)/more/learning-preferences' as const);
  }, [router]);

  const handleSelectAccommodation = useCallback(
    (mode: AccommodationMode) => {
      if (mode === currentMode) return;
      updateAccommodation.mutate(
        { accommodationMode: mode },
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
    [currentMode, updateAccommodation, t],
  );

  const handleSelectCelebrationLevel = (next: CelebrationLevel): void => {
    if (celebrationLevel === next) return;
    updateCelebrationLevel.mutate(next, {
      onError: () => {
        platformAlert(
          t('more.errors.couldNotSaveSetting'),
          t('more.errors.tryAgain'),
        );
      },
    });
  };

  const handleChildProgressNavigation = useCallback(
    (href: string) => {
      track('child_progress_navigated', { source: 'accommodation_screen' });
      router.push(href as never);
    },
    [router],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={handleBack}
          className="me-3 py-2 pe-2"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="accommodation-back"
        >
          <Text className="text-primary text-body font-semibold">{'←'}</Text>
        </Pressable>
        <Text className="text-h1 font-bold text-text-primary">
          {t('more.accommodation.screenTitle')}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        testID="accommodation-scroll"
      >
        <Text
          className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6"
          testID="accommodation-section-header"
        >
          {t('more.accommodation.sectionHeader')}
        </Text>

        {activeProfile?.isOwner && linkedChildren.length === 1 ? (
          <Pressable
            onPress={() => handleChildProgressNavigation(FAMILY_HOME_PATH)}
            className="self-start mb-3"
            accessibilityRole="button"
            accessibilityLabel={t(
              'more.learningMode.childPreferencesAccessLabel',
              {
                name:
                  linkedChildren[0]?.displayName ?? t('more.family.yourChild'),
              },
            )}
            testID="accommodation-mode-child-link"
          >
            <Text className="text-caption font-semibold text-primary">
              {t('more.learningMode.childPreferencesLink', {
                name:
                  linkedChildren[0]?.displayName ?? t('more.family.yourChild'),
              })}
            </Text>
          </Pressable>
        ) : null}

        {activeProfile?.isOwner && linkedChildren.length >= 2 ? (
          <Pressable
            onPress={() => handleChildProgressNavigation(FAMILY_HOME_PATH)}
            className="self-start mb-3"
            accessibilityRole="button"
            accessibilityLabel={t(
              'more.family.openFamilyPreferencesAccessLabel',
            )}
            testID="accommodation-mode-family-link"
          >
            <Text className="text-caption font-semibold text-primary">
              {t('more.learningMode.familyPreferencesLink')}
            </Text>
          </Pressable>
        ) : null}

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
                        disabled={
                          celebrationLoading || updateCelebrationLevel.isPending
                        }
                        onPress={() => handleSelectCelebrationLevel('all')}
                        testID="celebration-level-all"
                      />
                      <LearningModeOption
                        title={t('more.celebrations.bigOnlyTitle')}
                        description={t('more.celebrations.bigOnlyDescription')}
                        selected={celebrationLevel === 'big_only'}
                        disabled={
                          celebrationLoading || updateCelebrationLevel.isPending
                        }
                        onPress={() => handleSelectCelebrationLevel('big_only')}
                        testID="celebration-level-big-only"
                      />
                      <LearningModeOption
                        title={t('more.celebrations.offTitle')}
                        description={t('more.celebrations.offDescription')}
                        selected={celebrationLevel === 'off'}
                        disabled={
                          celebrationLoading || updateCelebrationLevel.isPending
                        }
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
                  const title =
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
                        {title}
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
