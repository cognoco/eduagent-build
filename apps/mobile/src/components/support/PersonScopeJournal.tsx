import { ActivityIndicator, ScrollView, View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor, SharedRecord } from '@eduagent/schemas';
import { useRouter } from 'expo-router';

import { DeskLampAnimation } from '../common/DeskLampAnimation';
import { MagicPenAnimation } from '../common/MagicPenAnimation';
import { SharedRecordView } from '../visibility';
import { useAppealVisibility, useSharedRecord } from './use-shared-record';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

function hasShareableFacts(record?: SharedRecord): boolean {
  return (record?.supporterView.facts.length ?? 0) > 0;
}

function PersonScopeJournalEmptyState({
  scope,
}: {
  scope: PersonScope;
}): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View className="mt-4 rounded-card border border-border bg-surface p-5">
      <View
        className="h-[148px] items-center justify-center"
        pointerEvents="none"
      >
        <DeskLampAnimation
          size={118}
          testID="person-scope-journal-empty-lamp"
        />
        <View className="absolute bottom-0 right-5">
          <MagicPenAnimation
            size={68}
            testID="person-scope-journal-empty-pen"
          />
        </View>
      </View>
      <Text className="mt-3 text-center text-h3 font-semibold text-text-primary">
        {t('supportHub.journal.personPlaceholderTitle')}
      </Text>
      <Text className="mt-2 text-center text-body text-text-secondary">
        {t('supportHub.journal.emptyMessage', { name: scope.displayName })}
      </Text>
      <Text className="mt-2 text-center text-caption text-text-secondary">
        {t('supportHub.journal.personPlaceholderMessage')}
      </Text>
    </View>
  );
}

export function PersonScopeJournal({
  scope,
}: {
  scope: PersonScope;
}): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const query = useSharedRecord(scope);
  const appeal = useAppealVisibility(scope);

  return (
    <ScrollView
      testID="person-scope-journal"
      className="flex-1 bg-background"
      contentContainerClassName="px-5 py-4"
    >
      <Text className="text-h2 font-semibold text-text-primary">
        {scope.displayName}
      </Text>
      <View className="mt-4">
        {query.isLoading ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        ) : query.isError ? (
          <SharedRecordView
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : hasShareableFacts(query.data) ? (
          <SharedRecordView
            record={query.data}
            supporteeName={scope.displayName}
            error={null}
            onRetry={() => void query.refetch()}
            onAppeal={() => appeal.mutate()}
            appealPending={appeal.isPending}
            appealReport={appeal.data}
            appealError={appeal.error}
            onRetryAppeal={() => appeal.mutate()}
            onOpenArtifact={(artifact) => {
              // Already inside the Journal stack; dynamic segments identify the leaf artifact.
              router.push({
                pathname:
                  '/(app)/journal/[personId]/[artifactKind]/[artifactId]',
                params: {
                  personId: scope.personId,
                  artifactKind: artifact.kind,
                  artifactId: artifact.id,
                },
              });
            }}
          />
        ) : (
          <PersonScopeJournalEmptyState scope={scope} />
        )}
      </View>
    </ScrollView>
  );
}
