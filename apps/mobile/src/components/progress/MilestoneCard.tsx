import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MilestoneRecord } from '@eduagent/schemas';
import type { Translate } from '../../i18n';
import { formatShortDate } from '../../lib/format-datetime';

const MILESTONE_COPY: Record<
  MilestoneRecord['milestoneType'],
  {
    icon: string;
    label: (
      threshold: number,
      t: Translate,
      metadata?: Record<string, unknown> | null,
    ) => string;
  }
> = {
  vocabulary_count: {
    icon: '📚',
    label: (threshold, t) => t('milestoneCard.wordCount', { count: threshold }),
  },
  topic_mastered_count: {
    icon: '🎯',
    label: (threshold, t) =>
      t('milestoneCard.topicCount', { count: threshold }),
  },
  session_count: {
    icon: '🧭',
    label: (threshold, t) =>
      t('milestoneCard.sessionCount', { count: threshold }),
  },
  streak_length: {
    icon: '🔥',
    label: (threshold, t) =>
      t('progress.milestoneCard.streakLength', { count: threshold }),
  },
  subject_mastered: {
    icon: '🏁',
    label: (_threshold, t, metadata) =>
      metadata?.['subjectName']
        ? t('progress.milestoneCard.subjectMastered', {
            subject: String(metadata['subjectName']),
          })
        : t('progress.milestoneCard.subjectMasteredFallback'),
  },
  book_completed: {
    icon: '📖',
    label: (_threshold, t) => t('progress.milestoneCard.bookCompleted'),
  },
  learning_time: {
    icon: '⏱',
    label: (threshold, t) => t('milestoneCard.hourCount', { count: threshold }),
  },
  cefr_level_up: {
    icon: '🗣',
    label: (_threshold, t) => t('progress.milestoneCard.cefrLevelUp'),
  },
  topics_explored: {
    icon: '🧠',
    label: (threshold, t, metadata) =>
      metadata?.['subjectName']
        ? t('progress.milestoneCard.topicsExplored', {
            count: threshold,
            subject: String(metadata['subjectName']),
          })
        : t('progress.milestoneCard.topicsExploredFallback', {
            count: threshold,
          }),
  },
};

interface MilestoneCardProps {
  milestone: MilestoneRecord;
}

export function MilestoneCard({
  milestone,
}: MilestoneCardProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  // The milestone_type DB column is free-text (no CHECK constraint), so an
  // unrecognized value can reach this component. Guard the MILESTONE_COPY
  // lookup so an unknown type renders a generic milestone card instead of
  // crashing the render (config.icon would throw on undefined).
  const config = MILESTONE_COPY[milestone.milestoneType] as
    | (typeof MILESTONE_COPY)[MilestoneRecord['milestoneType']]
    | undefined;
  const createdAtLabel = formatShortDate(milestone.createdAt, i18n.language, {
    month: 'short',
    day: 'numeric',
  });

  if (!config) {
    return (
      <View className="bg-surface rounded-card p-4">
        <View className="flex-row items-start">
          <Text className="text-xl me-3">{'🎯'}</Text>
          <View className="flex-1">
            <Text className="text-body font-semibold text-text-primary">
              {t('progress.milestoneCard.unknown')}
            </Text>
            <Text className="text-caption text-text-secondary mt-1">
              {createdAtLabel}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-card p-4">
      <View className="flex-row items-start">
        <Text className="text-xl me-3">{config.icon}</Text>
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary">
            {config.label(milestone.threshold, t, milestone.metadata ?? null)}
          </Text>
          <Text className="text-caption text-text-secondary mt-1">
            {createdAtLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}
