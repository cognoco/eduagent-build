import { ActivityIndicator, View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor } from '@eduagent/schemas';

import { SharedRecordView } from '../visibility';
import { useSharedRecord } from './use-shared-record';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

export function PersonScopeJournalPlaceholder({
  scope,
}: {
  scope: PersonScope;
}): React.ReactElement {
  const { t } = useTranslation();
  const query = useSharedRecord(scope);

  return (
    <View
      testID="person-scope-journal-placeholder"
      className="flex-1 bg-background px-5 py-4"
    >
      <Text className="text-h2 font-semibold text-text-primary">
        {scope.displayName}
      </Text>
      <View className="mt-4">
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
