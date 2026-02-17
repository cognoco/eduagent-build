import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequestConsent } from '../hooks/use-consent';

export default function ConsentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profileId, consentType } = useLocalSearchParams<{
    profileId: string;
    consentType: 'GDPR' | 'COPPA';
  }>();

  const { mutateAsync, isPending } = useRequestConsent();

  const [parentEmail, setParentEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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
            <Pressable
              onPress={() => router.back()}
              className="bg-primary rounded-button py-3.5 items-center"
              testID="consent-done"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Done
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text className="text-body text-text-secondary mb-6">
              {regulationText}
            </Text>

            {error !== '' && (
              <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
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
              placeholderTextColor="#525252"
              value={parentEmail}
              onChangeText={setParentEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!isPending}
              testID="consent-email"
            />

            <Pressable
              onPress={onSubmit}
              disabled={!canSubmit}
              className={`rounded-button py-3.5 items-center ${
                canSubmit ? 'bg-primary' : 'bg-surface-elevated'
              }`}
              testID="consent-submit"
            >
              {isPending ? (
                <ActivityIndicator color="#ffffff" testID="consent-loading" />
              ) : (
                <Text
                  className={`text-body font-semibold ${
                    canSubmit ? 'text-text-inverse' : 'text-text-secondary'
                  }`}
                >
                  Send consent request
                </Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
