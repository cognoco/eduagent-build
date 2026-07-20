import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NowCard as NowCardData } from '@eduagent/schemas';

import type { TranslateKey } from '../../i18n';
import { renderMilestoneMomentText } from '../../lib/milestone-moment-copy';
import { useThemeColors } from '../../lib/theme';

export interface LedgerMomentCardProps {
  card: NowCardData;
  onContinue: (card: NowCardData) => void;
  onDecline: (card: NowCardData) => void;
}

const SUPPORTED_LEDGER_COPY_KEYS: Partial<Record<string, TranslateKey>> = {
  session_filed: 'mentorHome.ledger.session_filed.title',
  notice_locked_in: 'mentorHome.ledger.notice_locked_in.title',
};

function ledgerKind(card: NowCardData): string {
  return typeof card.params['ledgerKind'] === 'string'
    ? card.params['ledgerKind']
    : card.templateKey.replace('now.ledger_moment.', '');
}

function ledgerCopyKey(card: NowCardData): TranslateKey {
  return (
    SUPPORTED_LEDGER_COPY_KEYS[ledgerKind(card)] ??
    'mentorHome.ledger.generic.title'
  );
}

function withJournalSectionIntent(card: NowCardData): NowCardData {
  if (card.deepLink.route !== 'journal') return card;

  if (ledgerKind(card) === 'quiz_personal_best') {
    return {
      ...card,
      deepLink: {
        ...card.deepLink,
        params: { ...card.deepLink.params, section: 'practice' },
      },
    };
  }

  // TODO: Map a future Journal-routed ledger kind only after product assigns
  // it to one of the existing Journal sections; unknown kinds stay at root.
  if (!('section' in card.deepLink.params)) return card;
  const rootParams = { ...card.deepLink.params };
  delete rootParams['section'];
  return {
    ...card,
    deepLink: { ...card.deepLink, params: rootParams },
  };
}

export function LedgerMomentCard({
  card,
  onContinue,
  onDecline,
}: LedgerMomentCardProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <Pressable
      testID="now-ledger-moment"
      accessibilityRole="button"
      onPress={() => onContinue(withJournalSectionIntent(card))}
      className="rounded-xl p-3"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
      }}
    >
      <Text className="text-text-secondary text-xs">
        {t('mentorHome.ledger.label')}
      </Text>
      <Text className="mt-1 font-semibold text-text-primary">
        {ledgerKind(card) === 'milestone_reached'
          ? renderMilestoneMomentText(card.params, t)
          : t(ledgerCopyKey(card), card.params)}
      </Text>
      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-sm text-primary">
          {t('mentorHome.cards.generic.cta')}
        </Text>
        <Pressable
          testID="now-ledger-dismiss"
          accessibilityRole="button"
          accessibilityLabel={t('home.coachBand.a11yDismiss')}
          hitSlop={8}
          onPress={() => onDecline(card)}
          className="p-1"
        >
          <Text className="text-text-secondary">
            {t('mentorHome.cards.dismissIcon')}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
