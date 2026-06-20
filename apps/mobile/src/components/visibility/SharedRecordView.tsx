import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SharedRecord } from '@eduagent/schemas';

import { ErrorFallback } from '../common/ErrorFallback';

interface SharedRecordViewProps {
  record?: SharedRecord;
  error?: Error | null;
  onRetry?: () => void;
}

export function SharedRecordView({
  record,
  error,
  onRetry,
}: SharedRecordViewProps): React.ReactElement {
  const { t } = useTranslation();

  if (error) {
    return (
      <ErrorFallback
        testID="visibility-shared-record-error"
        title={t('visibility.sharedRecord.errorTitle')}
        message={t('visibility.sharedRecord.errorMessage')}
        primaryAction={
          onRetry
            ? {
                label: t('visibility.sharedRecord.retry'),
                onPress: onRetry,
                testID: 'visibility-shared-record-retry',
              }
            : undefined
        }
      />
    );
  }

  const view = record?.supporterView;

  return (
    <View
      testID="visibility-shared-record"
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {view?.headline ?? t('visibility.sharedRecord.emptyTitle')}
      </Text>
      <Text className="mt-2 text-body-sm text-text-secondary">
        {t('visibility.sharedRecord.structuralOnly')}
      </Text>
      <View className="mt-4 gap-3">
        {(view?.facts ?? []).map((fact) => (
          <View
            key={fact.id}
            testID={`visibility-shared-record-fact-${fact.id}`}
            className="border-t border-border pt-3"
          >
            <Text className="text-body font-semibold text-text-primary">
              {fact.title}
            </Text>
            {fact.detail ? (
              <Text className="mt-1 text-body-sm text-text-secondary">
                {fact.detail}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
