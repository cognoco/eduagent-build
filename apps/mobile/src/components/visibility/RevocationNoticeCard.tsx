import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RevocationNotice } from '@eduagent/schemas';

export function RevocationNoticeCard({
  notice,
}: {
  notice: RevocationNotice;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <View
      testID="visibility-revocation-notice"
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {t('visibility.revocation.title')}
      </Text>
      <Text className="mt-2 text-body text-text-secondary">
        {t('visibility.revocation.message', {
          graceEndsAt: new Date(notice.graceEndsAt).toLocaleDateString(),
        })}
      </Text>
    </View>
  );
}
