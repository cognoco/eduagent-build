import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  supporterRelationSchema,
  visibilityContractSchema,
  type SupporterRelation,
} from '@eduagent/schemas';

import { ErrorFallback } from '../../../components/common';
import { assertOk } from '../../../lib/assert-ok';
import { useApiClient } from '../../../lib/api-client';
import { formatApiError } from '../../../lib/format-api-error';
import {
  useEligibleManagedPersons,
  type EligibleManagedPerson,
} from '../../../hooks/use-eligible-supportees';
import { useProfile } from '../../../lib/profile';
import { firstParam } from '../../../lib/route-params';

// A pre-filled `relation` param (e.g. from `pushLinkInitiateForManagedPerson`)
// is parsed as-is; a param-less arrival (the inline picker path below)
// defaults to 'parent' — the overwhelmingly common case (a supporter linking
// their own managed child) — rather than falling through to 'other'.
function parseRelation(value: string | undefined): SupporterRelation {
  if (value === undefined) return 'parent';
  return supporterRelationSchema.catch('other').parse(value);
}

// [WI-1137] Ratified requirement (MVP-DEFINITION.md §1 / RUNWAY.md 1C,
// 2026-07-10): this screen's picker must cover BOTH the managed-child flow
// and the join-my-family existing-account 13+ teen flow (WI-1753), not ship
// scoped to managed children only. WI-1753's cross-account identify/invite
// backend does not exist yet, so the `existingTeen` branch is a structural
// affordance only (no invite call) — it routes to an explicit "not yet
// available" state rather than a silent no-op, so the two items can land in
// either order without a picker rewrite.
type SupporteeTarget =
  | { kind: 'managedPerson'; personId: string; displayName?: string }
  | { kind: 'existingTeen' };

export default function InitiateLinkScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const eligibleManagedPersons = useEligibleManagedPersons();
  const params = useLocalSearchParams<{
    supporteePersonId?: string | string[];
    supporteeName?: string | string[];
    relation?: string | string[];
    managedTier?: string | string[];
  }>();
  const paramSupporteePersonId = firstParam(params.supporteePersonId);
  const paramSupporteeName = firstParam(params.supporteeName);
  const managedTier = firstParam(params.managedTier) === 'true';

  const [target, setTarget] = useState<SupporteeTarget | null>(() =>
    paramSupporteePersonId
      ? {
          kind: 'managedPerson',
          personId: paramSupporteePersonId,
          displayName: paramSupporteeName,
        }
      : null,
  );
  const [relation, setRelation] = useState<SupporterRelation>(() =>
    parseRelation(firstParam(params.relation)),
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const supporterPersonId = activeProfile?.id;
      if (!supporterPersonId || !target || target.kind !== 'managedPerson') {
        throw new Error(t('visibility.link.missingCreateParams'));
      }
      const res = await client.visibility.links.$post({
        json: {
          supporterPersonId,
          supporteePersonId: target.personId,
          relation,
          managedTier,
        },
      });
      const okRes = await assertOk(res);
      return visibilityContractSchema.parse(await okRes.json());
    },
    onSuccess: (contract) => {
      router.replace({
        pathname: '/(app)/link/[contractId]',
        params: {
          contractId: contract.id,
          audience: 'supporter',
          ...(target?.kind === 'managedPerson' && target.displayName
            ? { supporteeName: target.displayName }
            : {}),
        },
      } as Href);
    },
  });

  if (target === null) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 p-5"
        contentInsetAdjustmentBehavior="automatic"
        testID="visibility-link-initiate-screen"
      >
        <SupporteePicker
          eligibleManagedPersons={eligibleManagedPersons}
          onSelectManagedPerson={(person) =>
            setTarget({
              kind: 'managedPerson',
              personId: person.id,
              displayName: person.displayName,
            })
          }
          onSelectExistingTeen={() => setTarget({ kind: 'existingTeen' })}
        />
      </ScrollView>
    );
  }

  if (target.kind === 'existingTeen') {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 p-5"
        contentInsetAdjustmentBehavior="automatic"
        testID="visibility-link-initiate-screen"
      >
        <ExistingTeenUnavailable onBack={() => setTarget(null)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-5"
      contentInsetAdjustmentBehavior="automatic"
      testID="visibility-link-initiate-screen"
    >
      <View>
        <Text className="text-display-sm font-semibold text-text-primary">
          {t('visibility.link.createTitle')}
        </Text>
        <Text className="mt-2 text-body text-text-secondary">
          {t('visibility.link.createMessage', {
            supporteeName:
              target.displayName ?? t('visibility.contract.supporteeFallback'),
          })}
        </Text>
      </View>
      <RelationSelector value={relation} onChange={setRelation} />
      <View className="rounded-card border border-border bg-surface p-4">
        <Text className="text-h3 font-semibold text-text-primary">
          {t('visibility.link.createSummaryTitle')}
        </Text>
        <Text className="mt-2 text-body-sm text-text-secondary">
          {t('visibility.contract.reportableKinds')}
        </Text>
        <Text className="mt-2 text-body-sm text-text-secondary">
          {t('visibility.contract.artifactWall')}
        </Text>
        <Text className="mt-2 text-body-sm text-text-secondary">
          {t('visibility.contract.renderEquivalence')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('visibility.link.createAction')}
        className="min-h-[48px] items-center justify-center rounded-button bg-primary px-4 py-3"
        onPress={() => createMutation.mutate()}
        testID="visibility-link-create"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {createMutation.isPending
            ? t('visibility.link.creating')
            : t('visibility.link.createAction')}
        </Text>
      </Pressable>
      {createMutation.isError ? (
        <ErrorFallback
          title={t('visibility.link.createErrorTitle')}
          message={formatApiError(createMutation.error)}
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => createMutation.mutate(),
            testID: 'visibility-link-create-retry',
          }}
          testID="visibility-link-create-error"
        />
      ) : null}
    </ScrollView>
  );
}

function SupporteePicker({
  eligibleManagedPersons,
  onSelectManagedPerson,
  onSelectExistingTeen,
}: {
  eligibleManagedPersons: readonly EligibleManagedPerson[];
  onSelectManagedPerson: (person: EligibleManagedPerson) => void;
  onSelectExistingTeen: () => void;
}): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View testID="visibility-link-initiate-picker">
      <Text className="text-display-sm font-semibold text-text-primary">
        {t('visibility.link.pickerTitle')}
      </Text>
      {eligibleManagedPersons.length === 0 ? (
        <Text
          className="mt-3 text-body-sm text-text-secondary"
          testID="visibility-link-initiate-picker-empty"
        >
          {t('visibility.link.pickerManagedEmpty')}
        </Text>
      ) : (
        <View className="mt-3 gap-2">
          {eligibleManagedPersons.map((person) => (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityLabel={person.displayName}
              className="min-h-[48px] justify-center rounded-card bg-surface px-4 py-3"
              onPress={() => onSelectManagedPerson(person)}
              testID={`visibility-link-initiate-picker-managed-${person.id}`}
            >
              <Text className="text-body font-semibold text-text-primary">
                {person.displayName}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('visibility.link.pickerExistingTeenOption')}
        className="mt-4 min-h-[48px] justify-center rounded-card border border-border px-4 py-3"
        onPress={onSelectExistingTeen}
        testID="visibility-link-initiate-picker-existing-teen"
      >
        <Text className="text-body font-semibold text-text-primary">
          {t('visibility.link.pickerExistingTeenOption')}
        </Text>
      </Pressable>
    </View>
  );
}

function ExistingTeenUnavailable({
  onBack,
}: {
  onBack: () => void;
}): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View
      className="rounded-card border border-border bg-surface p-4"
      testID="visibility-link-initiate-existing-teen-unavailable"
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {t('visibility.link.existingTeenUnavailableTitle')}
      </Text>
      <Text className="mt-2 text-body text-text-secondary">
        {t('visibility.link.existingTeenUnavailableMessage')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.goBack')}
        className="mt-4 min-h-[44px] items-center justify-center rounded-button border border-border px-4 py-2"
        onPress={onBack}
        testID="visibility-link-initiate-existing-teen-back"
      >
        <Text className="text-body-sm font-semibold text-text-secondary">
          {t('common.goBack')}
        </Text>
      </Pressable>
    </View>
  );
}

function RelationSelector({
  value,
  onChange,
}: {
  value: SupporterRelation;
  onChange: (relation: SupporterRelation) => void;
}): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View testID="visibility-link-relation-selector">
      <Text className="text-body-sm font-semibold text-text-secondary">
        {t('visibility.link.relationLabel')}
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {supporterRelationSchema.options.map((option) => {
          const isSelected = option === value;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={t(`visibility.relation.${option}`)}
              className={`min-h-[44px] items-center justify-center rounded-button border-2 px-4 py-2 ${
                isSelected ? 'border-primary' : 'border-transparent bg-surface'
              }`}
              onPress={() => onChange(option)}
              testID={`visibility-link-relation-${option}`}
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                {t(`visibility.relation.${option}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
