import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor } from '@eduagent/schemas';

import { SharedRecordView } from '../visibility';
import { useSharedRecord } from './use-shared-record';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

interface SupportHubJournalTabProps {
  personScopes: readonly PersonScope[];
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
        ) : (
          <SharedRecordView
            record={query.data}
            error={query.isError && !query.data ? query.error : null}
            onRetry={() => void query.refetch()}
          />
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
