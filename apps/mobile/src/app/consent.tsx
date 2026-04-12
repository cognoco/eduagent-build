import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
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
// On web, cap at a mobile-like height to avoid massive whitespace.
const SCREEN_HEIGHT =
  Platform.OS === 'web'
    ? Math.min(Dimensions.get('screen').height, 812)
    : Dimensions.get('screen').height;

type Phase = 'child' | 'parent' | 'success';
type DeliveryState = 'sent' | 'failed';

export default function ConsentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { profileId } = useLocalSearchParams<{
    profileId: string;
  }>();
  const consentType = 'GDPR' as const;

  const { user } = useUser();
  const { mutateAsync, isPending } = useRequestConsent();
  const { isOffline } = useNetworkStatus();
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('child');
  const [parentEmail, setParentEmail] = useState('');
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState('');
  const [deliveryState, setDeliveryState] = useState<DeliveryState>('sent');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isTransitioningRef = useRef(false);
  const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();

  // BUG-26: Fade animation for phase transitions (child → parent → success)
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const transitionToPhase = useCallback(
    (newPhase: Phase) => {
      if (isTransitioningRef.current) return;
      isTransitioningRef.current = true;
      if (reduceMotion) {
        fadeAnim.setValue(1);
        setPhase(newPhase);
        isTransitioningRef.current = false;
        setIsTransitioning(false);
        return;
      }
      setIsTransitioning(true);
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setPhase(newPhase);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          isTransitioningRef.current = false;
          setIsTransitioning(false);
        });
      });
    },
    [fadeAnim, reduceMotion]
  );

  // Hand-off copy uses learner variant (consent screen is always shown to children).
  const copy = getConsentHandOffCopy('learner');

  // Regulation text uses the default (non-learner) variant since the PARENT reads it.
  const regulationCopy = getConsentRequestCopy('parent');
  const regulationText = regulationCopy.regulation;

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail);
  const childEmail = user?.primaryEmailAddress?.emailAddress;
  const isSameAsChild =
    isValidEmail &&
    !!childEmail &&
    parentEmail.trim().toLowerCase() === childEmail.toLowerCase();
  const canSubmit =
    isValidEmail &&
    !isSameAsChild &&
    !isPending &&
    !isTransitioning &&
    (phase === 'child' || phase === 'parent') &&
    !isOffline;

  const onSubmit = useCallback(async () => {
    if (!canSubmit || !profileId) return;

    setError('');
    try {
      const result = await mutateAsync({
        childProfileId: profileId,
        parentEmail: parentEmail.trim(),
        consentType,
      });
      setDeliveryState(result.emailStatus);
      transitionToPhase('success');
    } catch (err: unknown) {
      setError(formatApiError(err));
    }
  }, [
    canSubmit,
    profileId,
    consentType,
    parentEmail,
    mutateAsync,
    transitionToPhase,
  ]);

  const onResendEmail = useCallback(async () => {
    if (!profileId || resending) return;

    setResending(true);
    setResendError('');
    try {
      const result = await mutateAsync({
        childProfileId: profileId,
        parentEmail: parentEmail.trim(),
        consentType,
      });
      setDeliveryState(result.emailStatus);
    } catch (err: unknown) {
      setResendError(formatApiError(err));
    } finally {
      setResending(false);
    }
  }, [profileId, consentType, parentEmail, mutateAsync, resending]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background items-center"
      behavior="padding"
    >
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        style={
          Platform.OS === 'web' ? { maxWidth: 480, width: '100%' } : undefined
        }
        contentContainerStyle={{
          minHeight: SCREEN_HEIGHT,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={{ opacity: fadeAnim }}
          pointerEvents={isTransitioning ? 'none' : 'auto'}
        >
          {phase === 'child' && (
            <View testID="consent-child-view">
              <Text className="text-h1 font-bold text-text-primary mb-4">
                {copy.childTitle}
              </Text>
              <Text className="text-body text-text-secondary mb-6">
                {copy.childMessage}
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
                {isSameAsChild && (
                  <Text
                    className="text-danger text-body-sm mb-1"
                    testID="consent-same-email-warning"
                    accessibilityRole="alert"
                  >
                    This is your own email. Please enter a parent or
                    guardian&apos;s email address.
                  </Text>
                )}
                <Text className="text-body-sm text-text-secondary mb-6">
                  {copy.spamWarning}
                </Text>
              </View>

              <Button
                variant="primary"
                label={copy.childSubmitButton}
                onPress={onSubmit}
                disabled={!canSubmit}
                loading={isPending}
                testID="consent-submit"
              />
              <View className="flex-row justify-center mt-4">
                <Button
                  variant="tertiary"
                  size="small"
                  label={copy.parentIsHereButton}
                  onPress={() => transitionToPhase('parent')}
                  testID="consent-handoff-button"
                />
              </View>
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
                {isSameAsChild && (
                  <Text
                    className="text-danger text-body-sm mb-1"
                    testID="consent-same-email-warning"
                    accessibilityRole="alert"
                  >
                    This is your own email. Please enter a parent or
                    guardian&apos;s email address.
                  </Text>
                )}
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
                {deliveryState === 'sent'
                  ? copy.successMessage
                  : "We couldn't confirm delivery yet"}
              </Text>
              <Text className="text-body text-text-primary mb-2">
                {deliveryState === 'sent' ? (
                  <>
                    Your parent will get an email at{' '}
                    <Text className="font-semibold">{parentEmail}</Text>
                    {'. '}
                    We&apos;ll let you know as soon as they approve.
                  </>
                ) : (
                  <>
                    We could not confirm that the consent email reached{' '}
                    <Text className="font-semibold">{parentEmail}</Text>. Please
                    double-check the address and try again.
                  </>
                )}
              </Text>
              <Text className="text-body text-text-secondary mb-8">
                {deliveryState !== 'sent'
                  ? 'You can resend the request now or go back and enter a different email address.'
                  : ''}
              </Text>
              <Button
                variant="primary"
                label={
                  deliveryState === 'sent' ? copy.handBackButton : 'Go back'
                }
                onPress={() =>
                  deliveryState === 'sent'
                    ? router.back()
                    : transitionToPhase('parent')
                }
                testID="consent-done"
              />
              {resendError ? (
                <Text className="text-sm text-red-400 text-center mt-4 mb-1">
                  {resendError}
                </Text>
              ) : null}
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
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
