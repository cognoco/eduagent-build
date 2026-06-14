import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type {
  NowCard as NowCardData,
  NowOverflowResponse,
  NowResponse,
} from '@eduagent/schemas';

import { LedgerMomentCard } from './LedgerMomentCard';
import { NowCard } from './NowCard';

export interface NowCardStackProps {
  feed: NowResponse;
  overflow?: NowOverflowResponse;
  dismissedKeys: Set<string>;
  onContinue: (card: NowCardData) => void;
  onDecline: (card: NowCardData) => void;
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
      onContinue={onContinue}
      onDecline={onDecline}
    />
  );
}

export function NowCardStack({
  feed,
  dismissedKeys,
  onContinue,
  onDecline,
  onShowOverflow,
}: NowCardStackProps) {
  const { t } = useTranslation();
  const cards = feed.cards
    .filter(isActionableCard)
    .filter((card) => !dismissedKeys.has(getNowCardDismissKey(card)))
    .slice(0, 3);
  const anchor = cards[0];
  const modules = cards.slice(1, 3);

  if (!anchor && feed.overflowCount === 0) {
    return (
      <Pressable
        testID="now-empty-card"
        accessibilityRole="button"
        onPress={onShowOverflow}
        className="rounded-2xl border border-border bg-surface p-4"
      >
        <Text className="font-bold text-text-primary">
          {t('mentorHome.empty.title')}
        </Text>
        <Text className="mt-2 text-sm text-primary">
          {t('mentorHome.empty.cta')}
        </Text>
      </Pressable>
    );
  }

  return (
    <View testID="now-card-stack" className="gap-3">
      {anchor ? (
        <View testID="now-card-slot-anchor" accessibilityLabel="anchor">
          {renderCard(anchor, 'anchor', onContinue, onDecline)}
        </View>
      ) : null}
      {modules.map((card, index) => (
        <View
          key={getNowCardDismissKey(card)}
          testID={`now-card-slot-module-${index}`}
          accessibilityLabel="module"
        >
          {renderCard(card, 'module', onContinue, onDecline)}
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
