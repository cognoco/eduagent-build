import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { useProfile } from '../lib/profile';
import { ChangePassword } from './change-password';

function getSsoProviderLabel(
  externalAccounts: Array<{ provider: string }>
): string {
  const provider = externalAccounts[0]?.provider ?? 'your provider';
  if (provider === 'google' || provider === 'oauth_google') return 'Google';
  if (provider === 'apple' || provider === 'oauth_apple') return 'Apple';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

// NOTE: 2FA toggle commented out — original implementation conflated Clerk's
// email verification (prepareVerification) with TOTP 2FA (disableTOTP).
// These are independent Clerk APIs. Needs proper spec before re-implementing.
// See: docs/superpowers/plans/2026-04-04-account-security.md

export function AccountSecurity(): React.JSX.Element | null {
  const { user } = useUser();
  const { activeProfile } = useProfile();

  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const isOwner = activeProfile?.isOwner ?? false;
  const userRecord = user as unknown as Record<string, unknown> | null;
  const passwordEnabled = userRecord?.passwordEnabled as boolean;
  const externalAccounts = (userRecord?.externalAccounts ?? []) as Array<{
    provider: string;
  }>;

  if (!isOwner) return null;

  if (!passwordEnabled) {
    const providerLabel = getSsoProviderLabel(externalAccounts);
    return (
      <View className="mt-6">
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
          Account Security
        </Text>
        <View className="bg-surface rounded-card px-4 py-3.5">
          <Text className="text-body text-text-secondary">
            Your account is secured via {providerLabel}. Manage your security
            settings there.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="mt-6">
      <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
        Account Security
      </Text>

      {/* 2FA toggle removed — see comment at top of file */}

      <Pressable
        onPress={() => setShowPasswordForm((v) => !v)}
        className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3.5 mb-2"
        accessibilityLabel="Change Password"
        accessibilityRole="button"
        testID="change-password-row"
      >
        <Text className="text-body text-text-primary">Change Password</Text>
        <Text className="text-body text-text-secondary">
          {showPasswordForm ? '−' : '>'}
        </Text>
      </Pressable>

      {showPasswordForm && (
        <View className="bg-surface rounded-card px-4 py-3 mb-2">
          <ChangePassword />
        </View>
      )}
    </View>
  );
}
