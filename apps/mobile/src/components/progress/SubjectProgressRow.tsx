import { useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import type { SubjectInventory } from '@eduagent/schemas';
import { AccordionTopicList } from './AccordionTopicList';
import { ProgressBar } from './ProgressBar';
import { SubjectBookshelfMotif } from '../common/SubjectBookshelfMotif';
import { formatMinutes } from '../../lib/format-relative-date';
import {
  getLearningSubjectTint,
  type LearningSubjectTint,
} from '../../lib/learning-subject-tints';
import { useThemeColors } from '../../lib/theme';

// 'review' is planned for spaced-repetition scenarios but not yet wired.
// Add it back here and to ACTION_LABEL + getContextualAction when implemented.
type SubjectProgressRowAction = 'continue' | 'explore';

interface SubjectProgressRowProps {
  subject: SubjectInventory;
  onPress?: () => void;
  onAction?: (action: SubjectProgressRowAction) => void;
  childProfileId?: string;
  subjectId?: string;
  tint?: LearningSubjectTint;
  testID?: string;
}

function getContextualAction(
  subject: SubjectInventory,
): SubjectProgressRowAction {
  // Only show "Continue" when the user has actual progress AND still has
  // topics left to cover. An untouched subject (all notStarted, zero
  // activity) should invite exploration, not continuation.
  if (hasSubjectActivity(subject) && subject.topics.notStarted > 0)
    return 'continue';
  return 'explore';
}

function getStartedTopicsCount(subject: SubjectInventory): number {
  // inProgress + mastered = attemptedTopicIds.size (no double-counting).
  // DO NOT add explored — it overlaps with inProgress/mastered because
  // exploredTopicIds seeds attemptedTopicIds in the backend.
  return subject.topics.inProgress + subject.topics.mastered;
}

export function hasSubjectActivity(subject: SubjectInventory): boolean {
  return (
    subject.sessionsCount > 0 ||
    subject.topics.explored > 0 ||
    subject.topics.inProgress > 0 ||
    subject.topics.mastered > 0
  );
}

function getTopicHeadline(subject: SubjectInventory): {
  headline: string;
  progressValue: number;
  progressMax: number;
  subline: string;
  hideBar: boolean;
} {
  const startedCount = getStartedTopicsCount(subject);
  const sessionsLabel = `${subject.sessionsCount} ${
    subject.sessionsCount === 1 ? 'session' : 'sessions'
  }`;
  const displayMinutes = formatMinutes(
    subject.wallClockMinutes || subject.activeMinutes,
  );
  const subline = `${displayMinutes} · ${sessionsLabel}`;

  // [BUG-880] Always use the same headline schema across rows. Previously
  // a subject with sessions but no started topic surfaced "X sessions
  // completed" while peers showed "X topics started · Y mastered" — making
  // it look as if some subjects had richer tracking when they were just at
  // a different stage. Using a single schema everywhere keeps the metric
  // alphabet stable and lets users compare subjects at a glance. Time and
  // session count remain in the subline for both branches.
  return {
    headline: `${startedCount} ${
      startedCount === 1 ? 'topic' : 'topics'
    } started · ${subject.topics.mastered} mastered`,
    progressValue: subject.topics.mastered,
    progressMax: Math.max(1, subject.topics.total ?? 1),
    subline,
    hideBar: subject.topics.total == null,
  };
}

const ACTION_LABEL: Record<SubjectProgressRowAction, string> = {
  continue: 'Continue',
  explore: 'Explore',
};

export function SubjectProgressRow({
  subject,
  onPress,
  onAction,
  childProfileId,
  subjectId,
  tint: providedTint,
  testID,
}: SubjectProgressRowProps): React.ReactElement {
  const colors = useThemeColors();
  const tint = providedTint ?? getLearningSubjectTint(0, colors);
  const [expanded, setExpanded] = useState(false);
  const isAccordionMode = !!childProfileId && !!subjectId && !onPress;
  const hasExpandableTopics =
    subject.sessionsCount > 0 || getStartedTopicsCount(subject) > 0;
  const topicHeadline = getTopicHeadline(subject);
  const action = getContextualAction(subject);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  };

  const content = (
    <View
      className="rounded-card p-4"
      style={{
        backgroundColor: tint.soft,
        borderColor: tint.solid + '33',
        borderWidth: 1,
      }}
    >
      <View className="flex-row items-start justify-between">
        <View className="me-3">
          <SubjectBookshelfMotif
            testID={testID ? `${testID}-bookshelf` : undefined}
            tint={tint}
          />
        </View>
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
            fillColor={tint.solid}
            testID={testID ? `${testID}-bar` : undefined}
          />
        </View>
      ) : null}

      <View className="flex-row items-center justify-between mt-3">
        <Text className="text-caption text-text-secondary">
          {topicHeadline.subline}
        </Text>
        <View className="flex-row items-center gap-3">
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
          {isAccordionMode && hasExpandableTopics ? (
            <Text className="text-caption text-primary">
              {expanded ? '▴ Hide topics' : '▾ See topics'}
            </Text>
          ) : null}
        </View>
      </View>

      {isAccordionMode && childProfileId && subjectId ? (
        <AccordionTopicList
          childProfileId={childProfileId}
          subjectId={subjectId}
          subjectName={subject.subjectName}
          expanded={expanded}
        />
      ) : null}
    </View>
  );

  if (isAccordionMode) {
    return (
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${subject.subjectName}, ${
          expanded ? 'expanded' : 'collapsed'
        }`}
        accessibilityHint={
          expanded ? 'Tap to hide topics' : 'Tap to show topics'
        }
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

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
