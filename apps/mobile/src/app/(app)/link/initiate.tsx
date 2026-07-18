import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  supporterRelationSchema,
  visibilityContractSchema,
  type SupporterRelation,
} from '@eduagent/schemas';

import { ErrorFallback } from '../../../components/common';
import { assertOk } from '../../../lib/assert-ok';
import { useApiClient } from '../../../lib/api-client';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { formatApiError } from '../../../lib/format-api-error';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
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

  // [WI-2188 rework] `createMutation.reset()` (in the confirmation Back
  // handler below) only clears TanStack Query's *observer* state — it does
  // not cancel an already in-flight request. Without this guard, a create
  // request that resolves successfully AFTER the user has backed out still
  // ran its unconditional `onSuccess`, pulling them forward into the
  // contract screen they had just exited. Set on Back, checked in
  // `onSuccess`, and cleared before every new submit so a later, deliberate
  // create still navigates normally.
  const hasExitedRef = useRef(false);

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
      if (hasExitedRef.current) return;
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
        {/* [WI-2188] `_layout.tsx` hides the native Stack header for this
            whole route group, so this is the ceremony's only exit affordance
            here — canGoBack() is true for support-hub entry (mentor.tsx /
            subjects.tsx push this screen as a single push), false for a
            historyless direct/deep-link entry, which falls back to the same
            V2 home used by the sibling `[contractId].tsx` back button. */}
        <LinkCeremonyBackButton
          onPress={() => goBackOrReplace(router, '/(app)/home')}
          testID="visibility-link-initiate-picker-back"
        />
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
        {/* [WI-1753] The real cross-account invite flow is gated behind
            MODE_NAV_V2_ENABLED; other environments keep the "not yet available"
            placeholder so the shipped production behavior does not change. */}
        {FEATURE_FLAGS.MODE_NAV_V2_ENABLED ? (
          <ExistingTeenInvite onBack={() => setTarget(null)} />
        ) : (
          <ExistingTeenUnavailable onBack={() => setTarget(null)} />
        )}
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
      {/* [WI-2188] Discriminated by entry shape, reusing the two exit
          handlers this screen already has rather than inventing a third:
          reached via the inline picker (no supporteePersonId param) → back
          to the picker (same `setTarget(null)` shape the existingTeen
          branches already use above); reached via a pre-filled param (the
          `pushLinkInitiateForManagedPerson` direct-entry path, which skips
          the picker entirely) → there is no picker to return to, so this
          falls straight back to support-hub/fallback like the picker's own
          back button — AC-3 requires support-hub entry to return there in
          one step, not two. */}
      <LinkCeremonyBackButton
        onPress={() => {
          if (paramSupporteePersonId) {
            goBackOrReplace(router, '/(app)/home');
            return;
          }
          // Reset the mutation alongside the state change: without this, a
          // prior failed submit's `isError` state survives the trip back to
          // the picker and re-selecting a person re-renders the confirmation
          // step with the stale error already showing, before this attempt
          // has submitted anything.
          //
          // reset() does not cancel a request already in flight — mark that
          // the user has exited so a late-resolving success (see
          // `hasExitedRef` above) cannot navigate them forward again.
          hasExitedRef.current = true;
          createMutation.reset();
          setTarget(null);
        }}
        testID="visibility-link-initiate-confirm-back"
      />
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
        onPress={() => {
          hasExitedRef.current = false;
          createMutation.mutate();
        }}
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
            onPress: () => {
              hasExitedRef.current = false;
              createMutation.mutate();
            },
            testID: 'visibility-link-create-retry',
          }}
          testID="visibility-link-create-error"
        />
      ) : null}
    </ScrollView>
  );
}

// [WI-2188] Shared in-app exit for the two ceremony steps that previously had
// none (the initial picker and the managed-person confirmation step). Styled
// to match the sibling `link/[contractId].tsx` back button (same chevron +
// "common.goBack" label + tap-target sizing) so the `link/*` route family's
// back affordance stays visually consistent. Never submits or mutates — the
// caller supplies pure navigation/state-reset `onPress` handlers.
function LinkCeremonyBackButton({
  onPress,
  testID,
}: {
  onPress: () => void;
  testID: string;
}): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.goBack')}
      className="min-h-[44px] flex-row items-center gap-2 self-start rounded-button border border-border px-4 py-2"
      onPress={onPress}
      testID={testID}
    >
      <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
      <Text className="text-body-sm font-semibold text-text-secondary">
        {t('common.goBack')}
      </Text>
    </Pressable>
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

// [WI-1753] Cross-account existing-teen invite (join-my-family v1). ANTI-ENUM
// (AC-1): the endpoint returns a byte-identical neutral ack regardless of
// whether the email matches an account, so the confirmation copy is deliberately
// neutral ("if that email belongs to a MentoMate account…") — it never confirms
// or denies that an account exists. The invite disclosure copy is subject to the
// AC-1 operator disclosure review.
function ExistingTeenInvite({
  onBack,
}: {
  onBack: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const client = useApiClient();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await client['family-join'].invite.$post({
        json: { invitedEmail: email.trim() },
      });
      await assertOk(res);
    },
  });

  if (inviteMutation.isSuccess) {
    return (
      <View
        className="rounded-card border border-border bg-surface p-4"
        testID="visibility-link-initiate-existing-teen-sent"
      >
        <Text className="text-h3 font-semibold text-text-primary">
          {t('visibility.link.existingTeenInviteSentTitle')}
        </Text>
        <Text className="mt-2 text-body text-text-secondary">
          {t('visibility.link.existingTeenInviteSentMessage')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          className="mt-4 min-h-[44px] items-center justify-center rounded-button border border-border px-4 py-2"
          onPress={onBack}
          testID="visibility-link-initiate-existing-teen-done"
        >
          <Text className="text-body-sm font-semibold text-text-secondary">
            {t('common.goBack')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const canSubmit = email.trim().length > 0 && !inviteMutation.isPending;

  return (
    <View
      className="rounded-card border border-border bg-surface p-4"
      testID="visibility-link-initiate-existing-teen-invite"
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {t('visibility.link.existingTeenInviteTitle')}
      </Text>
      <Text className="mt-2 text-body text-text-secondary">
        {t('visibility.link.existingTeenInviteMessage')}
      </Text>
      <Text className="mt-4 mb-1 text-body-sm font-semibold text-text-secondary">
        {t('visibility.link.existingTeenInviteEmailLabel')}
      </Text>
      <TextInput
        className="rounded-input bg-background px-4 py-3 text-body text-text-primary"
        placeholder={t('visibility.link.existingTeenInviteEmailPlaceholder')}
        placeholderTextColor={colors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
        editable={!inviteMutation.isPending}
        testID="visibility-link-initiate-existing-teen-email"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('visibility.link.existingTeenInviteAction')}
        disabled={!canSubmit}
        className={`mt-4 min-h-[48px] items-center justify-center rounded-button px-4 py-3 ${
          canSubmit ? 'bg-primary' : 'bg-primary/50'
        }`}
        onPress={() => inviteMutation.mutate()}
        testID="visibility-link-initiate-existing-teen-submit"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {inviteMutation.isPending
            ? t('visibility.link.existingTeenInviteSending')
            : t('visibility.link.existingTeenInviteAction')}
        </Text>
      </Pressable>
      {inviteMutation.isError ? (
        <ErrorFallback
          title={t('visibility.link.existingTeenInviteErrorTitle')}
          message={formatApiError(inviteMutation.error)}
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => inviteMutation.mutate(),
            testID: 'visibility-link-initiate-existing-teen-retry',
          }}
          testID="visibility-link-initiate-existing-teen-error"
        />
      ) : null}
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
