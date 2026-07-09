import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useUser, useReverification } from '@clerk/expo';

import { extractClerkError } from '../lib/clerk-error';
import {
  isClerkRequestTimeoutError,
  withClerkTimeout,
} from '../lib/clerk-timeout';
import { useApiClient } from '../lib/api-client';
import { Sentry } from '../lib/sentry';
import { Button } from './common/Button';
import { PasswordInput } from './common/PasswordInput';

function getSsoProviderLabel(
  externalAccounts: Array<{ provider?: string | null }>,
  fallback: string,
): string {
  const provider = externalAccounts[0]?.provider ?? fallback;
  if (provider === 'google' || provider === 'oauth_google') return 'Google';
  if (provider === 'apple' || provider === 'oauth_apple') return 'Apple';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function AddPassword({
  onPasswordAdded,
}: {
  onPasswordAdded: () => void;
}): React.JSX.Element {
  const { user } = useUser();
  const api = useApiClient();
  const { t } = useTranslation();
  // [CRITICAL-2b] First-time password set on an SSO-only account is a
  // credential mutation with no current-password gate — require Clerk step-up
  // reverification so an unattended unlocked phone cannot silently add a
  // password and create a second way in.
  const reverifiedUpdatePassword = useReverification(
    (params: { newPassword: string }) => {
      if (!user) throw new Error('User not ready');
      return user.updatePassword(params);
    },
  );
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const providerLabel = getSsoProviderLabel(
    user?.externalAccounts ?? [],
    t('accountSecurity.providerFallback'),
  );

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!user) {
      setError(t('addPassword.errorNotReady'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('changePassword.errorTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('changePassword.errorMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      await withClerkTimeout(
        reverifiedUpdatePassword({ newPassword }),
        'user.updatePassword',
      );
      await withClerkTimeout(user.reload(), 'user.reload');
      // [CRITICAL-2a] Fire-and-forget security notification to the account
      // email. Must never block or fail the password add on a notify error.
      void api.account['security-event']
        .$post({ json: { event: 'password_added' } })
        .catch((err) =>
          // A lost notification is the takeover-alert gap [CRITICAL-2a] —
          // never block the password add, but keep the failure queryable.
          Sentry.captureException(err, {
            tags: {
              feature: 'security_notification',
              event: 'password_added',
            },
          }),
        );
      setNewPassword('');
      setConfirmPassword('');
      onPasswordAdded();
    } catch (err) {
      setError(
        isClerkRequestTimeoutError(err)
          ? t('accountSecurity.timeoutMessage')
          : extractClerkError(err),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    api,
    confirmPassword,
    newPassword,
    onPasswordAdded,
    reverifiedUpdatePassword,
    t,
    user,
  ]);

  return (
    <View className="mt-3">
      <Text className="text-body-sm text-text-secondary mb-3">
        {t('addPassword.providerContext', { provider: providerLabel })}
      </Text>

      <PasswordInput
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder={t('changePassword.newPlaceholder')}
        editable={!isSubmitting}
        testID="add-password-new"
        showRequirements
      />

      <View className="mt-2">
        <PasswordInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={t('changePassword.confirmPlaceholder')}
          editable={!isSubmitting}
          testID="add-password-confirm"
          onSubmitEditing={handleSubmit}
        />
      </View>

      {error ? (
        <Text className="text-xs text-danger mt-2" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button
        onPress={handleSubmit}
        disabled={isSubmitting}
        label={
          isSubmitting
            ? t('addPassword.submitting')
            : t('addPassword.submitButton')
        }
        className="mt-3 rounded-card"
        accessibilityLabel={t('addPassword.submitLabel')}
        testID="add-password-submit"
      />
    </View>
  );
}
