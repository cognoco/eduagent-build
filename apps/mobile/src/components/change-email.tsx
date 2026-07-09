import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';
import { useUser, useReverification } from '@clerk/expo';

import { assertOk } from '../lib/assert-ok';
import { formatApiError } from '../lib/format-api-error';
import { useApiClient } from '../lib/api-client';
import { extractClerkError } from '../lib/clerk-error';
import {
  isClerkRequestTimeoutError,
  withClerkTimeout,
} from '../lib/clerk-timeout';
import { useThemeColors } from '../lib/theme';
import { Button } from './common/Button';

interface EmailAddressResource {
  id: string;
  emailAddress: string;
  attemptVerification: (params: { code: string }) => Promise<unknown>;
  prepareVerification: (params: { strategy: 'email_code' }) => Promise<unknown>;
}

interface EmailSyncCandidate {
  emailAddress: string;
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
  const [success, setSuccess] = useState(false);
  const [syncCandidate, setSyncCandidate] = useState<EmailSyncCandidate | null>(
    null,
  );
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // [CRITICAL-2b] Promoting a new address to primary is a credential mutation —
  // gate it behind Clerk step-up reverification. If the instance requires it,
  // the enhanced fetcher prompts for re-confirmation and retries on success;
  // otherwise it passes through. Defends against an unattended unlocked phone
  // silently taking over the login email.
  const reverifiedSetPrimary = useReverification(
    (primaryEmailAddressId: string) => {
      if (!user) throw new Error('User not ready');
      return user.update({ primaryEmailAddressId });
    },
  );

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

  // [CRITICAL-2c] The old address is intentionally NOT destroyed. It remains a
  // verified, non-primary recovery identifier so a mistaken or hostile email
  // change does not strip the real owner of their last out-of-band way back in.
  // The server also emails a security notification to the old address on change
  // (see updateAccountEmailFromClerk).
  const completeEmailChange = useCallback(() => {
    setEmail('');
    setCode('');
    setPendingEmail(null);
    setSyncCandidate(null);
    setSuccess(true);
  }, []);

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
    setSuccess(false);

    if (!user || !pendingEmail) {
      setError(t('changeEmail.errorSendCodeFirst'));
      return;
    }

    if (!trimmedCode) {
      setError(t('changeEmail.errorCodeRequired'));
      return;
    }

    const candidate: EmailSyncCandidate = {
      emailAddress: pendingEmail.emailAddress,
    };

    setIsVerifying(true);
    try {
      await withClerkTimeout(
        pendingEmail.attemptVerification({ code: trimmedCode }),
        'email.attemptVerification',
      );
      await withClerkTimeout(
        reverifiedSetPrimary(pendingEmail.id),
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

    completeEmailChange();
    setIsVerifying(false);
  }, [
    code,
    completeEmailChange,
    formatSyncError,
    handleClerkError,
    pendingEmail,
    reverifiedSetPrimary,
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
    setSuccess(false);
    setIsVerifying(true);
    try {
      await syncEmailToBackend(syncCandidate);
      completeEmailChange();
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

      <Button
        onPress={handleSendCode}
        disabled={isSendingCode || isVerifying || !!syncCandidate}
        label={
          isSendingCode
            ? t('changeEmail.sendingCode')
            : t('changeEmail.sendCodeButton')
        }
        className="mt-3 rounded-card"
        accessibilityLabel={t('changeEmail.sendCodeLabel')}
        testID="change-email-send-code"
      />

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
            <Button
              onPress={handleRetrySync}
              disabled={isVerifying}
              label={
                isVerifying
                  ? t('changeEmail.verifying')
                  : t('changeEmail.retrySyncButton')
              }
              className="mt-3 rounded-card"
              accessibilityLabel={t('changeEmail.retrySyncLabel')}
              testID="change-email-retry-sync"
            />
          ) : (
            <Button
              onPress={handleVerify}
              disabled={isVerifying}
              label={
                isVerifying
                  ? t('changeEmail.verifying')
                  : t('changeEmail.verifyButton')
              }
              className="mt-3 rounded-card"
              accessibilityLabel={t('changeEmail.verifyLabel')}
              testID="change-email-verify"
            />
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
    </View>
  );
}
