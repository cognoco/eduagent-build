import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from '../../components/common';
import { useGuardianAttachment } from '../../hooks/use-guardian-attachment';
import { useGuardianAuthorityInitiation } from '../../hooks/use-guardian-authority-initiation';
import { formatApiError } from '../../lib/format-api-error';
import { firstParam } from '../../lib/route-params';

/**
 * Authenticated callback consumer for a platform/VPC provider. The callback
 * carries only a short-lived, single-use verification handle; the app never
 * sees provider evidence or authors guardian facts. The API redeems the
 * handle, mints an organization-bound authority assertion, then atomically
 * redeems that assertion into Guardianship + Consent.
 */
export default function GuardianAttachmentScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    chargePersonId?: string | string[];
    verificationHandle?: string | string[];
  }>();
  const chargePersonId = firstParam(params.chargePersonId);
  const verificationHandle = firstParam(params.verificationHandle);
  const initiation = useGuardianAuthorityInitiation();
  const attachment = useGuardianAttachment();
  const started = useRef(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const execute = useCallback(async () => {
    if (!chargePersonId || !verificationHandle) {
      setError(new Error(t('consent.profileNotFound')));
      return;
    }
    setError(null);
    try {
      const { authorityToken } = await initiation.mutateAsync({
        chargePersonId,
        verificationHandle,
      });
      await attachment.mutateAsync({ chargePersonId, authorityToken });
      setComplete(true);
    } catch (caught) {
      setError(caught);
    }
  }, [attachment, chargePersonId, initiation, t, verificationHandle]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void execute();
  }, [execute]);

  if (error) {
    return (
      <ErrorFallback
        title={t('common.tryAgain')}
        message={formatApiError(error)}
        primaryAction={{
          label: t('common.tryAgain'),
          onPress: () => {
            started.current = true;
            void execute();
          },
          testID: 'guardian-attachment-retry',
        }}
        testID="guardian-attachment-error"
      />
    );
  }

  if (!complete) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="guardian-attachment-loading"
      >
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  return (
    <View
      className="flex-1 items-center justify-center gap-5 bg-background p-6"
      testID="guardian-attachment-complete"
    >
      <Text className="text-h1 font-bold text-text-primary">
        {t('common.done')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.goHome')}
        className="min-h-[48px] items-center justify-center rounded-button bg-primary px-5 py-3"
        onPress={() => router.replace('/(app)' as Href)}
        testID="guardian-attachment-home"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {t('common.goHome')}
        </Text>
      </Pressable>
    </View>
  );
}
