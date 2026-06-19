import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NowCard as NowCardData } from '@eduagent/schemas';

import type { TranslateKey } from '../../i18n';
import { useThemeColors } from '../../lib/theme';

export type NowCardVariant = 'anchor' | 'module';
export type NowCardArcState = 'due' | 'advancing' | 'mastered';

export interface NowCardProps {
  card: NowCardData;
  variant?: NowCardVariant;
  arcState?: NowCardArcState;
  onContinue: (card: NowCardData) => void;
  onDecline: (card: NowCardData) => void;
  onCompleted?: (card: NowCardData) => void;
}

const CARD_COPY_KEYS: Partial<
  Record<
    NowCardData['kind'],
    { templateKey: string; title: TranslateKey; cta: TranslateKey }
  >
> = {
  unfinished_session: {
    templateKey: 'now.unfinished_session.default',
    title: 'mentorHome.cards.unfinished_session.title',
    cta: 'mentorHome.cards.unfinished_session.cta',
  },
  retention_due: {
    templateKey: 'now.retention_due.default',
    title: 'mentorHome.cards.retention_due.title',
    cta: 'mentorHome.cards.retention_due.cta',
  },
  parked_item: {
    templateKey: 'now.parked_item.default',
    title: 'mentorHome.cards.parked_item.title',
    cta: 'mentorHome.cards.parked_item.cta',
  },
  needs_deepening: {
    templateKey: 'now.needs_deepening.default',
    title: 'mentorHome.cards.needs_deepening.title',
    cta: 'mentorHome.cards.needs_deepening.cta',
  },
  challenge_ready: {
    templateKey: 'now.challenge_ready.default',
    title: 'mentorHome.cards.challenge_ready.title',
    cta: 'mentorHome.cards.challenge_ready.cta',
  },
};

const ARC_KEYS: Record<NowCardArcState, string> = {
  due: 'arcDue',
  advancing: 'arcAdvancing',
  mastered: 'arcMastered',
};

export function resolveNowCardCopyKeys(card: NowCardData): {
  title: TranslateKey;
  cta: TranslateKey;
} {
  const entry = CARD_COPY_KEYS[card.kind];
  if (entry?.templateKey === card.templateKey) {
    return { title: entry.title, cta: entry.cta };
  }
  return {
    title: 'mentorHome.cards.generic.title',
    cta: 'mentorHome.cards.generic.cta',
  };
}

function arcCopyKey(
  card: NowCardData,
  arcState: NowCardArcState,
): TranslateKey {
  return `mentorHome.cards.${card.kind}.${ARC_KEYS[arcState]}` as TranslateKey;
}

export function NowCard({
  card,
  variant = 'module',
  arcState,
  onContinue,
  onDecline,
  onCompleted,
}: NowCardProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const copy = resolveNowCardCopyKeys(card);
  const isAnchor = variant === 'anchor';

  return (
    <View
      testID={`now-card-${card.kind}`}
      className={isAnchor ? 'rounded-2xl p-4' : 'rounded-xl p-3'}
      style={{
        backgroundColor: isAnchor ? colors.primarySoft : colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
      }}
    >
      <Text className="text-text-primary font-bold">
        {t(copy.title, card.params)}
      </Text>
      {arcState ? (
        <Text
          testID="now-card-arc"
          className="mt-2 text-xs text-text-secondary"
        >
          {t(arcCopyKey(card, arcState))}
        </Text>
      ) : null}
      <View className="mt-3 flex-row items-center gap-2">
        <Pressable
          testID="now-card-continue"
          accessibilityRole="button"
          onPress={() => onContinue(card)}
          className="rounded-xl bg-primary px-4 py-2"
        >
          <Text className="text-sm font-bold text-text-inverse">
            {t(copy.cta)}
          </Text>
        </Pressable>
        {onCompleted ? (
          <Pressable
            testID="now-card-complete"
            accessibilityRole="button"
            onPress={() => onCompleted(card)}
            className="rounded-xl border border-border px-4 py-2"
          >
            <Text className="text-sm text-text-secondary">
              {t('mentorHome.cards.complete')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        testID="now-card-dismiss"
        accessibilityRole="button"
        accessibilityLabel={t('home.coachBand.a11yDismiss')}
        hitSlop={8}
        onPress={() => onDecline(card)}
        className="absolute right-2 top-2 p-1"
      >
        <Text className="text-text-secondary">
          {t('mentorHome.cards.dismissIcon')}
        </Text>
      </Pressable>
    </View>
  );
}
