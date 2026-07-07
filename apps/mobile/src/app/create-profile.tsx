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
import {
  Redirect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  conversationLanguageSchema,
  PARENT_ACCOUNT_MINIMUM_AGE,
  PROFILE_MINIMUM_AGE,
} from '@eduagent/schemas';
import { useProfile } from '../lib/profile';
import {
  readPreAuthAudienceSync,
  readPreAuthAudience,
  clearPreAuthAudience,
} from '../lib/pre-auth-audience';
import { useNavigationContract } from '../hooks/use-navigation-contract';
import { useActiveProfileRole } from '../hooks/use-active-profile-role';
import { useUpdateProfileAppContext } from '../hooks/use-profiles';
import { useCreateProfile } from '../hooks/use-create-profile';
import { useThemeColors } from '../lib/theme';
import { goBackOrReplace } from '../lib/navigation';
import { formatShortDate } from '../lib/format-datetime';
import { Button } from '../components/common/Button';
import { useKeyboardScroll } from '../hooks/use-keyboard-scroll';
import { formatApiError } from '../lib/format-api-error';
import { platformAlert } from '../lib/platform-alert';
import { errorHasCode } from '../components/session/session-types';
import { requestMentorBornCeremony } from '../lib/mentor-born-ceremony';

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

function formatDateForDisplay(date: Date, locale: string | undefined): string {
  return formatShortDate(date, locale, {
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

function calculateAgeFromDate(birthDate: Date, now = new Date()): number {
  const yearDiff = now.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() &&
      now.getDate() >= birthDate.getDate());

  return hasHadBirthdayThisYear ? yearDiff : yearDiff - 1;
}

export default function CreateProfileScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ for?: 'child' }>();
  const colors = useThemeColors();
  const { isLoaded, isSignedIn } = useAuth();
  const {
    activeProfile,
    profiles,
    switchProfile,
    isLoading: isProfileLoading,
  } = useProfile();
  const navigationContract = useNavigationContract();
  const activeProfileRole = useActiveProfileRole();
  const updateAppContext = useUpdateProfileAppContext();
  const createProfile = useCreateProfile();

  // BUG-239: Detect whether the current user is a parent adding a child.
  // When an account owner (parent) who already has a profile creates another
  // profile, the API grants consent inline — the parent IS the consenting
  // adult. We must NOT redirect to the child-consent-request flow or switch
  // to the child profile afterwards.
  const isParentAddingChild =
    activeProfile?.isOwner === true && profiles.length > 0;
  const isAddingChild = params.for === 'child' || isParentAddingChild;
  const isFirstProfileCreation =
    !isProfileLoading && !activeProfile && profiles.length === 0;

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
  // Audience chosen at the pre-auth welcome chooser, carried across the signup
  // wall. Drives first-profile setup: 'parent' (adult) sets family context and
  // routes to the add-a-child screen; 'learner'/absent gets a clean solo setup.
  // The old in-form Study/Family picker was removed — the chooser asks once.
  const [audience, setAudience] = useState(() => readPreAuthAudienceSync());
  useEffect(() => {
    let active = true;
    void readPreAuthAudience().then((resolved) => {
      if (active && resolved) setAudience(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

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
      setError(t('onboarding.createProfile.timeoutError'));
    }, PROFILE_CREATE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [createPostPending, t]);

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
        setError('');
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

  const isFirstProfileSetup = !isAddingChild && profiles.length === 0;
  const isParentFirstProfileSetup =
    isFirstProfileSetup && audience === 'parent';
  // Only adult owners can be guardians — `familyCapable` in app-context.tsx
  // requires an adult owner, and add-child is 18+.
  const isAdultBirthDate =
    birthDate !== null &&
    calculateAgeFromDate(birthDate) >= PARENT_ACCOUNT_MINIMUM_AGE;
  // A parent (chosen at the chooser) old enough to be a guardian: set family
  // context and route to the add-a-child screen after creating their own
  // profile. A parent-intent minor birth date is blocked explicitly in submit
  // so we never silently create a solo learner instead.
  const wantsFamily = isParentFirstProfileSetup && isAdultBirthDate;

  const canSubmit =
    displayName.trim().length >= 1 &&
    displayName.trim().length <= 50 &&
    birthDate !== null &&
    !loading;

  const title = isAddingChild
    ? t('createProfile.titleChild')
    : isParentFirstProfileSetup
      ? t('createProfile.titleParent')
      : t('createProfile.titleSelf');
  const displayNameLabel = isAddingChild
    ? t('createProfile.childDisplayNameLabel')
    : isParentFirstProfileSetup
      ? t('createProfile.parentDisplayNameLabel')
      : t('createProfile.displayNameLabel');
  const birthDateLabel = isAddingChild
    ? t('createProfile.childBirthDateLabel')
    : isParentFirstProfileSetup
      ? t('createProfile.parentBirthDateLabel')
      : t('createProfile.birthDateLabel');
  const birthDateHint = isAddingChild
    ? t('createProfile.childBirthDateHint', { age: PROFILE_MINIMUM_AGE })
    : isParentFirstProfileSetup
      ? t('createProfile.parentBirthDateHint', {
          age: PARENT_ACCOUNT_MINIMUM_AGE,
        })
      : t('createProfile.birthDateHint', { age: PROFILE_MINIMUM_AGE });

  const onSubmit = useCallback(async () => {
    if (
      !isFirstProfileCreation &&
      (activeProfileRole !== 'owner' || navigationContract.isParentProxy)
    ) {
      return;
    }
    if (!canSubmit || !birthDate) return;
    if (inFlightRef.current) return;

    const trimmedName = displayName.trim();
    if (trimmedName.length > 50) {
      setError(t('onboarding.createProfile.displayNameTooLong'));
      return;
    }

    if (isParentFirstProfileSetup && !isAdultBirthDate) {
      setError(t('createProfile.parentAdultAgeError'));
      return;
    }

    if (calculateAgeFromDate(birthDate) < PROFILE_MINIMUM_AGE) {
      setError(
        t('createProfile.minimumAgeError', {
          age: PROFILE_MINIMUM_AGE,
        }),
      );
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
      // i18n Phase 1 — Signup-time fix. Self-create: forward the device UI
      // language so the first LLM card uses the learner's locale instead of
      // the DB default 'en'. Parent-creates-child: OMIT the field — the
      // parent's UI locale does not reliably predict the child's language
      // (cross-language families exist). DB default 'en' applies until the
      // child first signs in on their own device, when useMentorLanguageSync
      // overwrites the row to match the child's UI choice.
      const parsedConversationLanguage = !isAddingChild
        ? conversationLanguageSchema.safeParse(i18n.language)
        : null;
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
        ...(parsedConversationLanguage?.success
          ? { conversationLanguage: parsedConversationLanguage.data }
          : {}),
        // [WI-811] Parent-creates-child must carry the discriminator so the v2
        // server routes this POST to createChildProfileV2 instead of the
        // idempotent owner replay (which would return the owner and create no
        // child). Owner/first-profile create omits it. Flag-off ignores it
        // (legacy classifies by profile count), so this is byte-compatible.
        ...(isAddingChild ? { kind: 'child' as const } : {}),
      };

      // useCreateProfile's onSuccess handles the BUG-264 optimistic cache
      // update (setQueriesData + invalidateQueries) so we don't need to do
      // it here. updateAppContext's own onSuccess patches the profile in
      // cache after the family-context PATCH, keeping the cache consistent.
      const profile = await createProfile.mutateAsync({
        body,
        signal: controller.signal,
      });
      if (
        abortRef.current !== controller ||
        requestSeqRef.current !== requestSeq ||
        controller.signal.aborted
      ) {
        return;
      }
      setCreatePostPending(false);

      // Persist family context immediately after creation for a parent
      // audience. First-profile parent setup writes the newly-created owner.
      // Parent-adds-child writes the already-active owner, not the returned
      // child profile. A learner audience leaves the default — no PATCH needed.
      const familyContextProfileId = isParentAddingChild
        ? activeProfile?.id
        : wantsFamily
          ? profile.id
          : null;
      const persistFamilyContext = async (): Promise<boolean> => {
        if (!familyContextProfileId) return true;
        try {
          await updateAppContext.mutateAsync({
            profileId: familyContextProfileId,
            defaultAppContext: 'family',
          });
          return true;
        } catch (intentErr) {
          if (__DEV__) {
            console.warn(
              'Failed to persist family context after profile creation.',
              intentErr,
            );
          }
          return false;
        }
      };
      const showFamilyContextRecoveryAlert = (retryAvailable = true): void => {
        const actions = retryAvailable
          ? [
              { text: t('common.notNow'), style: 'cancel' as const },
              {
                text: t('createProfile.switchFamilyModeCta'),
                onPress: () => {
                  void (async () => {
                    const retryPersisted = await persistFamilyContext();
                    if (!retryPersisted) showFamilyContextRecoveryAlert(false);
                  })();
                },
              },
            ]
          : [{ text: t('common.notNow'), style: 'cancel' as const }];

        platformAlert(
          t('createProfile.createdTitle'),
          t('createProfile.createdChildFamilyContextFailedBody', {
            name: trimmedName,
          }),
          actions,
        );
      };
      const familyContextPersisted = await persistFamilyContext();

      // BUG-239: When a parent adds a child, the API grants consent inline
      // (consentStatus === 'CONSENTED'). Do NOT redirect to the child consent
      // request screen, and do NOT switch to the child profile — keep the
      // parent on their own profile.
      if (isParentAddingChild) {
        handleClose();
        // Show confirmation — parent stays on their own profile. If the
        // family-context PATCH failed, keep the successful child creation and
        // give the parent an explicit retry path instead of silently landing
        // back in Study context.
        if (familyContextPersisted) {
          platformAlert(
            t('createProfile.createdTitle'),
            t('createProfile.createdChildBody', { name: trimmedName }),
          );
        } else {
          showFamilyContextRecoveryAlert();
        }
        return;
      }

      // Non-parent flow: first-time user or child self-registering.
      // Navigate FIRST — prevents crash from tree remount (themeKey change)
      // destroying the modal's navigation state during switchProfile.
      const needsConsentFlow =
        profile.consentStatus === 'PENDING' ||
        profile.consentStatus === 'PARENTAL_CONSENT_REQUESTED';

      // [#7] Consent double-surface race fix. Previously this branch did
      // router.replace('/consent') AND THEN switchProfile to the pending child.
      // Switching the active profile mounts the layout's ConsentPendingGate for
      // that profile, so two consent surfaces raced: the explicit /consent modal
      // and the layout gate. On web a router call issued just before the
      // switch-induced nav-tree remount silently no-ops, so the user could land
      // on the gate instead of the /consent email form — non-deterministic.
      //
      // The layout ConsentPendingGate is the single source of truth for a
      // pending-consent profile: for status PENDING it renders the full
      // "send to parent" surface (with its own push to /consent), and for
      // PARENTAL_CONSENT_REQUESTED it renders the waiting/resend UI. So we do
      // NOT push /consent here — we only switch to the child, and the gate takes
      // over deterministically with exactly one consent surface. For the
      // non-consent path we close the modal as before.
      //
      // switchProfile triggers a nav-tree remount via setActiveProfileId; any
      // router call that fires after the remount starts operates on a torn-down
      // navigator and silently no-ops on web. The profile context's isLoading
      // guard prevents CreateProfileGate from flashing during the switch window
      // (profiles.length > 0 && activeProfile === null stays true until the
      // switch completes).
      if (!needsConsentFlow && wantsFamily) {
        // Parent's own profile is created — take them straight to the
        // add-a-child screen (skippable via its Cancel) instead of the learner
        // home. Navigate FIRST (same remount-ordering reason as below), then
        // switch to the new owner so the add-child route guard resolves.
        router.replace({
          pathname: '/create-profile',
          params: { for: 'child' },
        });
      } else if (!needsConsentFlow) {
        if (isFirstProfileCreation && !isAddingChild) {
          requestMentorBornCeremony({
            profileId: profile.id,
            reason: 'first-profile-created',
          });
        }
        handleClose();
      }

      // Audience has served its purpose; clear the cross-signup carrier so a
      // later profile add does not re-trigger the family redirect.
      void clearPreAuthAudience();

      const switchResult = await switchProfile(profile.id);
      if (switchResult?.success === false) {
        platformAlert(
          t('createProfile.createdTitle'),
          switchResult.error ?? t('createProfile.createdSwitchFailedBody'),
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
          t('createProfile.upgradeRequiredTitle'),
          rawMessage || t('createProfile.upgradeRequiredBody'),
          [
            { text: t('common.notNow'), style: 'cancel' },
            {
              text: t('createProfile.seePlans'),
              onPress: () => router.push('/(app)/subscription' as Href),
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
    activeProfile?.id,
    isFirstProfileCreation,
    navigationContract.isParentProxy,
    canSubmit,
    displayName,
    birthDate,
    isParentAddingChild,
    isFirstProfileCreation,
    // i18n Phase 1 — onSubmit branches on isAddingChild and reads i18n.language
    // to build the create-profile payload. Without these in deps, a route or
    // language change between mount and submit would send the stale value.
    isAddingChild,
    i18n.language,
    createProfile,
    switchProfile,
    router,
    handleClose,
    isAdultBirthDate,
    isParentFirstProfileSetup,
    wantsFamily,
    updateAppContext,
    t,
  ]);

  // [BUG-375] Auth gate — deep-link entry must not show create-profile form to
  // unauthenticated users. Guard before rendering any content.
  if (!isLoaded) {
    return (
      <View
        testID="create-profile-auth-loading"
        className="flex-1 bg-background items-center justify-center"
      >
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }
  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  // WI-296: useActiveProfileRole returns null while the role is still
  // resolving. Show a spinner rather than the access-blocked screen so a
  // legitimate owner does not briefly see the blocked UI before the role lands.
  if (!isFirstProfileCreation && activeProfileRole === null) {
    return (
      <View
        testID="create-profile-role-loading"
        className="flex-1 bg-background items-center justify-center"
      >
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }

  // WI-296: Block create-profile when the active profile is not the account
  // owner, or when a parent is acting as a proxy for a child profile. In both
  // cases the API would reject the request; gate early to avoid a misleading
  // form that silently fails.
  if (
    !isFirstProfileCreation &&
    (activeProfileRole !== 'owner' || navigationContract.isParentProxy)
  ) {
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
          <Text className="text-h1 font-bold text-text-primary">{title}</Text>
          <Button
            variant="tertiary"
            size="small"
            label={t('common.cancel')}
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
            {displayNameLabel}
          </Text>
          <TextInput
            className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
            placeholder={
              isAddingChild
                ? t('onboarding.createProfile.childNamePlaceholder')
                : t('onboarding.createProfile.namePlaceholder')
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
            accessibilityLabel={displayNameLabel}
          />
        </View>

        <Text className="text-body-sm font-semibold text-text-secondary mb-1">
          {birthDateLabel}
        </Text>
        <Text className="text-body-sm text-text-secondary mb-2">
          {birthDateHint}
        </Text>
        {Platform.OS === 'web' ? (
          <View className="mb-2" onLayout={onFieldLayout('birthdate')}>
            <TextInput
              className="bg-surface text-text-primary text-body rounded-input px-4 py-3"
              placeholder={t('onboarding.createProfile.birthDatePlaceholder')}
              placeholderTextColor={colors.muted}
              value={birthDateText}
              onChangeText={onWebBirthDateChange}
              editable={!loading}
              autoComplete="birthdate-full"
              testID="create-profile-birthdate-input"
              accessibilityLabel={
                isAddingChild
                  ? t('onboarding.createProfile.childBirthDateAccessLabel')
                  : t('onboarding.createProfile.birthDateAccessLabel')
              }
              onFocus={onFieldFocus('birthdate')}
            />
            <Text className="text-caption text-text-secondary mt-2">
              {isAddingChild
                ? t('createProfile.childWebDateFormatHint')
                : t('createProfile.webDateFormatHint')}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowDatePicker(true)}
            className="bg-surface rounded-input px-4 py-3 mb-2"
            disabled={loading}
            accessibilityLabel={
              isAddingChild
                ? t('onboarding.createProfile.selectChildBirthDateLabel')
                : t('onboarding.createProfile.selectBirthDateLabel')
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
                ? formatDateForDisplay(birthDate, i18n?.language)
                : isAddingChild
                  ? t('createProfile.selectChildDob')
                  : t('createProfile.selectDob')}
            </Text>
          </Pressable>
        )}

        {Platform.OS === 'ios' && showDatePicker && (
          <Modal
            transparent
            animationType="slide"
            testID="date-picker-modal"
            accessibilityViewIsModal
          >
            <View className="flex-1 justify-end bg-black/30">
              <View className="bg-surface rounded-t-2xl pb-8">
                <View className="flex-row justify-end px-4 pt-3 pb-1">
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    className="min-h-[44px] min-w-[44px] items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel={t('createProfile.a11yCloseDatePicker')}
                    testID="date-picker-done"
                  >
                    <Text className="text-primary text-body font-semibold">
                      {t('common.done')}
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
          label={
            isAddingChild
              ? t('onboarding.createProfile.addChildButton')
              : t('common.continue')
          }
          onPress={onSubmit}
          disabled={!canSubmit}
          loading={loading}
          testID="create-profile-submit"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
