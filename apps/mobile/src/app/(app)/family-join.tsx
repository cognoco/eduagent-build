import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useTranslation } from 'react-i18next';
import type {
  FamilyJoinJourneyResult,
  FamilyJoinSupportershipDecision,
} from '@eduagent/schemas';

import { FamilyJoinDecisionCard } from '../../components/family/FamilyJoinDecisionCard';
import { useFamilyJoinJourney } from '../../hooks/use-family-join-journey';
import {
  clearFamilyJoinContinuation,
  readFamilyJoinContinuation,
  saveFamilyJoinContinuation,
} from '../../lib/family-join-journey-state';
import { formatApiError } from '../../lib/format-api-error';
import { firstParam } from '../../lib/route-params';

type JourneyRole = 'learner' | 'guardian';

export default function FamilyJoinScreen(): React.ReactElement {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    verificationHandle?: string | string[];
  }>();
  const parameterCode = firstParam(params.code)?.trim() ?? '';
  const verificationHandle =
    firstParam(params.verificationHandle)?.trim() ?? '';
  const journey = useFamilyJoinJourney();
  const [hydrating, setHydrating] = useState(true);
  const [restored, setRestored] = useState(false);
  const [role, setRole] = useState<JourneyRole>(
    verificationHandle ? 'guardian' : 'learner',
  );
  const [token, setToken] = useState(parameterCode);
  const [membershipAccepted, setMembershipAccepted] = useState(false);
  const [processingAccepted, setProcessingAccepted] = useState(false);
  const [supportershipDecision, setSupportershipDecision] =
    useState<FamilyJoinSupportershipDecision | null>(null);
  const [result, setResult] = useState<FamilyJoinJourneyResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!userId) {
      void clearFamilyJoinContinuation().finally(() => {
        if (active) setHydrating(false);
      });
      return () => {
        active = false;
      };
    }
    void readFamilyJoinContinuation(userId)
      .then((continuation) => {
        if (!active || !continuation) return;
        if (!parameterCode) setToken(continuation.token);
        if (!verificationHandle) setRole(continuation.role);
        setSupportershipDecision(continuation.supportershipDecision);
        setRestored(true);
      })
      .catch((caught) => {
        if (active) setError(caught);
      })
      .finally(() => {
        if (active) setHydrating(false);
      });
    return () => {
      active = false;
    };
  }, [parameterCode, userId, verificationHandle]);

  const busy =
    journey.start.isPending ||
    journey.guardian.isPending ||
    journey.finalize.isPending ||
    journey.decline.isPending;

  const recordResult = useCallback(
    async (
      next: FamilyJoinJourneyResult,
      owner: JourneyRole,
      decision: FamilyJoinSupportershipDecision,
    ) => {
      if (
        next.status === 'awaiting_guardian' ||
        next.status === 'ready_to_join'
      ) {
        if (!userId) {
          await clearFamilyJoinContinuation();
          return;
        }
        await saveFamilyJoinContinuation(userId, {
          version: 2,
          role: owner,
          token: token.trim(),
          supportershipDecision: decision,
          lastStatus: next.status,
        });
      } else {
        await clearFamilyJoinContinuation();
      }
      setResult(next);
    },
    [token, userId],
  );

  const startOrResume = useCallback(async () => {
    if (
      !token.trim() ||
      !membershipAccepted ||
      !processingAccepted ||
      !supportershipDecision
    ) {
      setError(new Error(t('familyJoinJourney.errors.completeDecisions')));
      return;
    }
    setError(null);
    try {
      const next = await journey.start.mutateAsync({
        token: token.trim(),
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision,
      });
      await recordResult(next, 'learner', supportershipDecision);
    } catch (caught) {
      setError(caught);
    }
  }, [
    journey.start,
    membershipAccepted,
    processingAccepted,
    recordResult,
    supportershipDecision,
    t,
    token,
  ]);

  const completeGuardian = useCallback(async () => {
    if (!token.trim() || !verificationHandle || !supportershipDecision) {
      setError(new Error(t('familyJoinJourney.errors.guardianNotReady')));
      return;
    }
    setError(null);
    try {
      const next = await journey.guardian.mutateAsync({
        token: token.trim(),
        verificationHandle,
        authorizeSupportership: supportershipDecision === 'accept',
      });
      await recordResult(next, 'guardian', supportershipDecision);
    } catch (caught) {
      setError(caught);
    }
  }, [
    journey.guardian,
    recordResult,
    supportershipDecision,
    t,
    token,
    verificationHandle,
  ]);

  const finalize = useCallback(async () => {
    if (!supportershipDecision) {
      setError(new Error(t('familyJoinJourney.errors.completeDecisions')));
      return;
    }
    setError(null);
    try {
      const next = await journey.finalize.mutateAsync({ token: token.trim() });
      await recordResult(next, 'learner', supportershipDecision);
    } catch (caught) {
      setError(caught);
    }
  }, [journey.finalize, recordResult, supportershipDecision, t, token]);

  const decline = useCallback(async () => {
    if (!token.trim()) return;
    setError(null);
    try {
      const next = await journey.decline.mutateAsync({ token: token.trim() });
      await clearFamilyJoinContinuation();
      setResult(next);
    } catch (caught) {
      setError(caught);
    }
  }, [journey.decline, token]);

  const exit = useCallback(async () => {
    await clearFamilyJoinContinuation().catch(() => undefined);
    router.replace('/(app)' as Href);
  }, [router]);

  const terminalCopy = useMemo(() => {
    if (result?.status === 'expired') {
      return {
        title: t('familyJoinJourney.terminal.expired.title'),
        message: t('familyJoinJourney.terminal.expired.message'),
      };
    }
    if (result?.status === 'declined') {
      return {
        title: t('familyJoinJourney.terminal.declined.title'),
        message: t('familyJoinJourney.terminal.declined.message'),
      };
    }
    if (result?.status === 'withdrawn') {
      return {
        title: t('familyJoinJourney.terminal.withdrawn.title'),
        message: t('familyJoinJourney.terminal.withdrawn.message'),
      };
    }
    return null;
  }, [result, t]);

  if (hydrating) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (result?.status === 'joined') {
    return (
      <JourneyStatus
        testID="family-join-complete"
        title={t('familyJoinJourney.complete.title')}
        message={t('familyJoinJourney.complete.message')}
        actionLabel={t('common.goHome')}
        onAction={exit}
      />
    );
  }

  if (terminalCopy) {
    return (
      <JourneyStatus
        testID="family-join-terminal"
        title={terminalCopy.title}
        message={terminalCopy.message}
        actionLabel={t('common.goHome')}
        actionTestID="family-join-exit"
        onAction={exit}
      />
    );
  }

  if (result?.status === 'awaiting_guardian' && role === 'learner') {
    return (
      <JourneyStatus
        testID="family-join-awaiting-guardian"
        title={t('familyJoinJourney.awaitingGuardian.title')}
        message={t('familyJoinJourney.awaitingGuardian.message')}
        code={token}
        actionLabel={t('familyJoinJourney.safeExit')}
        actionTestID="family-join-guardian-handoff"
        onAction={exit}
      />
    );
  }

  if (result?.status === 'ready_to_join') {
    if (role === 'guardian') {
      return (
        <JourneyStatus
          testID="family-join-guardian-finished"
          title={t('familyJoinJourney.guardianFinished.title')}
          message={t('familyJoinJourney.guardianFinished.message')}
          code={token}
          actionLabel={t('familyJoinJourney.safeExit')}
          onAction={exit}
        />
      );
    }
    return (
      <JourneyStatus
        testID="family-join-ready"
        title={t('familyJoinJourney.ready.title')}
        message={t('familyJoinJourney.ready.message')}
        actionLabel={t('familyJoinJourney.ready.join')}
        actionTestID="family-join-finalize"
        onAction={() => void finalize()}
        disabled={busy}
        secondaryLabel={t('familyJoinJourney.decline')}
        onSecondary={() => void decline()}
      />
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      testID={
        role === 'guardian'
          ? 'family-join-guardian-form'
          : 'family-join-learner-form'
      }
    >
      <View className="gap-2">
        <Text className="text-h1 font-bold text-text-primary">
          {t(
            role === 'guardian'
              ? 'familyJoinJourney.guardian.title'
              : 'familyJoinJourney.title',
          )}
        </Text>
        <Text className="text-body text-text-secondary">
          {t(
            role === 'guardian'
              ? 'familyJoinJourney.guardian.intro'
              : 'familyJoinJourney.intro',
          )}
        </Text>
      </View>

      {restored ? (
        <View
          className="rounded-card bg-primary/10 px-4 py-3"
          testID="family-join-restored"
        >
          <Text className="text-body-sm text-text-primary">
            {t('familyJoinJourney.restored')}
          </Text>
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="text-body font-semibold text-text-primary">
          {t('familyJoinJourney.code.label')}
        </Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          className="min-h-[48px] rounded-card border border-border bg-surface px-4 text-body text-text-primary"
          placeholder={t('familyJoinJourney.code.placeholder')}
          accessibilityLabel={t('familyJoinJourney.code.label')}
          testID="family-join-code"
        />
      </View>

      {role === 'learner' ? (
        <>
          <FamilyJoinDecisionCard
            title={t('familyJoinJourney.membership.title')}
            description={t('familyJoinJourney.membership.description')}
            selected={membershipAccepted}
            onPress={() => setMembershipAccepted((value) => !value)}
            testID="family-join-membership-accept"
          />
          <FamilyJoinDecisionCard
            title={t('familyJoinJourney.processing.title')}
            description={t('familyJoinJourney.processing.description')}
            selected={processingAccepted}
            onPress={() => setProcessingAccepted((value) => !value)}
            testID="family-join-processing-accept"
          />
        </>
      ) : (
        <View className="rounded-card bg-surface px-4 py-3">
          <Text className="text-body font-semibold text-text-primary">
            {t('familyJoinJourney.guardian.authorityTitle')}
          </Text>
          <Text className="mt-1 text-body-sm text-text-secondary">
            {t(
              verificationHandle
                ? 'familyJoinJourney.guardian.providerReturned'
                : 'familyJoinJourney.guardian.providerRequired',
            )}
          </Text>
        </View>
      )}

      <View className="gap-2">
        <Text className="text-body font-semibold text-text-primary">
          {t('familyJoinJourney.visibility.title')}
        </Text>
        <Text className="text-body-sm text-text-secondary">
          {t(
            role === 'guardian'
              ? 'familyJoinJourney.visibility.guardianDescription'
              : 'familyJoinJourney.visibility.description',
          )}
        </Text>
        <FamilyJoinDecisionCard
          title={t('familyJoinJourney.visibility.accept')}
          description={t('familyJoinJourney.visibility.acceptDescription')}
          selected={supportershipDecision === 'accept'}
          onPress={() => setSupportershipDecision('accept')}
          testID="family-join-visibility-accept"
        />
        <FamilyJoinDecisionCard
          title={t('familyJoinJourney.visibility.decline')}
          description={t('familyJoinJourney.visibility.declineDescription')}
          selected={supportershipDecision === 'decline'}
          onPress={() => setSupportershipDecision('decline')}
          testID="family-join-visibility-decline"
        />
      </View>

      {error ? (
        <View
          className="rounded-card border border-danger bg-danger/10 px-4 py-3"
          accessibilityRole="alert"
          testID="family-join-error"
        >
          <Text selectable className="text-body-sm text-danger">
            {formatApiError(error)}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          role === 'guardian'
            ? 'familyJoinJourney.guardian.complete'
            : 'familyJoinJourney.continue',
        )}
        className="min-h-[48px] items-center justify-center rounded-button bg-primary px-5 py-3 disabled:opacity-50"
        disabled={busy}
        onPress={() =>
          void (role === 'guardian' ? completeGuardian() : startOrResume())
        }
        testID={
          role === 'guardian'
            ? 'family-join-guardian-complete'
            : 'family-join-start'
        }
      >
        {busy ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-body font-semibold text-text-inverse">
            {t(
              role === 'guardian'
                ? 'familyJoinJourney.guardian.complete'
                : 'familyJoinJourney.continue',
            )}
          </Text>
        )}
      </Pressable>

      {role === 'learner' && token.trim() ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center"
          disabled={busy}
          onPress={() => void decline()}
          testID="family-join-decline"
        >
          <Text className="text-body font-semibold text-danger">
            {t('familyJoinJourney.decline')}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        className="min-h-[44px] items-center justify-center"
        onPress={() => void exit()}
        testID="family-join-exit"
      >
        <Text className="text-body text-text-secondary">
          {t('familyJoinJourney.safeExit')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function JourneyStatus({
  testID,
  title,
  message,
  code,
  actionLabel,
  actionTestID,
  onAction,
  disabled,
  secondaryLabel,
  onSecondary,
}: {
  testID: string;
  title: string;
  message: string;
  code?: string;
  actionLabel: string;
  actionTestID?: string;
  onAction: () => void | Promise<void>;
  disabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void | Promise<void>;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 24, paddingBottom: 40, gap: 16 }}
      contentInsetAdjustmentBehavior="automatic"
      testID={testID}
    >
      <Text className="text-h1 font-bold text-text-primary">{title}</Text>
      <Text className="text-body text-text-secondary">{message}</Text>
      {code ? (
        <View className="rounded-card bg-surface px-4 py-3">
          <Text className="text-caption text-text-secondary">
            {t('familyJoinJourney.code.label')}
          </Text>
          <Text
            selectable
            className="mt-1 text-body font-semibold text-text-primary"
          >
            {code}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        className="min-h-[48px] items-center justify-center rounded-button bg-primary px-5 py-3 disabled:opacity-50"
        disabled={disabled}
        onPress={() => void onAction()}
        testID={actionTestID}
      >
        <Text className="text-body font-semibold text-text-inverse">
          {actionLabel}
        </Text>
      </Pressable>
      {secondaryLabel && onSecondary ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center"
          onPress={() => void onSecondary()}
        >
          <Text className="text-body text-text-secondary">
            {secondaryLabel}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
