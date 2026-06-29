import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type {
  NowCard as NowCardData,
  NowOverflowResponse,
  NowResponse,
} from '@eduagent/schemas';

import { LedgerMomentCard } from './LedgerMomentCard';
import { NowCard, type NowCardArcState } from './NowCard';

export interface NowCardStackProps {
  feed: NowResponse;
  overflow?: NowOverflowResponse;
  dismissedKeys: Set<string>;
  onContinue: (card: NowCardData) => void;
  onDecline: (card: NowCardData) => void;
  onCompleted?: (card: NowCardData) => void;
  anchorArcState?: NowCardArcState;
  getArcState?: (card: NowCardData) => NowCardArcState | undefined;
  onShowOverflow: () => void;
}

export function getNowCardDismissKey(card: NowCardData): string {
  return [
    card.kind,
    card.templateKey,
    card.deepLink?.route ?? 'none',
    JSON.stringify(card.deepLink?.params ?? {}),
  ].join('|');
}

function isActionableCard(card: NowCardData): boolean {
  return !!card.deepLink?.route && !!card.deepLink.params;
}

function renderCard(
  card: NowCardData,
  variant: 'anchor' | 'module',
  onContinue: (card: NowCardData) => void,
  onDecline: (card: NowCardData) => void,
  arcState?: NowCardArcState,
  onCompleted?: (card: NowCardData) => void,
  enterDelayMs = 0,
  reduceMotion = false,
) {
  if (card.kind === 'ledger_moment') {
    // LedgerMomentCard has no internal animation, so apply the stagger entering
    // animation via a wrapper shell here to keep module cards uniform (AC#2).
    return (
      <Animated.View
        entering={
          reduceMotion ? undefined : FadeIn.delay(enterDelayMs).duration(300)
        }
      >
        <LedgerMomentCard
          card={card}
          onContinue={onContinue}
          onDecline={onDecline}
        />
      </Animated.View>
    );
  }
  return (
    <NowCard
      card={card}
      variant={variant}
      arcState={arcState}
      onContinue={onContinue}
      onDecline={onDecline}
      onCompleted={onCompleted}
      enterDelayMs={enterDelayMs}
    />
  );
}

export function NowCardStack({
  feed,
  dismissedKeys,
  onContinue,
  onDecline,
  onCompleted,
  anchorArcState,
  getArcState,
  onShowOverflow,
}: NowCardStackProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const cards = feed.cards
    .filter(isActionableCard)
    .filter((card) => !dismissedKeys.has(getNowCardDismissKey(card)))
    .slice(0, 3);
  const anchor = cards[0];
  const modules = cards.slice(1, 3);

  // When there is nothing actionable and no overflow, render nothing. The
  // screen's always-present Ask box + "Prefer something light?" affordance keep
  // it from being a dead-end — the previous "Browse more learning options" card
  // called onShowOverflow with overflowCount === 0, so its tap did nothing.
  if (!anchor && feed.overflowCount === 0) {
    return null;
  }

  return (
    <View testID="now-card-stack" accessibilityRole="list" className="gap-3">
      {anchor ? (
        <View testID="now-card-slot-anchor" key={getNowCardDismissKey(anchor)}>
          {renderCard(
            anchor,
            'anchor',
            onContinue,
            onDecline,
            getArcState?.(anchor) ?? anchorArcState,
            onCompleted,
            0,
            reduceMotion,
          )}
        </View>
      ) : null}
      {modules.map((card, index) => (
        <View
          key={getNowCardDismissKey(card)}
          testID={`now-card-slot-module-${index}`}
        >
          {renderCard(
            card,
            'module',
            onContinue,
            onDecline,
            getArcState?.(card),
            onCompleted,
            (index + 1) * 50,
            reduceMotion,
          )}
        </View>
      ))}
      {feed.overflowCount > 0 ? (
        <Pressable
          testID="now-overflow-entry"
          accessibilityRole="button"
          onPress={onShowOverflow}
          className="rounded-xl border border-border bg-surface px-3 py-2"
        >
          <Text className="text-sm text-text-secondary">
            {t('mentorHome.overflow.more', { count: feed.overflowCount })}
          </Text>
          <Text className="sr-only">{String(feed.overflowCount)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
