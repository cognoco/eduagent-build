import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';
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
import { useNowFeed, useNowOverflow } from '../../hooks/use-now-feed';
import { useSubjectsIndex } from '../../hooks/use-subjects-index';
import { matchBarIntent } from '../../lib/bar-intent-match';
import { hasFirstRealState } from '../../lib/first-real-state';
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

function pushMentorHomeworkCamera(router: ReturnType<typeof useRouter>): void {
  router.push({
    pathname: '/(app)/homework/camera',
    params: { entrySource: 'mentor', returnTo: 'mentor' },
  } as Href);
}

function LearnerMentorScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
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
  const overflow = useNowOverflow(showOverflow);
  const feed = nowFeed.data ?? nowFeed.fallbackFeed ?? undefined;
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

  const handleContinue = (card: NowCard): void => {
    setArcState(card, 'advancing');
    pushNowDeepLink(router, card.deepLink, {
      subjectHubTarget: 'v2-subject-hub',
    });
  };

  const handleDecline = (card: NowCard): void => {
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
      pushNowDeepLink(router, result.deepLink, {
        subjectHubTarget: 'v2-subject-hub',
      });
      return;
    }
    if (result.kind === 'mentor') {
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
    setShowLightPractice(true);
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
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16 }}
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
            onTranscript={handleSubmitText}
          />

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
  const personScopes = availableScopes.filter(
    (scope) => scope.kind === 'person',
  );
  const openScopedSubjects = (scope: (typeof personScopes)[number]): void => {
    setActiveScope(scope);
    router.push('/(app)/subjects' as Href);
  };
  const openScopedJournal = (scope: (typeof personScopes)[number]): void => {
    setActiveScope(scope);
    router.push('/(app)/journal' as Href);
  };

  if (activeScope.kind === 'supporter-hub') {
    return (
      <SupportHubMentorTab
        personScopes={personScopes}
        onOpenPersonScope={setActiveScope}
        onOpenSubjects={openScopedSubjects}
        onOpenJournal={openScopedJournal}
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
