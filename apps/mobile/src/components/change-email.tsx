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

    try {
      const syncResponse = await api.account.email.$patch({
        json: { email: pendingEmail.emailAddress },
      });
      await assertOk(syncResponse);
    } catch (err) {
      setError(
        t('changeEmail.errorSyncFailed', {
          message: formatApiError(err),
        }),
      );
      setIsVerifying(false);
      return;
    }

    try {
      await withClerkTimeout(
        oldPrimaryEmail?.destroy?.() ?? Promise.resolve(),
        'oldEmail.destroy',
      );
    } catch {
      setWarning(t('changeEmail.warningOldEmailStillActive'));
    } finally {
      setEmail('');
      setCode('');
      setPendingEmail(null);
      setSuccess(true);
      setIsVerifying(false);
    }
  }, [api, code, handleClerkError, pendingEmail, t, user]);

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
        disabled={isSendingCode || isVerifying}
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
            editable={!isVerifying}
            keyboardType="number-pad"
            onChangeText={setCode}
            placeholder={t('changeEmail.codePlaceholder')}
            placeholderTextColor={colors.muted}
            testID="change-email-code"
            value={code}
          />
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
        </View>
      ) : null}

      {error ? (
        <Text className="text-xs text-danger mt-2" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {success ? (
        <Text className="text-xs text-success mt-2">
          {t('changeEmail.successMessage')}
        </Text>
      ) : null}
      {warning ? (
        <Text className="text-xs text-warning mt-2">{warning}</Text>
      ) : null}
    </View>
  );
}
