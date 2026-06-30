import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor, SharedRecord } from '@eduagent/schemas';

import { DeskLampAnimation } from '../common/DeskLampAnimation';
import { MagicPenAnimation } from '../common/MagicPenAnimation';
import { SharedRecordView } from '../visibility';
import { useSharedRecord } from './use-shared-record';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

interface SupportHubJournalTabProps {
  personScopes: readonly PersonScope[];
}

function hasShareableFacts(record?: SharedRecord): boolean {
  return (record?.supporterView.facts.length ?? 0) > 0;
}

function SupportHubJournalEmptyState({
  scope,
}: {
  scope: PersonScope;
}): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View className="mt-4 border-t border-border pt-4">
      <View
        className="h-[132px] items-center justify-center"
        pointerEvents="none"
      >
        <DeskLampAnimation
          size={108}
          testID={`support-hub-journal-empty-lamp-${scope.personId}`}
        />
        <View className="absolute bottom-0 right-6">
          <MagicPenAnimation
            size={62}
            testID={`support-hub-journal-empty-pen-${scope.personId}`}
          />
        </View>
      </View>
      <Text className="mt-3 text-center text-h3 font-semibold text-text-primary">
        {t('supportHub.journal.personPlaceholderTitle')}
      </Text>
      <Text className="mt-2 text-center text-body text-text-secondary">
        {t('supportHub.journal.emptyMessage', {
          name: scope.displayName,
        })}
      </Text>
      <Text className="mt-2 text-center text-caption text-text-secondary">
        {t('supportHub.journal.personPlaceholderMessage')}
      </Text>
    </View>
  );
}

function SupportHubJournalPersonCard({
  scope,
}: {
  scope: PersonScope;
}): React.ReactElement {
  const { t } = useTranslation();
  const query = useSharedRecord(scope);

  return (
    <View
      className="rounded-card border border-border bg-surface p-4"
      testID={`support-hub-journal-person-${scope.personId}`}
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {scope.displayName}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('supportHub.journal.personHint')}
      </Text>
      <View className="mt-3">
        {query.isLoading ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        ) : query.isError && !query.data ? (
          <SharedRecordView
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : hasShareableFacts(query.data) ? (
          <SharedRecordView
            record={query.data}
            error={null}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <SupportHubJournalEmptyState scope={scope} />
        )}
      </View>
    </View>
  );
}

export function SupportHubJournalTab({
  personScopes,
}: SupportHubJournalTabProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <ScrollView
      testID="support-hub-journal-tab"
      className="flex-1 bg-background"
      contentContainerClassName="px-5 py-4"
    >
      <Text className="text-h2 font-semibold text-text-primary">
        {t('supportHub.journal.title')}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('supportHub.journal.subtitle')}
      </Text>

      <View className="mt-4 gap-3">
        {personScopes.map((scope) => (
          <SupportHubJournalPersonCard key={scope.edgeId} scope={scope} />
        ))}
      </View>
    </ScrollView>
  );
}
