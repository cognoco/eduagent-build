import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor, SharedRecord } from '@eduagent/schemas';

import { SharedRecordView } from '../visibility';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

interface SupportHubJournalTabProps {
  personScopes: readonly PersonScope[];
}

function emptySharedRecord(scope: PersonScope, headline: string): SharedRecord {
  return {
    supportershipId: scope.edgeId,
    generatedAt: new Date().toISOString(),
    factIds: [],
    supporterView: {
      audience: 'supporter',
      factIds: [],
      headline,
      facts: [],
    },
    supporteeView: {
      audience: 'supportee',
      factIds: [],
      headline: 'There are no shareable updates yet.',
      facts: [],
    },
  };
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
          <View
            key={scope.edgeId}
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
              <SharedRecordView
                record={emptySharedRecord(
                  scope,
                  t('visibility.sharedRecord.emptyForPerson', {
                    name: scope.displayName,
                  }),
                )}
              />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
