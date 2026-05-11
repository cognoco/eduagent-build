import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { AccommodationMode, CelebrationLevel } from '@eduagent/schemas';

import {
  useChildLearnerProfile,
  useUpdateAccommodationMode,
} from '../../hooks/use-learner-profile';
import {
  useChildCelebrationLevel,
  useUpdateChildCelebrationLevel,
} from '../../hooks/use-settings';
import {
  ACCOMMODATION_GUIDE,
  ACCOMMODATION_OPTIONS,
} from '../../lib/accommodation-options';
import { platformAlert } from '../../lib/platform-alert';
import { useThemeColors } from '../../lib/theme';

interface ChildAccommodationSectionProps {
  childProfileId: string;
  childName: string;
}

export function ChildAccommodationSection({
  childProfileId,
  childName,
}: ChildAccommodationSectionProps): React.ReactElement | null {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [showAccommodationGuide, setShowAccommodationGuide] = useState(false);

  const { data: learnerProfile } = useChildLearnerProfile(childProfileId);
  const updateAccommodation = useUpdateAccommodationMode();
  const { data: childCelebrationLevel = 'big_only' } =
    useChildCelebrationLevel(childProfileId);
  const updateChildCelebrationLevel = useUpdateChildCelebrationLevel();

  const currentAccommodationMode = learnerProfile?.accommodationMode ?? 'none';
  const showCelebrationFollowup =
    currentAccommodationMode === 'short-burst' ||
    currentAccommodationMode === 'predictable';

  const celebrationOptions: Array<{
    level: CelebrationLevel;
    titleKey: string;
    descriptionKey: string;
  }> = [
    {
      level: 'all',
      titleKey: 'more.celebrations.allTitle',
      descriptionKey: 'more.celebrations.allDescription',
    },
    {
      level: 'big_only',
      titleKey: 'more.celebrations.bigOnlyTitle',
      descriptionKey: 'more.celebrations.bigOnlyDescription',
    },
    {
      level: 'off',
      titleKey: 'more.celebrations.offTitle',
      descriptionKey: 'more.celebrations.offDescription',
    },
  ];

  const handleAccommodationChange = useCallback(
    (mode: AccommodationMode) => {
      if (mode === currentAccommodationMode) return;
      updateAccommodation.mutate(
        { childProfileId, accommodationMode: mode },
        {
          onError: () => {
            platformAlert(
              t('parentView.index.couldNotSaveSetting'),
              t('parentView.index.pleaseTryAgain'),
            );
          },
        },
      );
    },
    [childProfileId, currentAccommodationMode, updateAccommodation, t],
  );

  const handleChildCelebrationLevelChange = useCallback(
    (celebrationLevel: CelebrationLevel) => {
      if (celebrationLevel === childCelebrationLevel) return;
      updateChildCelebrationLevel.mutate(
        { childProfileId, celebrationLevel },
        {
          onError: () => {
            platformAlert(
              t('parentView.index.couldNotSaveSetting'),
              t('parentView.index.pleaseTryAgain'),
            );
          },
        },
      );
    },
    [childCelebrationLevel, childProfileId, t, updateChildCelebrationLevel],
  );

  return (
    <View testID={`child-accommodation-${childProfileId}`}>
      <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6">
        {t('parentView.index.learningAccommodationTitle', {
          name: childName,
        })}
      </Text>
      <Text className="text-body-sm text-text-secondary mb-2">
        {t('parentView.index.learningAccommodationDescription')}
      </Text>
      <Pressable
        onPress={() => setShowAccommodationGuide((v) => !v)}
        className="flex-row items-center mb-3"
        accessibilityRole="button"
        accessibilityLabel={t('parentView.index.toggleDecisionGuide')}
        testID={`accommodation-guide-toggle-${childProfileId}`}
      >
        <Ionicons
          name={showAccommodationGuide ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textSecondary}
        />
        <Text className="text-body-sm text-text-secondary ms-1">
          {t('parentView.index.notSureWhichToPick')}
        </Text>
      </Pressable>
      {showAccommodationGuide && (
        <View
          className="bg-surface rounded-card px-4 py-3 mb-3"
          testID={`accommodation-guide-content-${childProfileId}`}
        >
          {ACCOMMODATION_GUIDE.map((row) => {
            const isActive = row.recommendation === currentAccommodationMode;
            const recommendationTitle =
              ACCOMMODATION_OPTIONS.find((o) => o.mode === row.recommendation)
                ?.title ?? row.recommendation;
            return (
              <View
                key={row.recommendation}
                className="flex-row items-center justify-between py-2"
              >
                <Text className="text-body-sm text-text-secondary flex-1 me-3">
                  {row.condition}
                </Text>
                <Pressable
                  onPress={() => {
                    handleAccommodationChange(row.recommendation);
                    setShowAccommodationGuide(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('parentView.index.pickAccommodation', {
                    mode: row.recommendation,
                  })}
                  accessibilityState={{ selected: isActive }}
                  testID={`guide-pick-${row.recommendation}-${childProfileId}`}
                >
                  <Text className="text-primary text-body-sm font-semibold">
                    {recommendationTitle}
                    {isActive ? ` · ${t('parentView.index.active')}` : ''}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
      {ACCOMMODATION_OPTIONS.map((opt) => (
        <Pressable
          key={opt.mode}
          onPress={() => handleAccommodationChange(opt.mode)}
          disabled={updateAccommodation.isPending}
          className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
            currentAccommodationMode === opt.mode
              ? 'border-2 border-primary'
              : 'border-2 border-transparent'
          }`}
          accessibilityLabel={`${opt.title}: ${opt.description}`}
          accessibilityRole="radio"
          accessibilityState={{
            selected: currentAccommodationMode === opt.mode,
            disabled: updateAccommodation.isPending,
          }}
          testID={`accommodation-mode-${opt.mode}-${childProfileId}`}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-body font-semibold text-text-primary">
              {opt.title}
            </Text>
            {currentAccommodationMode === opt.mode && (
              <Text className="text-primary text-body font-semibold">
                {t('parentView.index.active')}
              </Text>
            )}
          </View>
          <Text className="text-body-sm text-text-secondary mt-1">
            {opt.description}
          </Text>
        </Pressable>
      ))}
      {showCelebrationFollowup ? (
        <View
          className="ml-4 mb-2 border-l-2 border-primary/30 pl-3"
          testID={`child-celebration-followup-${currentAccommodationMode}-${childProfileId}`}
        >
          <Text className="text-caption font-semibold text-text-primary mb-2">
            {t('more.celebrations.inlinePrompt')}
          </Text>
          {celebrationOptions.map((option) => (
            <Pressable
              key={option.level}
              onPress={() => handleChildCelebrationLevelChange(option.level)}
              disabled={updateChildCelebrationLevel.isPending}
              className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
                childCelebrationLevel === option.level
                  ? 'border-2 border-primary'
                  : 'border-2 border-transparent'
              }`}
              accessibilityRole="radio"
              accessibilityState={{
                selected: childCelebrationLevel === option.level,
                disabled: updateChildCelebrationLevel.isPending,
              }}
              testID={`child-celebration-level-${option.level}-${childProfileId}`}
            >
              <Text className="text-body font-semibold text-text-primary">
                {t(option.titleKey)}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-1">
                {t(option.descriptionKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text
        className="text-caption text-text-secondary mt-1 mb-2"
        testID={`accommodation-try-it-${childProfileId}`}
      >
        {t('parentView.index.accommodationTryIt', {
          name: childName,
        })}
      </Text>
    </View>
  );
}
