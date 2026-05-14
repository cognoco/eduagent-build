import { useRouter, useSegments, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { TopicProgress } from '@eduagent/schemas';
import { useChildSubjectTopics } from '../../hooks/use-dashboard';
import { RetentionSignal, type RetentionStatus } from './RetentionSignal';

interface AccordionTopicListProps {
  childProfileId: string;
  subjectId: string;
  subjectName: string;
  expanded: boolean;
}

function TopicSkeleton(): React.ReactElement {
  return (
    <View className="py-2" testID="accordion-topic-skeleton">
      <View className="bg-border rounded h-4 w-2/3 mb-2" />
      <View className="bg-border rounded h-3 w-1/3" />
    </View>
  );
}

function getTopicStatusLabel(topic: TopicProgress): string {
  if (topic.completionStatus === 'not_started') {
    return 'Not started';
  }

  if (topic.xpStatus === 'verified') {
    return 'Mastered';
  }

  if (topic.xpStatus === 'decayed') {
    return 'Needs review';
  }

  if (topic.completionStatus === 'in_progress') {
    return 'Started';
  }

  return 'Covered';
}

export function AccordionTopicList({
  childProfileId,
  subjectId,
  subjectName,
  expanded,
}: AccordionTopicListProps): React.ReactElement | null {
  const router = useRouter();
  const segments = useSegments();
  const isInsideChildStack = segments.includes('child');
  const {
    data: topics,
    isLoading,
    isError,
    refetch,
  } = useChildSubjectTopics(
    expanded ? childProfileId : undefined,
    expanded ? subjectId : undefined,
  );

  if (!expanded) {
    return null;
  }

  return (
    <View className="border-t border-border mt-3 pt-3">
      {isLoading ? (
        <>
          <TopicSkeleton />
          <TopicSkeleton />
          <TopicSkeleton />
        </>
      ) : isError || !topics ? (
        <Pressable
          onPress={(event) => {
            event?.stopPropagation?.();
            void refetch();
          }}
          accessibilityRole="button"
          accessibilityLabel="Retry loading topics. Tap here to retry, or close the subject card to dismiss."
          testID="accordion-topics-retry"
        >
          <Text className="text-caption text-text-secondary text-center py-2">
            Could not load topics. Tap to retry, or close the subject card to
            dismiss.
          </Text>
        </Pressable>
      ) : topics.length > 0 ? (
        topics.map((topic) => (
          <Pressable
            key={topic.topicId}
            onPress={(event) => {
              event?.stopPropagation?.();
              if (!isInsideChildStack) {
                router.push({
                  pathname: '/(app)/child/[profileId]',
                  params: { profileId: childProfileId },
                } as Href);
              }
              router.push({
                pathname: '/(app)/child/[profileId]/topic/[topicId]',
                params: {
                  profileId: childProfileId,
                  topicId: topic.topicId,
                  title: topic.title,
                  completionStatus: topic.completionStatus,
                  masteryScore:
                    topic.masteryScore != null
                      ? String(topic.masteryScore)
                      : '',
                  retentionStatus: topic.retentionStatus ?? '',
                  totalSessions: String(topic.totalSessions ?? 0),
                  subjectId,
                  subjectName,
                },
              } as Href);
            }}
            className="flex-row items-center justify-between py-2"
            accessibilityRole="link"
            accessibilityLabel={`View ${topic.title} details`}
            testID={`accordion-topic-${topic.topicId}`}
          >
            <Text className="text-body-sm text-text-primary flex-1 me-3">
              {topic.title}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-caption text-text-secondary">
                {getTopicStatusLabel(topic)}
              </Text>
              {topic.retentionStatus &&
              topic.totalSessions >= 1 &&
              topic.completionStatus !== 'not_started' ? (
                <RetentionSignal
                  status={topic.retentionStatus as RetentionStatus}
                  compact
                  parentFacing
                />
              ) : null}
            </View>
          </Pressable>
        ))
      ) : (
        <View className="items-center py-2" testID="accordion-topics-empty">
          <Text className="text-caption text-text-secondary text-center mb-2">
            No topics yet
          </Text>
          <Pressable
            onPress={(event) => {
              event?.stopPropagation?.();
              router.push('/(app)/library');
            }}
            accessibilityRole="button"
            accessibilityLabel="Browse topics in your library"
            testID="accordion-topics-browse"
          >
            <Text className="text-caption font-semibold text-primary">
              Browse topics
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
