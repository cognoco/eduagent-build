import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type {
  HubChapter,
  HubTopic,
  HubTopicState,
} from './_view-models/subject-hub-state';

interface SubjectHubChapterSectionProps {
  chapter: HubChapter;
  defaultExpanded?: boolean;
  onOpenTopic: (topicId: string) => void;
}

const STATE_MARK: Record<HubTopicState, string> = {
  'continue-now': 'C',
  started: 'S',
  'up-next': '>',
  later: '-',
  done: 'D',
  mastered: 'M',
};

const STATE_KEY: Record<HubTopicState, string> = {
  'continue-now': 'subjectHub.topic.continueNow',
  started: 'subjectHub.topic.started',
  'up-next': 'subjectHub.topic.upNext',
  later: 'subjectHub.topic.later',
  done: 'subjectHub.topic.done',
  mastered: 'subjectHub.topic.mastered',
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function TopicRow({
  hubTopic,
  onOpenTopic,
}: {
  hubTopic: HubTopic;
  onOpenTopic: (topicId: string) => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const stateLabel = t(STATE_KEY[hubTopic.state]);
  const stateSlug = slug(hubTopic.topic.title);

  return (
    <Pressable
      testID={`subject-hub-topic-${hubTopic.topic.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${stateLabel}: ${hubTopic.topic.title}`}
      className="mt-2 rounded-card border border-border bg-background px-4 py-3"
      onPress={() => onOpenTopic(hubTopic.topic.id)}
    >
      <View className="flex-row items-start">
        <Text
          testID={`subject-hub-topic-state-${stateSlug}`}
          className="me-3 text-body text-primary"
          accessible={false}
          importantForAccessibility="no"
        >
          {STATE_MARK[hubTopic.state]}
        </Text>
        <View className="flex-1">
          <Text className="text-body font-medium text-text-primary">
            {hubTopic.topic.title}
          </Text>
          <Text className="mt-1 text-caption text-text-secondary">
            {stateLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function SubjectHubChapterSection({
  chapter,
  defaultExpanded = false,
  onOpenTopic,
}: SubjectHubChapterSectionProps): React.ReactElement {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const masteredCount = chapter.topics.filter(
    (hubTopic) => hubTopic.state === 'mastered',
  ).length;

  return (
    <View className="mt-4 rounded-card bg-surface p-4">
      <Pressable
        testID={`subject-hub-chapter-toggle-${chapter.chapter}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
      >
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-body font-semibold text-text-primary">
              {chapter.chapter}
            </Text>
            <Text className="mt-1 text-caption text-text-secondary">
              {t('subjectHub.chapter.progress', {
                mastered: masteredCount,
                total: chapter.topics.length,
              })}
            </Text>
          </View>
          <Text className="text-body text-text-secondary">
            {expanded ? '-' : '+'}
          </Text>
        </View>
      </Pressable>

      {expanded
        ? chapter.topics.map((hubTopic) => (
            <TopicRow
              key={hubTopic.topic.id}
              hubTopic={hubTopic}
              onOpenTopic={onOpenTopic}
            />
          ))
        : null}
    </View>
  );
}
