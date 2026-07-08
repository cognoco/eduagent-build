import { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { platformAlert } from '../lib/platform-alert';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from './common/Button';
import { PasswordInput } from './common/PasswordInput';
import { extractClerkError } from '../lib/clerk-error';
import { signOutWithCleanup } from '../lib/sign-out';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { Sentry } from '../lib/sentry';

export function ChangePassword(): React.JSX.Element {
  const { user } = useUser();
  const { signOut } = useAuth();
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profiles } = useProfile();
  const { t } = useTranslation();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const clearBanners = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  const handleCurrentPasswordChange = useCallback(
    (value: string) => {
      setCurrentPassword(value);
      clearBanners();
    },
    [clearBanners],
  );

  const handleNewPasswordChange = useCallback(
    (value: string) => {
      setNewPassword(value);
      clearBanners();
    },
    [clearBanners],
  );

  const handleConfirmPasswordChange = useCallback(
    (value: string) => {
      setConfirmPassword(value);
      clearBanners();
    },
    [clearBanners],
  );

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSuccess(false);

    // [BUG-129] currentPassword must not be empty — Clerk's updatePassword
    // would reject an empty value with a generic API error, but submitting
    // a known-empty value wastes a request and gives the user no useful
    // feedback. Match the server's minimum (Clerk enforces ≥8 characters);
    // we don't accept anything shorter than the server contract.
    if (currentPassword.length < 8) {
      setError(t('changePassword.errorCurrentRequired'));
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
      await user?.updatePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
      // [CRITICAL-2a] Fire-and-forget security notification to the account
      // email. Must never block or fail the password change on a notify error.
      void api.account['security-event']
        .$post({ json: { event: 'password_changed' } })
        .catch((err) =>
          // A lost notification is the takeover-alert gap [CRITICAL-2a] —
          // never block the password change, but keep the failure queryable.
          Sentry.captureException(err, {
            tags: {
              feature: 'security_notification',
              event: 'password_changed',
            },
          }),
        );
    } catch (err) {
      setError(extractClerkError(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [api, user, currentPassword, newPassword, confirmPassword, t]);

  const handleForgotPassword = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOutWithCleanup({
        clerkSignOut: signOut,
        queryClient,
        profileIds: profiles.map((p) => p.id),
        clerkUserId: user?.id,
      });
    } catch {
      platformAlert(
        t('changePassword.signOutErrorTitle'),
        t('changePassword.signOutErrorMessage'),
      );
      return;
    } finally {
      setIsSigningOut(false);
    }
    router.replace('/(auth)/sign-in' as Href);
  }, [signOut, router, queryClient, profiles, t, user?.id]);

  return (
    <View className="mt-3">
      <PasswordInput
        value={currentPassword}
        onChangeText={handleCurrentPasswordChange}
        placeholder={t('changePassword.currentPlaceholder')}
        testID="current-password"
      />

      <Pressable
        onPress={isSigningOut ? undefined : handleForgotPassword}
        disabled={isSigningOut}
        className="mt-1 mb-3"
      >
        <Text className="text-xs text-primary">
          {isSigningOut
            ? t('changePassword.signingOut')
            : t('changePassword.forgotPassword')}
        </Text>
      </Pressable>

      <PasswordInput
        value={newPassword}
        onChangeText={handleNewPasswordChange}
        placeholder={t('changePassword.newPlaceholder')}
        testID="new-password"
        showRequirements
      />

      <View className="mt-2">
        <PasswordInput
          value={confirmPassword}
          onChangeText={handleConfirmPasswordChange}
          placeholder={t('changePassword.confirmPlaceholder')}
          testID="confirm-password"
        />
      </View>

      {error && (
        <Text className="text-xs text-danger mt-2" testID="password-error">
          {error}
        </Text>
      )}

      {success && (
        <Text className="text-xs text-success mt-2">
          {t('changePassword.successMessage')}
        </Text>
      )}

      <Button
        onPress={handleSubmit}
        disabled={isSubmitting}
        label={
          isSubmitting
            ? t('changePassword.updating')
            : t('changePassword.updateButton')
        }
        className="mt-3 rounded-card"
        accessibilityLabel={t('changePassword.updateLabel')}
        testID="update-password-button"
      />
    </View>
  );
}
