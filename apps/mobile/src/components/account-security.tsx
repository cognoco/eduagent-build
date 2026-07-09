import { useUser } from '@clerk/expo';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View, Text, Pressable } from 'react-native';

import { AddPassword } from './add-password';
import { ChangeEmail } from './change-email';
import { ChangePassword } from './change-password';

function getSsoProviderLabel(
  externalAccounts: Array<{ provider?: string | null }>,
  fallback: string,
): string {
  const provider = externalAccounts[0]?.provider ?? fallback;
  if (provider === 'google' || provider === 'oauth_google') return 'Google';
  if (provider === 'apple' || provider === 'oauth_apple') return 'Apple';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function SecurityRow({
  label,
  onPress,
  testID,
  expanded,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  expanded?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3.5 mb-2"
      style={({ pressed }) => ({
        ...(pressed ? { opacity: 0.6 } : {}),
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
      })}
      accessibilityLabel={label}
      accessibilityRole="button"
      testID={testID}
    >
      <Text className="text-body text-text-primary">{label}</Text>
      <Text className="text-body text-text-secondary">
        {expanded ? 'v' : '>'}
      </Text>
    </Pressable>
  );
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
  const router = useRouter();
  const { t } = useTranslation();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showAddPasswordForm, setShowAddPasswordForm] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [passwordAdded, setPasswordAdded] = useState(false);

  const passwordEnabled = (user?.passwordEnabled ?? false) || passwordAdded;
  const externalAccounts = user?.externalAccounts ?? [];

  if (!visible) return null;

  if (!passwordEnabled) {
    const providerLabel = getSsoProviderLabel(
      externalAccounts,
      t('accountSecurity.providerFallback'),
    );
    return (
      <>
        <View className="bg-surface rounded-card px-4 py-3.5 mb-2">
          <Text className="text-body text-text-primary">
            {t('accountSecurity.signedInWith', { provider: providerLabel })}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-0.5">
            {t('accountSecurity.securedVia', { provider: providerLabel })}
          </Text>
        </View>
        <SecurityRow
          label={t('accountSecurity.addPasswordLabel')}
          onPress={() => setShowAddPasswordForm((v) => !v)}
          testID="add-password-row"
          expanded={showAddPasswordForm}
        />
        {showAddPasswordForm ? (
          <View className="bg-surface rounded-card px-4 py-3 mb-2">
            <AddPassword
              onPasswordAdded={() => {
                setPasswordAdded(true);
                setShowAddPasswordForm(false);
              }}
            />
          </View>
        ) : null}
        <SecurityRow
          label={t('accountSecurity.changeEmailLabel')}
          onPress={() => setShowEmailForm((v) => !v)}
          testID="change-email-row"
          expanded={showEmailForm}
        />
        {showEmailForm ? (
          <View className="bg-surface rounded-card px-4 py-3 mb-2">
            <ChangeEmail />
          </View>
        ) : null}
        <SecurityRow
          label={t('accountSecurity.manageDevicesLabel')}
          onPress={() => router.push('/(app)/more/security-sessions' as Href)}
          testID="manage-devices-row"
        />
      </>
    );
  }

  return (
    <>
      {/* 2FA toggle removed — see comment at top of file */}

      <SecurityRow
        label={t('accountSecurity.changePasswordLabel')}
        onPress={() => setShowPasswordForm((v) => !v)}
        testID="change-password-row"
        expanded={showPasswordForm}
      />

      {showPasswordForm && (
        <View className="bg-surface rounded-card px-4 py-3 mb-2">
          <ChangePassword />
        </View>
      )}
      <SecurityRow
        label={t('accountSecurity.changeEmailLabel')}
        onPress={() => setShowEmailForm((v) => !v)}
        testID="change-email-row"
        expanded={showEmailForm}
      />
      {showEmailForm ? (
        <View className="bg-surface rounded-card px-4 py-3 mb-2">
          <ChangeEmail />
        </View>
      ) : null}
      <SecurityRow
        label={t('accountSecurity.manageDevicesLabel')}
        onPress={() => router.push('/(app)/more/security-sessions' as Href)}
        testID="manage-devices-row"
      />
    </>
  );
}
