import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequestConsent } from '../hooks/use-consent';
import { useThemeColors } from '../lib/theme';
import { Button } from '../components/common/Button';

export default function ConsentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { profileId, consentType } = useLocalSearchParams<{
    profileId: string;
    consentType: 'GDPR' | 'COPPA';
  }>();

  const { mutateAsync, isPending } = useRequestConsent();

  const [parentEmail, setParentEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail);
  const canSubmit = isValidEmail && !isPending && !success;

  const regulationText =
    consentType === 'GDPR'
      ? 'Under EU GDPR regulations, users under 16 need parental consent to use this service.'
      : 'Under US COPPA regulations, users under 13 need parental consent to use this service.';

  const onSubmit = useCallback(async () => {
    if (!canSubmit || !profileId || !consentType) return;

    setError('');
    try {
      await mutateAsync({
        childProfileId: profileId,
        parentEmail: parentEmail.trim(),
        consentType,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
    }
  }, [canSubmit, profileId, consentType, parentEmail, mutateAsync]);

  const onResendEmail = useCallback(async () => {
    if (!profileId || !consentType || resending) return;

    setResending(true);
    try {
      await mutateAsync({
        childProfileId: profileId,
        parentEmail: parentEmail.trim(),
        consentType,
      });
    } catch {
      // Silently ignore resend errors — the user already has a success state
    } finally {
      setResending(false);
    }
  }, [profileId, consentType, parentEmail, mutateAsync, resending]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-h1 font-bold text-text-primary">
            Parental consent required
          </Text>
        </View>

        {success ? (
          <View testID="consent-success">
            <Text className="text-body text-text-primary mb-4">
              We sent an email to{' '}
              <Text className="font-semibold">{parentEmail}</Text>.
            </Text>
            <Text className="text-body text-text-secondary mb-8">
              They'll need to approve before you can start learning. You can
              close this screen.
            </Text>
            <Button
              variant="primary"
              label="Done"
              onPress={() => router.back()}
              testID="consent-done"
            />
            <View className="flex-row justify-center mt-4">
              <Button
                variant="tertiary"
                size="small"
                label="Resend email"
                onPress={onResendEmail}
                loading={resending}
                testID="consent-resend-email"
              />
            </View>
          </View>
        ) : (
          <>
            <Text className="text-body text-text-secondary mb-6">
              {regulationText}
            </Text>

            {error !== '' && (
              <View
                className="bg-danger/10 rounded-card px-4 py-3 mb-4"
                accessibilityRole="alert"
              >
                <Text
                  className="text-danger text-body-sm"
                  testID="consent-error"
                >
                  {error}
                </Text>
              </View>
            )}

            <Text className="text-body-sm font-semibold text-text-secondary mb-1">
              Parent's email address
            </Text>
            <TextInput
              className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-6"
              placeholder="parent@example.com"
              placeholderTextColor={colors.muted}
              value={parentEmail}
              onChangeText={setParentEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!isPending}
              testID="consent-email"
            />

            <Button
              variant="primary"
              label="Send consent request"
              onPress={onSubmit}
              disabled={!canSubmit}
              loading={isPending}
              testID="consent-submit"
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
