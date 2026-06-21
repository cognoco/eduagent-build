import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  supporteeStructuralSubjectsResponseSchema,
  type ScopeDescriptor,
} from '@eduagent/schemas';

import { EmptyStateCard, ErrorFallback } from '../common';
import { useApiQuery } from '../../hooks/use-api-query';
import { useApiClient } from '../../lib/api-client';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

interface PersonScopeStructuralSubjectsProps {
  scope: PersonScope;
}

export function PersonScopeStructuralSubjects({
  scope,
}: PersonScopeStructuralSubjectsProps): React.ReactElement {
  const { t } = useTranslation();
  const client = useApiClient();
  const query = useApiQuery({
    queryKey: ['supportee-structural-subjects', scope.personId, scope.edgeId],
    fetch: (signal) =>
      client.scopes[':personId'].subjects.$get(
        { param: { personId: scope.personId } },
        { init: { signal } },
      ),
    select: (json: unknown) =>
      supporteeStructuralSubjectsResponseSchema.parse(json),
  });
  const subjects = query.data?.subjects ?? [];

  if (query.isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="person-scope-structural-subjects"
      >
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (query.isError && !query.data) {
    return (
      <View
        className="flex-1 bg-background p-5"
        testID="person-scope-structural-subjects"
      >
        <ErrorFallback
          variant="card"
          title={t('supportHub.subjects.errorTitle')}
          message={t('supportHub.subjects.errorMessage')}
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => void query.refetch(),
            testID: 'person-scope-subjects-retry',
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView
      testID="person-scope-structural-subjects"
      className="flex-1 bg-background"
      contentContainerClassName="px-5 py-4"
    >
      <Text className="text-h2 font-semibold text-text-primary">
        {scope.displayName}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('supportHub.subjects.structuralOnly')}
      </Text>

      <View className="mt-4 gap-3">
        {subjects.length === 0 ? (
          <EmptyStateCard
            title={t('supportHub.subjects.personEmptyTitle')}
            message={t('supportHub.subjects.personEmptyMessage')}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => void query.refetch(),
              testID: 'person-scope-subjects-empty-refresh',
            }}
            testID="person-scope-subjects-empty-state"
          />
        ) : (
          subjects.map((subject) => (
            <View
              key={subject.id}
              className="rounded-card border border-border bg-surface p-4"
              testID={`person-scope-subject-${subject.id}`}
            >
              <Text className="text-h3 font-semibold text-text-primary">
                {subject.name}
              </Text>
              <Text className="mt-1 text-body-sm text-text-secondary">
                {t('supportHub.subjects.bookCount', {
                  count: subject.books.length,
                })}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
