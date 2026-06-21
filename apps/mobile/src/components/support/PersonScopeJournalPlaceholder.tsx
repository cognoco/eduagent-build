import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor, SharedRecord } from '@eduagent/schemas';

import { SharedRecordView } from '../visibility';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

export function PersonScopeJournalPlaceholder({
  scope,
}: {
  scope: PersonScope;
}): React.ReactElement {
  const { t } = useTranslation();
  const emptyRecord: SharedRecord = {
    supportershipId: scope.edgeId,
    generatedAt: new Date().toISOString(),
    factIds: [],
    supporterView: {
      audience: 'supporter',
      factIds: [],
      headline: t('visibility.sharedRecord.emptyTitle'),
      facts: [],
    },
    supporteeView: {
      audience: 'supportee',
      factIds: [],
      headline: t('visibility.sharedRecord.emptyTitle'),
      facts: [],
    },
  };

  return (
    <View
      testID="person-scope-journal-placeholder"
      className="flex-1 bg-background px-5 py-4"
    >
      <Text className="text-h2 font-semibold text-text-primary">
        {scope.displayName}
      </Text>
      <View className="mt-4">
        <SharedRecordView record={emptyRecord} />
      </View>
      <View className="mt-4 rounded-card border border-border bg-surface p-4">
        <Text className="text-h3 font-semibold text-text-primary">
          {t('supportHub.journal.personPlaceholderTitle')}
        </Text>
        <Text className="mt-2 text-body text-text-secondary">
          {t('supportHub.journal.personPlaceholderMessage')}
        </Text>
      </View>
    </View>
  );
}
