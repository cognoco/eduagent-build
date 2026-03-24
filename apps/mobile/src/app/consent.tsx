import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequestConsent } from '../hooks/use-consent';
import { useThemeColors } from '../lib/theme';
import { Button } from '../components/common/Button';
import { useKeyboardScroll } from '../hooks/use-keyboard-scroll';
import {
  getConsentHandOffCopy,
  getConsentRequestCopy,
} from '../lib/consent-copy';
import { useNetworkStatus } from '../hooks/use-network-status';
import { formatApiError } from '../lib/format-api-error';

// Captured at module load — safe because these screens are portrait-locked.
const SCREEN_HEIGHT = Dimensions.get('screen').height;

type Phase = 'child' | 'parent' | 'success';

export default function ConsentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { profileId } = useLocalSearchParams<{
    profileId: string;
  }>();
  const consentType = 'GDPR' as const;

  const { mutateAsync, isPending } = useRequestConsent();
  const { isOffline } = useNetworkStatus();

  const [phase, setPhase] = useState<Phase>('child');
  const [parentEmail, setParentEmail] = useState('');
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();

  // Hand-off copy uses learner variant (consent screen is always shown to children).
  const copy = getConsentHandOffCopy('learner');

  // Regulation text uses the default (non-learner) variant since the PARENT reads it.
  const regulationCopy = getConsentRequestCopy('parent');
  const regulationText = regulationCopy.regulation;

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail);
  const canSubmit =
    isValidEmail && !isPending && phase === 'parent' && !isOffline;

  const onSubmit = useCallback(async () => {
    if (!canSubmit || !profileId) return;

    setError('');
    try {
      await mutateAsync({
        childProfileId: profileId,
        parentEmail: parentEmail.trim(),
        consentType,
      });
      setPhase('success');
    } catch (err: unknown) {
      setError(formatApiError(err));
    }
  }, [canSubmit, profileId, consentType, parentEmail, mutateAsync]);

  const onResendEmail = useCallback(async () => {
    if (!profileId || resending) return;

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
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          minHeight: SCREEN_HEIGHT,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {phase === 'child' && (
          <View testID="consent-child-view">
            <Text className="text-h1 font-bold text-text-primary mb-4">
              {copy.childTitle}
            </Text>
            <Text className="text-body text-text-secondary mb-8">
              {copy.childMessage}
            </Text>
            <Button
              variant="primary"
              label={copy.handOffButton}
              onPress={() => setPhase('parent')}
              testID="consent-handoff-button"
            />
          </View>
        )}

        {phase === 'parent' && (
          <View testID="consent-parent-view">
            <Text className="text-h1 font-bold text-text-primary mb-4">
              {copy.parentTitle}
            </Text>

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

            <View onLayout={onFieldLayout('email')}>
              <Text className="text-body-sm font-semibold text-text-secondary mb-1">
                {copy.parentEmailLabel}
              </Text>
              <TextInput
                className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-2"
                placeholder={copy.parentEmailPlaceholder}
                placeholderTextColor={colors.muted}
                value={parentEmail}
                onChangeText={setParentEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!isPending}
                testID="consent-email"
                onFocus={onFieldFocus('email')}
              />
              <Text className="text-body-sm text-text-secondary mb-6">
                {copy.spamWarning}
              </Text>
            </View>

            <Button
              variant="primary"
              label={copy.parentSubmitButton}
              onPress={onSubmit}
              disabled={!canSubmit}
              loading={isPending}
              testID="consent-submit"
            />
          </View>
        )}

        {phase === 'success' && (
          <View testID="consent-success">
            <Text className="text-h1 font-bold text-text-primary mb-4">
              {copy.successMessage}
            </Text>
            <Text className="text-body text-text-primary mb-2">
              We sent a consent link to{' '}
              <Text className="font-semibold">{parentEmail}</Text>.
            </Text>
            <Text className="text-body text-text-secondary mb-8">
              {copy.successSpamHint}
            </Text>
            <Button
              variant="primary"
              label={copy.handBackButton}
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
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
