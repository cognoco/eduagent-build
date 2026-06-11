import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { isAdultOwner, type Profile } from '@eduagent/schemas';
import { BookPageFlipAnimation } from '../common';
import {
  useMarkQuizDiscoverySurfaced,
  useQuizDiscoveryCard,
} from '../../hooks/use-coaching-card';
import {
  useLearningResumeTarget,
  useOverallProgress,
  useProgressInventory,
  useReviewSummary,
} from '../../hooks/use-progress';
import { useDashboard } from '../../hooks/use-dashboard';
import { isInGracePeriod } from '../../lib/consent-grace';
import { useSubjects } from '../../hooks/use-subjects';
import { getGreeting } from '../../lib/greeting';
import { useHasLinkedChildren, useProfile } from '../../lib/profile';
import {
  childProfileHref,
  LEARNER_HOME_RETURN_TO,
  pushLearningResumeTarget,
} from '../../lib/navigation';
import { resolveLoadingMotionPreset } from '../../lib/motion-presets';
import {
  clearSessionRecoveryMarker,
  isRecoveryMarkerFresh,
  readSessionRecoveryMarker,
  type SessionRecoveryMarker,
} from '../../lib/session-recovery';
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { useEnsureStudyMode } from '../../lib/use-mode-switch';
import { useNavigationHomeContract } from '../../hooks/use-navigation-contract';
import { useSubscriptionStatus } from '../../hooks/use-subscription';
import { getSubjectTint, getSubjectTintMap } from '../../lib/subject-tints';
import { useTheme } from '../../lib/theme';
import { useThemeColors } from '../../lib/theme';
import {
  WithdrawalCountdownBanner,
  type ChildInGracePeriod,
} from '../family/WithdrawalCountdownBanner';
import { NudgeBanner } from '../nudge/NudgeBanner';
import { CoachBand } from './CoachBand';
import { ChildQuotaLine } from './ChildQuotaLine';
import { EarlyAdopterCard } from './EarlyAdopterCard';
import { ParentHomeScreen } from './ParentHomeScreen';
import { SubjectTile } from './SubjectTile';
import type { TranslateKey } from '../../i18n';

const CREATE_SUBJECT_FROM_HOME_HREF = '/create-subject' as const;

type HomeIntentAction = {
  testID: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  titleKey: TranslateKey;
  subtitleKey: TranslateKey;
  route:
    | '/create-subject'
    | '/(app)/homework/camera'
    | '/(app)/practice'
    | '/(app)/session';
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
    testID: 'home-ask-anything',
    icon: 'chatbubble-ellipses-outline',
    titleKey: 'home.learner.askAnythingLabel',
    subtitleKey: 'home.learner.askAnythingSubtitle',
    route: '/(app)/session',
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
  now?: Date;
  showParentHome?: boolean;
  returnToTab?: string;
}

export function LearnerScreen({
  activeProfile,
  now,
  showParentHome = true,
  returnToTab = LEARNER_HOME_RETURN_TO,
}: LearnerScreenProps): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { colorScheme } = useTheme();
  const { data: subjects, isLoading, isError, refetch } = useSubjects();
  const { data: resumeTarget } = useLearningResumeTarget();
  const { data: reviewSummary } = useReviewSummary();
  const { data: overallProgress } = useOverallProgress();
  const { data: progressInventory } = useProgressInventory();
  const { data: dashboard } = useDashboard();
  const { data: quizDiscovery } = useQuizDiscoveryCard();
  const { switchProfile } = useProfile();
  const hasLinkedChildren = useHasLinkedChildren();
  const ensureStudyMode = useEnsureStudyMode();
  const navigationHome = useNavigationHomeContract();
  const navigationContract = navigationHome.contract;
  const navigationProxy = navigationHome.proxy;
  const { data: subscriptionStatus } = useSubscriptionStatus({
    enabled: true,
  });
  const hasFamilyPlan =
    subscriptionStatus?.tier === 'family' || subscriptionStatus?.tier === 'pro';
  // [HOME-07] Adult owner without children has no Family setup entry on Home.
  // Surface a Family setup CTA on the learner home when the contract permits
  // adding a child (gates.showAddChild already encodes: isAdultOwner &&
  // ownerRole && !isParentProxy &&, in V1, subscriptionReady) and no children
  // are linked yet. Route to /(app)/more so the existing handleAddChild flow
  // owns subscription/quota gating — never duplicate that logic here.
  const familySetupFallback =
    isAdultOwner(activeProfile) && hasFamilyPlan && !navigationProxy.active;
  const showFamilySetupCta =
    (navigationContract.gates.showAddChild || familySetupFallback) &&
    !hasLinkedChildren;
  const screenLoadingMotion = resolveLoadingMotionPreset({
    surface: 'screen',
    contentDensity: 'sparse',
  });
  const markQuizDiscoverySurfaced = useMarkQuizDiscoverySurfaced();
  const [recoveryMarker, setRecoveryMarker] =
    useState<SessionRecoveryMarker | null>(null);
  const [dismissedQuizDiscoveryId, setDismissedQuizDiscoveryId] = useState<
    string | null
  >(null);
  const [coachBandDismissed, setCoachBandDismissed] = useState(false);
  const totalTopicsCompleted = overallProgress?.totalTopicsCompleted ?? null;
  const totalSessions = progressInventory?.global.totalSessions ?? 0;
  const childrenInGracePeriod = useMemo((): ChildInGracePeriod[] => {
    return (dashboard?.children ?? []).flatMap((child) => {
      if (
        child.consentStatus === 'WITHDRAWN' &&
        child.respondedAt != null &&
        isInGracePeriod(child.respondedAt)
      ) {
        return [
          {
            profileId: child.profileId,
            displayName: child.displayName,
            respondedAt: child.respondedAt,
          },
        ];
      }
      return [];
    });
  }, [dashboard]);
  const returnParams = useMemo(
    () => ({ returnTo: returnToTab }),
    [returnToTab],
  );

  const dismissCoachBand = useCallback(() => {
    setCoachBandDismissed(true);
  }, []);

  const openParentSessionSummaries = useCallback(async () => {
    if (!activeProfile || !navigationProxy.parentProfileId) return;

    const childProfileId = activeProfile.id;
    const result = await switchProfile(navigationProxy.parentProfileId);
    if (!result.success) return;

    router.push(childProfileHref(childProfileId));
  }, [activeProfile, navigationProxy.parentProfileId, router, switchProfile]);

  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const subjectsLoadFailed = isError && !subjects;
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
              : marker,
          );
          return;
        }

        setRecoveryMarker((current) => (current === null ? current : null));
        if (marker) {
          void clearSessionRecoveryMarker(activeProfile?.id).catch((err) =>
            console.error('[LearnerScreen] stale marker cleanup failed:', err),
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
    const activeSubjects = subjects.filter((s) => s.status === 'active');
    const subjectTintsById = getSubjectTintMap(
      activeSubjects.map((s) => s.id),
      colorScheme,
    );
    const progressBySubject = new Map(
      (overallProgress?.subjects ?? []).map((p) => [p.subjectId, p]),
    );
    return activeSubjects.map((s) => {
      const progress = progressBySubject.get(s.id);
      const tint =
        subjectTintsById.get(s.id) ?? getSubjectTint(s.id, colorScheme);
      const total = progress?.topicsTotal ?? 0;
      const completed = progress?.topicsCompleted ?? 0;

      const isPreparing = s.curriculumStatus === 'preparing';
      let hint = isPreparing ? `Setting up ${s.name}...` : 'Open';
      if (
        !isPreparing &&
        resumeTarget?.subjectId === s.id &&
        ['active_session', 'paused_session'].includes(resumeTarget.resumeKind)
      ) {
        hint = `Continue ${resumeTarget.topicTitle ?? s.name}`;
      } else if (
        !isPreparing &&
        reviewSummary?.nextReviewTopic?.subjectId === s.id
      ) {
        hint = `Quiz: ${reviewSummary.nextReviewTopic.topicTitle}`;
      } else if (!isPreparing && completed > 0) {
        hint = `Practice: ${s.name}`;
      }

      return {
        subjectId: s.id,
        name: s.name,
        hint,
        isPreparing,
        progress: total > 0 ? completed / total : 0,
        topicsCompleted: completed,
        topicsTotal: total,
        tintSolid: tint.solid,
        tintSoft: tint.soft,
      };
    });
  }, [subjects, overallProgress, resumeTarget, reviewSummary, colorScheme]);

  const coachBand = useMemo(() => {
    if (navigationProxy.active) return null;

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
              err,
            ),
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
              ...returnParams,
            },
          } as Href);
        },
      };
    }

    if (resumeTarget) {
      return {
        headline: `Pick up where you left off in ${
          resumeTarget.topicTitle ?? resumeTarget.subjectName
        }.`,
        onContinue: () =>
          pushLearningResumeTarget(router, resumeTarget, returnToTab),
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
            params: returnParams,
          } as Href),
      };
    }

    if (quizDiscovery && dismissedQuizDiscoveryId !== quizDiscovery.id) {
      return {
        headline: quizDiscovery.title,
        onContinue: () => {
          markQuizDiscoveryHandled();
          // [QUIZ-16] capitals/guess_who carry no subject, so route straight to
          // /quiz/launch — it honors the activityType route param and starts the
          // round the card advertised. Pushing /quiz (the picker) dropped
          // activityType and forced the learner to re-pick. Vocabulary rounds
          // need a language subject the discovery card doesn't carry
          // (generate-round throws VocabularyContextError without languageCode),
          // so those still land on the picker to choose the subject.
          router.push(
            quizDiscovery.activityType === 'vocabulary'
              ? ({
                  pathname: '/(app)/quiz',
                  params: { ...returnParams },
                } as Href)
              : ({
                  pathname: '/(app)/quiz/launch',
                  params: {
                    activityType: quizDiscovery.activityType,
                    ...returnParams,
                  },
                } as Href),
          );
        },
      };
    }

    return null;
  }, [
    activeProfile?.id,
    dismissedQuizDiscoveryId,
    markQuizDiscoveryHandled,
    navigationProxy.active,
    quizDiscovery,
    recoveryMarker,
    resumeTarget,
    returnParams,
    returnToTab,
    router,
    reviewSummary,
  ]);

  const openIntentAction = useCallback(
    (route: HomeIntentAction['route']): void => {
      // [CR-2026-05-19-H29] Single push, no home pre-seed. The camera screen
      // itself uses router.replace(homeHrefForReturnTo(returnTo)) on close, so
      // back/close behavior does not rely on the cross-tab back stack — it
      // navigates to the explicit returnTo target. Previously this seeded
      // homeHref before camera to work around the 1-deep cross-stack issue,
      // but that doesn't actually seed the camera's back stack (pushing a tab
      // route while on it behaves like a tab switch, not a stack push).
      router.push({
        pathname: route,
        params:
          route === '/(app)/session'
            ? { mode: 'freeform', ...returnParams }
            : returnParams,
      } as Href);
    },
    [returnParams, router],
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
        <BookPageFlipAnimation size={screenLoadingMotion.size} />
        {loadingTimedOut && (
          <View className="mt-6 items-center" testID="learner-loading-timeout">
            <Text className="text-body text-text-secondary text-center">
              {t('learnerHomeTimeout.loading')}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-3 min-h-[44px] items-center justify-center rounded-button bg-primary px-6 py-2"
              testID="learner-loading-retry"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('learnerHomeTimeout.retry')}
              </Text>
            </Pressable>
            {/* [HOME-08] Replace the self-referential "Go home" (which is this
                screen) with escape routes that actually change state — matching
                the recovery pattern already used in home.tsx:119. Library is
                only in STUDY_TABS, so ensureStudyMode switches family-mode
                users to study first; the helper is a no-op otherwise. */}
            <Pressable
              onPress={() =>
                ensureStudyMode(() => router.replace('/(app)/library' as Href))
              }
              className="mt-2 min-h-[44px] items-center justify-center px-6 py-2"
              testID="learner-loading-go-library"
            >
              <Text className="text-body text-primary font-medium">
                {t('learnerHomeTimeout.goToLibrary')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.replace('/(app)/more' as Href)}
              className="min-h-[44px] items-center justify-center px-6 py-2"
              testID="learner-loading-go-more"
            >
              <Text className="text-body text-primary font-medium">
                {t('learnerHomeTimeout.moreOptions')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    );
  }

  const firstName = activeProfile?.displayName?.split(' ')[0];
  const showCoachBand =
    FEATURE_FLAGS.COACH_BAND_ENABLED && coachBand && !coachBandDismissed;
  const showLearningActions = navigationContract.gates.showLearningActions;

  if (showParentHome && navigationContract.gates.showFamilyHome) {
    return <ParentHomeScreen activeProfile={activeProfile} now={now} />;
  }

  return (
    <View className="flex-1 bg-background" testID="learner-screen">
      <View className="px-5" style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-row items-center">
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary leading-tight">
              {firstName
                ? t('home.learner.greeting', { name: firstName })
                : t('home.learner.greetingNoName')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {subtitle}
            </Text>
            {showLearningActions ? (
              <ChildQuotaLine totalTopicsCompleted={totalTopicsCompleted} />
            ) : null}
          </View>
          {showLearningActions ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(app)/my-notes',
                  params: { returnTo: returnToTab },
                } as Href)
              }
              className="min-h-[56px] min-w-[64px] rounded-card bg-highlight-bg items-center justify-center px-2"
              accessibilityRole="button"
              accessibilityLabel="Open My Notes"
              testID="home-my-notes"
            >
              <Ionicons
                name="document-text-outline"
                size={21}
                color={colors.highlightFg}
              />
              <Text
                className="text-caption font-semibold text-highlight-fg mt-0.5"
                numberOfLines={1}
              >
                {t('home.learner.myNotes')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <EarlyAdopterCard totalSessions={totalSessions} />
        {showLearningActions ? <NudgeBanner /> : null}

        {showCoachBand && (
          <View>
            <Text className="text-caption font-bold uppercase text-text-secondary px-5 mt-4 mb-2">
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

        <View className="px-5">
          <WithdrawalCountdownBanner
            childrenInGracePeriod={childrenInGracePeriod}
          />
        </View>

        {showLearningActions && (
          <View className={showCoachBand ? 'mt-1' : 'mt-5'}>
            <Text className="text-h3 font-bold text-text-primary px-5 mb-2">
              {t('home.learner.intentHeading')}
            </Text>
            <View className="px-5" style={{ gap: 8 }}>
              {HOME_INTENT_ACTIONS.map((action) => {
                const title = t(action.titleKey);
                const subtitle = t(action.subtitleKey);

                return (
                  <Pressable
                    key={action.testID}
                    testID={action.testID}
                    onPress={() => openIntentAction(action.route)}
                    className={`rounded-2xl border px-4 py-3 flex-row items-center ${
                      action.highlight
                        ? 'bg-primary-soft border-primary/40'
                        : 'bg-surface border-border'
                    }`}
                    style={{ gap: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}. ${subtitle}`}
                  >
                    <View className="w-10 h-10 rounded-2xl bg-surface-elevated items-center justify-center">
                      <Ionicons
                        name={action.icon}
                        size={21}
                        color={colors.primary}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-body font-bold text-text-primary">
                        {title}
                      </Text>
                      <Text
                        className="text-body-sm text-text-secondary mt-0.5"
                        numberOfLines={2}
                      >
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
          </View>
        )}

        <View className={showLearningActions ? 'mt-5' : 'mt-4'}>
          {subjectCards.length > 0 ? (
            <>
              <Text className="text-caption font-bold uppercase text-text-secondary px-5 mb-2.5">
                {t('home.learner.yourSubjects')}
              </Text>
              <ScrollView
                testID="home-subject-carousel"
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
              >
                {subjectCards.map((card) => (
                  <SubjectTile
                    key={card.subjectId}
                    {...card}
                    testID={`home-subject-card-${card.subjectId}`}
                    onPress={
                      card.isPreparing
                        ? undefined
                        : () => {
                            router.push({
                              pathname: '/(app)/shelf/[subjectId]',
                              params: {
                                subjectId: card.subjectId,
                                returnTo: returnToTab,
                              },
                            } as Href);
                          }
                    }
                  />
                ))}
                {showLearningActions && (
                  <Pressable
                    testID="home-add-subject-tile"
                    onPress={() =>
                      router.push({
                        pathname: CREATE_SUBJECT_FROM_HOME_HREF,
                        params: { returnTo: returnToTab },
                      } as Href)
                    }
                    className="rounded-2xl border border-dashed border-border items-center justify-center"
                    style={{ width: 96, height: 150, gap: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.learner.newSubject')}
                  >
                    <Text className="text-h3 text-primary opacity-80">+</Text>
                    <Text className="text-caption font-bold text-text-primary">
                      {t('home.learner.newSubject')}
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            </>
          ) : showLearningActions ? (
            subjectsLoadFailed ? (
              <View
                testID="home-subjects-load-error"
                className="mx-5 rounded-2xl border border-border bg-surface items-center justify-center py-7"
                style={{ gap: 10 }}
              >
                <Ionicons
                  name="cloud-offline-outline"
                  size={30}
                  color={colors.textSecondary}
                  style={{ opacity: 0.65 }}
                />
                <Text className="text-body-sm font-semibold text-text-primary text-center px-6">
                  {t('home.learner.subjectsLoadError')}
                </Text>
                <Text className="text-body-sm text-text-secondary text-center px-6">
                  {t('home.learner.subjectsLoadErrorHint')}
                </Text>
                <Pressable
                  testID="home-subjects-load-retry"
                  onPress={() => void refetch()}
                  className="bg-surface-elevated rounded-xl px-5 py-2.5 mt-1"
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading subjects"
                >
                  <Text className="text-body-sm font-bold text-text-primary">
                    {t('common.retry')}
                  </Text>
                </Pressable>
              </View>
            ) : (
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
                      pathname: CREATE_SUBJECT_FROM_HOME_HREF,
                      params: { returnTo: returnToTab },
                    } as Href)
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
          ) : null}
        </View>

        {showFamilySetupCta && (
          <View className="px-5 mt-4" testID="home-family-setup-cta">
            <Pressable
              onPress={() => router.push('/(app)/more' as Href)}
              className="rounded-2xl border border-primary/40 bg-primary-soft px-4 py-4 flex-row items-center"
              style={{ gap: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('home.learner.familySetup.cta')}
              testID="home-family-setup-cta-button"
            >
              <View className="w-10 h-10 rounded-2xl bg-surface-elevated items-center justify-center">
                <Ionicons
                  name="people-outline"
                  size={21}
                  color={colors.primary}
                />
              </View>
              <View className="flex-1">
                <Text className="text-body font-bold text-text-primary">
                  {t('home.learner.familySetup.title')}
                </Text>
                <Text
                  className="text-body-sm text-text-secondary mt-0.5"
                  numberOfLines={2}
                >
                  {t('home.learner.familySetup.subtitle')}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
        )}

        {navigationProxy.active && (
          <View testID="intent-proxy-placeholder" className="px-5 mt-4">
            <View className="rounded-card bg-primary-soft px-4 py-4">
              <Text className="text-body font-semibold text-text-primary">
                {t('home.learner.proxySessionSummariesTitle', {
                  name: activeProfile?.displayName ?? 'this learner',
                })}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-1">
                {t('home.learner.proxySessionSummariesBody', {
                  name: activeProfile?.displayName ?? 'this learner',
                })}
              </Text>
              {navigationProxy.parentProfileId ? (
                <Pressable
                  onPress={() => void openParentSessionSummaries()}
                  className="self-start rounded-button bg-primary px-4 py-3 mt-3"
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'home.learner.proxySessionSummariesCta',
                    {
                      name: activeProfile?.displayName ?? 'this learner',
                    },
                  )}
                  testID="proxy-view-session-summaries"
                >
                  <Text className="text-body-sm font-semibold text-text-inverse">
                    {t('home.learner.proxySessionSummariesCta', {
                      name: activeProfile?.displayName ?? 'this learner',
                    })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
