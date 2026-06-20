import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor } from '@eduagent/schemas';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

interface SupportHubSubjectsTabProps {
  personScopes: readonly PersonScope[];
  onOpenPersonScope: (scope: PersonScope) => void;
}

export function SupportHubSubjectsTab({
  personScopes,
  onOpenPersonScope,
}: SupportHubSubjectsTabProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <ScrollView
      testID="support-hub-subjects-tab"
      className="flex-1 bg-background"
      contentContainerClassName="px-5 py-4"
    >
      <Text className="text-h2 font-semibold text-text-primary">
        {t('supportHub.subjects.title')}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('supportHub.subjects.subtitle')}
      </Text>

      <View className="mt-4 gap-3">
        {personScopes.length === 0 ? (
          <View className="rounded-card border border-border bg-surface p-4">
            <Text className="text-body text-text-secondary">
              {t('supportHub.subjects.empty')}
            </Text>
          </View>
        ) : (
          personScopes.map((scope) => (
            <Pressable
              key={scope.edgeId}
              accessibilityRole="button"
              accessibilityLabel={t('supportHub.subjects.openPerson', {
                name: scope.displayName,
              })}
              onPress={() => onOpenPersonScope(scope)}
              className="rounded-card border border-border bg-surface p-4"
              testID={`support-hub-subjects-person-${scope.personId}`}
            >
              <Text className="text-h3 font-semibold text-text-primary">
                {scope.displayName}
              </Text>
              <Text className="mt-1 text-body-sm text-text-secondary">
                {t('supportHub.subjects.personHint')}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}
