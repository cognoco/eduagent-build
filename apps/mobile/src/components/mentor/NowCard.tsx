import { Pressable, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';
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
  /** Stagger delay (ms) for the entering animation; set by NowCardStack. */
  enterDelayMs?: number;
  animate?: boolean;
}

const CARD_COPY_KEYS: Partial<
  Record<
    NowCardData['kind'],
    { templateKey: string; title: TranslateKey; cta: TranslateKey }
  >
> = {
  billing_alert: {
    templateKey: 'now.billing_alert.payment_failed',
    title: 'mentorHome.cards.billing_alert.title',
    cta: 'mentorHome.cards.billing_alert.cta',
  },
  unfinished_session: {
    templateKey: 'now.unfinished_session.default',
    title: 'mentorHome.cards.unfinished_session.title',
    cta: 'mentorHome.cards.unfinished_session.cta',
  },
  mentor_notice: {
    templateKey: 'now.mentor_notice.default',
    title: 'mentorHome.cards.mentor_notice.title',
    cta: 'mentorHome.cards.mentor_notice.cta',
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
  enterDelayMs = 0,
  animate = true,
}: NowCardProps) {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const copy = resolveNowCardCopyKeys(card);
  const isAnchor = variant === 'anchor';
  const isBillingAlert = card.kind === 'billing_alert';
  const deadline =
    typeof card.params.deadlineAt === 'string'
      ? new Date(card.params.deadlineAt)
      : null;
  const formattedDeadline =
    deadline && !Number.isNaN(deadline.getTime())
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
          dateStyle: 'medium',
        }).format(deadline)
      : null;

  return (
    <Animated.View
      testID={`now-card-${card.kind}`}
      entering={
        animate && !reduceMotion
          ? FadeIn.delay(enterDelayMs).duration(300)
          : undefined
      }
      exiting={animate && !reduceMotion ? FadeOut.duration(200) : undefined}
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
      {isBillingAlert ? (
        <Text className="mt-2 text-sm text-text-secondary">
          {card.params.accessState === 'current'
            ? formattedDeadline
              ? t('mentorHome.cards.billing_alert.currentAccess', {
                  deadline: formattedDeadline,
                })
              : t('mentorHome.cards.billing_alert.currentAccessNoDeadline')
            : t('mentorHome.cards.billing_alert.freeFallback')}
        </Text>
      ) : null}
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
        {/* [WI-2499] Mentor-notice cards expose Continue and Not now only — no
            generic Complete/mastery affordance, which would imply a
            server-unvalidated success. */}
        {onCompleted && !isBillingAlert && card.kind !== 'mentor_notice' ? (
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
      {!isBillingAlert ? (
        <Pressable
          testID="now-card-dismiss"
          accessibilityRole="button"
          accessibilityLabel={t('home.coachBand.a11yDismiss')}
          hitSlop={8}
          onPress={() => onDecline(card)}
          className={
            card.kind === 'mentor_notice'
              ? 'mt-2 self-start p-1'
              : 'absolute right-2 top-2 p-1'
          }
        >
          <Text className="text-text-secondary">
            {card.kind === 'mentor_notice'
              ? t('mentorHome.cards.mentor_notice.notNow')
              : t('mentorHome.cards.dismissIcon')}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
