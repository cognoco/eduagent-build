import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  goBackOrReplace,
  homeHrefForReturnTo,
  pushLearningResumeTarget,
} from '../../../../lib/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorFallback } from '../../../../components/common';
import { ProgressBar } from '../../../../components/progress';
import {
  useProgressInventory,
  useLearningResumeTarget,
  useSubjectProgress,
} from '../../../../hooks/use-progress';
import { useActiveProfileRole } from '../../../../hooks/use-active-profile-role';
import { useLanguageProgress } from '../../../../hooks/use-language-progress';
import { formatMinutes } from '../../../../lib/format-relative-date';
import { useUpdateSubject } from '../../../../hooks/use-subjects';
import { platformAlert } from '../../../../lib/platform-alert';
import {
  classifyApiError,
  formatApiError,
} from '../../../../lib/format-api-error';
import { copyRegisterFor } from '../../../../lib/copy-register';

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <View className="bg-surface rounded-card p-4 flex-1">
      <Text className="text-caption text-text-secondary">{label}</Text>
      <Text className="text-h3 font-semibold text-text-primary mt-2">
        {value}
      </Text>
    </View>
  );
}

export default function ProgressSubjectScreen(): React.ReactElement {
  const { t } = useTranslation();
  const role = useActiveProfileRole();
  const register = copyRegisterFor(role);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { subjectId, returnTo } = useLocalSearchParams<{
    subjectId: string;
    returnTo?: string;
  }>();
  const backFallback = returnTo
    ? homeHrefForReturnTo(returnTo)
    : ('/(app)/progress' as const);
  const inventoryQuery = useProgressInventory();
  const subjectProgressQuery = useSubjectProgress(subjectId ?? '');
  const resumeTargetQuery = useLearningResumeTarget({
    subjectId: subjectId ?? undefined,
  });
  const languageProgressQuery = useLanguageProgress(subjectId ?? '');
  const updateSubject = useUpdateSubject();
  const languageProgress = languageProgressQuery.data;
  const hasFocusedOnceRef = useRef(false);
  const refetchInventory = inventoryQuery.refetch;
  const refetchLanguageProgress = languageProgressQuery.refetch;
  const refetchResumeTarget = resumeTargetQuery.refetch;
  const refetchSubjectProgress = subjectProgressQuery.refetch;

  const subject = inventoryQuery.data?.subjects.find(
    (entry) => entry.subjectId === subjectId,
  );
  const legacyProgress = subjectProgressQuery.data;
  const isLanguageSubject =
    subject?.pedagogyMode === 'four_strands' || !!languageProgress;
  const canResumeSubject = !!resumeTargetQuery.data;

  const openSubjectShelf = (targetSubjectId: string): void => {
    router.push({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: targetSubjectId },
    } as never);
  };

  const handlePrimarySubjectAction = (): void => {
    if (!subject) return;
    if (canResumeSubject && resumeTargetQuery.data) {
      pushLearningResumeTarget(router, resumeTargetQuery.data);
      return;
    }
    openSubjectShelf(subject.subjectId);
  };

  const hideSubject = async (): Promise<void> => {
    if (!subject) return;
    try {
      await updateSubject.mutateAsync({
        subjectId: subject.subjectId,
        status: 'archived',
      });
      router.replace(backFallback as never);
    } catch (err: unknown) {
      platformAlert(t('progress.subject.hideErrorTitle'), formatApiError(err));
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      void refetchInventory();
      void refetchSubjectProgress();
      void refetchResumeTarget();
      void refetchLanguageProgress();
    }, [
      refetchInventory,
      refetchLanguageProgress,
      refetchResumeTarget,
      refetchSubjectProgress,
    ]),
  );

  const confirmHideSubject = (): void => {
    if (!subject) return;
    platformAlert(
      t('progress.subject.hideConfirmTitle', {
        subject: subject.subjectName,
      }),
      t('progress.subject.hideConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('progress.subject.hideConfirmAction'),
          style: 'destructive',
          onPress: () => {
            void hideSubject();
          },
        },
      ],
      { cancelable: true },
    );
  };

  // [M20] Timeout escape for the loading skeleton
  const [skeletonTimedOut, setSkeletonTimedOut] = useState(false);
  useEffect(() => {
    if (!inventoryQuery.isLoading) {
      setSkeletonTimedOut(false);
      return;
    }
    const t = setTimeout(() => setSkeletonTimedOut(true), 20_000);
    return () => clearTimeout(t);
  }, [inventoryQuery.isLoading]);

  // [EP15-C6] Every state must have at least one action. The prior
  // implementation jumped straight to the render tree when `!subjectId`
  // or `!subject` with no "go back" pressable — a genuine dead-end.
  if (!subjectId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="progress-subject-missing"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          {t('progress.subject.noSubjectTitle')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('progress.subject.noSubjectSubtitle')}
        </Text>
        <Pressable
          onPress={() => router.replace(backFallback as never)}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('progress.subject.backToProgress')}
          testID="progress-subject-missing-back"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('progress.subject.backToProgress')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // [EP15-C6] Loading state. Previously the screen rendered immediately
  // with `subject?.subjectName ?? 'Subject progress'` and an empty body,
  // which is indistinguishable from a "this subject is gone" state.
  if (inventoryQuery.isLoading) {
    if (skeletonTimedOut) {
      return (
        <View
          className="flex-1 bg-background"
          style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          <ErrorFallback
            variant="centered"
            title={t('progress.subject.loadingTooLong')}
            message={t('progress.subject.checkConnection')}
            primaryAction={{
              label: t('common.retry'),
              onPress: () => void inventoryQuery.refetch(),
              testID: 'progress-subject-skeleton-timeout-retry',
            }}
            secondaryAction={{
              label: t('common.goBack'),
              onPress: () => goBackOrReplace(router, backFallback),
              testID: 'progress-subject-skeleton-timeout-back',
            }}
            testID="progress-subject-skeleton-timeout"
          />
        </View>
      );
    }
    return (
      <View
        className="flex-1 bg-background px-6 items-center justify-center"
        style={{ paddingTop: insets.top }}
        testID="progress-subject-loading"
      >
        <Text className="text-h3 font-semibold text-text-primary mt-4 text-center">
          {t('progress.subject.loadingTitle')}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-2 text-center">
          {t('progress.subject.loadingMessage')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, backFallback)}
          className="mt-6 rounded-button bg-surface-elevated px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="progress-subject-loading-back"
        >
          <Text className="text-body font-semibold text-text-primary">
            {t('common.goBack')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // [EP15-C6] Error state — query failure gets a retry + go back.
  if (inventoryQuery.isError && !inventoryQuery.data) {
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <ErrorFallback
          variant="centered"
          title={t('progress.subject.errorTitle')}
          message={
            classifyApiError(inventoryQuery.error).category === 'network'
              ? t('progress.subject.errorMessageNetwork')
              : t('progress.subject.errorMessageServer')
          }
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => void inventoryQuery.refetch(),
            testID: 'progress-subject-error-retry',
          }}
          secondaryAction={{
            label: t('common.goBack'),
            onPress: () => router.replace(backFallback as never),
            testID: 'progress-subject-error-back',
          }}
          testID="progress-subject-error"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center mt-4">
          <Pressable
            onPress={() => goBackOrReplace(router, backFallback)}
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="progress-subject-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {subject?.subjectName ?? t('progress.subject.fallbackTitle')}
            </Text>
            {subject?.estimatedProficiencyLabel ||
            subject?.estimatedProficiency ? (
              <Text className="text-body-sm text-text-secondary mt-0.5">
                {subject?.estimatedProficiencyLabel ??
                  subject?.estimatedProficiency}
              </Text>
            ) : null}
          </View>
          {subject ? (
            <Pressable
              onPress={handlePrimarySubjectAction}
              className="bg-primary rounded-button px-4 py-2 ms-2 items-center justify-center min-h-[40px]"
              accessibilityRole="button"
              accessibilityLabel={
                canResumeSubject
                  ? t('progress.subject.resume')
                  : t('progress.subject.chooseNext')
              }
              testID="progress-subject-resume"
            >
              <Text className="text-body-sm font-semibold text-text-inverse">
                {canResumeSubject
                  ? t('progress.subject.resume')
                  : t('progress.subject.chooseNext')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {subject ? (
          <>
            <View className="bg-coaching-card rounded-card p-5 mt-4">
              <Text className="text-h3 font-semibold text-text-primary">
                {subject.topics.total != null && subject.topics.total > 0
                  ? t('progress.subject.topicsMastered', {
                      mastered: subject.topics.mastered,
                      total: subject.topics.total,
                    })
                  : subject.topics.total === 0
                    ? t('progress.subject.noTopicsPlanned')
                    : (() => {
                        const n = Math.max(
                          subject.topics.explored,
                          subject.topics.mastered + subject.topics.inProgress,
                        );
                        return t('progress.subject.topicsExplored', {
                          count: n,
                        });
                      })()}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-2">
                {subject.vocabulary.total > 0
                  ? t('progress.subject.wordsTracked', {
                      count: subject.vocabulary.total,
                    })
                  : t('progress.subject.sessionsCompleted', {
                      count: subject.sessionsCount,
                    })}
              </Text>
              {subject.topics.total != null && subject.topics.total > 0 ? (
                <View className="mt-4">
                  <ProgressBar
                    value={subject.topics.mastered}
                    max={subject.topics.total}
                    testID="progress-subject-bar"
                  />
                </View>
              ) : null}
            </View>

            <View className="flex-row gap-3 mt-4">
              <StatCard
                label={t('progress.subject.statStarted')}
                value={String(subject.topics.inProgress)}
              />
              <StatCard
                label={t('progress.subject.statNotStarted')}
                value={String(subject.topics.notStarted)}
              />
            </View>

            <View className="flex-row gap-3 mt-3">
              <StatCard
                label={t('progress.subject.statTimeSpent')}
                value={formatMinutes(
                  subject.wallClockMinutes || subject.activeMinutes,
                )}
              />
              <StatCard
                label={t('progress.subject.statSessions')}
                value={String(subject.sessionsCount)}
              />
            </View>

            {subject.vocabulary.total > 0 ? (
              <View className="bg-surface rounded-card p-4 mt-4">
                <Text className="text-h3 font-semibold text-text-primary">
                  {t('progress.subject.vocabularyTitle')}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  {t('progress.subject.vocabularyBreakdown', {
                    mastered: subject.vocabulary.mastered,
                    learning: subject.vocabulary.learning,
                    new: subject.vocabulary.new,
                  })}
                </Text>
                <View className="mt-4 gap-2">
                  {Object.entries(subject.vocabulary.byCefrLevel).map(
                    ([level, count]) => (
                      <View
                        key={level}
                        className="flex-row items-center justify-between"
                      >
                        <Text className="text-body-sm text-text-primary">
                          {level}
                        </Text>
                        <Text className="text-body-sm text-text-secondary">
                          {t('progress.subject.wordCount', { count })}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/vocabulary/[subjectId]',
                      params: { subjectId: subject.subjectId },
                    } as never)
                  }
                  className="mt-3 py-2 self-start"
                  accessibilityRole="button"
                  accessibilityLabel={t('progress.subject.viewAllVocab')}
                  testID="vocab-view-all"
                >
                  <Text className="text-body-sm font-semibold text-primary">
                    {t('progress.subject.viewAllVocabLink')}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {isLanguageSubject && (
              <View
                className="bg-coaching-card rounded-card p-5 mt-4"
                testID="cefr-milestone-card"
              >
                <Text className="text-h3 font-semibold text-text-primary">
                  {t('progress.subject.languageMilestone')}
                </Text>

                {languageProgressQuery.isLoading ? (
                  <View className="mt-3">
                    <View className="bg-border rounded h-4 w-2/3 mb-2" />
                    <View className="bg-border rounded h-3 w-full" />
                  </View>
                ) : languageProgressQuery.isError ? (
                  <View className="mt-3">
                    <Text className="text-body-sm text-text-secondary mb-2">
                      {t('progress.subject.milestoneLoadError')}
                    </Text>
                    <Pressable
                      onPress={() => void languageProgressQuery.refetch()}
                      className="bg-surface-elevated rounded-button px-4 py-2.5 self-start min-h-[44px] items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel={t('progress.subject.retryMilestone')}
                      testID="cefr-milestone-retry"
                    >
                      <Text className="text-body-sm font-semibold text-text-primary">
                        {t('common.retry')}
                      </Text>
                    </Pressable>
                  </View>
                ) : languageProgress?.currentMilestone ? (
                  <>
                    <Text className="text-body-sm text-text-secondary mt-1">
                      {languageProgress.currentLevel} ·{' '}
                      {languageProgress.currentMilestone.milestoneTitle}
                    </Text>
                    <View className="mt-3">
                      <View className="flex-row justify-between mb-1">
                        <Text className="text-caption text-text-muted">
                          {t('progress.subject.wordsProgress', {
                            mastered:
                              languageProgress.currentMilestone.wordsMastered,
                            target:
                              languageProgress.currentMilestone.wordsTarget,
                          })}
                        </Text>
                        <Text className="text-caption text-text-muted">
                          {t('progress.subject.phrasesProgress', {
                            mastered:
                              languageProgress.currentMilestone.chunksMastered,
                            target:
                              languageProgress.currentMilestone.chunksTarget,
                          })}
                        </Text>
                      </View>
                      <View className="bg-border rounded-full h-2 overflow-hidden">
                        <View
                          className="bg-primary h-full rounded-full"
                          style={{
                            width: `${Math.round(
                              languageProgress.currentMilestone
                                .milestoneProgress * 100,
                            )}%`,
                          }}
                        />
                      </View>
                    </View>
                    {languageProgress.nextMilestone && (
                      <Text className="text-caption text-text-muted mt-2">
                        {t('progress.subject.upNext', {
                          level: languageProgress.nextMilestone.level,
                          title: languageProgress.nextMilestone.milestoneTitle,
                        })}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text className="text-body-sm text-text-secondary mt-2">
                    {t('progress.subject.milestoneNoData')}
                  </Text>
                )}
              </View>
            )}

            {subjectProgressQuery.isError ? (
              <View
                className="bg-surface rounded-card p-4 mt-4"
                testID="progress-subject-retention-error"
              >
                <Text className="text-h3 font-semibold text-text-primary">
                  {t('progress.subject.retentionTitle')}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1 mb-3">
                  {t('progress.subject.retentionLoadError')}
                </Text>
                <Pressable
                  onPress={() => void subjectProgressQuery.refetch()}
                  className="bg-surface-elevated rounded-button px-4 py-2.5 self-start min-h-[44px] items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel={t('progress.subject.retryRetention')}
                  testID="progress-subject-retention-retry"
                >
                  <Text className="text-body-sm font-semibold text-text-primary">
                    {t('common.retry')}
                  </Text>
                </Pressable>
              </View>
            ) : legacyProgress && subject.sessionsCount > 0 ? (
              <Pressable
                onPress={handlePrimarySubjectAction}
                className="bg-surface rounded-card p-4 mt-4"
                accessibilityRole="button"
                accessibilityLabel={t('progress.subject.retentionTitle')}
                accessibilityHint={
                  canResumeSubject
                    ? t('progress.subject.resume')
                    : t('progress.subject.openShelf')
                }
                testID="progress-subject-retention-card"
              >
                <Text className="text-h3 font-semibold text-text-primary">
                  {t('progress.subject.retentionTitle')}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  {legacyProgress.retentionStatus === 'strong'
                    ? t(`progress.register.${register}.retentionStrong`)
                    : legacyProgress.retentionStatus === 'fading'
                      ? t(`progress.register.${register}.retentionFading`)
                      : t(`progress.register.${register}.retentionWeak`)}
                </Text>
              </Pressable>
            ) : null}

            <View className="flex-row gap-3 mt-6">
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(app)/progress/[subjectId]/sessions',
                    params: { subjectId: subject.subjectId },
                  } as never)
                }
                className="bg-surface rounded-button px-4 py-3 items-center flex-1"
                accessibilityRole="button"
                accessibilityLabel={t('progress.subject.pastConversations')}
                testID="progress-subject-past-conversations"
              >
                <Text className="text-body font-semibold text-text-primary">
                  {t('progress.subject.pastConversations')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => openSubjectShelf(subject.subjectId)}
                className="bg-surface rounded-button px-4 py-3 items-center flex-1"
                accessibilityRole="button"
                accessibilityLabel={t('progress.subject.openShelf')}
              >
                <Text className="text-body font-semibold text-text-primary">
                  {t('progress.subject.openShelf')}
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={confirmHideSubject}
              disabled={updateSubject.isPending}
              className="mt-3 bg-surface rounded-button px-4 py-3 items-center min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('progress.subject.hideSubject')}
              accessibilityHint={t('progress.subject.hideSubjectHint')}
              testID="progress-subject-hide"
            >
              <Text className="text-body font-semibold text-danger">
                {updateSubject.isPending
                  ? t('progress.subject.hidingSubject')
                  : t('progress.subject.hideSubject')}
              </Text>
            </Pressable>
          </>
        ) : (
          // [EP15-C6] Dead-end fix — the prior version showed only text
          // with zero actionable elements. Users scrolling into a deleted
          // subject had nothing to press besides the OS back gesture.
          <View
            className="bg-surface rounded-card p-5 mt-4"
            testID="progress-subject-gone"
          >
            <Text className="text-h3 font-semibold text-text-primary">
              {t('progress.subject.goneTitle')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              {t('progress.subject.goneSubtitle')}
            </Text>
            <Pressable
              onPress={() => router.replace(backFallback as never)}
              className="bg-primary rounded-button px-4 py-3 items-center mt-4 min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('progress.subject.backToProgress')}
              testID="progress-subject-gone-back"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('progress.subject.backToProgress')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
