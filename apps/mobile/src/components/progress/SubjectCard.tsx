import { Pressable, Text, View } from 'react-native';
import type { SubjectInventory } from '@eduagent/schemas';
import { ProgressBar } from './ProgressBar';

type SubjectCardAction = 'review' | 'continue' | 'explore';

interface SubjectCardProps {
  subject: SubjectInventory;
  onPress?: () => void;
  onAction?: (action: SubjectCardAction) => void;
  testID?: string;
}

function getContextualAction(subject: SubjectInventory): SubjectCardAction {
  if (subject.topics.notStarted > 0) return 'continue';
  return 'explore';
}

function getTopicHeadline(subject: SubjectInventory): {
  headline: string;
  progressValue: number;
  progressMax: number;
  footnote: string;
  hideBar: boolean;
} {
  const hasFixedGoal = subject.topics.total != null && subject.topics.total > 0;

  if (!hasFixedGoal) {
    const exploredCount = Math.max(
      subject.topics.explored,
      subject.topics.mastered + subject.topics.inProgress
    );
    return {
      headline: `${exploredCount} topics explored`,
      progressValue: exploredCount,
      progressMax: Math.max(1, exploredCount),
      footnote: `${subject.wallClockMinutes || subject.activeMinutes} min`,
      hideBar: true,
    };
  }

  if (subject.topics.explored > 0) {
    return {
      headline: `${
        subject.topics.mastered + subject.topics.explored
      } topics explored`,
      progressValue: subject.topics.mastered,
      progressMax: subject.topics.total ?? 0,
      footnote: `${subject.topics.mastered}/${subject.topics.total} planned topics mastered`,
      hideBar: false,
    };
  }

  // BUG-[NOTION-3468bce9]: Label "mastered" explicitly so the Progress
  // screen's count isn't confused with the Library's "completed" count.
  return {
    headline: `${subject.topics.mastered}/${subject.topics.total} topics mastered`,
    progressValue: subject.topics.mastered,
    progressMax: subject.topics.total ?? 0,
    footnote: `${subject.wallClockMinutes || subject.activeMinutes} min`,
    hideBar: false,
  };
}

const ACTION_LABEL: Record<SubjectCardAction, string> = {
  review: 'Review',
  continue: 'Continue',
  explore: 'Explore',
};

export function SubjectCard({
  subject,
  onPress,
  onAction,
  testID,
}: SubjectCardProps): React.ReactElement {
  const topicHeadline = getTopicHeadline(subject);
  const action = getContextualAction(subject);
  const content = (
    <View className="bg-surface rounded-card p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 me-3">
          <Text className="text-body font-semibold text-text-primary">
            {subject.subjectName}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {topicHeadline.headline}
          </Text>
        </View>
        {subject.estimatedProficiencyLabel || subject.estimatedProficiency ? (
          <View className="bg-background rounded-full px-3 py-1">
            <Text className="text-caption font-semibold text-text-secondary">
              {subject.estimatedProficiencyLabel ??
                subject.estimatedProficiency}
            </Text>
          </View>
        ) : null}
      </View>

      {!topicHeadline.hideBar ? (
        <View className="mt-3">
          <ProgressBar
            value={topicHeadline.progressValue}
            max={topicHeadline.progressMax}
            testID={testID ? `${testID}-bar` : undefined}
          />
        </View>
      ) : null}

      <View className="flex-row items-center justify-between mt-3">
        <Text className="text-caption text-text-secondary">
          {topicHeadline.footnote}
        </Text>
        <View className="flex-row items-center gap-3">
          <Text className="text-caption text-text-secondary">
            {subject.vocabulary.total > 0
              ? `${subject.vocabulary.total} words`
              : `${subject.sessionsCount} sessions`}
          </Text>
          {onAction ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onAction(action);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${ACTION_LABEL[action]} ${subject.subjectName}`}
              testID={testID ? `${testID}-action` : `subject-card-action`}
            >
              <Text className="text-body-sm font-semibold text-primary">
                {ACTION_LABEL[action]}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${subject.subjectName} progress`}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}
