import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, type Href, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useNavigationContract } from '../../hooks/use-navigation-contract';
import { platformAlert } from '../../lib/platform-alert';
import { useProfile } from '../../lib/profile';
import { useScopeContext } from '../../lib/scope-context';
import {
  ClerkSignOutTimeoutError,
  signOutWithCleanup,
} from '../../lib/sign-out';
import { SectionHeader, SettingsRow } from '../more/settings-rows';

export function AccountAdminSheet(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut, userId } = useAuth();
  const { activeProfile, profiles } = useProfile();
  const {
    activeScope,
    availableScopes,
    isLoading: isScopeLoading,
  } = useScopeContext();
  const navigationContract = useNavigationContract();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName = activeProfile?.displayName ?? t('more.account.profile');
  const activePersonScope =
    activeScope.kind === 'person' ? activeScope : undefined;
  const selectedPersonScope = activePersonScope
    ? availableScopes.find(
        (scope) =>
          scope.kind === 'person' &&
          scope.personId === activePersonScope.personId &&
          scope.edgeId === activePersonScope.edgeId,
      )
    : undefined;
  const authorizedLearnerScope =
    selectedPersonScope?.kind === 'person' ? selectedPersonScope : undefined;
  const canEnterSelectedLearnerRoute = authorizedLearnerScope
    ? navigationContract.canEnter('child/[profileId]', {
        profileId: authorizedLearnerScope.personId,
      })
    : false;
  const editableLearnerProfile =
    authorizedLearnerScope && canEnterSelectedLearnerRoute
      ? profiles.find(
          (profile) => profile.id === authorizedLearnerScope.personId,
        )
      : undefined;
  const canEditSelectedLearner =
    editableLearnerProfile !== undefined &&
    navigationContract.gates.showAccommodationChildEditor &&
    navigationContract.gates.showMentorLanguageChildEditor;
  const learnerTargetName = editableLearnerProfile?.displayName ?? displayName;
  const showLearnerSettings =
    !isScopeLoading &&
    (activeScope.kind !== 'person' || canEditSelectedLearner);
  const learnerProfileId = editableLearnerProfile?.id;

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOutWithCleanup({
        clerkSignOut: signOut,
        queryClient,
        profileIds: profiles.map((profile) => profile.id),
        clerkUserId: userId ?? undefined,
      });
    } catch (err) {
      if (err instanceof ClerkSignOutTimeoutError) {
        router.replace('/sign-in');
        return;
      }
      platformAlert(
        t('more.account.couldNotSignOut'),
        t('more.errors.tryAgainMoment'),
      );
      setIsSigningOut(false);
    }
  }, [isSigningOut, profiles, queryClient, router, signOut, t, userId]);

  // Proxy sessions redirect below. For non-proxy non-owners, sessionIsOwner
  // gates every owner-only row; the per-feature sub-gates narrow that set further.
  if (navigationContract.isParentProxy) {
    return <Redirect href="/(app)/home" />;
  }

  return (
    <ScrollView
      className="flex-1 px-5"
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      testID="account-admin-sheet"
    >
      <View className="pt-4">
        <Text className="text-h2 font-bold text-text-primary">
          {t('accountAdmin.title')}
        </Text>
        <Text className="mt-1 text-body text-text-secondary">
          {displayName}
        </Text>
      </View>

      {showLearnerSettings ? (
        <>
          <SectionHeader>
            {t('more.learningPreferences.sectionHeader')}
          </SectionHeader>
          <SettingsRow
            label={t('more.learningPreferences.rowLabel')}
            targetName={learnerTargetName}
            onPress={() =>
              router.push(
                learnerProfileId
                  ? (`/(app)/more/accommodation?childProfileId=${learnerProfileId}` as Href)
                  : ('/(app)/more/accommodation' as Href),
              )
            }
            testID="account-admin-learning-preferences"
          />
          <SettingsRow
            label={t('more.mentorMemory.sectionHeader')}
            targetName={learnerTargetName}
            onPress={() =>
              router.push(
                learnerProfileId
                  ? ({
                      pathname: '/(app)/child/[profileId]/mentor-memory',
                      params: { profileId: learnerProfileId },
                    } as Href)
                  : ('/(app)/mentor-memory?returnTo=account' as Href),
              )
            }
            testID="account-admin-mentor-memory"
          />
          <SettingsRow
            label={t('more.account.mentorLanguage')}
            targetName={learnerTargetName}
            onPress={() =>
              router.push(
                learnerProfileId
                  ? (`/(app)/more/mentor-language?childProfileId=${learnerProfileId}` as Href)
                  : ('/(app)/more/mentor-language' as Href),
              )
            }
            testID="account-admin-mentor-language"
          />
        </>
      ) : null}

      <SectionHeader>{t('more.account.sectionHeader')}</SectionHeader>
      <SettingsRow
        label={t('more.account.profile')}
        value={displayName}
        // '/profiles' is a TOP-LEVEL route (app/profiles.tsx), NOT under the
        // (app) group — so '/(app)/profiles' would be a dead route. The cast
        // types the correct top-level path.
        onPress={() => router.push('/profiles' as Href)}
        testID="account-admin-profile"
      />
      {navigationContract.gates.sessionIsOwner &&
      navigationContract.gates.showAccountSecurity ? (
        <SettingsRow
          label={t('accountAdmin.security')}
          targetName={displayName}
          onPress={() => router.push('/(app)/more/account' as Href)}
          testID="account-admin-security"
        />
      ) : null}
      {navigationContract.gates.sessionIsOwner &&
      navigationContract.gates.showBilling ? (
        <SettingsRow
          label={t('more.account.subscription')}
          targetName={displayName}
          onPress={() => router.push('/(app)/subscription' as Href)}
          testID="account-admin-subscription"
        />
      ) : null}
      <SettingsRow
        label={t('more.notifications.sectionHeader')}
        targetName={displayName}
        onPress={() => router.push('/(app)/more/notifications' as Href)}
        testID="account-admin-notifications"
      />

      {navigationContract.gates.sessionIsOwner &&
      (navigationContract.gates.showAddChild ||
        navigationContract.gates.showRemoveFamilyMember) ? (
        <>
          <SectionHeader>{t('more.family.sectionHeader')}</SectionHeader>
          {navigationContract.gates.showAddChild ? (
            <SettingsRow
              label={t('more.family.addChild')}
              description={t('more.family.addChildDescription')}
              onPress={() =>
                router.push({
                  pathname: '/create-profile',
                  params: { for: 'child' },
                } as Href)
              }
              testID="account-admin-add-child"
            />
          ) : null}
          <SettingsRow
            label={t('accountAdmin.familySettings')}
            onPress={() => router.push('/(app)/more' as Href)}
            testID="account-admin-family-settings"
          />
        </>
      ) : null}

      <SectionHeader>{t('more.sections.settings')}</SectionHeader>
      <SettingsRow
        label={t('more.privacy.privacyAndData')}
        targetName={displayName}
        onPress={() => router.push('/(app)/more/privacy' as Href)}
        testID="account-admin-privacy"
      />
      <SettingsRow
        label={t('more.help.helpAndFeedback')}
        targetName={displayName}
        onPress={() => router.push('/(app)/more/help' as Href)}
        testID="account-admin-help"
      />

      <Pressable
        onPress={() => void handleSignOut()}
        disabled={isSigningOut}
        className={`mt-6 min-h-[48px] items-center justify-center rounded-button border border-danger/30 bg-surface px-5 py-3 ${
          isSigningOut ? 'opacity-60' : ''
        }`}
        accessibilityRole="button"
        accessibilityLabel={`${t('more.account.signOut')}. ${displayName}`}
        accessibilityState={{ disabled: isSigningOut }}
        testID="account-admin-sign-out"
      >
        {isSigningOut ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        ) : (
          <Text className="text-body font-semibold text-danger">
            {t('more.account.signOut')}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
