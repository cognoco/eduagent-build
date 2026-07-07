import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppealReport, SharedRecord } from '@eduagent/schemas';

import { ErrorFallback } from '../common/ErrorFallback';
import { StructuralFactCard } from '../learning-surface';

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
  const appeal =
    record && onAppeal && !appealError
      ? appealPending
        ? { state: 'pending' as const, testID: 'visibility-appeal-pending' }
        : appealReport
          ? {
              state: 'resolved' as const,
              report: appealReport.report,
              testID: 'visibility-appeal-report',
            }
          : {
              label: t('visibility.appeal.label'),
              onPress: onAppeal,
              testID: 'visibility-appeal-button',
            }
      : undefined;

  return (
    <>
      <StructuralFactCard
        headline={view?.headline ?? t('visibility.sharedRecord.emptyTitle')}
        structuralOnlyLabel={t('visibility.sharedRecord.structuralOnly')}
        facts={(view?.facts ?? []).map((fact) => ({
          id: fact.id,
          title: fact.title,
          detail: fact.detail,
        }))}
        appeal={appeal}
        testID="visibility-shared-record"
      />
      {record && onAppeal && appealError ? (
        <View className="mt-4 border-t border-border pt-4">
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
        </View>
      ) : null}
    </>
  );
}
