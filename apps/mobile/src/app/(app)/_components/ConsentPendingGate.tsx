import React from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useClerk, useUser } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeAgeBracket } from '@eduagent/schemas';
import { useProfile } from '../../../lib/profile';
import { useThemeColors } from '../../../lib/theme';
import { signOutWithCleanup } from '../../../lib/sign-out';
import { platformAlert } from '../../../lib/platform-alert';
import { formatApiError } from '../../../lib/format-api-error';
import { GateContent } from '../../../components/common';
import {
  useConsentStatus,
  useRequestConsent,
  useResendConsent,
} from '../../../hooks/use-consent';
import { getConsentPendingCopy } from '../../../lib/consent-copy';
import { PreviewSubjectBrowser } from './PreviewSubjectBrowser';
import { PreviewSampleCoaching } from './PreviewSampleCoaching';
import {
  canSwitchFromConsentGate,
  buildSwitchProfileConfirmation,
} from '../_lib/consent-gate-helpers';

export function ConsentPendingGate(): React.ReactElement {
  const AUTO_REFRESH_MS = 15_000;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { t } = useTranslation();
  const { profiles, activeProfile, switchProfile } = useProfile();

  const handleSignOut = async () => {
    try {
      await signOutWithCleanup({
        clerkSignOut: signOut,
        queryClient,
        profileIds: profiles.map((p) => p.id),
        clerkUserId: user?.id,
      });
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      platformAlert(
        t('tabs.createProfile.signOutFailedTitle'),
        t('tabs.createProfile.signOutFailedMessage'),
      );
    }
  };
  const { data: consentData } = useConsentStatus();
  // [WI-374] Two distinct mutations: a plain resend (reuses the stored email
  // server-side, no email on the wire) and the request/change-recipient path
  // (carries a real email). They must not share one mutation — that coupling
  // is what let the masked email be resent (WI-261).
  const resendConsentMutation = useResendConsent();
  const resendMutation = useRequestConsent();
  const ageBracket = activeProfile?.birthYear
    ? computeAgeBracket(activeProfile.birthYear)
    : 'adult';
  const copy = getConsentPendingCopy(ageBracket);
  const [checking, setChecking] = React.useState(false);
  const [previewMode, setPreviewMode] = React.useState<
    'subjects' | 'coaching' | null
  >(null);
  const [changingEmail, setChangingEmail] = React.useState(false);
  const [newParentEmail, setNewParentEmail] = React.useState('');
  const [changeEmailError, setChangeEmailError] = React.useState('');
  const [resendFeedback, setResendFeedback] = React.useState<
    'sent' | 'error' | null
  >(null);
  const [resendErrorMsg, setResendErrorMsg] = React.useState('');

  // Consent email was sent when status is PARENTAL_CONSENT_REQUESTED
  // (parentEmail alone is not reliable — use the canonical profile status)
  const emailWasSent =
    activeProfile?.consentStatus === 'PARENTAL_CONSENT_REQUESTED';

  const refreshConsentGate = React.useCallback(async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['profiles'] }),
      queryClient.refetchQueries({ queryKey: ['consent-status'] }),
    ]);
  }, [queryClient]);

  const onCheckAgain = async () => {
    setChecking(true);
    try {
      await refreshConsentGate();
    } finally {
      setChecking(false);
    }
  };

  React.useEffect(() => {
    if (!emailWasSent) return;
    const interval = setInterval(() => {
      void refreshConsentGate();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [emailWasSent, refreshConsentGate]);

  const onResend = () => {
    // [WI-374] A plain resend carries NO email — the server reuses the stored
    // recipient. We deliberately do not forward consentData.parentEmail (which
    // is the MASKED address from the status endpoint); sending it back would
    // corrupt the stored request and reset the resend cap (WI-261).
    if (!activeProfile || !consentData?.consentType) return;
    setResendFeedback(null);
    setResendErrorMsg('');
    resendConsentMutation.mutate(
      {
        childProfileId: activeProfile.id,
        consentType: consentData.consentType,
      },
      {
        onSuccess: () => {
          setResendFeedback('sent');
        },
        onError: (err) => {
          setResendFeedback('error');
          setResendErrorMsg(formatApiError(err));
        },
      },
    );
  };

  const parentEmail = consentData?.parentEmail;

  // ── Change-email validation ──────────────────────────────────────────
  const isValidNewEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newParentEmail);
  const childEmail = user?.primaryEmailAddress?.emailAddress;
  const isSameAsChild =
    isValidNewEmail &&
    !!childEmail &&
    newParentEmail.trim().toLowerCase() === childEmail.toLowerCase();
  const canSubmitNewEmail =
    isValidNewEmail &&
    !isSameAsChild &&
    !resendMutation.isPending &&
    !!consentData?.consentType;

  const onSubmitNewEmail = () => {
    if (!activeProfile || !canSubmitNewEmail) return;
    const consentType = consentData?.consentType;
    if (!consentType) return;
    setChangeEmailError('');
    resendMutation.mutate(
      {
        childProfileId: activeProfile.id,
        parentEmail: newParentEmail.trim(),
        consentType,
      },
      {
        onSuccess: () => {
          const sentTo = newParentEmail.trim();
          setChangingEmail(false);
          setNewParentEmail('');
          setResendFeedback('sent');
          void queryClient.invalidateQueries({
            queryKey: ['consent-status'],
          });
          platformAlert(
            t('tabs.consentPending.linkSentTitle'),
            t('tabs.consentPending.linkSentMessage', { email: sentTo }),
          );
        },
        onError: (err) => {
          setChangeEmailError(formatApiError(err));
        },
      },
    );
  };

  // Preview screens replace the gate when active
  if (previewMode === 'subjects') {
    return <PreviewSubjectBrowser onDismiss={() => setPreviewMode(null)} />;
  }
  if (previewMode === 'coaching') {
    return <PreviewSampleCoaching onDismiss={() => setPreviewMode(null)} />;
  }

  // ── No email sent yet (PENDING) — show "send to parent" flow ──────
  if (!emailWasSent) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
        testID="consent-pending-gate"
      >
        <GateContent>
          <Text className="text-h1 font-bold text-text-primary mb-4 text-center">
            {copy.noEmailSentTitle}
          </Text>
          <Text className="text-body text-text-secondary mb-2 text-center">
            {copy.noEmailSentDescription}
          </Text>
          <Text className="text-body text-text-secondary mb-8 text-center">
            {copy.noEmailSentSubtext}
          </Text>

          <Pressable
            onPress={() => {
              if (!activeProfile) return;
              router.push({
                pathname: '/consent',
                params: { profileId: activeProfile.id },
              });
            }}
            className="bg-primary rounded-button py-3.5 px-8 items-center mb-3 w-full"
            testID="consent-send-to-parent"
            accessibilityRole="button"
            accessibilityLabel={copy.sendToParentButton}
          >
            <Text className="text-body font-semibold text-text-inverse">
              {copy.sendToParentButton}
            </Text>
          </Pressable>

          {canSwitchFromConsentGate(activeProfile, profiles) && (
            <Pressable
              onPress={() => {
                // [BUG-776] Confirm destination by name before switching.
                const prompt = buildSwitchProfileConfirmation({
                  activeProfile,
                  profiles,
                  t,
                });
                if (!prompt) return;
                platformAlert(prompt.title, prompt.message, [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('tabs.switchProfile.switchButton'),
                    onPress: () => {
                      void switchProfile(prompt.target.id).catch(() => {
                        platformAlert(
                          'Could not switch profile',
                          'Please try again.',
                        );
                      });
                    },
                  },
                ]);
              }}
              className="py-3.5 px-8 items-center mb-3 w-full"
              testID="consent-switch-profile"
              accessibilityRole="button"
              accessibilityLabel={t('tabs.consentGate.switchProfile')}
            >
              <Text className="text-body font-semibold text-text-secondary">
                {t('tabs.consentGate.switchProfile')}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => void handleSignOut()}
            className="py-3.5 px-8 items-center w-full"
            testID="consent-sign-out"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.consentGate.signOut')}
          >
            <Text className="text-body font-semibold text-primary">
              {t('tabs.consentGate.signOut')}
            </Text>
          </Pressable>
        </GateContent>
      </ScrollView>
    );
  }

  // ── Email was sent (PARENTAL_CONSENT_REQUESTED) — waiting UI ──────
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
      testID="consent-pending-gate"
    >
      <GateContent>
        <Text className="text-h1 font-bold text-text-primary mb-4 text-center">
          {copy.title}
        </Text>
        <Text className="text-body text-text-secondary mb-2 text-center">
          {parentEmail
            ? copy.descriptionWithEmail(parentEmail)
            : copy.descriptionWithoutEmail}
        </Text>
        <Text className="text-body text-text-secondary mb-8 text-center">
          {copy.subtext}
        </Text>

        <Pressable
          onPress={onCheckAgain}
          disabled={checking}
          className="bg-primary rounded-button py-3.5 px-8 items-center mb-3 w-full"
          testID="consent-check-again"
          accessibilityRole="button"
          accessibilityLabel={t('tabs.consentPending.checkAgain')}
        >
          {checking ? (
            <ActivityIndicator
              color={colors.textInverse}
              accessibilityLabel={t('common.loading')}
            />
          ) : (
            <Text className="text-body font-semibold text-text-inverse">
              {t('tabs.consentPending.checkAgain')}
            </Text>
          )}
        </Pressable>

        <Text className="text-body-sm text-text-muted text-center mb-3">
          {t('tabs.consentPending.autoChecking')}
        </Text>

        {parentEmail && consentData?.consentType && !changingEmail && (
          <Pressable
            onPress={onResend}
            disabled={resendConsentMutation.isPending}
            className="bg-surface rounded-button py-3.5 px-8 items-center mb-3 w-full"
            testID="consent-resend"
            accessibilityRole="button"
            accessibilityLabel={t(
              'tabs.consentPending.resendApprovalEmailLabel',
            )}
          >
            {resendConsentMutation.isPending ? (
              <ActivityIndicator
                color={colors.accent}
                accessibilityLabel={t('common.loading')}
              />
            ) : (
              <Text className="text-body font-semibold text-primary">
                {t('tabs.consentPending.resendEmail')}
              </Text>
            )}
          </Pressable>
        )}

        {resendFeedback === 'sent' && !changingEmail && (
          <Text
            className="text-body-sm text-primary text-center mb-3"
            testID="consent-resend-success"
            accessibilityRole="alert"
          >
            {t('tabs.consentPending.emailSentFeedback')}
          </Text>
        )}
        {resendFeedback === 'error' && !changingEmail && (
          <View
            className="bg-danger/10 rounded-card px-4 py-3 mb-3 w-full"
            accessibilityRole="alert"
          >
            <Text
              className="text-danger text-body-sm"
              testID="consent-resend-error"
            >
              {resendErrorMsg || t('errors.generic')}
            </Text>
          </View>
        )}

        {consentData?.consentType && !changingEmail && (
          <Pressable
            onPress={() => {
              setChangingEmail(true);
              setResendFeedback(null);
              setChangeEmailError('');
            }}
            className="py-3.5 px-8 items-center mb-3 w-full"
            testID="consent-change-email"
            accessibilityRole="button"
            accessibilityLabel={copy.changeEmailButton}
          >
            <Text className="text-body font-semibold text-primary">
              {copy.changeEmailButton}
            </Text>
          </Pressable>
        )}

        {changingEmail && (
          <View className="bg-surface rounded-card px-4 py-4 mb-3 w-full">
            <Text className="text-body-sm font-semibold text-text-secondary mb-1">
              {copy.changeEmailLabel}
            </Text>
            <TextInput
              className="bg-background text-text-primary text-body rounded-input px-4 py-3 mb-2"
              placeholder={t('tabs.consentPending.parentEmailPlaceholder')}
              placeholderTextColor={colors.muted}
              value={newParentEmail}
              onChangeText={setNewParentEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoFocus
              editable={!resendMutation.isPending}
              testID="consent-new-email-input"
            />
            {isSameAsChild && (
              <Text
                className="text-danger text-body-sm mb-1"
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                testID="consent-change-same-email-warning"
              >
                {copy.sameEmailWarning}
              </Text>
            )}
            {changeEmailError !== '' && (
              <View
                className="bg-danger/10 rounded-card px-4 py-3 mb-2"
                accessibilityRole="alert"
              >
                <Text
                  className="text-danger text-body-sm"
                  testID="consent-change-email-error"
                >
                  {changeEmailError}
                </Text>
              </View>
            )}
            <Pressable
              onPress={onSubmitNewEmail}
              disabled={!canSubmitNewEmail}
              className={`rounded-button py-3.5 items-center mb-2 ${
                canSubmitNewEmail ? 'bg-primary' : 'bg-primary/40'
              }`}
              testID="consent-change-email-submit"
              accessibilityRole="button"
              accessibilityLabel={copy.changeEmailSubmit}
            >
              {resendMutation.isPending ? (
                <ActivityIndicator
                  color={colors.textInverse}
                  accessibilityLabel={t('common.loading')}
                />
              ) : (
                <Text className="text-body font-semibold text-text-inverse">
                  {copy.changeEmailSubmit}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setChangingEmail(false);
                setNewParentEmail('');
              }}
              className="py-2 items-center"
              testID="consent-change-email-cancel"
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text className="text-body-sm text-text-secondary">
                {t('common.cancel')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Preview section */}
        <View className="w-full mt-6 mb-4">
          <View className="flex-row items-center mb-3">
            <View className="flex-1 h-px bg-border" />
            <Text className="text-caption text-text-muted mx-3">
              {t('tabs.consentPending.whileYouWait')}
            </Text>
            <View className="flex-1 h-px bg-border" />
          </View>
          <Text className="text-body-sm text-text-secondary text-center mb-3">
            {t('tabs.consentPending.previewIntro')}
          </Text>
          <Pressable
            onPress={() => setPreviewMode('subjects')}
            className="bg-surface rounded-card px-4 py-3.5 mb-2 flex-row items-center"
            testID="preview-browse-subjects"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.consentPending.browseSubjectsLabel')}
          >
            <Text className="text-body me-3">{'\u{1F4DA}'}</Text>
            <View className="flex-1">
              <Text className="text-body font-semibold text-text-primary">
                {t('tabs.consentPending.browseSubjects')}
              </Text>
              <Text className="text-caption text-text-secondary">
                {t('tabs.consentPending.browseSubjectsHint')}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => setPreviewMode('coaching')}
            className="bg-surface rounded-card px-4 py-3.5 flex-row items-center"
            testID="preview-sample-coaching"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.consentPending.sampleMentoringLabel')}
          >
            <Text className="text-body me-3">{'\u{1F3AF}'}</Text>
            <View className="flex-1">
              <Text className="text-body font-semibold text-text-primary">
                {t('tabs.consentPending.sampleMentoring')}
              </Text>
              <Text className="text-caption text-text-secondary">
                {t('tabs.consentPending.sampleMentoringHint')}
              </Text>
            </View>
          </Pressable>
        </View>

        {canSwitchFromConsentGate(activeProfile, profiles) && (
          <Pressable
            onPress={() => {
              // [BUG-776] Confirm destination by name before switching.
              const prompt = buildSwitchProfileConfirmation({
                activeProfile,
                profiles,
                t,
              });
              if (!prompt) return;
              platformAlert(prompt.title, prompt.message, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('tabs.switchProfile.switchButton'),
                  onPress: () => {
                    void switchProfile(prompt.target.id).catch(() => {
                      platformAlert(
                        t('tabs.switchProfile.errorTitle'),
                        t('tabs.switchProfile.errorMessage'),
                      );
                    });
                  },
                },
              ]);
            }}
            className="py-3.5 px-8 items-center mb-3 w-full"
            testID="consent-switch-profile"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.consentGate.switchProfile')}
          >
            <Text className="text-body font-semibold text-text-secondary">
              {t('tabs.consentGate.switchProfile')}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => void handleSignOut()}
          className="py-3.5 px-8 items-center w-full"
          testID="consent-sign-out"
          accessibilityRole="button"
          accessibilityLabel={t('tabs.consentGate.signOut')}
        >
          <Text className="text-body font-semibold text-primary">
            {t('tabs.consentGate.signOut')}
          </Text>
        </Pressable>
      </GateContent>
    </ScrollView>
  );
}
