import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  sharedRecordArtifactKindSchema,
  type ScopeDescriptor,
  type SharedRecordArtifactKind,
} from '@eduagent/schemas';

import { Button, ErrorFallback } from '../../../../../components/common';
import { StructuralFactCard } from '../../../../../components/learning-surface';
import { useSharedRecord } from '../../../../../components/support/use-shared-record';
import { firstParam } from '../../../../../lib/route-params';
import { useScopeContext } from '../../../../../lib/scope-context';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

function isStaleArtifactError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return status === 403 || status === 404 || status === 410;
}

function StaleArtifact({
  artifactKind,
  onBack,
}: {
  artifactKind?: SharedRecordArtifactKind;
  onBack: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const title =
    artifactKind === 'weekly_report'
      ? t('parentView.weeklyReport.reportGoneTitle')
      : artifactKind === 'session_recap'
        ? t('recaps.notFoundTitle')
        : t('errors.resourceNotFound');
  const message =
    artifactKind === 'weekly_report'
      ? t('parentView.weeklyReport.reportGoneBody')
      : artifactKind === 'session_recap'
        ? t('recaps.notFoundMessage')
        : t('errors.resourceGone');

  return (
    <View className="flex-1 bg-background px-5 py-4">
      <ErrorFallback
        title={title}
        message={message}
        primaryAction={{
          label: t('common.goBack'),
          onPress: onBack,
          testID: 'person-journal-artifact-stale-back',
        }}
        testID="person-journal-artifact-stale"
      />
    </View>
  );
}

function ArtifactLoading(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 items-center justify-center bg-background"
      testID="person-journal-artifact-loading"
    >
      <ActivityIndicator accessibilityLabel={t('common.loading')} />
    </View>
  );
}

function AuthorizedArtifact({
  scope,
  artifactKind,
  artifactId,
  onBack,
}: {
  scope: PersonScope;
  artifactKind: SharedRecordArtifactKind;
  artifactId: string;
  onBack: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const { setActiveScope } = useScopeContext();
  const query = useSharedRecord(scope);

  useEffect(() => {
    setActiveScope(scope);
  }, [scope, setActiveScope]);

  if (query.isLoading) {
    return <ArtifactLoading />;
  }

  if (query.isError && isStaleArtifactError(query.error)) {
    return <StaleArtifact artifactKind={artifactKind} onBack={onBack} />;
  }

  if (query.isError && !query.data) {
    return (
      <View className="flex-1 bg-background px-5 py-4">
        <ErrorFallback
          title={t('visibility.sharedRecord.errorTitle')}
          message={t('visibility.sharedRecord.errorMessage')}
          primaryAction={{
            label: t('visibility.sharedRecord.retry'),
            onPress: () => void query.refetch(),
            testID: 'person-journal-artifact-retry',
          }}
          secondaryAction={{
            label: t('common.goBack'),
            onPress: onBack,
            testID: 'person-journal-artifact-error-back',
          }}
          testID="person-journal-artifact-error"
        />
      </View>
    );
  }

  const fact = query.data?.supporterView.facts.find(
    (candidate) =>
      candidate.artifact?.kind === artifactKind &&
      candidate.artifact.id === artifactId,
  );

  if (!fact) {
    return <StaleArtifact artifactKind={artifactKind} onBack={onBack} />;
  }

  return (
    <View
      className="flex-1 bg-background px-5 py-4"
      testID={`person-journal-artifact-${artifactKind}-${artifactId}`}
    >
      <View className="mb-4 items-start">
        <Button
          label={t('common.goBack')}
          onPress={onBack}
          variant="tertiary"
          testID="person-journal-artifact-back"
        />
      </View>
      <Text className="mb-4 text-h2 font-semibold text-text-primary">
        {scope.displayName}
      </Text>
      <StructuralFactCard
        headline={fact.title}
        structuralOnlyLabel={t('visibility.sharedRecord.structuralOnly')}
        facts={fact.detail ? [{ id: fact.id, title: fact.detail }] : []}
        testID="person-journal-artifact-detail"
      />
    </View>
  );
}

export default function PersonJournalArtifactScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{
    personId?: string | string[];
    artifactKind?: string | string[];
    artifactId?: string | string[];
  }>();
  const { availableScopes, isLoading: scopesLoading } = useScopeContext();
  const personId = firstParam(params.personId);
  const artifactId = firstParam(params.artifactId);
  const artifactKindResult = sharedRecordArtifactKindSchema.safeParse(
    firstParam(params.artifactKind),
  );
  const scope = availableScopes.find(
    (candidate): candidate is PersonScope =>
      candidate.kind === 'person' && candidate.personId === personId,
  );
  const onBack = (): void => {
    router.replace('/(app)/journal');
  };

  if (!personId || !artifactId || !artifactKindResult.success) {
    return (
      <StaleArtifact
        artifactKind={
          artifactKindResult.success ? artifactKindResult.data : undefined
        }
        onBack={onBack}
      />
    );
  }

  if (scopesLoading) {
    return <ArtifactLoading />;
  }

  if (!scope) {
    return (
      <StaleArtifact artifactKind={artifactKindResult.data} onBack={onBack} />
    );
  }

  return (
    <AuthorizedArtifact
      scope={scope}
      artifactKind={artifactKindResult.data}
      artifactId={artifactId}
      onBack={onBack}
    />
  );
}
