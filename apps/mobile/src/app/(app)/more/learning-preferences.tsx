import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AccommodationMode,
  CelebrationLevel,
  KnowledgeInventory,
} from '@eduagent/schemas';

import { useProfile } from '../../../lib/profile';
import { isNewLearner } from '../../../lib/progressive-disclosure';
import {
  useLearnerProfile,
  useUpdateAccommodationMode,
} from '../../../hooks/use-learner-profile';
import {
  useCelebrationLevel,
  useUpdateCelebrationLevel,
} from '../../../hooks/use-settings';
import { ACCOMMODATION_OPTIONS } from '../../../lib/accommodation-options';
import { track } from '../../../lib/analytics';
import { FAMILY_HOME_PATH, goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import {
  LearningModeOption,
  SectionHeader,
  SettingsRow,
} from '../../../components/more/settings-rows';

export default function LearningPreferencesScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { activeProfile, profiles } = useProfile();
  const queryClient = useQueryClient();

  const cachedInventory = queryClient.getQueryData<KnowledgeInventory>([
    'progress',
    'inventory',
    activeProfile?.id,
  ]);
  const hideMentorMemory = isNewLearner(cachedInventory?.global.totalSessions);

  const {
    data: learnerProfile,
    isError: learnerProfileError,
    refetch: refetchLearnerProfile,
  } = useLearnerProfile();
  const updateAccommodation = useUpdateAccommodationMode();
  const { data: celebrationLevel = 'big_only', isLoading: celebrationLoading } =
    useCelebrationLevel();
  const updateCelebrationLevel = useUpdateCelebrationLevel();

  const displayName = activeProfile?.displayName ?? 'User';
  const linkedChildren = activeProfile?.isOwner
    ? profiles.filter((p) => p.id !== activeProfile.id && !p.isOwner)
    : [];

  const handleBack = useCallback(() => {
    goBackOrReplace(router, '/(app)/more' as const);
  }, [router]);

  const handleSelectAccommodation = useCallback(
    (mode: AccommodationMode) => {
      if (mode === (learnerProfile?.accommodationMode ?? 'none')) return;
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
    [learnerProfile?.accommodationMode, updateAccommodation, t],
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
      track('child_progress_navigated', { source: 'more_preferences_link' });
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
          testID="learning-preferences-back"
        >
          <Text className="text-primary text-body font-semibold">{'←'}</Text>
        </Pressable>
        <Text className="text-h1 font-bold text-text-primary">
          {t('more.learningPreferences.screenTitle')}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        testID="learning-preferences-scroll"
      >
        <Text
          className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-1 mt-6"
          testID="learning-accommodation-section-header"
        >
          {t('more.accommodation.sectionHeader', { name: displayName })}
        </Text>
        <Text className="text-caption text-text-secondary mb-2">
          {activeProfile?.isOwner && linkedChildren.length > 0
            ? t('more.learningMode.subtitleWithChildren')
            : t('more.learningMode.subtitle')}
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
              const selected = learnerProfile.accommodationMode === opt.mode;
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
          </>
        )}

        {!hideMentorMemory ? (
          <>
            <SectionHeader testID="mentor-memory-section-header">
              {t('more.mentorMemory.sectionHeader')}
            </SectionHeader>
            <SettingsRow
              label={t('more.mentorMemory.viewAndManage')}
              onPress={() =>
                router.push(
                  '/(app)/mentor-memory?returnTo=learning-preferences',
                )
              }
              testID="mentor-memory-link"
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
