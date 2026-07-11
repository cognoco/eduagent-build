import React from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  computeAgeBracketFromDate,
  conversationLanguageSchema,
  type Profile,
} from '@eduagent/schemas';
import { useApiClient } from '../../../../lib/api-client';
import { assertOk } from '../../../../lib/assert-ok';
import { formatApiError } from '../../../../lib/format-api-error';
import { errorHasCode } from '../../../../components/session/session-types';
import { platformAlert } from '../../../../lib/platform-alert';
import {
  setPreviewState,
  clearPreviewState,
  type PreviewOnboardingStateV0,
  type SaveTarget,
} from '../../../../lib/preview-onboarding-state';
import { FEATURE_FLAGS } from '../../../../lib/feature-flags';
import { useThemeColors } from '../../../../lib/theme';

export function ProfileBasicsStep({
  target,
  previewState,
  onComplete,
  onExitWizard,
}: {
  target: SaveTarget;
  previewState: PreviewOnboardingStateV0;
  onComplete: (created: { parent: Profile; child?: Profile }) => void;
  // [WI-824] Layout-level wizard-done signal (= SaveWizardGate's onComplete /
  // markWizardDone). The upgrade CTA must call this so the inline gate unmounts
  // and the pushed /subscription route becomes visible (Gate-2 follow-up).
  onExitWizard: () => void;
}): React.ReactElement {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  // i18n Phase 1 — Signup-time fix. The owner POST is a self-create, so
  // forward the device UI language for the first LLM call. The child POST
  // OMITS the field (MED-2): the parent's UI locale does not reliably
  // predict the child's language; DB default 'en' applies until the child
  // first signs in on their own device.
  const ownerConversationLanguage = (() => {
    const parsed = conversationLanguageSchema.safeParse(i18n.language);
    return parsed.success ? parsed.data : undefined;
  })();

  const [parentName, setParentName] = React.useState('');
  const [parentBirthYear, setParentBirthYear] = React.useState('');
  const [childName, setChildName] = React.useState('');
  const [childBirthYear, setChildBirthYear] = React.useState('');
  const [createdParent, setCreatedParent] = React.useState<Profile | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [childError, setChildError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const needsChild = target === 'child' || target === 'both';
  const needsOwner = true; // all targets require an owner profile

  const isValidYear = (s: string) =>
    /^\d{4}$/.test(s) &&
    Number(s) > 1900 &&
    Number(s) <= new Date().getFullYear();

  // [HIGH-A3 / HIGH-B2] Client-side adult-age gate. Server has NO 18+ rule
  // (apps/api/src/services/profile.ts:184-191 only enforces 11+), so without
  // this gate a minor could complete the wizard as isOwner=true with a child
  // linked underneath. Skipped entirely when target === 'self' — server's 11+
  // floor covers that case.
  //
  // [OPT-C] Gated by FEATURE_FLAGS.ADULT_OWNER_GATE_ENABLED. When OFF,
  // adultGateRequired is false and adultGatePasses is trivially true, so
  // canSubmit falls back to today's behaviour (field validations only).
  const parentIsAdult =
    isValidYear(parentBirthYear) &&
    computeAgeBracketFromDate(Number(parentBirthYear)) === 'adult';
  const adultGateRequired =
    FEATURE_FLAGS.ADULT_OWNER_GATE_ENABLED && needsChild;
  const adultGatePasses = !adultGateRequired || parentIsAdult;

  const canSubmit =
    !loading &&
    parentName.trim().length > 0 &&
    isValidYear(parentBirthYear) &&
    (needsChild
      ? childName.trim().length > 0 && isValidYear(childBirthYear)
      : true) &&
    adultGatePasses;

  const submit = React.useCallback(async () => {
    setError(null);
    setChildError(null);
    setLoading(true);
    try {
      let parent = createdParent;

      // [HIGH-4] Resume guard: if the preview state already records a created
      // owner profile id and that profile is in the cache, skip the owner POST
      // to prevent double-creation on wizard remount mid-flight.
      if (!parent && previewState.createdOwnerProfileId) {
        const cached = queryClient.getQueriesData<Profile[]>({
          predicate: (q) => String(q.queryKey[0]) === 'profiles',
        });
        for (const [, list] of cached) {
          const match = list?.find(
            (p) => p.id === previewState.createdOwnerProfileId,
          );
          if (match) {
            parent = match;
            setCreatedParent(match);
            break;
          }
        }
      }

      if (!parent) {
        const res = await client.profiles.$post({
          json: {
            displayName: parentName.trim(),
            birthYear: Number(parentBirthYear),
            ...(ownerConversationLanguage
              ? { conversationLanguage: ownerConversationLanguage }
              : {}),
          },
        });
        await assertOk(res);
        const data = (await res.json()) as { profile: Profile };
        parent = data.profile;
        setCreatedParent(parent);

        // [HIGH-4] Persist owner id BEFORE the second POST so a crash between
        // the two calls can resume without double-creating the owner.
        await setPreviewState({
          ...previewState,
          createdOwnerProfileId: parent.id,
        });

        const cachedParent = parent;
        queryClient.setQueriesData<Profile[]>(
          { predicate: (q) => String(q.queryKey[0]) === 'profiles' },
          (old) => (old ? [...old, cachedParent] : [cachedParent]),
        );
      }

      let child: Profile | undefined;
      if (needsChild) {
        try {
          // [WI-811] Explicit `kind:'child'` discriminator: the post-graph POST
          // routes to createChildProfileV2 instead of the idempotent owner
          // replay (a child-create must never return the owner).
          const res = await client.profiles.$post({
            json: {
              displayName: childName.trim(),
              birthYear: Number(childBirthYear),
              kind: 'child',
            },
          });
          await assertOk(res);
          const data = (await res.json()) as { profile: Profile };
          child = data.profile;

          const cachedChild = child;
          queryClient.setQueriesData<Profile[]>(
            { predicate: (q) => String(q.queryKey[0]) === 'profiles' },
            (old) => (old ? [...old, cachedChild] : [cachedChild]),
          );
        } catch (childErr) {
          // [WI-824] PROFILE_LIMIT_EXCEEDED is an upgrade gate, not a retryable
          // error. Surface the upgrade CTA via alert + "See plans" → /subscription,
          // mirroring the pattern in create-profile.tsx (BUG-947). All other errors
          // keep the existing inline banner + Retry behaviour (AC 9).
          if (errorHasCode(childErr, 'PROFILE_LIMIT_EXCEEDED')) {
            const rawMessage =
              typeof childErr === 'object' &&
              childErr !== null &&
              'message' in childErr &&
              typeof (childErr as { message?: unknown }).message === 'string'
                ? (childErr as { message: string }).message
                : '';
            platformAlert(
              t('createProfile.upgradeRequiredTitle'),
              rawMessage || t('createProfile.upgradeRequiredBody'),
              [
                { text: t('common.notNow'), style: 'cancel' },
                {
                  text: t('createProfile.seePlans'),
                  // [WI-824] EXIT the wizard before navigating. The save-wizard
                  // renders INLINE via SaveWizardGate's early-return in
                  // (app)/_layout.tsx; a bare router.push leaves the gate mounted
                  // and the /subscription route never renders. onExitWizard()
                  // (markWizardDone) unmounts the gate; clearPreviewState mirrors
                  // every other gate-exit (handleCancel / ConfirmStep success).
                  onPress: () => {
                    onExitWizard();
                    void clearPreviewState();
                    router.push('/(app)/subscription' as Href);
                  },
                },
              ],
            );
            setLoading(false);
            return;
          }
          // [AC 9] Keep parent. Surface retryable child error inline.
          setChildError(formatApiError(childErr));
          setLoading(false);
          return;
        }
      }

      await queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]) === 'profiles',
      });

      if (parent) {
        onComplete({ parent, child });
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [
    client,
    queryClient,
    router,
    createdParent,
    needsChild,
    parentName,
    parentBirthYear,
    childName,
    childBirthYear,
    previewState,
    onComplete,
    // i18n Phase 1 — owner POST reads this; without it in deps, a language
    // change between mount and submit would send the stale locale.
    ownerConversationLanguage,
    t,
  ]);

  return (
    <View>
      {needsOwner && (
        <View className="mb-6">
          <Text className="text-h3 font-semibold text-text-primary mb-3">
            {target === 'self'
              ? t('saveWizard.aboutYouSelf')
              : t('saveWizard.aboutYouParent')}
          </Text>
          <TextInput
            placeholder={t('saveWizard.yourNamePlaceholder')}
            value={parentName}
            onChangeText={setParentName}
            className="bg-surface text-text-primary rounded-input px-4 py-3 mb-3"
            testID={
              target === 'self'
                ? 'save-basics-display-name'
                : 'save-basics-parent-name'
            }
            accessibilityLabel={t('saveWizard.yourNameLabel')}
          />
          <TextInput
            placeholder={t('saveWizard.yourBirthYearPlaceholder')}
            value={parentBirthYear}
            onChangeText={setParentBirthYear}
            keyboardType="number-pad"
            maxLength={4}
            className="bg-surface text-text-primary rounded-input px-4 py-3"
            testID={
              target === 'self'
                ? 'save-basics-birth-year'
                : 'save-basics-parent-birth-year'
            }
            accessibilityLabel={t('saveWizard.yourBirthYearLabel')}
          />
        </View>
      )}

      {needsChild && (
        <View className="mb-6">
          <Text className="text-h3 font-semibold text-text-primary mb-3">
            {t('saveWizard.aboutChild')}
          </Text>
          <TextInput
            placeholder={t('saveWizard.childNamePlaceholder')}
            value={childName}
            onChangeText={setChildName}
            className="bg-surface text-text-primary rounded-input px-4 py-3 mb-3"
            testID="save-basics-child-name"
            accessibilityLabel={t('saveWizard.childNameLabel')}
          />
          <TextInput
            placeholder={t('saveWizard.childBirthYearPlaceholder')}
            value={childBirthYear}
            onChangeText={setChildBirthYear}
            keyboardType="number-pad"
            maxLength={4}
            className="bg-surface text-text-primary rounded-input px-4 py-3"
            testID="save-basics-child-birth-year"
            accessibilityLabel={t('saveWizard.childBirthYearLabel')}
          />
        </View>
      )}

      {/* [HIGH-A3] Adult-age gate inline message. Visible only when the parent
          has entered a valid 4-digit year that resolves to under-18, while the
          flow needs a child profile. Empty / partial input shows nothing.
          Copy matches plan spec exactly. */}
      {adultGateRequired && isValidYear(parentBirthYear) && !parentIsAdult && (
        <View
          className="bg-warning/10 rounded-card px-4 py-3 mb-3"
          testID="save-basics-adult-required"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text className="text-warning text-body-sm">
            {t('saveWizard.ageGate')}
          </Text>
        </View>
      )}
      {error && (
        <View
          className="bg-danger/10 rounded-card px-4 py-3 mb-3"
          testID="save-basics-error"
        >
          <Text className="text-danger text-body-sm">{error}</Text>
        </View>
      )}
      {childError && (
        <View
          className="bg-danger/10 rounded-card px-4 py-3 mb-3"
          testID="save-basics-child-error"
        >
          <Text className="text-danger text-body-sm mb-2">
            {t('saveWizard.childSaveError', { error: childError })}
          </Text>
          <Pressable
            onPress={() => void submit()}
            testID="save-basics-retry-child"
            accessibilityRole="button"
          >
            <Text className="text-primary font-semibold">
              {t('common.retry')}
            </Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={() => void submit()}
        disabled={!canSubmit}
        className={`rounded-button py-3.5 items-center ${canSubmit ? 'bg-primary' : 'bg-primary/40'}`}
        testID="save-basics-continue"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
      >
        {loading ? (
          <ActivityIndicator
            color={colors.textInverse}
            accessibilityLabel={t('common.loading')}
          />
        ) : (
          <Text className="text-body font-semibold text-text-inverse">
            {t('common.continue')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
