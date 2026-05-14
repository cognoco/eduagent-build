import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../../../../components/progress';
import { useChildSubjectTopics } from '../../../../../hooks/use-dashboard';
import { useChildInventory } from '../../../../../hooks/use-progress';
import { Button } from '../../../../../components/common/Button';
import { goBackOrReplace } from '../../../../../lib/navigation';
import { isNewLearner } from '../../../../../lib/progressive-disclosure';

const COMPLETION_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'Started',
  completed: 'Completed',
  verified: 'Verified',
  stable: 'Stable',
};

function TopicSkeleton(): React.ReactNode {
  return (
    <View className="bg-surface rounded-card p-4 mt-3">
      <View className="bg-border rounded h-5 w-2/3 mb-2" />
      <View className="bg-border rounded h-3 w-1/3 mb-2" />
      <View className="bg-border rounded-full h-2 w-full" />
    </View>
  );
}

export default function SubjectTopicsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    profileId: rawProfileId,
    subjectId: rawSubjectId,
    subjectName: routeSubjectName,
  } = useLocalSearchParams<{
    profileId: string;
    subjectId: string;
    subjectName?: string;
  }>();
  const profileId = Array.isArray(rawProfileId)
    ? rawProfileId[0]
    : rawProfileId;
  const subjectId = Array.isArray(rawSubjectId)
    ? rawSubjectId[0]
    : rawSubjectId;
  const {
    data: topics,
    isLoading,
    isError,
    refetch,
  } = useChildSubjectTopics(profileId, subjectId);
  const { data: inventory } = useChildInventory(profileId);
  const childIsNew = isNewLearner(inventory?.global.totalSessions);
  const subjectName =
    routeSubjectName ??
    inventory?.subjects.find((subject) => subject.subjectId === subjectId)
      ?.subjectName ??
    'Subject';

  if (!profileId || !subjectId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-subject-missing-params"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          {t('parentView.subjects.subjectNotFound')}
        </Text>
        <Text className="text-text-secondary text-body text-center mb-6">
          {t('parentView.subjects.unableToLoadSubject')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="child-subject-missing-params-back"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('common.back')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (isError) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-subject-error"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          {t('parentView.subjects.couldNotLoadTopics')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('parentView.subjects.somethingWentWrong')}
        </Text>
        <Button
          variant="primary"
          label={t('common.tryAgain')}
          onPress={() => refetch()}
          testID="retry-topics"
        />
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="mt-3 py-3 px-6 min-h-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="child-subject-error-back"
        >
          <Text className="text-body text-primary font-semibold">
            {t('common.back')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="me-3 py-2 pe-2"
          accessibilityLabel={t('common.goBack')}
          accessibilityRole="button"
          testID="back-button"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          {subjectName}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="subject-topics-scroll"
      >
        {isLoading ? (
          <>
            <TopicSkeleton />
            <TopicSkeleton />
            <TopicSkeleton />
          </>
        ) : topics && topics.length > 0 ? (
          topics.map((topic) => (
            <Pressable
              key={topic.topicId}
              onPress={() =>
                router.push({
                  pathname: '/(app)/child/[profileId]/topic/[topicId]',
                  params: {
                    profileId: profileId ?? '',
                    topicId: topic.topicId,
                    title: topic.title,
                    completionStatus: topic.completionStatus,
                    masteryScore:
                      topic.masteryScore !== null &&
                      topic.masteryScore !== undefined
                        ? String(topic.masteryScore)
                        : '',
                    retentionStatus: topic.retentionStatus ?? '',
                    totalSessions: String(topic.totalSessions ?? 0),
                    subjectId: subjectId ?? '',
                    subjectName: subjectName ?? '',
                  },
                } as Href)
              }
              className="bg-surface rounded-card p-4 mt-3"
              accessibilityLabel={t('parentView.subjects.viewTopicDetails', {
                title: topic.title,
              })}
              accessibilityRole="button"
              testID={`topic-card-${topic.topicId}`}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-body font-medium text-text-primary flex-1 me-2">
                  {topic.title}
                </Text>
                {topic.retentionStatus &&
                topic.totalSessions >= 1 &&
                topic.completionStatus !== 'not_started' ? (
                  <View testID="subject-retention-badge">
                    <RetentionSignal
                      status={topic.retentionStatus as RetentionStatus}
                      compact
                      parentFacing
                    />
                  </View>
                ) : null}
              </View>
              <Text className="text-caption text-text-secondary mb-2">
                {COMPLETION_LABELS[topic.completionStatus] ??
                  topic.completionStatus}
              </Text>
              {topic.masteryScore !== null &&
                topic.masteryScore !== undefined && (
                  <View className="h-2 bg-border rounded-full overflow-hidden">
                    <View
                      className="h-full bg-primary rounded-full"
                      style={{
                        width: `${Math.round(topic.masteryScore * 100)}%`,
                      }}
                    />
                  </View>
                )}
            </Pressable>
          ))
        ) : !topics ? (
          // BUG-106: Data is undefined without isError — possible silent failure.
          // Offer retry instead of misleading "No topics yet".
          <View className="py-8 items-center" testID="topics-load-unknown">
            <Text className="text-body text-text-secondary mb-3">
              {t('parentView.subjects.topicsCouldNotLoad')}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="bg-primary rounded-button px-5 py-2.5 items-center"
              accessibilityRole="button"
              accessibilityLabel={t('parentView.subjects.retryLoadingTopics')}
              testID="topics-retry-fallback"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('common.retry')}
              </Text>
            </Pressable>
          </View>
        ) : childIsNew ? (
          <View className="py-8 items-center" testID="topics-new-learner">
            <Text className="text-body text-text-secondary text-center">
              {t('parentView.subjects.topicsNewLearner')}
            </Text>
          </View>
        ) : (
          <View className="py-8 items-center" testID="topics-empty">
            <Text className="text-body text-text-secondary">
              {t('parentView.subjects.noTopicsYet')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
