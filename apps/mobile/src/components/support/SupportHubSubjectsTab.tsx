import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor } from '@eduagent/schemas';

import type { EligibleManagedPerson } from '../../hooks/use-eligible-supportees';
import { SupportPersonPickerSheet } from './SupportPersonPickerSheet';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

interface SupportHubSubjectsTabProps {
  personScopes: readonly PersonScope[];
  onOpenPersonScope: (scope: PersonScope) => void;
  /** WI-1393 — managed persons without an existing visibility contract. */
  eligiblePersons?: readonly EligibleManagedPerson[];
  /** WI-1393 — navigates to `/(app)/link/new` with the selected person. */
  onSelectEligiblePerson?: (person: EligibleManagedPerson) => void;
  /** WI-1393 — 0-eligible degrade: guides the owner to add a child first. */
  onAddChildFallback?: () => void;
}

export function SupportHubSubjectsTab({
  personScopes,
  onOpenPersonScope,
  eligiblePersons = [],
  onSelectEligiblePerson,
  onAddChildFallback,
}: SupportHubSubjectsTabProps): React.ReactElement {
  const { t } = useTranslation();
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  const handleSelectPerson = (person: EligibleManagedPerson): void => {
    setIsPickerVisible(false);
    onSelectEligiblePerson?.(person);
  };

  const handleAddChild = (): void => {
    setIsPickerVisible(false);
    onAddChildFallback?.();
  };

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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('supportHub.subjects.addSupporterLabel')}
              onPress={() => setIsPickerVisible(true)}
              className="mt-3 min-h-[44px] items-center justify-center rounded-button bg-primary px-4 py-3"
              testID="support-hub-subjects-empty-add"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('supportHub.subjects.addSupporterLabel')}
              </Text>
            </Pressable>
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

      <SupportPersonPickerSheet
        visible={isPickerVisible}
        eligiblePersons={eligiblePersons}
        onSelectPerson={handleSelectPerson}
        onAddChild={handleAddChild}
        onClose={() => setIsPickerVisible(false)}
      />
    </ScrollView>
  );
}
