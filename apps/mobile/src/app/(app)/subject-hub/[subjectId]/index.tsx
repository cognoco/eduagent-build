import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import type { Subject } from '@eduagent/schemas';

import {
  EmptyStateCard,
  ErrorFallback,
  QueryStateView,
} from '../../../../components/common';
import {
  SubjectHub,
  SubjectHubManageSheet,
  SubjectHubPreparing,
  type HubNextUp,
} from '../../../../components/subject-hub';
import { useSubjectHub } from '../../../../hooks/use-subject-hub';
import { useRetryCurriculum } from '../../../../hooks/use-books';
import { useSubjects, useUpdateSubject } from '../../../../hooks/use-subjects';
import { useParentProxy } from '../../../../hooks/use-parent-proxy';
import {
  goBackOrReplace,
  pushLearningResumeTarget,
} from '../../../../lib/navigation';
import { FEATURE_FLAGS } from '../../../../lib/feature-flags';
import { platformAlert } from '../../../../lib/platform-alert';
import { formatApiError } from '../../../../lib/format-api-error';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function SubjectHubRoute(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ subjectId?: string | string[] }>();
  const subjectId = firstParam(params.subjectId);
  const hub = useSubjectHub(subjectId);
  const retryCurriculum = useRetryCurriculum(subjectId);

  // WI-1119: in-context subject management on the hub. Gate on proxy scope — a
  // supporter-proxy session is read-only over the child's subjects, mirroring
  // Library's `canWrite = !navigationContract.isParentProxy`. (canStudy is not
  // used: buildSubjectHubData hardcodes it true, so it can't gate the proxy.)
  const { isParentProxy } = useParentProxy();
  const canManage = !isParentProxy;
  const [manageOpen, setManageOpen] = useState(false);
  // includeInactive so a deep-linked paused/archived subject still resolves its
  // status; defaults to 'active' (the common hub-entry path) until loaded.
  const subjectsQuery = useSubjects({
    includeInactive: true,
    enabled: canManage && !!subjectId,
  });
  const subjectStatus: Subject['status'] =
    subjectsQuery.data?.find((subject) => subject.id === subjectId)?.status ??
    'active';
  // Don't expose the manage entry until the status is actually known — opening
  // the sheet on the 'active' fallback would show the wrong action set for a
  // deep-linked paused/archived subject (pause+archive instead of resume/restore).
  const manageReady = canManage && !!subjectsQuery.data;
  const updateSubject = useUpdateSubject();

  const handleChangeStatus = useCallback(
    (status: Subject['status']) => {
      if (!subjectId || updateSubject.isPending) return;
      // Classify-then-format at this boundary: pass the raw error to
      // formatApiError so the screen never parses HTTP status codes itself
      // (UX Resilience Rules), matching Library's manage-error path.
      updateSubject.mutate(
        { subjectId, status },
        {
          onError: (err: unknown) =>
            platformAlert(
              t('library.manage.updateErrorTitle'),
              formatApiError(err),
            ),
          onSuccess: () => setManageOpen(false),
        },
      );
    },
    [subjectId, updateSubject, t],
  );

  const goBack = useCallback(() => {
    // The Subjects tab moves to /(app)/subjects under the V2 shell; fall back to
    // the legacy Library tab only when V2 nav is off, so a back-stack-exhausted
    // user lands on the tab they actually came from.
    const fallback = (
      FEATURE_FLAGS.MODE_NAV_V2_ENABLED ? '/(app)/subjects' : '/(app)/library'
    ) as Href;
    goBackOrReplace(router, fallback);
  }, [router]);

  const goPickBook = useCallback(() => {
    router.push({
      pathname: '/(app)/pick-book/[subjectId]',
      params: { subjectId },
    } as Href);
  }, [router, subjectId]);

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
        pathname: '/(app)/topic/[topicId]',
        params: { subjectId, topicId },
      } as Href);
    },
    [router, subjectId],
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

  // HIGH-3: surface a platform alert when the retry mutation fails so the
  // learner knows the tap did not silently succeed. Classifying at this
  // boundary (not inside the alert message) keeps the screen unaware of HTTP
  // status codes — per repo UX Resilience Rules.
  useEffect(() => {
    if (retryCurriculum.isError && retryCurriculum.error) {
      platformAlert(
        t('subjectHub.stuck.retryFailedTitle'),
        formatApiError(retryCurriculum.error),
      );
    }
  }, [retryCurriculum.isError, retryCurriculum.error, t]);

  // HIGH-2: dispatched:0 means every book for this subject is already claimed
  // by an in-flight job and cannot be regenerated — the honest path is to pick
  // a different book rather than showing a terminal empty state.
  useEffect(() => {
    if (retryCurriculum.data?.dispatched === 0 && subjectId) {
      router.push({
        pathname: '/(app)/pick-book/[subjectId]',
        params: { subjectId },
      } as Href);
    }
  }, [retryCurriculum.data, router, subjectId]);

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

  // QueryStateView consolidates loading + error into actionable states:
  //   loading → TimeoutLoader (spinner escapes to retry/back after the timeout,
  //             so a stalled hub query is never a spinner-forever dead-end)
  //   error   → ErrorFallback with retry + back
  // Children render only once the hub has settled without error. The settled
  // hub data is non-null (the `!subjectId` guard above is the only null case),
  // so an empty subject still surfaces a recoverable empty state below rather
  // than handing blank data to SubjectHub.
  const hubData = hub.data;

  return (
    <QueryStateView
      isLoading={hub.isLoading || !hubData}
      error={hub.isError ? true : undefined}
      loadingTitle={t('subjectHub.loading')}
      errorTitle={t('subjectHub.errors.loadTitle')}
      errorMessage={t('subjectHub.errors.loadMessage')}
      testID="subject-hub-error"
      retry={{
        onPress: hub.refetch,
        label: t('common.retry'),
        testID: 'subject-hub-retry',
      }}
      back={{
        onPress: goBack,
        label: t('common.goBack'),
        testID: 'subject-hub-back',
      }}
    >
      {hubData && hub.emptyKind === 'preparing' ? (
        <SubjectHubPreparing
          subjectName={hubData.subjectName}
          onRetry={() => {
            if (!retryCurriculum.isPending) retryCurriculum.mutate();
          }}
          onBack={goBack}
          isRetrying={retryCurriculum.isPending}
        />
      ) : hubData && hub.emptyKind === 'stuck' ? (
        <EmptyStateCard
          variant="centered"
          testID="subject-hub-stuck"
          title={t('subjectHub.stuck.title')}
          message={t('subjectHub.stuck.message')}
          primaryAction={{
            label: t('subjectHub.stuck.retry'),
            onPress: () => {
              if (!retryCurriculum.isPending) retryCurriculum.mutate();
            },
            testID: 'subject-hub-stuck-retry',
          }}
          secondaryAction={{
            label: t('common.goBack'),
            onPress: goBack,
            testID: 'subject-hub-stuck-back',
          }}
        />
      ) : hubData && hub.emptyKind === 'pick-book' ? (
        <EmptyStateCard
          variant="centered"
          testID="subject-hub-pick-book"
          title={t('subjectHub.pickBook.title')}
          message={t('subjectHub.pickBook.message')}
          primaryAction={{
            label: t('subjectHub.pickBook.cta'),
            onPress: goPickBook,
            testID: 'subject-hub-pick-book-cta',
          }}
          secondaryAction={{
            label: t('common.goBack'),
            onPress: goBack,
            testID: 'subject-hub-pick-book-back',
          }}
        />
      ) : hubData ? (
        <View className="flex-1" testID="subject-hub-screen">
          {manageReady ? (
            <View className="flex-row justify-end px-5 pt-3">
              <Pressable
                testID="subject-hub-manage"
                accessibilityRole="button"
                accessibilityLabel={t('subjectHub.manage.accessibilityLabel')}
                onPress={() => setManageOpen(true)}
                className="min-h-[40px] justify-center rounded-button px-3"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  {t('subjectHub.manage.open')}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <SubjectHub
            data={hubData}
            onNextUpPress={handleNextUp}
            onStudyTopic={handleStudyTopic}
            onReviewTopic={handleReviewTopic}
          />
          {canManage ? (
            <SubjectHubManageSheet
              visible={manageOpen}
              subjectName={hubData.subjectName}
              status={subjectStatus}
              isSaving={updateSubject.isPending}
              onClose={() => setManageOpen(false)}
              onChangeStatus={handleChangeStatus}
            />
          ) : null}
        </View>
      ) : null}
    </QueryStateView>
  );
}
