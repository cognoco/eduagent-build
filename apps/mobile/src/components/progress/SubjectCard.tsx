import { useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import type { SubjectInventory } from '@eduagent/schemas';
import { AccordionTopicList } from './AccordionTopicList';
import { ProgressBar } from './ProgressBar';
import { formatMinutes } from '../../lib/format-relative-date';

// 'review' is planned for spaced-repetition scenarios but not yet wired.
// Add it back here and to ACTION_LABEL + getContextualAction when implemented.
type SubjectCardAction = 'continue' | 'explore';

interface SubjectCardProps {
  subject: SubjectInventory;
  onPress?: () => void;
  onAction?: (action: SubjectCardAction) => void;
  childProfileId?: string;
  subjectId?: string;
  testID?: string;
}

function getContextualAction(subject: SubjectInventory): SubjectCardAction {
  if (subject.topics.notStarted > 0) return 'continue';
  return 'explore';
}

function getStudiedTopicsCount(subject: SubjectInventory): number {
  return (
    subject.topics.explored +
    subject.topics.mastered +
    subject.topics.inProgress
  );
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
  const studiedCount = getStudiedTopicsCount(subject);
  const sessionsLabel = `${subject.sessionsCount} ${
    subject.sessionsCount === 1 ? 'session' : 'sessions'
  }`;
  const displayMinutes = formatMinutes(
    subject.wallClockMinutes || subject.activeMinutes
  );
  const subline = `${displayMinutes} · ${sessionsLabel}`;

  if (studiedCount === 0 && subject.sessionsCount > 0) {
    return {
      headline: `${subject.sessionsCount} ${
        subject.sessionsCount === 1 ? 'session' : 'sessions'
      } completed`,
      progressValue: 0,
      progressMax: 1,
      subline,
      hideBar: true,
    };
  }

  return {
    headline: `${studiedCount} ${
      studiedCount === 1 ? 'topic' : 'topics'
    } studied · ${subject.topics.mastered} mastered`,
    progressValue: subject.topics.mastered,
    progressMax: Math.max(1, subject.topics.total ?? 1),
    subline,
    hideBar: subject.topics.total == null,
  };
}

const ACTION_LABEL: Record<SubjectCardAction, string> = {
  continue: 'Continue',
  explore: 'Explore',
};

export function SubjectCard({
  subject,
  onPress,
  onAction,
  childProfileId,
  subjectId,
  testID,
}: SubjectCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const isAccordionMode = !!childProfileId && !!subjectId && !onPress;
  const hasExpandableTopics =
    subject.sessionsCount > 0 || getStudiedTopicsCount(subject) > 0;
  const topicHeadline = getTopicHeadline(subject);
  const action = getContextualAction(subject);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  };

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
        accessibilityHint="Tap to show topics"
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
