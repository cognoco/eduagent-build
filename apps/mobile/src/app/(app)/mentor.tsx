import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import type { NowCard, NowDeepLink, NowResponse } from '@eduagent/schemas';

import {
  ColdStartCard,
  LightPracticeAffordance,
  MentorCelebration,
  MentorInputBar,
  NowCardStack,
  OnTrackBadge,
  RewardReceiptCard,
  getNowCardDismissKey,
  type LightPracticeRoute,
  type NowCardArcState,
  type RewardReceipt,
} from '../../components/mentor';
import { SupportHubMentorTab } from '../../components/support';
import { ErrorFallback } from '../../components/common';
import {
  useEligibleManagedPersons,
  type EligibleManagedPerson,
} from '../../hooks/use-eligible-supportees';
import { useAnnounce } from '../../hooks/use-announce';
import {
  useMentorNoticeActions,
  useNowFeed,
  useNowOverflow,
  type NowFeedQueryResult,
} from '../../hooks/use-now-feed';
import { useSubjectsIndex } from '../../hooks/use-subjects-index';
import { matchBarIntent } from '../../lib/bar-intent-match';
import { hasFirstRealState } from '../../lib/first-real-state';
import { getVoiceLocaleForLanguage } from '../../lib/language-locales';
import { useProfile } from '../../lib/profile';
import {
  pushAddChildForSupport,
  pushLinkInitiateForManagedPerson,
  pushLinkInitiatePicker,
} from '../../lib/navigation';
import { pushNowDeepLink } from '../../lib/now-deep-link';
import { useScopeContext } from '../../lib/scope-context';
import { isSchoolDayEvening } from '../../lib/school-day-evening';

function resumeDeepLinkFromCache(
  feed: NowResponse | undefined,
): NowDeepLink | null {
  const unfinished = feed?.cards.find(
    (card) => card.kind === 'unfinished_session',
  );
  return unfinished?.deepLink ?? null;
}

function countReviewsDue(feed: NowResponse | undefined): number {
  return (
    feed?.cards.filter((card) => card.kind === 'retention_due').length ?? 0
  );
}

function rewardReceiptFromFeed(
  feed: NowResponse | undefined,
): RewardReceipt | null {
  const receiptCard = feed?.cards.find(
    (card) =>
      card.kind === 'ledger_moment' &&
      typeof card.params.receiptKind === 'string',
  );
  if (!receiptCard) return null;
  if (
    receiptCard.params.receiptKind === 'practice_points' &&
    typeof receiptCard.params.amount === 'number'
  ) {
    return {
      kind: 'practice_points',
      amount: receiptCard.params.amount,
      topicTitle:
        typeof receiptCard.params.topicTitle === 'string'
          ? receiptCard.params.topicTitle
          : undefined,
    };
  }
  return null;
}

function useTransitionBoundFeed(
  nowFeed: NowFeedQueryResult,
  profileId: string | undefined,
): NowResponse | undefined {
  const incoming = nowFeed.data ?? nowFeed.fallbackFeed ?? undefined;
  const latestRef = useRef({ profileId, feed: incoming });
  latestRef.current = { profileId, feed: incoming };
  const acceptedRef = useRef(Boolean(incoming));
  const [snapshot, setSnapshot] = useState<{
    profileId: string | undefined;
    feed: NowResponse | undefined;
  }>(() => ({ profileId, feed: incoming }));

  useEffect(() => {
    if (snapshot.profileId !== profileId) {
      acceptedRef.current = Boolean(incoming);
      setSnapshot({ profileId, feed: incoming });
      return;
    }
    if (!acceptedRef.current && incoming) {
      acceptedRef.current = true;
      setSnapshot({ profileId, feed: incoming });
    }
  }, [incoming, profileId, snapshot.profileId]);

  const refetch = nowFeed.refetch;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const boundary = latestRef.current;
      acceptedRef.current = Boolean(boundary.feed);
      setSnapshot(boundary);

      void (async () => {
        try {
          const result = await refetch();
          if (!active || !result.data) return;
          acceptedRef.current = true;
          setSnapshot({ profileId, feed: result.data });
        } catch {
          // React Query retains the error state for the route's retry UI.
        }
      })();

      return () => {
        active = false;
      };
    }, [profileId, refetch]),
  );

  return snapshot.profileId === profileId ? snapshot.feed : incoming;
}

function pushMentorHomeworkCamera(router: ReturnType<typeof useRouter>): void {
  router.push({
    pathname: '/(app)/homework/camera',
    params: { entrySource: 'mentor', returnTo: 'mentor' },
  } as Href);
}

function LearnerMentorScreen(): React.ReactElement {
  const { activeProfile } = useProfile();
  const { t } = useTranslation();
  const router = useRouter();
  const { setActiveScope } = useScopeContext();
  const announce = useAnnounce();
  const { width: windowWidth } = useWindowDimensions();
  const nowFeed = useNowFeed();
  const subjectsIndex = useSubjectsIndex();
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [cardArcStates, setCardArcStates] = useState<
    Record<string, NowCardArcState>
  >({});
  const [completionCelebration, setCompletionCelebration] = useState<{
    eventId: string;
    messageKey: 'mentorHome.celebration.ownChoice';
  } | null>(null);
  const [seenCelebrationEventIds, setSeenCelebrationEventIds] = useState<
    Set<string>
  >(new Set());
  const [showOverflow, setShowOverflow] = useState(false);
  const [showLightPractice, setShowLightPractice] = useState(false);
  const [barClarification, setBarClarification] = useState<{
    input: string;
    revision: number;
  } | null>(null);
  const clarificationRetryLabel =
    barClarification && barClarification.revision > 1
      ? t('common.tryAgain')
      : null;
  const clarificationAnnouncement = barClarification
    ? [
        clarificationRetryLabel,
        t('subject.clarifyLabel'),
        barClarification.input,
      ]
        .filter(Boolean)
        .join(' ')
    : null;
  const clarificationRevision = barClarification?.revision;
  useEffect(() => {
    if (
      Platform.OS !== 'ios' ||
      !clarificationAnnouncement ||
      clarificationRevision === undefined
    ) {
      return;
    }
    announce(clarificationAnnouncement);
  }, [announce, clarificationAnnouncement, clarificationRevision]);
  const overflow = useNowOverflow(showOverflow);
  const mentorNoticeActions = useMentorNoticeActions();
  const feed = useTransitionBoundFeed(nowFeed, activeProfile?.id);
  const firstRealState = hasFirstRealState({
    // Count ACTIVE subjects only. useSubjectsIndex now surfaces every status
    // (paused/archived included) for the Subjects browse grouping, so the
    // cold-start / homework-prompt gate must filter to active here — otherwise a
    // user with only paused/archived subjects would skip the cold-start card.
    activeSubjectCount: subjectsIndex.subjects.filter(
      (subject) => subject.status === 'active',
    ).length,
    feedCardCount: feed?.cards.length ?? 0,
  });
  const rewardReceipt = rewardReceiptFromFeed(feed);
  const reviewsDue = countReviewsDue(feed);
  const showHomeworkPrompt = isSchoolDayEvening() && firstRealState;

  const setArcState = (card: NowCard, arcState: NowCardArcState): void => {
    const key = getNowCardDismissKey(card);
    setCardArcStates((current) => ({ ...current, [key]: arcState }));
  };

  const getArcState = (card: NowCard): NowCardArcState | undefined =>
    cardArcStates[getNowCardDismissKey(card)];

  const handleContinue = async (card: NowCard): Promise<void> => {
    setArcState(card, 'advancing');
    if (card.kind === 'mentor_notice') {
      const noticeId = card.deepLink.params.noticeId;
      if (!noticeId) {
        await mentorNoticeActions.invalidate();
        setArcState(card, 'due');
        return;
      }
      try {
        const result = await mentorNoticeActions.recheck.mutateAsync(noticeId);
        router.push(
          `/(app)/session?sessionId=${encodeURIComponent(result.sessionId)}` as Href,
        );
      } catch (error) {
        if ((error as { status?: number }).status === 409) {
          await mentorNoticeActions.invalidate();
        }
        setArcState(card, 'due');
      }
      return;
    }
    pushNowDeepLink(router, card.deepLink, {
      subjectHubTarget: 'v2-subject-hub',
      setActiveScope,
    });
  };

  const handleDecline = async (card: NowCard): Promise<void> => {
    if (card.kind === 'mentor_notice') {
      // [WI-2499] Not now defers for the current learning day; it must not
      // dismiss locally or show light-practice success — that would render a
      // success state the server never confirmed. A successful defer
      // invalidates the feed (mentorNoticeActions.defer's onSuccess), which
      // is the only authoritative way the card leaves the screen; on
      // conflict/rejection/transport failure/malformed response, the card
      // stays until an authoritative refetch says otherwise.
      const noticeId = card.deepLink.params.noticeId;
      if (!noticeId) {
        await mentorNoticeActions.invalidate();
        return;
      }
      try {
        await mentorNoticeActions.defer.mutateAsync(noticeId);
      } catch (error) {
        if ((error as { status?: number }).status === 409) {
          await mentorNoticeActions.invalidate();
        }
      }
      return;
    }
    setDismissedKeys((current) => {
      const next = new Set(current);
      next.add(getNowCardDismissKey(card));
      return next;
    });
    setShowLightPractice(true);
  };

  const handleCompleted = (card: NowCard): void => {
    const key = getNowCardDismissKey(card);
    setCardArcStates((current) => ({ ...current, [key]: 'mastered' }));
    setCompletionCelebration({
      eventId: `mentor-completed:${key}`,
      messageKey: 'mentorHome.celebration.ownChoice',
    });
  };

  const handleCelebrationSeen = (eventId: string): void => {
    setSeenCelebrationEventIds((current) => {
      const next = new Set(current);
      next.add(eventId);
      return next;
    });
  };

  const handleSubmitText = (text: string): void => {
    const result = matchBarIntent(text, {
      subjects: subjectsIndex.subjects.map((s) => ({
        id: s.subjectId,
        name: s.subjectName,
      })),
    });
    if (result.kind === 'jump') {
      setBarClarification(null);
      pushNowDeepLink(router, result.deepLink, {
        subjectHubTarget: 'v2-subject-hub',
        setActiveScope,
      });
      return;
    }
    if (result.kind === 'mentor') {
      setBarClarification(null);
      router.push({
        pathname: '/(app)/session',
        params: {
          entrySource: 'mentor',
          returnTo: 'mentor',
          mode: 'freeform',
          rawInput: result.text,
        },
      } as Href);
      return;
    }
    setBarClarification((current) => ({
      input: result.text,
      revision: (current?.revision ?? 0) + 1,
    }));
  };

  const handleLightPractice = (route: LightPracticeRoute): void => {
    if (route === 'dictation') {
      router.push('/(app)/dictation' as Href);
      return;
    }
    router.push({
      pathname: '/(app)/quiz',
      params: {
        activityType: route === 'guess_who' ? 'guess_who' : route,
        returnTo: 'mentor',
      },
    } as Href);
  };

  let renderedFeed: React.ReactNode = null;
  if (nowFeed.isLoading && !feed) {
    renderedFeed = (
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  } else if (nowFeed.isError && !feed) {
    renderedFeed = (
      <ErrorFallback
        variant="card"
        title={t('mentorHome.error.title')}
        message={t('mentorHome.error.message')}
        primaryAction={{
          label: t('common.tryAgain'),
          onPress: () => void nowFeed.refetch(),
          testID: 'mentor-feed-retry',
        }}
        secondaryAction={{
          label: t('mentorHome.error.subjects'),
          onPress: () => router.push('/(app)/subjects' as Href),
          testID: 'mentor-feed-subjects',
        }}
        testID="mentor-feed-error"
      />
    );
  } else if (!firstRealState) {
    renderedFeed = (
      <ColdStartCard
        onFill={() => undefined}
        onSubmitText={handleSubmitText}
        onOpenCamera={() => pushMentorHomeworkCamera(router)}
      />
    );
  } else if (feed) {
    // Error with a populated cache: keep the cached cards AND synthesize a
    // client-side "continue where you left off" card so this branch is never a
    // dead-end (T11b). Deep-link straight to the cached unfinished session when
    // one exists; otherwise open the session spine via the generic fallback.
    const resumeLink = resumeDeepLinkFromCache(feed);
    const handleContinueFallback = (): void => {
      if (resumeLink) {
        pushNowDeepLink(router, resumeLink, {
          subjectHubTarget: 'v2-subject-hub',
          setActiveScope,
        });
        return;
      }
      router.push({
        pathname: '/(app)/session',
        params: { entrySource: 'mentor', returnTo: 'mentor' },
      } as Href);
    };
    renderedFeed = (
      <>
        {nowFeed.isSlowFallback ? (
          <View
            testID="mentor-feed-fallback"
            className="rounded-card border border-border bg-surface px-4 py-3"
          >
            <Text className="text-body-sm text-text-secondary">
              {t('mentorHome.fallback.cached')}
            </Text>
          </View>
        ) : null}
        {nowFeed.isError ? (
          <Pressable
            testID="continue-fallback-card"
            accessibilityRole="button"
            onPress={handleContinueFallback}
            className="rounded-card border border-border bg-surface px-4 py-3"
          >
            <Text className="text-body-sm font-bold text-text-primary">
              {t('mentorHome.fallback.continue')}
            </Text>
          </Pressable>
        ) : null}
        <NowCardStack
          feed={feed}
          overflow={overflow.data}
          dismissedKeys={dismissedKeys}
          anchorArcState="due"
          getArcState={getArcState}
          onContinue={handleContinue}
          onDecline={handleDecline}
          onCompleted={handleCompleted}
          onShowOverflow={() => setShowOverflow(true)}
        />
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      testID="mentor-screen"
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        testID="mentor-scroll"
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: windowWidth <= 360 ? 12 : 20,
          paddingVertical: 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text className="mb-4 text-h2 font-bold text-text-primary">
          {t('mentorHome.headline')}
        </Text>

        <View className="gap-3">
          {showHomeworkPrompt ? (
            <Pressable
              testID="mentor-homework-prompt"
              accessibilityRole="button"
              onPress={() => pushMentorHomeworkCamera(router)}
              className="rounded-card border border-border bg-surface px-4 py-3"
            >
              <Text className="text-body-sm text-text-secondary">
                {t('mentorHome.homeworkPrompt')}
              </Text>
            </Pressable>
          ) : null}

          {/* On-track status moved out of the page header into a compact,
              right-aligned chip directly above the feed. */}
          <View className="flex-row justify-end">
            <OnTrackBadge reviewsDue={reviewsDue} />
          </View>

          {renderedFeed}

          {completionCelebration ? (
            <MentorCelebration
              eventId={completionCelebration.eventId}
              messageKey={completionCelebration.messageKey}
              seenEventIds={seenCelebrationEventIds}
              onMarkSeen={handleCelebrationSeen}
            />
          ) : null}
          {rewardReceipt ? <RewardReceiptCard receipt={rewardReceipt} /> : null}

          {/* Ask box moved up from a bottom-pinned bar into the scroll area so
              the keyboard no longer covers it while typing. */}
          <MentorInputBar
            unavailable={nowFeed.isError && !feed}
            onSubmitText={handleSubmitText}
            onOpenCamera={() => pushMentorHomeworkCamera(router)}
            onOpenHomework={() => pushMentorHomeworkCamera(router)}
            voiceLocale={getVoiceLocaleForLanguage(
              activeProfile?.conversationLanguage,
            )}
          />

          {barClarification ? (
            <View
              key={barClarification.revision}
              testID="mentor-bar-clarification"
              accessibilityLiveRegion="polite"
              className="rounded-xl border border-border bg-surface-elevated px-4 py-3"
            >
              {clarificationRetryLabel ? (
                <Text className="mb-1 text-xs font-semibold text-primary">
                  {clarificationRetryLabel}
                </Text>
              ) : null}
              <Text className="text-body-sm text-text-secondary">
                {t('subject.clarifyLabel')}
              </Text>
              <Text className="mt-1 text-body-sm text-text-primary">
                {barClarification.input}
              </Text>
            </View>
          ) : null}

          {showLightPractice || (feed?.cards.length ?? 0) <= 1 ? (
            <LightPracticeAffordance
              reason="thin_feed"
              supportedRoutes={[
                'capitals',
                'guess_who',
                'vocabulary',
                'dictation',
              ]}
              onSelect={handleLightPractice}
            />
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function MentorScreen(): React.ReactElement {
  const { activeScope, availableScopes, setActiveScope } = useScopeContext();
  const router = useRouter();
  const eligiblePersons = useEligibleManagedPersons();
  const personScopes = availableScopes.filter(
    (scope) => scope.kind === 'person',
  );
  const openScopedRoute = (
    scope: (typeof personScopes)[number],
    route: '/(app)/subjects' | '/(app)/journal',
  ): void => {
    setActiveScope(scope);
    router.push(route as Href);
  };
  const openScopedSubjects = (scope: (typeof personScopes)[number]): void =>
    openScopedRoute(scope, '/(app)/subjects');
  const openScopedJournal = (scope: (typeof personScopes)[number]): void =>
    openScopedRoute(scope, '/(app)/journal');
  const handleSelectEligiblePerson = (person: EligibleManagedPerson): void =>
    pushLinkInitiateForManagedPerson(router, person);
  const handleAddChildFallback = (): void => pushAddChildForSupport(router);
  const handleSelectExistingTeen = (): void => pushLinkInitiatePicker(router);

  if (activeScope.kind === 'supporter-hub') {
    return (
      <SupportHubMentorTab
        personScopes={personScopes}
        onOpenPersonScope={setActiveScope}
        onOpenSubjects={openScopedSubjects}
        onOpenJournal={openScopedJournal}
        eligiblePersons={eligiblePersons}
        onSelectEligiblePerson={handleSelectEligiblePerson}
        onAddChildFallback={handleAddChildFallback}
        onSelectExistingTeen={handleSelectExistingTeen}
      />
    );
  }

  if (activeScope.kind === 'person') {
    return (
      <SupportHubMentorTab
        personScopes={[activeScope]}
        activePersonScope={activeScope}
        onOpenPersonScope={setActiveScope}
        onOpenSubjects={openScopedSubjects}
        onOpenJournal={openScopedJournal}
      />
    );
  }

  return <LearnerMentorScreen />;
}
