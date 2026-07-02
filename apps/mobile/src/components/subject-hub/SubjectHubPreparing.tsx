import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BookPageFlipAnimation } from '../common';
import { resolveLoadingMotionPreset } from '../../lib/motion-presets';
import { useThemeColors } from '../../lib/theme';

const SLOW_THRESHOLD_MS = 30_000;
const STALLED_THRESHOLD_MS = 60_000;

type PreparingPhase = 'building' | 'slow' | 'stalled';

interface SubjectHubPreparingProps {
  /** Re-dispatch curriculum generation (retry-curriculum). */
  onRetry: () => void;
  /** Leave the subject (back / fallback). */
  onBack: () => void;
  /** True while the retry mutation is in flight, to guard double-taps. */
  isRetrying?: boolean;
  /**
   * Subject name to personalize the title. When provided the named i18n key is
   * used ("Building your {{subject}} curriculum…"); when absent the plain key
   * is used — never interpolate an empty variable (repo i18n rule).
   */
  subjectName?: string;
  testID?: string;
}

/**
 * Building-curriculum state for the subject hub. While generation is in flight
 * the hub polls and resolves on its own, so the happy path needs no buttons.
 * For the rare case where generation never completes (failed/stuck prewarm), a
 * client-side timer escalates to a retry affordance — mirroring the book-detail
 * generating screen — so the learner is never stranded on an endless animation.
 */
export function SubjectHubPreparing({
  onRetry,
  onBack,
  isRetrying = false,
  subjectName,
  testID = 'subject-hub-preparing',
}: SubjectHubPreparingProps): React.ReactElement {
  const { t } = useTranslation();
  const themeColors = useThemeColors();
  const motion = resolveLoadingMotionPreset({
    surface: 'screen',
    contentDensity: 'sparse',
  });
  const [phase, setPhase] = useState<PreparingPhase>('building');

  useEffect(() => {
    const slowTimer = setTimeout(() => setPhase('slow'), SLOW_THRESHOLD_MS);
    const stalledTimer = setTimeout(
      () => setPhase('stalled'),
      STALLED_THRESHOLD_MS,
    );
    return () => {
      clearTimeout(slowTimer);
      clearTimeout(stalledTimer);
    };
  }, []);

  return (
    <View className="flex-1 items-center justify-center px-5" testID={testID}>
      <View testID="subject-hub-preparing-book-animation">
        <BookPageFlipAnimation
          size={motion.size}
          color={themeColors.accent}
          testID="subject-hub-preparing-animation"
        />
      </View>
      <Text className="mt-4 text-h2 font-bold text-text-primary text-center">
        {subjectName
          ? t('subjectHub.preparing.titleNamed', { subject: subjectName })
          : t('subjectHub.preparing.title')}
      </Text>
      <Text className="mt-2 text-body-sm text-text-secondary text-center">
        {t('subjectHub.preparing.message')}
      </Text>

      {phase === 'slow' && (
        <Text
          className="mt-2 text-body-sm text-text-secondary text-center"
          accessibilityLiveRegion="polite"
        >
          {t('subjectHub.preparing.slow')}
        </Text>
      )}

      {phase === 'stalled' && (
        <View className="mt-4 items-center">
          <Text
            className="mb-4 text-body text-text-secondary text-center"
            accessibilityLiveRegion="polite"
          >
            {t('subjectHub.preparing.stalledMessage')}
          </Text>
          <Pressable
            onPress={() => {
              if (!isRetrying) onRetry();
            }}
            disabled={isRetrying}
            accessibilityRole="button"
            accessibilityLabel={t('subjectHub.preparing.retry')}
            className="mb-3 min-h-[48px] items-center justify-center rounded-button bg-primary px-6 py-3"
            testID="subject-hub-preparing-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('subjectHub.preparing.retry')}
            </Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t('common.goBack')}
        className="mt-6 px-5 py-3"
        testID="subject-hub-preparing-back"
      >
        <Text className="text-body font-semibold text-primary">
          {t('common.goBack')}
        </Text>
      </Pressable>
    </View>
  );
}
