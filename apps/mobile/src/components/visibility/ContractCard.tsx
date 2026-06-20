import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RenderAudience, VisibilityContract } from '@eduagent/schemas';

interface ContractCardProps {
  contract: VisibilityContract;
  audience: RenderAudience;
  supporteeName?: string;
  supporterName?: string;
  onAccept?: () => void;
}

export function ContractCard({
  contract,
  audience,
  supporteeName,
  supporterName,
  onAccept,
}: ContractCardProps): React.ReactElement {
  const { t } = useTranslation();
  const accepted =
    audience === 'supporter'
      ? Boolean(contract.supporterAcceptedAt)
      : Boolean(contract.supporteeAcceptedAt);

  return (
    <View
      testID="visibility-contract-card"
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {t('visibility.contract.title')}
      </Text>
      <Text className="mt-2 text-body text-text-secondary">
        {audience === 'supportee'
          ? t('visibility.contract.supporteeLine', {
              supporterName:
                supporterName ?? t('visibility.contract.supporterFallback'),
              relation: t(`visibility.relation.${contract.relation}`),
            })
          : t('visibility.contract.supporterLine', {
              supporteeName:
                supporteeName ?? t('visibility.contract.supporteeFallback'),
            })}
      </Text>
      <View className="mt-4 gap-2">
        <Text className="text-body-sm text-text-secondary">
          {t('visibility.contract.reportableKinds')}
        </Text>
        <Text className="text-body-sm text-text-secondary">
          {t('visibility.contract.artifactWall')}
        </Text>
        <Text className="text-body-sm text-text-secondary">
          {t('visibility.contract.renderEquivalence')}
        </Text>
        <Text className="text-body-sm text-text-secondary">
          {t('visibility.contract.safetyException')}
        </Text>
      </View>
      {onAccept ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('visibility.contract.accept')}
          className="mt-4 min-h-[48px] items-center justify-center rounded-button bg-primary px-4 py-3"
          disabled={accepted}
          onPress={onAccept}
          testID="visibility-contract-accept"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {accepted
              ? t('visibility.contract.accepted')
              : t('visibility.contract.accept')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
