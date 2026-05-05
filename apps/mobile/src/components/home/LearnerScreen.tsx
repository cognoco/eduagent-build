import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { Profile } from '@eduagent/schemas';
import { BookPageFlipAnimation, ProfileSwitcher } from '../common';
import {
  useMarkQuizDiscoverySurfaced,
  useQuizDiscoveryCard,
} from '../../hooks/use-coaching-card';
import {
  useLearningResumeTarget,
  useOverallProgress,
  useReviewSummary,
} from '../../hooks/use-progress';
import { useSubjects } from '../../hooks/use-subjects';
import { getGreeting } from '../../lib/greeting';
import {
  LEARNER_HOME_HREF,
  LEARNER_HOME_RETURN_TO,
  pushLearningResumeTarget,
} from '../../lib/navigation';
import {
  clearSessionRecoveryMarker,
  isRecoveryMarkerFresh,
  readSessionRecoveryMarker,
  type SessionRecoveryMarker,
} from '../../lib/session-recovery';
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { getSubjectTint } from '../../lib/subject-tints';
import { useTheme } from '../../lib/theme';
import { useThemeColors } from '../../lib/theme';
import { CoachBand } from './CoachBand';
import { SubjectCard } from './SubjectCard';

const HOME_RETURN_PARAMS = { returnTo: LEARNER_HOME_RETURN_TO } as const;

const DEFAULT_SUBJECT_ICON: React.ComponentProps<typeof Ionicons>['name'] =
  'book-outline';

type HomeIntentAction = {
  testID: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  titleKey: string;
  subtitleKey: string;
  route: '/create-subject' | '/(app)/homework/camera' | '/(app)/practice';
  highlight?: boolean;
};

const HOME_INTENT_ACTIONS: HomeIntentAction[] = [
  {
    testID: 'home-action-homework',
    icon: 'camera-outline',
    titleKey: 'home.learner.intentActions.homework.title',
    subtitleKey: 'home.learner.intentActions.homework.subtitle',
    route: '/(app)/homework/camera',
    highlight: true,
  },
  {
    testID: 'home-action-practice',
    icon: 'refresh-outline',
    titleKey: 'home.learner.intentActions.practice.title',
    subtitleKey: 'home.learner.intentActions.practice.subtitle',
    route: '/(app)/practice',
  },
  {
    testID: 'home-action-study-new',
    icon: 'book-outline',
    titleKey: 'home.learner.intentActions.studyNew.title',
    subtitleKey: 'home.learner.intentActions.studyNew.subtitle',
    route: '/create-subject',
  },
];

export interface LearnerScreenProps {
  profiles: Profile[];
  activeProfile: Profile | null;
  switchProfile: (
    profileId: string
  ) => Promise<{ success: boolean; error?: string }>;
  onBack?: () => void;
  now?: Date;
}

export function LearnerScreen({
  profiles,
  activeProfile,
  switchProfile,
  onBack,
  now,
}: LearnerScreenProps): React.ReactElement {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { colorScheme } = useTheme();
  const { data: subjects, isLoading, isError, refetch } = useSubjects();
  const { data: resumeTarget } = useLearningResumeTarget();
  const { data: reviewSummary } = useReviewSummary();
  const { data: overallProgress } = useOverallProgress();
  const { data: quizDiscovery } = useQuizDiscoveryCard();
  const markQuizDiscoverySurfaced = useMarkQuizDiscoverySurfaced();
  const [recoveryMarker, setRecoveryMarker] =
    useState<SessionRecoveryMarker | null>(null);
  const [dismissedQuizDiscoveryId, setDismissedQuizDiscoveryId] = useState<
    string | null
  >(null);
  const isParentProxy = Boolean(
    activeProfile && !activeProfile.isOwner && profiles.some((p) => p.isOwner)
  );

  const [coachBandDismissed, setCoachBandDismissed] = useState(false);

  const dismissCoachBand = useCallback(() => {
    setCoachBandDismissed(true);
  }, []);

  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecoveryMarker(): Promise<void> {
      try {
        const marker = await readSessionRecoveryMarker(activeProfile?.id);
        if (cancelled) return;

        if (marker && isRecoveryMarkerFresh(marker)) {
          setRecoveryMarker((current) =>
            current?.sessionId === marker.sessionId &&
            current?.updatedAt === marker.updatedAt
              ? current
              : marker
          );
          return;
        }

        setRecoveryMarker((current) => (current === null ? current : null));
        if (marker) {
          void clearSessionRecoveryMarker(activeProfile?.id).catch((err) =>
            console.error('[LearnerScreen] stale marker cleanup failed:', err)
          );
        }
      } catch {
        if (!cancelled) {
          setRecoveryMarker((current) => (current === null ? current : null));
        }
      }
    }

    void loadRecoveryMarker();

    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id]);

  useEffect(() => {
    setDismissedQuizDiscoveryId(null);
  }, [activeProfile?.id, quizDiscovery?.id]);

  const { subtitle } = getGreeting(activeProfile?.displayName ?? '', now);

  const markQuizDiscoveryHandled = useCallback(() => {
    if (!quizDiscovery) return;
    setDismissedQuizDiscoveryId(quizDiscovery.id);
    markQuizDiscoverySurfaced.mutate(quizDiscovery.activityType);
  }, [markQuizDiscoverySurfaced, quizDiscovery]);

  const subjectCards = useMemo(() => {
    if (!subjects?.length) return [];
    const progressBySubject = new Map(
      (overallProgress?.subjects ?? []).map((p) => [p.subjectId, p])
    );
    return subjects
      .filter((s) => s.status === 'active')
      .map((s) => {
        const progress = progressBySubject.get(s.id);
        const tint = getSubjectTint(s.id, colorScheme);
        const total = progress?.topicsTotal ?? 0;
        const completed = progress?.topicsCompleted ?? 0;

        let hint = 'Open';
        if (
          resumeTarget?.subjectId === s.id &&
          ['active_session', 'paused_session'].includes(resumeTarget.resumeKind)
        ) {
          hint = `Continue ${resumeTarget.topicTitle ?? s.name}`;
        } else if (reviewSummary?.nextReviewTopic?.subjectId === s.id) {
          hint = `Quiz: ${reviewSummary.nextReviewTopic.topicTitle}`;
        } else if (completed > 0) {
          hint = `Practice: ${s.name}`;
        }

        return {
          subjectId: s.id,
          name: s.name,
          hint,
          progress: total > 0 ? completed / total : 0,
          topicsCompleted: completed,
          topicsTotal: total,
          tintSolid: tint.solid,
          tintSoft: tint.soft,
          icon: DEFAULT_SUBJECT_ICON,
        };
      });
  }, [subjects, overallProgress, resumeTarget, reviewSummary, colorScheme]);

  const coachBand = useMemo(() => {
    if (isParentProxy) return null;

    if (recoveryMarker) {
      return {
        headline: `Pick up where you stopped in ${
          recoveryMarker.topicName ??
          recoveryMarker.subjectName ??
          'your session'
        }.`,
        onContinue: () => {
          void clearSessionRecoveryMarker(activeProfile?.id).catch((err) =>
            console.error(
              '[LearnerScreen] clearSessionRecoveryMarker failed:',
              err
            )
          );
          router.push({
            pathname: '/(app)/session',
            params: {
              sessionId: recoveryMarker.sessionId,
              ...(recoveryMarker.subjectId && {
                subjectId: recoveryMarker.subjectId,
              }),
              ...(recoveryMarker.subjectName && {
                subjectName: recoveryMarker.subjectName,
              }),
              ...(recoveryMarker.mode && { mode: recoveryMarker.mode }),
              ...(recoveryMarker.topicId && {
                topicId: recoveryMarker.topicId,
              }),
              ...(recoveryMarker.topicName && {
                topicName: recoveryMarker.topicName,
              }),
              ...HOME_RETURN_PARAMS,
            },
          } as never);
        },
      };
    }

    if (resumeTarget) {
      return {
        headline: `Pick up where you left off in ${
          resumeTarget.topicTitle ?? resumeTarget.subjectName
        }.`,
        onContinue: () =>
          pushLearningResumeTarget(
            router,
            resumeTarget,
            LEARNER_HOME_RETURN_TO
          ),
      };
    }

    if (
      reviewSummary &&
      reviewSummary.totalOverdue > 0 &&
      reviewSummary.nextReviewTopic
    ) {
      const topic = reviewSummary.nextReviewTopic;
      return {
        headline: `Revisit ${topic.topicTitle} — it's starting to fade.`,
        onContinue: () =>
          router.push({
            pathname: '/(app)/topic/relearn',
            params: HOME_RETURN_PARAMS,
          } as never),
      };
    }

    if (quizDiscovery && dismissedQuizDiscoveryId !== quizDiscovery.id) {
      return {
        headline: quizDiscovery.title,
        onContinue: () => {
          markQuizDiscoveryHandled();
          router.push({
            pathname: '/(app)/quiz',
            params: {
              activityType: quizDiscovery.activityType,
              ...HOME_RETURN_PARAMS,
            },
          } as never);
        },
      };
    }

    return null;
  }, [
    activeProfile?.id,
    dismissedQuizDiscoveryId,
    isParentProxy,
    markQuizDiscoveryHandled,
    quizDiscovery,
    recoveryMarker,
    resumeTarget,
    reviewSummary,
  ]);

  const openIntentAction = useCallback(
    (route: HomeIntentAction['route']): void => {
      if (route === '/(app)/homework/camera') {
        // Seed the back stack before the nested camera route. There is no
        // homework index screen, so Home is the clear return target.
        router.push(LEARNER_HOME_HREF as never);
      }

      router.push({
        pathname: route,
        params: HOME_RETURN_PARAMS,
      } as never);
    },
    []
  );

  if (isLoading) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        testID="learner-loading-state"
      >
        <BookPageFlipAnimation size={140} />
        {loadingTimedOut && (
          <View className="mt-6 items-center" testID="learner-loading-timeout">
            <Text className="text-body text-text-secondary text-center">
              Taking longer than usual...
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-3 min-h-[44px] items-center justify-center rounded-button bg-primary px-6 py-2"
              testID="learner-loading-retry"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Retry
              </Text>
            </Pressable>
            {onBack ? (
              <Pressable
                onPress={onBack}
                className="mt-2 min-h-[44px] items-center justify-center px-6 py-2"
                testID="learner-loading-go-back"
              >
                <Text className="text-body text-text-secondary">Go back</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.replace('/(app)/home' as never)}
                className="mt-2 min-h-[44px] items-center justify-center px-6 py-2"
                testID="learner-loading-go-home"
              >
                <Text className="text-body text-text-secondary">Go home</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    );
  }

  if (isError && !subjects) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        testID="learner-error-state"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          We couldn't load your library right now
        </Text>
        <Pressable
          onPress={() => void refetch()}
          className="min-h-[44px] px-6 items-center justify-center bg-surface rounded-card"
          accessibilityRole="button"
          accessibilityLabel="Retry loading library"
        >
          <Text className="text-body font-semibold text-text-primary">
            Retry
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  const firstName = activeProfile?.displayName?.split(' ')[0] ?? 'there';
  const showCoachBand =
    FEATURE_FLAGS.COACH_BAND_ENABLED && coachBand && !coachBandDismissed;

  return (
    <View className="flex-1 bg-background" testID="learner-screen">
      <View
        className="flex-row items-center justify-between px-5"
        style={{
          paddingTop: insets.top + 16,
          zIndex: 10,
          elevation: 10,
        }}
      >
        <View className="flex-row items-center flex-1 me-3">
          {onBack ? (
            <Pressable
              onPress={onBack}
              className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="learner-back"
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={colors.textPrimary}
              />
            </Pressable>
          ) : null}
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary leading-tight">
              Hey {firstName}!
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {subtitle}
            </Text>
          </View>
        </View>
        <ProfileSwitcher
          profiles={profiles}
          activeProfileId={activeProfile?.id}
          onSwitch={switchProfile}
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {showCoachBand && (
          <View>
            <Text className="text-caption font-bold uppercase text-text-tertiary px-5 mt-4 mb-2">
              {t('home.learner.recommended')}
            </Text>
            <CoachBand
              headline={coachBand.headline}
              now={now}
              onContinue={coachBand.onContinue}
              onDismiss={dismissCoachBand}
            />
          </View>
        )}

        {!isParentProxy && (
          <View className={showCoachBand ? 'mt-1' : 'mt-5'}>
            <Text className="text-h3 font-bold text-text-primary px-5 mb-2">
              {t('home.learner.intentHeading')}
            </Text>
            <View className="px-5" style={{ gap: 10 }}>
              {HOME_INTENT_ACTIONS.map((action) => {
                const title = t(action.titleKey);
                const subtitle = t(action.subtitleKey);

                return (
                  <Pressable
                    key={action.testID}
                    testID={action.testID}
                    onPress={() => openIntentAction(action.route)}
                    className={`rounded-2xl border px-4 py-4 flex-row items-center ${
                      action.highlight
                        ? 'bg-primary-soft border-primary/40'
                        : 'bg-surface border-border'
                    }`}
                    style={{ gap: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}. ${subtitle}`}
                  >
                    <View className="w-11 h-11 rounded-2xl bg-surface-elevated items-center justify-center">
                      <Ionicons
                        name={action.icon}
                        size={22}
                        color={colors.primary}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-body font-bold text-text-primary">
                        {title}
                      </Text>
                      <Text className="text-body-sm text-text-secondary mt-1">
                        {subtitle}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                );
              })}
            </View>

            <View className="px-5 mt-3">
              <Pressable
                testID="home-ask-anything"
                onPress={() =>
                  router.push({
                    pathname: '/(app)/session',
                    params: { mode: 'freeform', ...HOME_RETURN_PARAMS },
                  } as never)
                }
                className="rounded-2xl bg-surface border border-border pl-4 pr-1.5 py-2.5 flex-row items-center"
                style={{ gap: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('home.learner.askAnythingLabel')}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={14}
                  color={colors.muted}
                />
                <Text className="flex-1 text-body-sm text-text-tertiary">
                  {t('home.learner.askAnythingPlaceholder')}
                </Text>
                <View className="w-8 h-8 rounded-full bg-surface-elevated items-center justify-center">
                  <Ionicons name="mic-outline" size={14} color={colors.muted} />
                </View>
              </Pressable>
            </View>
          </View>
        )}

        <View className={!isParentProxy ? 'mt-5' : 'mt-4'}>
          {subjectCards.length > 0 ? (
            <>
              <Text className="text-caption font-bold uppercase text-text-tertiary px-5 mb-2.5">
                {t('home.learner.yourSubjects')}
              </Text>
              <ScrollView
                testID="home-subject-carousel"
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
              >
                {subjectCards.map((card) => (
                  <SubjectCard
                    key={card.subjectId}
                    {...card}
                    testID={`home-subject-card-${card.subjectId}`}
                    onPress={() => {
                      // Two-push pattern (CLAUDE.md cross-tab rule):
                      // unstable_settings only seeds one level deep, so push
                      // the progress index first then the subject child to
                      // keep router.back() landing on the progress tab root.
                      router.push('/(app)/progress' as never);
                      router.push({
                        pathname: '/(app)/progress/[subjectId]',
                        params: { subjectId: card.subjectId },
                      } as never);
                    }}
                  />
                ))}
                {!isParentProxy && (
                  <Pressable
                    testID="home-add-subject-tile"
                    onPress={() =>
                      router.push({
                        pathname: '/create-subject',
                        params: HOME_RETURN_PARAMS,
                      } as never)
                    }
                    className="rounded-2xl border border-dashed border-border items-center justify-center"
                    style={{ width: 96, height: 150, gap: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.learner.newSubject')}
                  >
                    <Text className="text-h3 text-text-tertiary opacity-70">
                      +
                    </Text>
                    <Text className="text-caption font-bold text-text-tertiary">
                      {t('home.learner.newSubject')}
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            </>
          ) : (
            !isParentProxy && (
              <View
                testID="home-empty-subjects"
                className="mx-5 rounded-2xl border border-dashed border-border items-center justify-center py-7"
                style={{ gap: 10 }}
              >
                <Ionicons
                  name="book-outline"
                  size={30}
                  color={colors.textSecondary}
                  style={{ opacity: 0.6 }}
                />
                <Text className="text-body-sm font-semibold text-text-primary text-center px-6">
                  {t('home.learner.emptySubjectsTitle')}
                </Text>
                <Text className="text-body-sm text-text-secondary text-center px-6">
                  {t('home.learner.emptySubjectsMessage')}
                </Text>
                <Pressable
                  testID="home-add-first-subject"
                  onPress={() =>
                    router.push({
                      pathname: '/create-subject',
                      params: HOME_RETURN_PARAMS,
                    } as never)
                  }
                  className="bg-primary rounded-xl px-5 py-2.5 mt-1"
                  accessibilityRole="button"
                  accessibilityLabel={t('home.learner.addSubject')}
                >
                  <Text className="text-body-sm font-bold text-text-inverse">
                    {t('home.learner.addSubject')}
                  </Text>
                </Pressable>
              </View>
            )
          )}
        </View>

        {isParentProxy && (
          <View testID="intent-proxy-placeholder" className="px-5 mt-4">
            <Text className="text-body text-text-secondary text-center">
              Sessions are private to{' '}
              {activeProfile?.displayName ?? 'this learner'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
