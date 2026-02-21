import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../../components/progress';
import { useSubjects } from '../../../hooks/use-subjects';
import { useOverallProgress } from '../../../hooks/use-progress';
import { useRetentionTopics } from '../../../hooks/use-retention';

interface EnrichedTopic {
  topicId: string;
  subjectId: string;
  name: string;
  subjectName: string;
  retention: RetentionStatus;
  lastReviewedAt: string | null;
  repetitions: number;
  failureCount: number;
}

function formatLastPracticed(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function LearningBookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    null
  );

  const { data: subjects, isLoading: subjectsLoading } = useSubjects();
  const { data: overallProgress, isLoading: progressLoading } =
    useOverallProgress();

  // Fetch retention data for each subject
  const firstSubjectId = subjects?.[0]?.id ?? '';
  const secondSubjectId = subjects?.[1]?.id ?? '';
  const thirdSubjectId = subjects?.[2]?.id ?? '';

  const first = useRetentionTopics(firstSubjectId);
  const second = useRetentionTopics(secondSubjectId);
  const third = useRetentionTopics(thirdSubjectId);

  const retentionBySubject = [first, second, third];

  // Build retention status map from progress data
  const retentionMap = new Map<string, RetentionStatus>();
  if (overallProgress?.subjects) {
    for (const sp of overallProgress.subjects) {
      retentionMap.set(sp.subjectId, sp.retentionStatus);
    }
  }

  // Build enriched topic list from retention queries
  const allTopics: EnrichedTopic[] = [];
  const topicsLoading =
    (firstSubjectId && first.isLoading) ||
    (secondSubjectId && second.isLoading) ||
    (thirdSubjectId && third.isLoading);

  if (subjects) {
    for (let i = 0; i < Math.min(subjects.length, 3); i++) {
      const subject = subjects[i];
      const retentionData = retentionBySubject[i]?.data;
      if (retentionData?.topics) {
        for (const topic of retentionData.topics) {
          const retention: RetentionStatus =
            topic.xpStatus === 'decayed'
              ? 'forgotten'
              : topic.repetitions === 0
              ? 'weak'
              : topic.easeFactor >= 2.5
              ? 'strong'
              : 'fading';
          const enriched = topic as unknown as { topicTitle?: string };
          allTopics.push({
            topicId: topic.topicId,
            subjectId: subject.id,
            name: enriched.topicTitle ?? topic.topicId,
            subjectName: subject.name,
            retention,
            lastReviewedAt: topic.lastReviewedAt,
            repetitions: topic.repetitions,
            failureCount: topic.failureCount,
          });
        }
      }
    }
  }

  // Apply subject filter
  const filteredTopics = selectedSubjectId
    ? allTopics.filter((t) => t.subjectId === selectedSubjectId)
    : allTopics;

  const isLoading = subjectsLoading || progressLoading || topicsLoading;
  const subjectCount = new Set(allTopics.map((t) => t.subjectId)).size;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-text-primary">
          Learning Book
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1">
          {isLoading
            ? 'Loading...'
            : `${allTopics.length} topics across ${subjectCount} subject${
                subjectCount === 1 ? '' : 's'
              }`}
        </Text>
      </View>

      {/* Subject filter tabs */}
      {subjects && subjects.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-5 py-2"
          contentContainerStyle={{ gap: 8 }}
          testID="subject-filter-tabs"
        >
          <Pressable
            onPress={() => setSelectedSubjectId(null)}
            className={`rounded-full px-4 py-2 ${
              selectedSubjectId === null ? 'bg-primary' : 'bg-surface-elevated'
            }`}
            testID="filter-all"
          >
            <Text
              className={`text-body-sm font-medium ${
                selectedSubjectId === null
                  ? 'text-text-inverse'
                  : 'text-text-secondary'
              }`}
            >
              All
            </Text>
          </Pressable>
          {subjects.map((subject) => (
            <Pressable
              key={subject.id}
              onPress={() =>
                setSelectedSubjectId(
                  selectedSubjectId === subject.id ? null : subject.id
                )
              }
              className={`rounded-full px-4 py-2 flex-row items-center ${
                selectedSubjectId === subject.id
                  ? 'bg-primary'
                  : 'bg-surface-elevated'
              }`}
              testID={`filter-${subject.id}`}
            >
              <Text
                className={`text-body-sm font-medium ${
                  selectedSubjectId === subject.id
                    ? 'text-text-inverse'
                    : 'text-text-secondary'
                }`}
              >
                {subject.name}
              </Text>
              {retentionMap.has(subject.id) && (
                <View className="ml-2">
                  <RetentionSignal
                    status={retentionMap.get(subject.id)!}
                    compact
                  />
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {isLoading ? (
          <View className="py-8 items-center" testID="learning-book-loading">
            <ActivityIndicator />
          </View>
        ) : filteredTopics.length > 0 ? (
          filteredTopics.map((topic) => (
            <Pressable
              key={topic.topicId}
              onPress={() =>
                router.push({
                  pathname: `/(learner)/topic/${topic.topicId}`,
                  params: {
                    subjectId: topic.subjectId,
                  },
                } as never)
              }
              className="bg-surface rounded-card px-4 py-3 mb-2"
              testID={`topic-row-${topic.topicId}`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-body font-medium text-text-primary">
                    {topic.name}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <Text className="text-caption text-text-secondary">
                      {topic.subjectName}
                    </Text>
                    {topic.repetitions > 0 && (
                      <Text className="text-caption text-text-secondary ml-2">
                        {topic.repetitions}{' '}
                        {topic.repetitions === 1 ? 'session' : 'sessions'}
                      </Text>
                    )}
                  </View>
                  {topic.failureCount >= 3 && (
                    <Text className="text-caption text-warning mt-0.5">
                      Needs attention
                    </Text>
                  )}
                  {formatLastPracticed(topic.lastReviewedAt) && (
                    <Text className="text-caption text-text-tertiary mt-0.5">
                      Last practiced:{' '}
                      {formatLastPracticed(topic.lastReviewedAt)}
                    </Text>
                  )}
                </View>
                <RetentionSignal status={topic.retention} />
              </View>
            </Pressable>
          ))
        ) : (
          <View
            className="bg-surface rounded-card px-4 py-6 items-center"
            testID="learning-book-empty"
          >
            <Text className="text-body text-text-secondary">
              No topics yet — add a subject to get started
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
