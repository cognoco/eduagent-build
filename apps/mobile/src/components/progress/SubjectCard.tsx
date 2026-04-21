import { Pressable, Text, View } from 'react-native';
import type { SubjectInventory } from '@eduagent/schemas';
import { ProgressBar } from './ProgressBar';
import { formatMinutes } from '../../lib/format-relative-date';

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
  // [M5] || is intentional: wallClockMinutes defaults to 0 for pre-F-045
  // snapshots, so falsy-fallback correctly shows activeMinutes instead of 0.
  const displayMinutes = formatMinutes(
    subject.wallClockMinutes || subject.activeMinutes
  );

  if (!hasFixedGoal) {
    const exploredCount = Math.max(
      subject.topics.explored,
      subject.topics.mastered + subject.topics.inProgress
    );
    return {
      headline: `${exploredCount} ${
        exploredCount === 1 ? 'topic' : 'topics'
      } explored`,
      progressValue: exploredCount,
      progressMax: Math.max(1, exploredCount),
      footnote: displayMinutes,
      hideBar: true,
    };
  }

  // [BUG-525/BUG-527] Compute the effective engagement count: how many
  // distinct topics the child has touched in any state. This guards against
  // the impossible state "explored > 0 but sessions = 0" by reconciling
  // with sessionsCount — and ensures mastered=0 cards still show activity.
  const touchedTopics =
    subject.topics.explored +
    subject.topics.mastered +
    subject.topics.inProgress;

  if (touchedTopics > 0) {
    // Show engagement (topics studied) as the primary headline so parents
    // see activity even when mastery is 0. Mastery fraction is the footnote.
    return {
      headline: `${touchedTopics} ${
        touchedTopics === 1 ? 'topic' : 'topics'
      } studied`,
      progressValue: subject.topics.mastered,
      progressMax: subject.topics.total ?? 0,
      footnote: `${subject.topics.mastered}/${subject.topics.total} mastered`,
      hideBar: false,
    };
  }

  // No topics touched yet. If sessions > 0, the child engaged but no topic
  // was classified — show session-based engagement instead of bare "0/N mastered".
  if (subject.sessionsCount > 0) {
    return {
      headline: `${subject.sessionsCount} ${
        subject.sessionsCount === 1 ? 'session' : 'sessions'
      } completed`,
      progressValue: 0,
      progressMax: subject.topics.total ?? 0,
      footnote: `${displayMinutes} · 0/${subject.topics.total} mastered`,
      hideBar: false,
    };
  }

  // Truly no activity — show the mastery target.
  return {
    headline: `0/${subject.topics.total} topics mastered`,
    progressValue: 0,
    progressMax: subject.topics.total ?? 0,
    footnote: displayMinutes,
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
              ? `${subject.vocabulary.total} ${
                  subject.vocabulary.total === 1 ? 'word' : 'words'
                }`
              : `${subject.sessionsCount} ${
                  subject.sessionsCount === 1 ? 'session' : 'sessions'
                }`}
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
