import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';
import type { NowCard, NowResponse } from '@eduagent/schemas';

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
import { ErrorFallback } from '../../components/common';
import { useNowFeed, useNowOverflow } from '../../hooks/use-now-feed';
import { useSubjectsIndex } from '../../hooks/use-subjects-index';
import { matchBarIntent } from '../../lib/bar-intent-match';
import { hasFirstRealState } from '../../lib/first-real-state';
import { pushNowDeepLink } from '../../lib/now-deep-link';

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

export default function MentorScreen(): React.ReactElement {
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
    activeSubjectCount: subjectsIndex.subjects.length,
    feedCardCount: feed?.cards.length ?? 0,
  });
  const rewardReceipt = rewardReceiptFromFeed(feed);
  const reviewsDue = countReviewsDue(feed);

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
    const result = matchBarIntent(text);
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
    <View className="flex-1 bg-background" testID="mentor-screen">
      <View className="flex-1 px-5 py-4">
        <View className="mb-4 flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {t('mentorHome.title')}
            </Text>
            <Text className="mt-1 text-body-sm text-text-secondary">
              {t('mentorHome.subtitle')}
            </Text>
          </View>
          <OnTrackBadge reviewsDue={reviewsDue} />
        </View>

        <View className="gap-3">
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
      </View>
      <MentorInputBar
        unavailable={nowFeed.isError && !feed}
        onSubmitText={handleSubmitText}
        onOpenCamera={() => pushMentorHomeworkCamera(router)}
        onOpenHomework={() => pushMentorHomeworkCamera(router)}
        onTranscript={handleSubmitText}
      />
    </View>
  );
}
