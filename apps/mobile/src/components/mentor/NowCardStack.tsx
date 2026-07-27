import { Pressable, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';
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

function isLearningMomentReceipt(card: NowCardData): boolean {
  return card.kind === 'ledger_moment' && card.params['ledgerKind'] !== 'quota';
}

function renderCard(
  card: NowCardData,
  variant: 'anchor' | 'module',
  onContinue: (card: NowCardData) => void,
  onDecline: (card: NowCardData) => void,
  arcState?: NowCardArcState,
  onCompleted?: (card: NowCardData) => void,
) {
  if (card.kind === 'ledger_moment') {
    return (
      <LedgerMomentCard
        card={card}
        onContinue={onContinue}
        onDecline={onDecline}
      />
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
      animate={false}
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
  const seenDismissKeys = new Set<string>();
  const cards = feed.cards
    .filter(isActionableCard)
    .filter(
      (card) =>
        card.kind === 'billing_alert' ||
        !dismissedKeys.has(getNowCardDismissKey(card)),
    )
    .filter((card) => {
      const dismissKey = getNowCardDismissKey(card);
      if (seenDismissKeys.has(dismissKey)) return false;
      seenDismissKeys.add(dismissKey);
      return true;
    });
  const receiptCards = cards.filter(isLearningMomentReceipt);
  const actionLimit = receiptCards.length > 0 ? 2 : 3;
  const actionCards = cards
    .filter((card) => !isLearningMomentReceipt(card))
    .slice(0, actionLimit);
  const receipts = receiptCards.slice(0, 3 - actionCards.length);
  const anchor = actionCards[0];
  const modules = actionCards.slice(1);

  // When there is nothing actionable and no overflow, render nothing. The
  // screen's always-present Ask box + "Prefer something light?" affordance keep
  // it from being a dead-end — the previous "Browse more learning options" card
  // called onShowOverflow with overflowCount === 0, so its tap did nothing.
  if (!anchor && receipts.length === 0 && feed.overflowCount === 0) {
    return null;
  }

  const slotAnimation = (enterDelayMs: number) => ({
    entering: reduceMotion
      ? undefined
      : FadeIn.delay(enterDelayMs).duration(300),
    exiting: reduceMotion ? undefined : FadeOut.duration(200),
  });

  return (
    <View testID="now-card-stack" accessibilityRole="list" className="gap-3">
      {anchor ? (
        <Animated.View
          testID="now-card-slot-anchor"
          key={getNowCardDismissKey(anchor)}
          collapsable={false}
          {...slotAnimation(0)}
        >
          {renderCard(
            anchor,
            'anchor',
            onContinue,
            onDecline,
            getArcState?.(anchor) ?? anchorArcState,
            onCompleted,
          )}
        </Animated.View>
      ) : null}
      {modules.map((card, index) => (
        <Animated.View
          key={getNowCardDismissKey(card)}
          testID={`now-card-slot-module-${index}`}
          collapsable={false}
          {...slotAnimation((index + 1) * 50)}
        >
          {renderCard(
            card,
            'module',
            onContinue,
            onDecline,
            getArcState?.(card),
            onCompleted,
          )}
        </Animated.View>
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
      {receipts.map((card, index) => (
        <Animated.View
          key={getNowCardDismissKey(card)}
          testID={`now-card-slot-receipt-${index}`}
          collapsable={false}
          {...slotAnimation((actionCards.length + index) * 50)}
        >
          {renderCard(
            card,
            'module',
            onContinue,
            onDecline,
            getArcState?.(card),
            onCompleted,
          )}
        </Animated.View>
      ))}
    </View>
  );
}
