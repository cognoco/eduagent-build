import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor, SharedRecord } from '@eduagent/schemas';

import type { EligibleManagedPerson } from '../../hooks/use-eligible-supportees';
import { SupportPersonPickerSheet } from './SupportPersonPickerSheet';
import { useSharedRecord } from './use-shared-record';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

interface SupportHubMentorTabProps {
  personScopes: readonly PersonScope[];
  activePersonScope?: PersonScope;
  onOpenPersonScope?: (scope: PersonScope) => void;
  onOpenSubjects?: (scope: PersonScope) => void;
  onOpenJournal?: (scope: PersonScope) => void;
  /** WI-1393 — managed persons without an existing visibility contract. */
  eligiblePersons?: readonly EligibleManagedPerson[];
  /** WI-1393 — navigates to `/(app)/link/new` with the selected person. */
  onSelectEligiblePerson?: (person: EligibleManagedPerson) => void;
  /** WI-1393 — 0-eligible degrade: guides the owner to add a child first. */
  onAddChildFallback?: () => void;
}

function hasShareableFacts(record?: SharedRecord): boolean {
  return (record?.supporterView.facts.length ?? 0) > 0;
}

function SupportHubActionButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress?: () => void;
  testID: string;
}): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      className="rounded-card border border-border bg-background px-3 py-2"
    >
      <Text className="text-center text-label font-semibold text-text-primary">
        {label}
      </Text>
    </Pressable>
  );
}

function SupportHubMentorPersonCard({
  scope,
  onOpenPersonScope,
  onOpenSubjects,
  onOpenJournal,
}: {
  scope: PersonScope;
  onOpenPersonScope?: (scope: PersonScope) => void;
  onOpenSubjects?: (scope: PersonScope) => void;
  onOpenJournal?: (scope: PersonScope) => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const query = useSharedRecord(scope);
  const facts = query.data?.supporterView.facts.slice(0, 2) ?? [];

  return (
    <View
      className="rounded-card border border-border bg-surface p-4"
      testID={`support-hub-mentor-person-${scope.personId}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-h3 font-semibold text-text-primary">
            {scope.displayName}
          </Text>
          <Text className="mt-1 text-body-sm text-text-secondary">
            {query.data?.supporterView.headline ??
              t('supportHub.mentor.loadingHeadline')}
          </Text>
        </View>
        {query.isLoading ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        ) : null}
      </View>

      {query.isError && !query.data ? (
        <View className="mt-3 rounded-card border border-border bg-background p-3">
          <Text className="text-body-sm font-semibold text-text-primary">
            {t('supportHub.mentor.errorTitle')}
          </Text>
          <Text className="mt-1 text-body-sm text-text-secondary">
            {t('supportHub.mentor.errorMessage')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void query.refetch()}
            testID={`support-hub-mentor-retry-${scope.personId}`}
            className="mt-3 rounded-card border border-border px-3 py-2"
          >
            <Text className="text-center text-label font-semibold text-text-primary">
              {t('common.tryAgain')}
            </Text>
          </Pressable>
        </View>
      ) : hasShareableFacts(query.data) ? (
        <View className="mt-3 gap-3">
          <Text className="text-caption text-text-secondary">
            {t('supportHub.mentor.structuralOnly')}
          </Text>
          {facts.map((fact) => (
            <View
              key={fact.id}
              className="border-t border-border pt-3"
              testID={`support-hub-mentor-fact-${fact.id}`}
            >
              <Text className="text-caption font-semibold uppercase text-text-secondary">
                {fact.kind === 'mastery'
                  ? t('supportHub.mentor.factKind.mastery')
                  : fact.kind === 'effort'
                    ? t('supportHub.mentor.factKind.effort')
                    : t('supportHub.mentor.factKind.observable_engagement')}
              </Text>
              <Text className="mt-1 text-body font-semibold text-text-primary">
                {fact.title}
              </Text>
              {fact.detail ? (
                <Text className="mt-1 text-body-sm text-text-secondary">
                  {fact.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : query.data ? (
        <View className="mt-3 rounded-card border border-border bg-background p-3">
          <Text className="text-body-sm font-semibold text-text-primary">
            {t('supportHub.mentor.emptyCardTitle')}
          </Text>
          <Text className="mt-1 text-body-sm text-text-secondary">
            {t('supportHub.mentor.emptyCardMessage', {
              name: scope.displayName,
            })}
          </Text>
        </View>
      ) : null}

      <View className="mt-4 gap-2">
        <SupportHubActionButton
          label={t('supportHub.mentor.actionMentor')}
          onPress={() => onOpenPersonScope?.(scope)}
          testID={`support-hub-mentor-open-${scope.personId}`}
        />
        <View className="flex-row gap-2">
          <View className="flex-1">
            <SupportHubActionButton
              label={t('supportHub.mentor.actionSubjects')}
              onPress={() => onOpenSubjects?.(scope)}
              testID={`support-hub-subjects-open-${scope.personId}`}
            />
          </View>
          <View className="flex-1">
            <SupportHubActionButton
              label={t('supportHub.mentor.actionJournal')}
              onPress={() => onOpenJournal?.(scope)}
              testID={`support-hub-journal-open-${scope.personId}`}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

export function SupportHubMentorTab({
  personScopes,
  activePersonScope,
  onOpenPersonScope,
  onOpenSubjects,
  onOpenJournal,
  eligiblePersons = [],
  onSelectEligiblePerson,
  onAddChildFallback,
}: SupportHubMentorTabProps): React.ReactElement {
  const { t } = useTranslation();
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const title = activePersonScope
    ? t('supportHub.mentor.personTitle', {
        name: activePersonScope.displayName,
      })
    : t('supportHub.mentor.title');

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
      testID={
        activePersonScope ? 'person-scope-mentor-tab' : 'support-hub-mentor-tab'
      }
      className="flex-1 bg-background"
      contentContainerClassName="px-5 py-4"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-h2 font-semibold text-text-primary">
            {title}
          </Text>
          <Text className="mt-1 text-body-sm text-text-secondary">
            {activePersonScope
              ? t('supportHub.mentor.personSubtitle')
              : t('supportHub.mentor.subtitle')}
          </Text>
        </View>
        {/* Persistent header affordance for the populated hub. When there are
            no person scopes, the cold-start empty state below owns the single
            "Start supporting" CTA — rendering both would give two controls the
            same accessibility label. */}
        {!activePersonScope && personScopes.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('supportHub.mentor.addSupporterLabel')}
            onPress={() => setIsPickerVisible(true)}
            className="rounded-card border border-border bg-background px-3 py-2"
            testID="support-hub-mentor-add-supporter"
          >
            <Text className="text-label font-semibold text-text-primary">
              {t('supportHub.mentor.addSupporterLabel')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View className="mt-4 gap-3">
        {personScopes.length === 0 ? (
          <View className="rounded-card border border-border bg-surface p-4">
            <Text className="text-body text-text-secondary">
              {t('supportHub.mentor.empty')}
            </Text>
            {!activePersonScope ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('supportHub.mentor.addSupporterLabel')}
                onPress={() => setIsPickerVisible(true)}
                className="mt-3 min-h-[44px] items-center justify-center rounded-button bg-primary px-4 py-3"
                testID="support-hub-mentor-empty-add"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('supportHub.mentor.addSupporterLabel')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          personScopes.map((scope) => (
            <SupportHubMentorPersonCard
              key={scope.edgeId}
              scope={scope}
              onOpenPersonScope={onOpenPersonScope}
              onOpenSubjects={onOpenSubjects}
              onOpenJournal={onOpenJournal}
            />
          ))
        )}
      </View>

      {!activePersonScope ? (
        <SupportPersonPickerSheet
          visible={isPickerVisible}
          eligiblePersons={eligiblePersons}
          onSelectPerson={handleSelectPerson}
          onAddChild={handleAddChild}
          onClose={() => setIsPickerVisible(false)}
        />
      ) : null}
    </ScrollView>
  );
}
