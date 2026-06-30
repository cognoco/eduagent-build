import React from 'react';
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
import { goBackOrReplace } from '../../../lib/navigation';
import { useProfile } from '../../../lib/profile';
import { firstParam } from '../../../lib/route-params';

function parseRelation(value: string | undefined): SupporterRelation {
  return supporterRelationSchema.catch('other').parse(value);
}

export default function NewLinkScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const params = useLocalSearchParams<{
    supporteePersonId?: string | string[];
    supporteeName?: string | string[];
    relation?: string | string[];
    managedTier?: string | string[];
  }>();
  const supporteePersonId = firstParam(params.supporteePersonId);
  const supporteeName = firstParam(params.supporteeName);
  const relation = parseRelation(firstParam(params.relation));
  const managedTier = firstParam(params.managedTier) === 'true';

  const createMutation = useMutation({
    mutationFn: async () => {
      const supporterPersonId = activeProfile?.id;
      if (!supporterPersonId || !supporteePersonId) {
        throw new Error(t('visibility.link.missingCreateParams'));
      }
      const res = await client.visibility.links.$post({
        json: {
          supporterPersonId,
          supporteePersonId,
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
          ...(supporteeName ? { supporteeName } : {}),
        },
      } as Href);
    },
  });

  if (!supporteePersonId) {
    return (
      <View className="flex-1 bg-background p-5">
        <ErrorFallback
          variant="centered"
          title={t('visibility.link.missingTitle')}
          message={t('visibility.link.missingMessage')}
          primaryAction={{
            label: t('common.goBack'),
            onPress: () => goBackOrReplace(router, '/(app)/home'),
            testID: 'visibility-link-new-missing-back',
          }}
          testID="visibility-link-new-missing"
        />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-5"
      contentInsetAdjustmentBehavior="automatic"
      testID="visibility-link-new-screen"
    >
      <View>
        <Text className="text-display-sm font-semibold text-text-primary">
          {t('visibility.link.createTitle')}
        </Text>
        <Text className="mt-2 text-body text-text-secondary">
          {t('visibility.link.createMessage', {
            supporteeName:
              supporteeName ?? t('visibility.contract.supporteeFallback'),
          })}
        </Text>
      </View>
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
