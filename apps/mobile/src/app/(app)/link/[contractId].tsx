import React from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  revocationNoticeSchema,
  visibilityContractSchema,
  type RenderAudience,
  type VisibilityContract,
} from '@eduagent/schemas';

import { ErrorFallback, TimeoutLoader } from '../../../components/common';
import { ContractCard } from '../../../components/visibility';
import { useApiQuery } from '../../../hooks/use-api-query';
import { useApiClient } from '../../../lib/api-client';
import { formatApiError } from '../../../lib/format-api-error';
import { useProfile } from '../../../lib/profile';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function deriveAudience(
  contract: VisibilityContract,
  activePersonId: string | undefined,
): RenderAudience | 'unknown' {
  if (activePersonId === contract.supporterPersonId) {
    return 'supporter';
  }
  if (activePersonId === contract.supporteePersonId) {
    return 'supportee';
  }
  return 'unknown';
}

export default function LinkContractScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    contractId?: string | string[];
    supporteeName?: string | string[];
    supporterName?: string | string[];
  }>();
  const contractId = firstParam(params.contractId);
  const supporteeName = firstParam(params.supporteeName);
  const supporterName = firstParam(params.supporterName);
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  const contractQuery = useApiQuery({
    queryKey: ['visibility-contract', contractId],
    enabled: Boolean(contractId),
    fetch: (signal) =>
      client.visibility.links[':id'].contract.$get(
        { param: { id: contractId ?? '' } },
        { init: { signal } },
      ),
    select: (json: unknown) => visibilityContractSchema.parse(json),
  });

  const acceptMutation = useMutation({
    mutationFn: async (input: {
      contract: VisibilityContract;
      audience: RenderAudience;
    }) => {
      const actorPersonId = activeProfile?.id;
      if (!actorPersonId) {
        throw new Error(t('visibility.link.missingActor'));
      }
      const res = await client.visibility.links[':id'].accept.$post({
        param: { id: input.contract.id },
        json: { actorPersonId, audience: input.audience },
      });
      return visibilityContractSchema.parse(await res.json());
    },
    onSuccess: (contract) => {
      queryClient.setQueryData(['visibility-contract', contract.id], contract);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (contract: VisibilityContract) => {
      const res = await client.visibility.links[':id'].revoke.$post({
        param: { id: contract.supportershipId },
      });
      return revocationNoticeSchema.parse(await res.json());
    },
    onSuccess: () => {
      void contractQuery.refetch();
    },
  });

  if (!contractId) {
    return (
      <View className="flex-1 bg-background p-5">
        <ErrorFallback
          variant="centered"
          title={t('visibility.link.missingTitle')}
          message={t('visibility.link.missingMessage')}
          primaryAction={{
            label: t('common.goBack'),
            onPress: router.back,
            testID: 'visibility-link-missing-back',
          }}
          testID="visibility-link-missing"
        />
      </View>
    );
  }

  if (contractQuery.isLoading) {
    return (
      <TimeoutLoader
        isLoading
        loadingLabel={t('visibility.link.loading')}
        primaryAction={{
          label: t('common.tryAgain'),
          onPress: () => contractQuery.refetch(),
          testID: 'visibility-link-loading-retry',
        }}
        testID="visibility-link-loading"
      />
    );
  }

  if (contractQuery.isError || !contractQuery.data) {
    return (
      <View className="flex-1 bg-background p-5">
        <ErrorFallback
          variant="centered"
          title={t('visibility.link.errorTitle')}
          message={
            contractQuery.error
              ? formatApiError(contractQuery.error)
              : t('visibility.link.errorMessage')
          }
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => contractQuery.refetch(),
            testID: 'visibility-link-error-retry',
          }}
          secondaryAction={{
            label: t('common.goBack'),
            onPress: router.back,
            testID: 'visibility-link-error-back',
          }}
          testID="visibility-link-error"
        />
      </View>
    );
  }

  const contract = contractQuery.data;
  const audience = deriveAudience(contract, activeProfile?.id);
  const actionableAudience: RenderAudience | undefined =
    audience === 'unknown' ? undefined : audience;
  const cardAudience: RenderAudience =
    audience === 'supporter' ? 'supporter' : 'supportee';
  const accepted =
    audience === 'supporter'
      ? Boolean(contract.supporterAcceptedAt)
      : audience === 'supportee'
        ? Boolean(contract.supporteeAcceptedAt)
        : true;
  const active =
    contract.status === 'accepted' || contract.status === 'restamped';
  const canRevoke = active && audience === 'supportee';
  const canAccept = actionableAudience !== undefined && !accepted;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-5"
      contentInsetAdjustmentBehavior="automatic"
      testID="visibility-link-screen"
    >
      <View>
        <Text className="text-display-sm font-semibold text-text-primary">
          {active
            ? t('visibility.link.reviewTitle')
            : t('visibility.link.title')}
        </Text>
        <Text className="mt-2 text-body text-text-secondary">
          {active
            ? t('visibility.link.reviewMessage')
            : t('visibility.link.message')}
        </Text>
      </View>
      <ContractCard
        contract={contract}
        audience={cardAudience}
        supporteeName={supporteeName}
        supporterName={supporterName}
        onAccept={
          canAccept && actionableAudience
            ? () =>
                acceptMutation.mutate({
                  contract,
                  audience: actionableAudience,
                })
            : undefined
        }
      />
      {acceptMutation.isError ? (
        <ErrorFallback
          title={t('visibility.link.acceptErrorTitle')}
          message={formatApiError(acceptMutation.error)}
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => acceptMutation.mutate({ contract, audience }),
            testID: 'visibility-link-accept-retry',
          }}
          testID="visibility-link-accept-error"
        />
      ) : null}
      {active ? (
        <View
          className="rounded-card border border-border bg-surface p-4"
          testID="visibility-link-review"
        >
          <Text className="text-h3 font-semibold text-text-primary">
            {t('visibility.link.activeTitle')}
          </Text>
          <Text className="mt-2 text-body text-text-secondary">
            {t('visibility.link.activeMessage')}
          </Text>
        </View>
      ) : null}
      {canRevoke ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('visibility.link.revoke')}
          className="min-h-[48px] items-center justify-center rounded-button border border-danger px-4 py-3"
          onPress={() => revokeMutation.mutate(contract)}
          testID="visibility-contract-revoke"
        >
          <Text className="text-body font-semibold text-danger">
            {revokeMutation.isPending
              ? t('visibility.link.revoking')
              : t('visibility.link.revoke')}
          </Text>
        </Pressable>
      ) : null}
      {revokeMutation.isSuccess ? (
        <Text className="text-body-sm text-text-secondary">
          {t('visibility.link.revoked')}
        </Text>
      ) : null}
      {revokeMutation.isError ? (
        <ErrorFallback
          title={t('visibility.link.revokeErrorTitle')}
          message={formatApiError(revokeMutation.error)}
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => revokeMutation.mutate(contract),
            testID: 'visibility-link-revoke-retry',
          }}
          testID="visibility-link-revoke-error"
        />
      ) : null}
    </ScrollView>
  );
}
