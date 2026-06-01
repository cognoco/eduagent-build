import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, Pressable, View } from 'react-native';
import { useUser } from '@clerk/clerk-expo';

import { assertOk } from '../lib/assert-ok';
import { formatApiError } from '../lib/format-api-error';
import { useApiClient } from '../lib/api-client';
import { extractClerkError } from '../lib/clerk-error';
import {
  isClerkRequestTimeoutError,
  withClerkTimeout,
} from '../lib/clerk-timeout';
import { useThemeColors } from '../lib/theme';

interface EmailAddressResource {
  id: string;
  emailAddress: string;
  attemptVerification: (params: { code: string }) => Promise<unknown>;
  prepareVerification: (params: { strategy: 'email_code' }) => Promise<unknown>;
}

interface DestroyableEmailAddress {
  destroy: () => Promise<unknown>;
  emailAddress?: string | null;
  id?: string | null;
}

interface EmailSyncCandidate {
  emailAddress: string;
  oldPrimaryEmail: DestroyableEmailAddress | null;
}

export function ChangeEmail(): React.JSX.Element {
  const { user } = useUser();
  const api = useApiClient();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState<EmailAddressResource | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [syncCandidate, setSyncCandidate] = useState<EmailSyncCandidate | null>(
    null,
  );
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleClerkError = useCallback(
    (err: unknown): string =>
      isClerkRequestTimeoutError(err)
        ? t('accountSecurity.timeoutMessage')
        : extractClerkError(err),
    [t],
  );

  const handleSendCode = useCallback(async () => {
    const trimmedEmail = email.trim();
    setError(null);
    setWarning(null);
    setSuccess(false);
    setSyncCandidate(null);

    if (!user) {
      setError(t('changeEmail.errorNotReady'));
      return;
    }

    if (!trimmedEmail) {
      setError(t('changeEmail.errorEmailRequired'));
      return;
    }

    setIsSendingCode(true);
    try {
      const createdEmail = (await withClerkTimeout(
        user.createEmailAddress({ email: trimmedEmail }),
        'user.createEmailAddress',
      )) as EmailAddressResource;
      await withClerkTimeout(
        createdEmail.prepareVerification({ strategy: 'email_code' }),
        'email.prepareVerification',
      );
      setPendingEmail(createdEmail);
    } catch (err) {
      setPendingEmail(null);
      setError(handleClerkError(err));
    } finally {
      setIsSendingCode(false);
    }
  }, [email, handleClerkError, t, user]);

  const syncEmailToBackend = useCallback(
    async (candidate: EmailSyncCandidate) => {
      const syncResponse = await api.account.email.$patch({
        json: { email: candidate.emailAddress },
      });
      await assertOk(syncResponse);
    },
    [api],
  );

  const completeEmailChange = useCallback(
    async (candidate: EmailSyncCandidate) => {
      try {
        await withClerkTimeout(
          candidate.oldPrimaryEmail?.destroy?.() ?? Promise.resolve(),
          'oldEmail.destroy',
        );
      } catch {
        setWarning(t('changeEmail.warningOldEmailStillActive'));
      } finally {
        setEmail('');
        setCode('');
        setPendingEmail(null);
        setSyncCandidate(null);
        setSuccess(true);
      }
    },
    [t],
  );

  const formatSyncError = useCallback(
    (err: unknown): string =>
      t('changeEmail.errorSyncFailed', {
        message: formatApiError(err),
      }),
    [t],
  );

  const handleVerify = useCallback(async () => {
    const trimmedCode = code.trim();
    setError(null);
    setWarning(null);
    setSuccess(false);

    if (!user || !pendingEmail) {
      setError(t('changeEmail.errorSendCodeFirst'));
      return;
    }

    if (!trimmedCode) {
      setError(t('changeEmail.errorCodeRequired'));
      return;
    }

    const oldPrimaryEmail =
      user.primaryEmailAddress as DestroyableEmailAddress | null;
    const candidate: EmailSyncCandidate = {
      emailAddress: pendingEmail.emailAddress,
      oldPrimaryEmail,
    };

    setIsVerifying(true);
    try {
      await withClerkTimeout(
        pendingEmail.attemptVerification({ code: trimmedCode }),
        'email.attemptVerification',
      );
      await withClerkTimeout(
        user.update({ primaryEmailAddressId: pendingEmail.id }),
        'user.update',
      );
      await withClerkTimeout(user.reload(), 'user.reload');
    } catch (err) {
      setError(handleClerkError(err));
      setIsVerifying(false);
      return;
    }

    setSyncCandidate(candidate);
    try {
      await syncEmailToBackend(candidate);
    } catch (err) {
      setError(formatSyncError(err));
      setIsVerifying(false);
      return;
    }

    await completeEmailChange(candidate);
    setIsVerifying(false);
  }, [
    code,
    completeEmailChange,
    formatSyncError,
    handleClerkError,
    pendingEmail,
    syncEmailToBackend,
    t,
    user,
  ]);

  const handleRetrySync = useCallback(async () => {
    if (!syncCandidate) {
      setError(t('changeEmail.errorSendCodeFirst'));
      return;
    }

    setError(null);
    setWarning(null);
    setSuccess(false);
    setIsVerifying(true);
    try {
      await syncEmailToBackend(syncCandidate);
      await completeEmailChange(syncCandidate);
    } catch (err) {
      setError(formatSyncError(err));
    } finally {
      setIsVerifying(false);
    }
  }, [
    completeEmailChange,
    formatSyncError,
    syncCandidate,
    syncEmailToBackend,
    t,
  ]);

  return (
    <View className="mt-3">
      <Text className="text-body-sm text-text-secondary mb-3">
        {t('changeEmail.description')}
      </Text>

      <TextInput
        className="bg-surface text-text-primary text-body rounded-input px-4 py-3"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!isSendingCode && !isVerifying}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder={t('changeEmail.emailPlaceholder')}
        placeholderTextColor={colors.muted}
        spellCheck={false}
        testID="change-email-input"
        value={email}
      />

      <Pressable
        onPress={handleSendCode}
        disabled={isSendingCode || isVerifying || !!syncCandidate}
        className="bg-primary rounded-card px-4 py-3 mt-3 items-center"
        accessibilityLabel={t('changeEmail.sendCodeLabel')}
        accessibilityRole="button"
        testID="change-email-send-code"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {isSendingCode
            ? t('changeEmail.sendingCode')
            : t('changeEmail.sendCodeButton')}
        </Text>
      </Pressable>

      {pendingEmail ? (
        <View className="mt-4">
          <Text className="text-body-sm font-semibold text-text-secondary mb-1">
            {t('changeEmail.codeLabel')}
          </Text>
          <TextInput
            className="bg-surface text-text-primary text-body rounded-input px-4 py-3"
            editable={!isVerifying && !syncCandidate}
            keyboardType="number-pad"
            onChangeText={setCode}
            placeholder={t('changeEmail.codePlaceholder')}
            placeholderTextColor={colors.muted}
            testID="change-email-code"
            value={code}
          />
          {syncCandidate ? (
            <Pressable
              onPress={handleRetrySync}
              disabled={isVerifying}
              className="bg-primary rounded-card px-4 py-3 mt-3 items-center"
              accessibilityLabel={t('changeEmail.retrySyncLabel')}
              accessibilityRole="button"
              testID="change-email-retry-sync"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {isVerifying
                  ? t('changeEmail.verifying')
                  : t('changeEmail.retrySyncButton')}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleVerify}
              disabled={isVerifying}
              className="bg-primary rounded-card px-4 py-3 mt-3 items-center"
              accessibilityLabel={t('changeEmail.verifyLabel')}
              accessibilityRole="button"
              testID="change-email-verify"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {isVerifying
                  ? t('changeEmail.verifying')
                  : t('changeEmail.verifyButton')}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {error ? (
        <Text className="text-xs text-danger mt-2" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {success ? (
        <Text className="text-xs text-success mt-2" accessibilityRole="alert">
          {t('changeEmail.successMessage')}
        </Text>
      ) : null}
      {warning ? (
        <Text className="text-xs text-warning mt-2" accessibilityRole="alert">
          {warning}
        </Text>
      ) : null}
    </View>
  );
}
