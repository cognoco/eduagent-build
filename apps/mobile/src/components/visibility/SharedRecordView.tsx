import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppealReport, SharedRecord } from '@eduagent/schemas';

import { ErrorFallback } from '../common/ErrorFallback';
import { AppealButton } from './AppealButton';

interface SharedRecordViewProps {
  record?: SharedRecord;
  error?: Error | null;
  onRetry?: () => void;
  onAppeal?: () => void;
  appealPending?: boolean;
  appealReport?: AppealReport;
  appealError?: Error | null;
  onRetryAppeal?: () => void;
}

export function SharedRecordView({
  record,
  error,
  onRetry,
  onAppeal,
  appealPending,
  appealReport,
  appealError,
  onRetryAppeal,
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
      {record && onAppeal ? (
        <View className="mt-4 border-t border-border pt-4">
          {appealPending ? (
            <ActivityIndicator
              accessibilityLabel={t('common.loading')}
              testID="visibility-appeal-pending"
            />
          ) : appealReport ? (
            <View
              testID="visibility-appeal-report"
              className="rounded-card border border-border bg-background p-3"
            >
              <Text className="text-body-sm text-text-secondary">
                {appealReport.report}
              </Text>
            </View>
          ) : appealError ? (
            <ErrorFallback
              testID="visibility-appeal-error"
              title={t('visibility.appeal.errorTitle')}
              message={t('visibility.appeal.errorMessage')}
              primaryAction={
                onRetryAppeal
                  ? {
                      label: t('common.tryAgain'),
                      onPress: onRetryAppeal,
                      testID: 'visibility-appeal-retry',
                    }
                  : undefined
              }
            />
          ) : (
            <AppealButton onPress={onAppeal} />
          )}
        </View>
      ) : null}
    </View>
  );
}
