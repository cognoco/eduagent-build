import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, Pressable, View } from 'react-native';
import { useUser } from '@clerk/clerk-expo';

import { extractClerkError } from '../lib/clerk-error';
import {
  isClerkRequestTimeoutError,
  withClerkTimeout,
} from '../lib/clerk-timeout';
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
  const { t } = useTranslation();
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
        user.updatePassword({ newPassword }),
        'user.updatePassword',
      );
      await withClerkTimeout(user.reload(), 'user.reload');
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
  }, [confirmPassword, newPassword, onPasswordAdded, t, user]);

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

      <Pressable
        onPress={handleSubmit}
        disabled={isSubmitting}
        className="bg-primary rounded-card px-4 py-3 mt-3 items-center"
        accessibilityLabel={t('addPassword.submitLabel')}
        accessibilityRole="button"
        testID="add-password-submit"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {isSubmitting
            ? t('addPassword.submitting')
            : t('addPassword.submitButton')}
        </Text>
      </Pressable>
    </View>
  );
}
