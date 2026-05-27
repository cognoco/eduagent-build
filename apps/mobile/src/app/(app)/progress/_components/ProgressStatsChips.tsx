import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { KnowledgeInventory } from '@eduagent/schemas';
import type { ProgressMetrics } from '../../../../hooks/use-progress';
import { formatMinutes } from '../../../../lib/format-relative-date';

export function ProgressStatsChips(props: {
  inventory: KnowledgeInventory | undefined;
  progressMetrics: ProgressMetrics | null;
  practiceActivityCount: number;
  hasLanguageSubject: boolean;
  isViewingSelf: boolean;
  onPressVocabulary: () => void;
}): React.ReactElement | null {
  const {
    inventory,
    progressMetrics,
    practiceActivityCount,
    hasLanguageSubject,
    isViewingSelf,
    onPressVocabulary,
  } = props;
  const { t } = useTranslation();

  if (!inventory && !progressMetrics) return null;

  const hasWeeklyDelta =
    !!inventory &&
    ((inventory.global.weeklyDeltaTopicsMastered ?? 0) > 0 ||
      (inventory.global.weeklyDeltaVocabularyTotal ?? 0) > 0 ||
      (inventory.global.weeklyDeltaTopicsExplored ?? 0) > 0);

  return (
    <>
      {inventory ? (
        <View className="bg-surface rounded-card p-4 mt-4">
          <View className="flex-row flex-wrap gap-2">
            <View className="bg-background rounded-full px-3 py-1.5">
              <Text className="text-caption font-semibold text-text-primary">
                {t('progress.stats.sessions', {
                  count: inventory.global.totalSessions,
                })}
              </Text>
            </View>
            {practiceActivityCount > 0 ? (
              <View className="bg-background rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  {t('progress.stats.practiceLessons', {
                    count: practiceActivityCount,
                  })}
                </Text>
              </View>
            ) : null}
            <View className="bg-background rounded-full px-3 py-1.5">
              <Text className="text-caption font-semibold text-text-primary">
                {/* [M5] || intentional: totalWallClockMinutes defaults to 0 for
                  pre-F-045 snapshots; falsy-fallback shows activeMinutes. */}
                {formatMinutes(
                  inventory.global.totalWallClockMinutes ||
                    inventory.global.totalActiveMinutes,
                )}
              </Text>
            </View>
            <View
              testID="progress-streak-count"
              className="bg-background rounded-full px-3 py-1.5"
            >
              <Text className="text-caption font-semibold text-text-primary">
                {t('progress.stats.streak', {
                  count: inventory.global.currentStreak,
                })}
              </Text>
            </View>
            {/* [F-012] Show vocabulary pill for language subjects only. */}
            {/* [LEARN-21 / Notion #603] Vocabulary browser is hard-wired
              to the active adult profile; only surface the tappable
              chip when viewing self to avoid leaking adult vocab into
              a child view. Render readonly count chip otherwise. */}
            {hasLanguageSubject && isViewingSelf ? (
              <Pressable
                onPress={onPressVocabulary}
                className="bg-background rounded-full px-3 py-1.5"
                accessibilityRole="button"
                accessibilityLabel={
                  inventory.global.vocabularyTotal > 0
                    ? t('progress.stats.viewVocabCount', {
                        count: inventory.global.vocabularyTotal,
                      })
                    : t('progress.stats.viewVocab')
                }
                testID="progress-vocab-stat"
              >
                <Text className="text-caption font-semibold text-primary">
                  {inventory.global.vocabularyTotal > 0
                    ? t('progress.stats.wordsLink', {
                        count: inventory.global.vocabularyTotal,
                      })
                    : t('progress.stats.vocabularyLink')}
                </Text>
              </Pressable>
            ) : hasLanguageSubject && inventory.global.vocabularyTotal > 0 ? (
              <View
                testID="progress-vocab-stat-readonly"
                className="bg-background rounded-full px-3 py-1.5"
              >
                <Text className="text-caption font-semibold text-text-primary">
                  {t('progress.stats.wordsLink', {
                    count: inventory.global.vocabularyTotal,
                  })}
                </Text>
              </View>
            ) : null}
            {inventory.global.topicsMastered > 0 ||
            inventory.global.topicsAttempted > 0 ? (
              <View
                testID="progress-topics-mastered-chip"
                className="bg-background rounded-full px-3 py-1.5"
              >
                <Text className="text-caption font-semibold text-text-primary">
                  {t('progress.stats.topicsMasteredOfAttempted', {
                    mastered: inventory.global.topicsMastered,
                    attempted: inventory.global.topicsAttempted,
                  })}
                </Text>
              </View>
            ) : null}
          </View>
          {hasWeeklyDelta ? (
            <View
              testID="progress-weekly-delta-chip"
              className="flex-row flex-wrap gap-2 mt-2"
            >
              {(inventory.global.weeklyDeltaTopicsMastered ?? 0) > 0 ? (
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-secondary">
                    {t('progress.weeklyDelta.topicsMastered', {
                      count: inventory.global.weeklyDeltaTopicsMastered,
                    })}
                  </Text>
                </View>
              ) : null}
              {(inventory.global.weeklyDeltaVocabularyTotal ?? 0) > 0 ? (
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-secondary">
                    {t('progress.weeklyDelta.vocabularyTotal', {
                      count: inventory.global.weeklyDeltaVocabularyTotal,
                    })}
                  </Text>
                </View>
              ) : null}
              {(inventory.global.weeklyDeltaTopicsExplored ?? 0) > 0 ? (
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-secondary">
                    {t('progress.weeklyDelta.topicsExplored', {
                      count: inventory.global.weeklyDeltaTopicsExplored,
                    })}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* This week at a glance chip */}
      {inventory &&
      ((inventory.thisWeekMini?.sessions ?? 0) > 0 ||
        (inventory.thisWeekMini?.wordsLearned ?? 0) > 0 ||
        (inventory.thisWeekMini?.topicsTouched ?? 0) > 0) ? (
        <View
          testID="progress-this-week-chip"
          className="bg-surface rounded-card p-4 mt-4"
        >
          <Text className="text-caption font-bold text-text-secondary mb-2">
            {t('progress.thisWeek.title')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(inventory.thisWeekMini?.sessions ?? 0) > 0 ? (
              <View className="bg-background rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  {t('progress.weeklyReport.mini.sessions', {
                    count: inventory.thisWeekMini?.sessions,
                  })}
                </Text>
              </View>
            ) : null}
            {(inventory.thisWeekMini?.wordsLearned ?? 0) > 0 ? (
              <View className="bg-background rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  {t('progress.weeklyReport.mini.words', {
                    count: inventory.thisWeekMini?.wordsLearned,
                  })}
                </Text>
              </View>
            ) : null}
            {(inventory.thisWeekMini?.topicsTouched ?? 0) > 0 ? (
              <View className="bg-background rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  {t('progress.weeklyReport.mini.topics', {
                    count: inventory.thisWeekMini?.topicsTouched,
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Recall queue chip — populated after first refresh */}
      {progressMetrics &&
      (progressMetrics.retentionCardsDue > 0 ||
        progressMetrics.retentionCardsStrong > 0 ||
        progressMetrics.retentionCardsFading > 0) ? (
        <View
          testID="progress-recall-queue-chip"
          className="bg-surface rounded-card p-4 mt-4"
        >
          <Text className="text-caption font-bold text-text-secondary mb-2">
            {t('progress.recallQueue.title')}
          </Text>
          <Text className="text-caption font-semibold text-text-primary">
            {[
              progressMetrics.retentionCardsDue > 0
                ? t('progress.recallQueue.due', {
                    count: progressMetrics.retentionCardsDue,
                  })
                : null,
              progressMetrics.retentionCardsStrong > 0
                ? t('progress.recallQueue.strong', {
                    count: progressMetrics.retentionCardsStrong,
                  })
                : null,
              progressMetrics.retentionCardsFading > 0
                ? t('progress.recallQueue.fading', {
                    count: progressMetrics.retentionCardsFading,
                  })
                : null,
            ]
              .filter(Boolean)
              .join(' • ')}
          </Text>
        </View>
      ) : null}
    </>
  );
}
