import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import type {
  CuratedMemoryView,
  DashboardChild,
  ProgressSummary,
} from '@eduagent/schemas';

import { useThemeColors } from '../../lib/theme';
import { withOpacity } from '../../lib/color-opacity';
import type { Translate } from '../../i18n';
import { firstNameOf } from './parent-card-prompts';

// The mentor slot is the calm voice below a single child's card. Priority:
//   (1) celebration — a client-side rule fired (long streak or a big mastery
//       week). Copy reframes rather than restating the numbers the card's
//       momentum strip already shows (avoids the double-surface noted in the
//       plan's Challenge LOW-3).
//   (2) guidance — the dashboard's own coaching line for this child.
//   (3) nothing — the slot is optional, never filler.

const STREAK_CELEBRATION_THRESHOLD = 7;
const TOPICS_CELEBRATION_THRESHOLD = 3;

export interface MentorSlotInsight {
  kind: 'works' | 'read';
  text: string;
}

const MEMORY_INSIGHT_PRIORITY: Array<
  CuratedMemoryView['categories'][number]['items'][number]['category']
> = ['communicationNotes', 'learningStyle'];

function firstDurableMemoryInsight(
  memory: CuratedMemoryView | null | undefined,
): string | null {
  const items = memory?.categories.flatMap((category) => category.items) ?? [];

  for (const category of MEMORY_INSIGHT_PRIORITY) {
    const match = items.find(
      (item) => item.category === category && item.statement.trim().length > 0,
    );
    if (match) return match.statement.trim();
  }

  return null;
}

export function resolveMentorSlotInsight(
  memory: CuratedMemoryView | null | undefined,
  progressSummary: ProgressSummary | null | undefined,
): MentorSlotInsight | null {
  const durableMemory = firstDurableMemoryInsight(memory);
  if (durableMemory) {
    return { kind: 'works', text: durableMemory };
  }

  const summary = progressSummary?.summary?.trim();
  if (summary) {
    return { kind: 'read', text: summary };
  }

  return null;
}

export function MentorSlot({
  child,
  insight,
  t,
}: {
  child: DashboardChild;
  insight?: MentorSlotInsight | null;
  t: Translate;
}): React.ReactElement | null {
  const colors = useThemeColors();
  const name = firstNameOf(child.displayName);

  const streakCelebration = child.currentStreak >= STREAK_CELEBRATION_THRESHOLD;
  const topicsCelebration =
    (child.progress?.weeklyDeltaTopicsMastered ?? 0) >=
    TOPICS_CELEBRATION_THRESHOLD;
  const guidance = insight?.text.trim() || null;

  if (streakCelebration || topicsCelebration) {
    const text = streakCelebration
      ? t('home.parent.mentorSlot.celebrationStreak', { name })
      : t('home.parent.mentorSlot.celebrationTopics', { name });

    return (
      <View
        className="bg-surface rounded-card px-4 py-4 flex-row items-start"
        style={{
          borderColor: withOpacity(colors.primary, 0.18),
          borderWidth: 1,
        }}
        testID="parent-home-mentor-slot"
      >
        <View
          className="w-9 h-9 rounded-full items-center justify-center me-3"
          style={{ backgroundColor: colors.primarySoft }}
          accessibilityElementsHidden
        >
          <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
        </View>
        <Text
          className="text-body-sm text-text-primary flex-1"
          testID="parent-home-mentor-slot-celebration"
        >
          {text}
        </Text>
      </View>
    );
  }

  if (guidance) {
    return (
      <View
        className="bg-surface rounded-card px-4 py-4"
        style={{
          borderColor: withOpacity(colors.primary, 0.14),
          borderWidth: 1,
        }}
        testID="parent-home-mentor-slot"
      >
        <View className="flex-row items-center mb-2">
          <Ionicons
            name="chatbubbles-outline"
            size={16}
            color={colors.primary}
          />
          <Text className="text-caption font-bold uppercase text-text-secondary ms-2">
            {insight?.kind === 'read'
              ? t('home.parent.mentorSlot.mentorRead', { name })
              : t('home.parent.mentorSlot.worksFor', { name })}
          </Text>
        </View>
        <Text
          className="text-body-sm text-text-secondary"
          testID="parent-home-mentor-slot-guidance"
        >
          {guidance}
        </Text>
      </View>
    );
  }

  return null;
}
