import { useState, useCallback } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { PasswordInput } from './common';
import { extractClerkError } from '../lib/clerk-error';

export function ChangePassword(): React.JSX.Element {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
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
    } catch (err) {
      setError(extractClerkError(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [user, currentPassword, newPassword, confirmPassword]);

  const handleForgotPassword = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      Alert.alert('Could not sign out', 'Please try again.');
      return;
    } finally {
      setIsSigningOut(false);
    }
    router.replace('/(auth)/sign-in' as never);
  }, [signOut, router]);

  return (
    <View className="mt-3">
      <PasswordInput
        value={currentPassword}
        onChangeText={setCurrentPassword}
        placeholder="Current password"
        testID="current-password"
      />

      <Pressable
        onPress={isSigningOut ? undefined : handleForgotPassword}
        disabled={isSigningOut}
        className="mt-1 mb-3"
      >
        <Text className="text-xs text-primary">
          {isSigningOut ? 'Signing out...' : 'Forgot your password?'}
        </Text>
      </Pressable>

      <PasswordInput
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder="New password"
        testID="new-password"
        showRequirements
      />

      <View className="mt-2">
        <PasswordInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password"
          testID="confirm-password"
        />
      </View>

      {error && (
        <Text className="text-xs text-danger mt-2" testID="password-error">
          {error}
        </Text>
      )}

      {success && (
        <Text className="text-xs text-success mt-2">Password updated</Text>
      )}

      <Pressable
        onPress={handleSubmit}
        disabled={isSubmitting}
        className="bg-primary rounded-card px-4 py-3 mt-3 items-center"
        accessibilityLabel="Update password"
        accessibilityRole="button"
        testID="update-password-button"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {isSubmitting ? 'Updating...' : 'Update Password'}
        </Text>
      </Pressable>
    </View>
  );
}
