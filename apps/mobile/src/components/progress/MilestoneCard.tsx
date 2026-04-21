import { View, Text } from 'react-native';
import type { MilestoneRecord } from '@eduagent/schemas';

const MILESTONE_COPY: Record<
  MilestoneRecord['milestoneType'],
  {
    icon: string;
    label: (
      threshold: number,
      metadata?: Record<string, unknown> | null
    ) => string;
  }
> = {
  vocabulary_count: {
    icon: '📚',
    label: (threshold) =>
      `${threshold} ${threshold === 1 ? 'word' : 'words'} learned`,
  },
  topic_mastered_count: {
    icon: '🎯',
    label: (threshold) =>
      `${threshold} ${threshold === 1 ? 'topic' : 'topics'} mastered`,
  },
  session_count: {
    icon: '🧭',
    label: (threshold) =>
      `${threshold} learning ${
        threshold === 1 ? 'session' : 'sessions'
      } completed`,
  },
  streak_length: {
    icon: '🔥',
    label: (threshold) => `${threshold}-day streak`,
  },
  subject_mastered: {
    icon: '🏁',
    label: (_threshold, metadata) =>
      `Mastered ${String(metadata?.['subjectName'] ?? 'a subject')}`,
  },
  book_completed: {
    icon: '📖',
    label: () => 'Completed a book',
  },
  learning_time: {
    icon: '⏱',
    label: (threshold) =>
      `${threshold} ${threshold === 1 ? 'hour' : 'hours'} of learning`,
  },
  cefr_level_up: {
    icon: '🗣',
    label: () => 'Language level increased',
  },
  topics_explored: {
    icon: '🧠',
    label: (threshold, metadata) =>
      `Explored ${threshold} topics in ${String(
        metadata?.['subjectName'] ?? 'a subject'
      )}`,
  },
};

interface MilestoneCardProps {
  milestone: MilestoneRecord;
}

export function MilestoneCard({
  milestone,
}: MilestoneCardProps): React.ReactElement {
  const config = MILESTONE_COPY[milestone.milestoneType];
  const createdAt = new Date(milestone.createdAt);

  return (
    <View className="bg-surface rounded-card p-4">
      <View className="flex-row items-start">
        <Text className="text-xl me-3">{config.icon}</Text>
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary">
            {config.label(milestone.threshold, milestone.metadata ?? null)}
          </Text>
          <Text className="text-caption text-text-secondary mt-1">
            {createdAt.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
      </View>
    </View>
  );
}
