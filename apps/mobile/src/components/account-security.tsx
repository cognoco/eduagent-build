import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
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

export function AccountSecurity({
  visible = true,
}: {
  visible?: boolean;
}): React.JSX.Element | null {
  const { user } = useUser();

  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const passwordEnabled = user?.passwordEnabled ?? false;
  const externalAccounts = user?.externalAccounts ?? [];

  if (!visible) return null;

  if (!passwordEnabled) {
    const providerLabel = getSsoProviderLabel(externalAccounts);
    return (
      <View className="bg-surface rounded-card px-4 py-3.5 mb-2">
        <Text className="text-body text-text-secondary">
          Secured via {providerLabel}
        </Text>
      </View>
    );
  }

  return (
    <>
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
    </>
  );
}
