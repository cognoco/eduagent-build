import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NowCard as NowCardData } from '@eduagent/schemas';

import type { TranslateKey } from '../../i18n';
import { useThemeColors } from '../../lib/theme';

export interface LedgerMomentCardProps {
  card: NowCardData;
  onContinue: (card: NowCardData) => void;
  onDecline: (card: NowCardData) => void;
}

function ledgerCopyKey(card: NowCardData): TranslateKey {
  const ledgerKind =
    typeof card.params['ledgerKind'] === 'string'
      ? card.params['ledgerKind']
      : card.templateKey.replace('now.ledger_moment.', '');
  if (!ledgerKind || ledgerKind === card.templateKey) {
    return 'mentorHome.ledger.generic.title';
  }
  return `mentorHome.ledger.${ledgerKind}.title` as TranslateKey;
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
      onPress={() => onContinue(card)}
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
        {t(ledgerCopyKey(card), card.params)}
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
