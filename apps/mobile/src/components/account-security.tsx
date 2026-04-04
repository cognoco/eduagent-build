import { useState, useCallback } from 'react';
import { View, Text, Switch, Pressable, Alert, TextInput } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { useProfile } from '../lib/profile';
import { useThemeColors } from '../lib/theme';
import { extractClerkError } from '../lib/clerk-error';
import { ChangePassword } from './change-password';

function getSsoProviderLabel(
  externalAccounts: Array<{ provider: string }>
): string {
  const provider = externalAccounts[0]?.provider ?? 'your provider';
  if (provider === 'google' || provider === 'oauth_google') return 'Google';
  if (provider === 'apple' || provider === 'oauth_apple') return 'Apple';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

type VerifyStage = 'idle' | 'code_sent' | 'verifying';

export function AccountSecurity(): React.JSX.Element | null {
  const { user } = useUser();
  const { activeProfile } = useProfile();
  const colors = useThemeColors();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [verifyStage, setVerifyStage] = useState<VerifyStage>('idle');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const isOwner = activeProfile?.isOwner ?? false;
  const userRecord = user as unknown as Record<string, unknown> | null;
  const passwordEnabled = userRecord?.passwordEnabled as boolean;
  const twoFactorEnabled = userRecord?.twoFactorEnabled as boolean;
  const externalAccounts = (userRecord?.externalAccounts ?? []) as Array<{
    provider: string;
  }>;

  const handleToggle2FA = useCallback(
    async (enable: boolean) => {
      if (!user) return;

      if (!enable) {
        Alert.alert(
          'Turn off email verification?',
          "You'll only need your password to sign in.",
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Turn Off',
              style: 'destructive',
              onPress: async () => {
                try {
                  await (
                    user as unknown as { disableTOTP: () => Promise<void> }
                  ).disableTOTP();
                } catch (err) {
                  Alert.alert('Error', extractClerkError(err));
                }
              },
            },
          ]
        );
        return;
      }

      try {
        setVerifyError(null);
        const emailAddress = (
          user as unknown as {
            primaryEmailAddress: {
              prepareVerification: (opts: {
                strategy: string;
              }) => Promise<void>;
            };
          }
        ).primaryEmailAddress;
        await emailAddress.prepareVerification({ strategy: 'email_code' });
        setVerifyStage('code_sent');
      } catch (err) {
        setVerifyError(extractClerkError(err));
      }
    },
    [user]
  );

  const handleVerifyCode = useCallback(async () => {
    if (!user) return;
    setVerifyStage('verifying');
    setVerifyError(null);

    try {
      const emailAddress = (
        user as unknown as {
          primaryEmailAddress: {
            attemptVerification: (opts: { code: string }) => Promise<void>;
          };
        }
      ).primaryEmailAddress;
      await emailAddress.attemptVerification({ code: verifyCode });
      setVerifyStage('idle');
      setVerifyCode('');
    } catch (err) {
      setVerifyError(extractClerkError(err));
      setVerifyStage('code_sent');
    }
  }, [user, verifyCode]);

  const handleCancelVerify = useCallback(() => {
    setVerifyStage('idle');
    setVerifyCode('');
    setVerifyError(null);
  }, []);

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

      <View className="bg-surface rounded-card px-4 py-3 mb-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-body text-text-primary">
              Email Verification
            </Text>
            <Text className="text-xs text-text-secondary mt-0.5">
              Require a code sent to your email when signing in
            </Text>
          </View>
          <Switch
            value={twoFactorEnabled ?? false}
            onValueChange={handleToggle2FA}
            disabled={verifyStage !== 'idle'}
            accessibilityLabel="Email Verification"
            testID="email-2fa-toggle"
          />
        </View>

        {verifyStage !== 'idle' && (
          <View className="mt-3 pt-3 border-t border-border">
            <Text className="text-body-sm text-text-secondary mb-2">
              Enter the 6-digit code sent to your email
            </Text>
            <TextInput
              className="bg-background text-text-primary text-body px-4 py-3 rounded-input"
              value={verifyCode}
              onChangeText={setVerifyCode}
              placeholder="000000"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              testID="verify-2fa-code"
            />
            {verifyError && (
              <Text className="text-xs text-danger mt-1">{verifyError}</Text>
            )}
            <View className="flex-row mt-3 gap-2">
              <Pressable
                onPress={handleCancelVerify}
                className="flex-1 bg-background rounded-card px-4 py-2.5 items-center"
                testID="cancel-2fa-verify"
              >
                <Text className="text-body-sm font-semibold text-text-primary">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleVerifyCode}
                disabled={verifyCode.length < 6 || verifyStage === 'verifying'}
                className="flex-1 bg-primary rounded-card px-4 py-2.5 items-center"
                testID="confirm-2fa-code"
              >
                <Text className="text-body-sm font-semibold text-text-inverse">
                  {verifyStage === 'verifying' ? 'Verifying...' : 'Verify'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

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
