import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile, type Profile } from '../lib/profile';
import { useThemeColors } from '../lib/theme';
import { goBackOrReplace } from '../lib/navigation';
import { Button } from '../components/common/Button';
import { useKeyboardScroll } from '../hooks/use-keyboard-scroll';
import { formatApiError } from '../lib/format-api-error';
import { platformAlert } from '../lib/platform-alert';

// Captured at module load — safe because these screens are portrait-locked.
// On web, cap at a mobile-like height to avoid massive whitespace.
const SCREEN_HEIGHT =
  Platform.OS === 'web'
    ? Math.min(Dimensions.get('screen').height, 812)
    : Dimensions.get('screen').height;

const MAX_DATE = new Date();
const MIN_DATE = new Date(
  MAX_DATE.getFullYear() - 100,
  MAX_DATE.getMonth(),
  MAX_DATE.getDate()
);

function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function parseWebBirthDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(year, month - 1, day);
  const isValid =
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day;

  if (!isValid) return null;
  if (parsed < MIN_DATE || parsed > MAX_DATE) return null;

  return parsed;
}

export default function CreateProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const client = useApiClient();
  const { activeProfile, profiles, switchProfile } = useProfile();

  // BUG-239: Detect whether the current user is a parent adding a child.
  // When an account owner (parent) who already has a profile creates another
  // profile, the API grants consent inline — the parent IS the consenting
  // adult. We must NOT redirect to the child-consent-request flow or switch
  // to the child profile afterwards.
  const isParentAddingChild =
    activeProfile?.isOwner === true && profiles.length > 0;

  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [birthDateText, setBirthDateText] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // [BUG-UX-PROFILE-TIMEOUT] Hard 30s UI timeout: if the profile-creation POST
  // hasn't resolved, surface an inline error and restore the form so the user
  // can retry. Avoids an infinite spinner dead-end on slow/stuck networks.
  useEffect(() => {
    if (!loading) return undefined;
    const PROFILE_CREATE_TIMEOUT_MS = 30_000;
    const timer = setTimeout(() => {
      setLoading(false);
      setError(
        'Creating your profile is taking too long. Check your connection and try again.'
      );
    }, PROFILE_CREATE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();

  const handleClose = useCallback(() => {
    goBackOrReplace(router, '/(app)/home');
  }, [router]);

  const birthYear = birthDate ? birthDate.getFullYear() : null;

  const onDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        setShowDatePicker(false);
      }
      if (selectedDate) {
        setBirthDate(selectedDate);
      }
    },
    []
  );

  const onWebBirthDateChange = useCallback(
    (value: string) => {
      setBirthDateText(value);
      setBirthDate(parseWebBirthDate(value));
      if (error) setError('');
    },
    [error]
  );

  const canSubmit =
    displayName.trim().length >= 1 &&
    displayName.trim().length <= 50 &&
    birthDate !== null &&
    !loading;

  const onSubmit = useCallback(async () => {
    if (!canSubmit || !birthDate) return;

    const trimmedName = displayName.trim();
    if (trimmedName.length > 50) {
      setError('Display name must be 50 characters or fewer.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const body = {
        displayName: trimmedName,
        // birthDate is non-null here (guarded above) — read birthYear from
        // the narrowed value rather than the outer `birthYear` derivation,
        // which TS sees as `number | null`.
        birthYear: birthDate.getFullYear(),
      };

      const res = await client.profiles.$post({ json: body });
      const result = (await res.json()) as { profile: Profile };

      // BUG-264: Optimistically add the new profile to the query cache BEFORE
      // invalidating. Without this, invalidateQueries triggers a refetch with
      // stale data (empty array for first-time users), causing activeProfile to
      // be null briefly, which remounts CreateProfileGate and flashes the
      // welcome screen again.
      queryClient.setQueryData<Profile[]>(['profiles'], (old) =>
        old ? [...old, result.profile] : [result.profile]
      );
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });

      // BUG-239: When a parent adds a child, the API grants consent inline
      // (consentStatus === 'CONSENTED'). Do NOT redirect to the child consent
      // request screen, and do NOT switch to the child profile — keep the
      // parent on their own profile.
      if (isParentAddingChild) {
        handleClose();
        // Show confirmation — parent stays on their own profile
        platformAlert(
          'Profile created',
          `${trimmedName}'s profile is ready. You can switch to it from the Profiles screen.`
        );
        return;
      }

      // Non-parent flow: first-time user or child self-registering.
      // Navigate FIRST — prevents crash from tree remount (themeKey change)
      // destroying the modal's navigation state during switchProfile.
      // Only redirect to consent when the API returned a pending consent status
      // (child self-registering who needs parental approval).
      const needsConsentFlow =
        result.profile.consentStatus === 'PENDING' ||
        result.profile.consentStatus === 'PARENTAL_CONSENT_REQUESTED';

      const switchResult = await switchProfile(result.profile.id);
      if (switchResult?.success === false) {
        platformAlert(
          'Profile created',
          switchResult.error ??
            'We created the profile, but could not switch to it automatically. You can switch from the Profiles screen.'
        );
      }

      if (needsConsentFlow) {
        router.replace({
          pathname: '/consent',
          params: { profileId: result.profile.id },
        });
      } else {
        handleClose();
      }
    } catch (err: unknown) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [
    canSubmit,
    displayName,
    birthDate,
    isParentAddingChild,
    client,
    queryClient,
    switchProfile,
    router,
    handleClose,
  ]);

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
        <View className="flex-row items-center justify-between mb-8">
          <Text className="text-h1 font-bold text-text-primary">
            {isParentAddingChild ? 'Add a child' : 'New profile'}
          </Text>
          <Button
            variant="tertiary"
            size="small"
            label="Cancel"
            onPress={handleClose}
            testID="create-profile-cancel"
          />
        </View>

        {error !== '' && (
          <View
            className="bg-danger/10 rounded-card px-4 py-3 mb-4"
            accessibilityRole="alert"
          >
            <Text
              className="text-danger text-body-sm"
              testID="create-profile-error"
            >
              {error}
            </Text>
          </View>
        )}

        <View onLayout={onFieldLayout('name')}>
          <Text className="text-body-sm font-semibold text-text-secondary mb-1">
            {isParentAddingChild ? "Child's display name" : 'Display name'}
          </Text>
          <TextInput
            className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
            placeholder={
              isParentAddingChild ? "Enter your child's name" : 'Enter name'
            }
            placeholderTextColor={colors.muted}
            value={displayName}
            onChangeText={(value: string) => {
              setDisplayName(value);
              if (error) setError('');
            }}
            maxLength={50}
            editable={!loading}
            testID="create-profile-name"
            onFocus={onFieldFocus('name')}
          />
        </View>

        <Text className="text-body-sm font-semibold text-text-secondary mb-1">
          {isParentAddingChild ? "Child's birth date" : 'Birth date'}
        </Text>
        <Text className="text-body-sm text-text-secondary mb-2">
          {isParentAddingChild
            ? "We use your child's age to personalise how their mentor talks to them and to comply with privacy laws. Minimum age is 11."
            : 'We use your age to personalise how your mentor talks to you and to comply with privacy laws. Minimum age is 11.'}
        </Text>
        {Platform.OS === 'web' ? (
          <View className="mb-2" onLayout={onFieldLayout('birthdate')}>
            <TextInput
              className="bg-surface text-text-primary text-body rounded-input px-4 py-3"
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.muted}
              value={birthDateText}
              onChangeText={onWebBirthDateChange}
              editable={!loading}
              autoComplete="birthdate-full"
              testID="create-profile-birthdate-input"
              accessibilityLabel={
                isParentAddingChild ? "Child's birth date" : 'Birth date'
              }
              onFocus={onFieldFocus('birthdate')}
            />
            <Text className="text-caption text-text-secondary mt-2">
              {isParentAddingChild
                ? "Enter your child's birth date as YYYY-MM-DD."
                : 'Enter your birth date as YYYY-MM-DD.'}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowDatePicker(true)}
            className="bg-surface rounded-input px-4 py-3 mb-2"
            disabled={loading}
            accessibilityLabel={
              isParentAddingChild
                ? "Select child's birth date"
                : 'Select birth date'
            }
            testID="create-profile-birthdate"
          >
            <Text
              className={
                birthDate ? 'text-text-primary text-body' : 'text-body'
              }
              style={birthDate ? undefined : { color: colors.muted }}
            >
              {birthDate
                ? formatDateForDisplay(birthDate)
                : isParentAddingChild
                ? "Select your child's date of birth"
                : 'Select date of birth'}
            </Text>
          </Pressable>
        )}

        {Platform.OS === 'ios' && showDatePicker && (
          <Modal transparent animationType="slide" testID="date-picker-modal">
            <View className="flex-1 justify-end bg-black/30">
              <View className="bg-surface rounded-t-2xl pb-8">
                <View className="flex-row justify-end px-4 pt-3 pb-1">
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    className="min-h-[44px] min-w-[44px] items-center justify-center"
                    accessibilityLabel="Close date picker"
                    testID="date-picker-done"
                  >
                    <Text className="text-primary text-body font-semibold">
                      Done
                    </Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={birthDate ?? new Date(2010, 0, 1)}
                  mode="date"
                  display="spinner"
                  maximumDate={MAX_DATE}
                  minimumDate={MIN_DATE}
                  onChange={onDateChange}
                  testID="date-picker"
                />
              </View>
            </View>
          </Modal>
        )}

        {Platform.OS === 'android' && showDatePicker && (
          <DateTimePicker
            value={birthDate ?? new Date(2010, 0, 1)}
            mode="date"
            display="default"
            maximumDate={MAX_DATE}
            minimumDate={MIN_DATE}
            onChange={onDateChange}
            testID="date-picker"
          />
        )}

        {/* Spacer before submit — persona is auto-detected from birth date */}
        <View className="h-6" />

        <Button
          variant="primary"
          label="Create profile"
          onPress={onSubmit}
          disabled={!canSubmit}
          loading={loading}
          testID="create-profile-submit"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
