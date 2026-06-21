import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor } from '@eduagent/schemas';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

interface SupportHubMentorTabProps {
  personScopes: readonly PersonScope[];
  activePersonScope?: PersonScope;
  onOpenPersonScope?: (scope: PersonScope) => void;
}

export function SupportHubMentorTab({
  personScopes,
  activePersonScope,
  onOpenPersonScope,
}: SupportHubMentorTabProps): React.ReactElement {
  const { t } = useTranslation();
  const title = activePersonScope
    ? t('supportHub.mentor.personTitle', {
        name: activePersonScope.displayName,
      })
    : t('supportHub.mentor.title');

  return (
    <ScrollView
      testID={
        activePersonScope ? 'person-scope-mentor-tab' : 'support-hub-mentor-tab'
      }
      className="flex-1 bg-background"
      contentContainerClassName="px-5 py-4"
    >
      <Text className="text-h2 font-semibold text-text-primary">{title}</Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {activePersonScope
          ? t('supportHub.mentor.personSubtitle')
          : t('supportHub.mentor.subtitle')}
      </Text>

      <View className="mt-4 gap-3">
        {personScopes.length === 0 ? (
          <View className="rounded-card border border-border bg-surface p-4">
            <Text className="text-body text-text-secondary">
              {t('supportHub.mentor.empty')}
            </Text>
          </View>
        ) : (
          personScopes.map((scope) => (
            <Pressable
              key={scope.edgeId}
              accessibilityRole="button"
              accessibilityLabel={t('supportHub.mentor.openPerson', {
                name: scope.displayName,
              })}
              onPress={() => onOpenPersonScope?.(scope)}
              className="rounded-card border border-border bg-surface p-4"
              testID={`support-hub-mentor-person-${scope.personId}`}
            >
              <Text className="text-h3 font-semibold text-text-primary">
                {scope.displayName}
              </Text>
              <Text className="mt-1 text-body-sm text-text-secondary">
                {t('supportHub.mentor.personHint')}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}
