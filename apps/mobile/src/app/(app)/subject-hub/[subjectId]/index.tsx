import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';

import { ErrorFallback } from '../../../../components/common';
import { SubjectHub, type HubNextUp } from '../../../../components/subject-hub';
import { useSubjectHub } from '../../../../hooks/use-subject-hub';
import {
  goBackOrReplace,
  pushLearningResumeTarget,
} from '../../../../lib/navigation';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function SubjectHubRoute(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ subjectId?: string | string[] }>();
  const subjectId = firstParam(params.subjectId);
  const hub = useSubjectHub(subjectId);

  const goBack = useCallback(() => {
    goBackOrReplace(router, '/(app)/library' as Href);
  }, [router]);

  const openTopic = useCallback(
    (topicId: string, bookId?: string | null) => {
      router.push({
        pathname: '/(app)/topic/[topicId]',
        params: {
          subjectId,
          topicId,
          ...(bookId ? { bookId } : {}),
        },
      } as Href);
    },
    [router, subjectId],
  );

  const handleStudyTopic = useCallback(
    (topicId: string) => {
      openTopic(topicId);
    },
    [openTopic],
  );

  const handleReviewTopic = useCallback(
    (topicId: string) => {
      router.push({
        pathname: '/(app)/retention/review',
        params: { topicId },
      } as Href);
    },
    [router],
  );

  const handleNextUp = useCallback(
    (nextUp: HubNextUp) => {
      if (!nextUp.topicId) return;
      if (nextUp.kind === 'resume' && hub.data?.nextUp.resumeTarget) {
        pushLearningResumeTarget(router, hub.data.nextUp.resumeTarget);
        return;
      }
      if (nextUp.kind === 'review-due') {
        handleReviewTopic(nextUp.topicId);
        return;
      }

      openTopic(nextUp.topicId, nextUp.bookId);
    },
    [handleReviewTopic, hub.data?.nextUp.resumeTarget, openTopic, router],
  );

  if (!subjectId) {
    return (
      <ErrorFallback
        variant="centered"
        testID="subject-hub-missing-param"
        title={t('subjectHub.errors.missingSubjectTitle')}
        message={t('subjectHub.errors.missingSubjectMessage')}
        secondaryAction={{
          label: t('common.goBack'),
          onPress: goBack,
          testID: 'subject-hub-missing-param-back',
        }}
      />
    );
  }

  if (hub.isError) {
    return (
      <ErrorFallback
        variant="centered"
        testID="subject-hub-error"
        title={t('subjectHub.errors.loadTitle')}
        message={t('subjectHub.errors.loadMessage')}
        primaryAction={{
          label: t('common.retry'),
          onPress: hub.refetch,
          testID: 'subject-hub-retry',
        }}
        secondaryAction={{
          label: t('common.goBack'),
          onPress: goBack,
          testID: 'subject-hub-back',
        }}
      />
    );
  }

  if (hub.isLoading || !hub.data) {
    return (
      <View
        className="flex-1 items-center justify-center bg-bg px-6"
        testID="subject-hub-loading"
      >
        <Text className="text-body text-text-secondary">
          {t('subjectHub.loading')}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1" testID="subject-hub-screen">
      <SubjectHub
        data={hub.data}
        onNextUpPress={handleNextUp}
        onStudyTopic={handleStudyTopic}
        onReviewTopic={handleReviewTopic}
      />
    </View>
  );
}
