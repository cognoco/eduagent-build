import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type {
  AppealReport,
  SharedRecord,
  SharedRecordArtifactRef,
} from '@eduagent/schemas';

import { ErrorFallback } from '../common/ErrorFallback';
import { StructuralFactCard } from '../learning-surface';
import {
  renderSharedRecordFact,
  renderSharedRecordHeadline,
} from '../support/shared-record-fact-copy';

interface SharedRecordViewProps {
  record?: SharedRecord;
  error?: Error | null;
  onRetry?: () => void;
  onAppeal?: () => void;
  appealPending?: boolean;
  appealReport?: AppealReport;
  appealError?: Error | null;
  onRetryAppeal?: () => void;
  supporteeName?: string;
  onOpenArtifact?: (artifact: SharedRecordArtifactRef) => void;
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
  supporteeName,
  onOpenArtifact,
}: SharedRecordViewProps): React.ReactElement {
  const { t, i18n } = useTranslation();

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
        ? {
            state: 'pending' as const,
            label: t('common.loading'),
            testID: 'visibility-appeal-pending',
          }
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
        headline={
          view
            ? renderSharedRecordHeadline(view, t, supporteeName)
            : t('visibility.sharedRecord.emptyTitle')
        }
        structuralOnlyLabel={t('visibility.sharedRecord.structuralOnly')}
        facts={(view?.facts ?? []).map((fact) => {
          const artifact = fact.artifact;

          return {
            id: fact.id,
            ...renderSharedRecordFact(fact, t, i18n.language),
            ...(artifact && onOpenArtifact
              ? {
                  onPress: () => onOpenArtifact(artifact),
                  testID: `journal-artifact-${artifact.kind}-${artifact.id}`,
                }
              : {}),
          };
        })}
        appeal={appeal}
        testID="visibility-shared-record"
      />
      {record?.unavailableFactCount ? (
        <Text
          testID="visibility-shared-record-unavailable"
          className="mt-2 text-caption text-text-secondary"
        >
          {t('visibility.sharedRecord.unavailable', {
            count: record.unavailableFactCount,
          })}
        </Text>
      ) : null}
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
