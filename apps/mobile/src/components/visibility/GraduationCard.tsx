import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { VisibilityMoment } from '@eduagent/schemas';

export function GraduationCard({
  moment,
}: {
  moment: VisibilityMoment;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <View
      testID="visibility-graduation-card"
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {t('visibility.graduation.title')}
      </Text>
      <Text className="mt-2 text-body text-text-secondary">
        {t('visibility.graduation.message')}
      </Text>
      <Text className="mt-2 text-body-sm text-text-secondary">
        {t('visibility.graduation.version', {
          version:
            'contractVersion' in moment.payload
              ? String(moment.payload.contractVersion)
              : '',
        })}
      </Text>
    </View>
  );
}
