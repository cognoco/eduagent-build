import { useState, useCallback, useEffect, useRef } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { computeAgeBracket } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { useProfile, type Profile } from '../lib/profile';
import { useNavigationContract } from '../hooks/use-navigation-contract';
import { useActiveProfileRole } from '../hooks/use-active-profile-role';
import { useUpdateProfileAppContext } from '../hooks/use-profiles';
import { useThemeColors } from '../lib/theme';
import { goBackOrReplace } from '../lib/navigation';
import { Button } from '../components/common/Button';
import { useKeyboardScroll } from '../hooks/use-keyboard-scroll';
import { formatApiError } from '../lib/format-api-error';
import { platformAlert } from '../lib/platform-alert';
import { errorHasCode } from '../components/session/session-types';

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
  MAX_DATE.getDate(),
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ for?: 'child' }>();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const client = useApiClient();
  const { isLoaded, isSignedIn } = useAuth();
  const { activeProfile, profiles, switchProfile } = useProfile();
  const navigationContract = useNavigationContract();
  const activeProfileRole = useActiveProfileRole();
  const updateAppContext = useUpdateProfileAppContext();

  // BUG-239: Detect whether the current user is a parent adding a child.
  // When an account owner (parent) who already has a profile creates another
  // profile, the API grants consent inline — the parent IS the consenting
  // adult. We must NOT redirect to the child-consent-request flow or switch
  // to the child profile afterwards.
  const isParentAddingChild =
    activeProfile?.isOwner === true && profiles.length > 0;
  const isAddingChild = params.for === 'child' || isParentAddingChild;

  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [birthDateText, setBirthDateText] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createPostPending, setCreatePostPending] = useState(false);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  // [ACCOUNT-01] Capture Study/Family intent on first profile setup.
  // Persisted via PATCH /profiles/:id/app-context immediately after creation.
  // null = not chosen yet (gates submit for the first-profile flow).
  // Skipped entirely for "adding a child" (intent is implicit), for the
  // proxy/non-owner gate paths (those never reach POST anyway), and for
  // adolescent first-profile users (the API rejects family mode for non-adult
  // owners; forcing them through the picker would be a dead end).
  const [intent, setIntent] = useState<'study' | 'family' | null>(null);

  // [BUG-UX-PROFILE-TIMEOUT] Hard 30s UI timeout: if the profile-creation POST
  // hasn't resolved, surface an inline error and restore the form so the user
  // can retry. Avoids an infinite spinner dead-end on slow/stuck networks.
  useEffect(() => {
    if (!createPostPending) return undefined;
    const PROFILE_CREATE_TIMEOUT_MS = 30_000;
    const timer = setTimeout(() => {
      const controller = abortRef.current;
      controller?.abort();
      if (abortRef.current === controller) {
        abortRef.current = null;
        inFlightRef.current = false;
        requestSeqRef.current += 1;
      }
      setCreatePostPending(false);
      setLoading(false);
      setError(
        'Creating your profile is taking too long. Check your connection and try again.',
      );
    }, PROFILE_CREATE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [createPostPending]);

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();

  const handleClose = useCallback(() => {
    goBackOrReplace(router, '/(app)/home');
  }, [router]);

  const onDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        setShowDatePicker(false);
      }
      if (selectedDate) {
        setBirthDate(selectedDate);
      }
    },
    [],
  );

  const onWebBirthDateChange = useCallback(
    (value: string) => {
      setBirthDateText(value);
      setBirthDate(parseWebBirthDate(value));
      if (error) setError('');
    },
    [error],
  );

  // [ACCOUNT-01] First-profile setup is the *only* path where the Study/Family
  // intent picker appears. Adding a child has implicit intent (the parent is
  // already on a family-shape account), and once profiles exist the per-profile
  // app-context can be flipped from More → Account / the mode switcher.
  const isFirstProfileSetup = !isAddingChild && profiles.length === 0;
  // Only adult owners can pick 'family' — `familyCapable` in app-context.tsx
  // requires `computeAgeBracket === 'adult'`. We still SHOW the picker so
  // adolescent first-profile users get an explanation, but the family option
  // is disabled with a hint. Birth date must be set before we can show the
  // picker (we need the age bracket).
  const isAdultBirthDate =
    birthDate !== null &&
    computeAgeBracket(birthDate.getFullYear()) === 'adult';
  const showIntentPicker = isFirstProfileSetup && birthDate !== null;
  const intentRequired = showIntentPicker && isAdultBirthDate;

  const canSubmit =
    displayName.trim().length >= 1 &&
    displayName.trim().length <= 50 &&
    birthDate !== null &&
    (!intentRequired || intent !== null) &&
    !loading;

  const onSubmit = useCallback(async () => {
    if (activeProfileRole !== 'owner' || navigationContract.isParentProxy)
      return;
    if (!canSubmit || !birthDate) return;
    if (inFlightRef.current) return;

    const trimmedName = displayName.trim();
    if (trimmedName.length > 50) {
      setError('Display name must be 50 characters or fewer.');
      return;
    }

    setError('');
    inFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setCreatePostPending(true);
    setLoading(true);

    try {
      const body = {
        displayName: trimmedName,
        // birthDate is non-null here (guarded above) — read birth fields from
        // the narrowed value rather than the outer `birthYear` derivation,
        // which TS sees as `number | null`.
        // WI-297: Submit full birth date so the server can compute exact age
        // (avoids year-only overestimation of the age gate).
        birthYear: birthDate.getFullYear(),
        birthMonth: birthDate.getMonth() + 1, // getMonth() is 0-based
        birthDay: birthDate.getDate(),
      };

      const res = await client.profiles.$post(
        { json: body },
        { init: { signal: controller.signal } },
      );
      await assertOk(res);
      const result = (await res.json()) as { profile: Profile };
      setCreatePostPending(false);
      if (requestSeqRef.current !== requestSeq || controller.signal.aborted) {
        return;
      }

      // [ACCOUNT-01] Persist Study/Family intent immediately after creation.
      // The profile is created with defaultAppContext=null; setting it now
      // means future sign-ins land the user in the correct mode the moment
      // they add a child (family-mode UI activates as soon as
      // familyCapable === true, which requires hasFamilyLinks === true).
      // Picking 'study' is the default — no PATCH needed for that branch.
      // Wrapped in a non-throwing try so a flaky PATCH never blocks the
      // profile-created success path; the user can change mode later from
      // More → Account.
      let intentPersistedProfile: Profile | null = null;
      if (isFirstProfileSetup && intent === 'family' && isAdultBirthDate) {
        try {
          intentPersistedProfile = await updateAppContext.mutateAsync({
            profileId: result.profile.id,
            defaultAppContext: 'family',
          });
        } catch (intentErr) {
          if (__DEV__) {
            console.warn(
              '[ACCOUNT-01] Failed to persist family intent on first profile setup; user can change later from More → Account.',
              intentErr,
            );
          }
        }
      }
      const createdProfile = intentPersistedProfile ?? result.profile;

      // BUG-264: Optimistically add the new profile to the query cache BEFORE
      // invalidating. Without this, invalidateQueries triggers a refetch with
      // stale data (empty array for first-time users), causing activeProfile to
      // be null briefly, which remounts CreateProfileGate and flashes the
      // welcome screen again.
      queryClient.setQueriesData<Profile[]>(
        {
          predicate: (query) => String(query.queryKey[0]) === 'profiles',
        },
        (old) =>
          old && !old.some((profile) => profile.id === createdProfile.id)
            ? [...old, createdProfile]
            : (old ?? [createdProfile]),
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
          `${trimmedName}'s profile is ready. You can open it from Family mode.`,
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

      // Navigate FIRST — switchProfile triggers a nav-tree remount via
      // setActiveProfileId; any router call that fires after the remount
      // starts operates on a torn-down navigator and silently no-ops on web.
      // The profile context's isLoading guard prevents CreateProfileGate from
      // flashing during the switch window (profiles.length > 0 &&
      // activeProfile === null stays true until the switch completes).
      if (needsConsentFlow) {
        router.replace({
          pathname: '/consent',
          params: { profileId: result.profile.id },
        });
      } else {
        handleClose();
      }

      const switchResult = await switchProfile(result.profile.id);
      if (switchResult?.success === false) {
        platformAlert(
          'Profile created',
          switchResult.error ??
            'We created the profile, but could not switch to it automatically. You can switch from the Profiles screen.',
        );
      }
    } catch (err: unknown) {
      if (requestSeqRef.current !== requestSeq || controller.signal.aborted) {
        return;
      }
      // [BUG-947] PROFILE_LIMIT_EXCEEDED is an upgrade gate, not a server fault.
      // The route returns 402 with an actionable "upgrade to Family or Pro"
      // message; without this branch the generic UpstreamError path renders it
      // as "Something went wrong on our end" — exactly what QA reported as a
      // fake 500. Surface the upgrade CTA inline so the user can act.
      if (errorHasCode(err, 'PROFILE_LIMIT_EXCEEDED')) {
        // [BUG-947] Do NOT use `instanceof Error` here — Metro HMR can break
        // module identity so instanceof fails even for genuine Error objects.
        // Read `.message` via property access on the raw value instead; the
        // `errorHasCode` guard above already confirmed the object shape is valid.
        const rawMessage =
          typeof err === 'object' &&
          err !== null &&
          'message' in err &&
          typeof (err as { message?: unknown }).message === 'string'
            ? (err as { message: string }).message
            : '';
        platformAlert(
          'Upgrade required',
          rawMessage ||
            'Your subscription does not support additional profiles. Please upgrade to Family or Pro.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'See plans',
              onPress: () => router.push('/(app)/subscription'),
            },
          ],
        );
        setError('');
      } else {
        setError(formatApiError(err));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        inFlightRef.current = false;
        setCreatePostPending(false);
        setLoading(false);
      }
    }
  }, [
    activeProfileRole,
    navigationContract.isParentProxy,
    canSubmit,
    displayName,
    birthDate,
    isParentAddingChild,
    client,
    queryClient,
    switchProfile,
    router,
    handleClose,
    intent,
    isFirstProfileSetup,
    isAdultBirthDate,
    updateAppContext,
  ]);

  // [BUG-375] Auth gate — deep-link entry must not show create-profile form to
  // unauthenticated users. Guard before rendering any content.
  if (!isLoaded) {
    return (
      <View
        testID="create-profile-auth-loading"
        className="flex-1 bg-background items-center justify-center"
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  // WI-296: useActiveProfileRole returns null while the role is still
  // resolving. Show a spinner rather than the access-blocked screen so a
  // legitimate owner does not briefly see the blocked UI before the role lands.
  if (activeProfileRole === null) {
    return (
      <View
        testID="create-profile-role-loading"
        className="flex-1 bg-background items-center justify-center"
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // WI-296: Block create-profile when the active profile is not the account
  // owner, or when a parent is acting as a proxy for a child profile. In both
  // cases the API would reject the request; gate early to avoid a misleading
  // form that silently fails.
  if (activeProfileRole !== 'owner' || navigationContract.isParentProxy) {
    return (
      <View
        testID="create-profile-access-blocked"
        className="flex-1 bg-background items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className="text-h2 font-bold text-text-primary text-center mb-3">
          {t('proxy.readOnly.title')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-8">
          {t('proxy.readOnly.hint')}
        </Text>
        <Button
          variant="primary"
          label={t('proxy.readOnly.switchProfileCta')}
          onPress={handleClose}
          testID="create-profile-blocked-close"
        />
      </View>
    );
  }

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
            {isAddingChild ? 'Add a child' : 'New profile'}
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
            {isAddingChild ? "Child's display name" : 'Display name'}
          </Text>
          <TextInput
            className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
            placeholder={
              isAddingChild ? "Enter your child's name" : 'Enter name'
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
          {isAddingChild ? "Child's birth date" : 'Birth date'}
        </Text>
        <Text className="text-body-sm text-text-secondary mb-2">
          {isAddingChild
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
                isAddingChild ? "Child's birth date" : 'Birth date'
              }
              onFocus={onFieldFocus('birthdate')}
            />
            <Text className="text-caption text-text-secondary mt-2">
              {isAddingChild
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
              isAddingChild ? "Select child's birth date" : 'Select birth date'
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
                : isAddingChild
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

        {/* [ACCOUNT-01] Intent picker — first-profile setup only.
            Hidden when adding a child (implicit family intent), hidden until
            the user has picked a birth date (we need the age bracket to know
            whether family mode is even reachable), and hidden once any
            profile exists (use the More → Account mode switcher instead). */}
        {showIntentPicker && (
          <View className="mt-2 mb-2" testID="create-profile-intent-picker">
            <Text className="text-body-sm font-semibold text-text-secondary mb-1">
              How will you use MentoMate?
            </Text>
            <Text className="text-body-sm text-text-secondary mb-2">
              {isAdultBirthDate
                ? 'You can change this any time from More → Account.'
                : 'You are set up as a learner. Adults can switch to Family mode once they add a child.'}
            </Text>
            <Pressable
              onPress={() => {
                setIntent('study');
                if (error) setError('');
              }}
              className={
                intent === 'study'
                  ? 'bg-primary/15 border border-primary rounded-input px-4 py-3 mb-2'
                  : 'bg-surface rounded-input px-4 py-3 mb-2'
              }
              accessibilityRole="radio"
              accessibilityState={{ selected: intent === 'study' }}
              testID="create-profile-intent-study"
            >
              <Text className="text-text-primary text-body font-semibold">
                Just for me (Study)
              </Text>
              <Text className="text-body-sm text-text-secondary mt-1">
                Personal learning. You will land on the learner home.
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!isAdultBirthDate) return;
                setIntent('family');
                if (error) setError('');
              }}
              disabled={!isAdultBirthDate}
              className={
                intent === 'family'
                  ? 'bg-primary/15 border border-primary rounded-input px-4 py-3 mb-2'
                  : isAdultBirthDate
                    ? 'bg-surface rounded-input px-4 py-3 mb-2'
                    : 'bg-surface opacity-50 rounded-input px-4 py-3 mb-2'
              }
              accessibilityRole="radio"
              accessibilityState={{
                selected: intent === 'family',
                disabled: !isAdultBirthDate,
              }}
              testID="create-profile-intent-family"
            >
              <Text className="text-text-primary text-body font-semibold">
                For my family (Family)
              </Text>
              <Text className="text-body-sm text-text-secondary mt-1">
                {isAdultBirthDate
                  ? 'Mentor children alongside your own learning. Family mode activates after you add a child.'
                  : 'Available for adult account owners only.'}
              </Text>
            </Pressable>
          </View>
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
