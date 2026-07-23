import { useEffect } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import {
  useFamilyPoolBreakdownSharing,
  useUpdateFamilyPoolBreakdownSharing,
} from '../../../hooks/use-settings';
import { platformAlert } from '../../../lib/platform-alert';
import { useProfile } from '../../../lib/profile';
import {
  SectionHeader,
  SettingsRow,
} from '../../../components/more/settings-rows';

export default function FamilySettingsScreen(): React.ReactElement | null {
  const router = useRouter();
  const navigationContract = useNavigationContract();
  const isUnauthorized =
    navigationContract.isParentProxy ||
    !navigationContract.gates.sessionIsOwner;

  useEffect(() => {
    if (isUnauthorized) router.replace('/(app)/home');
  }, [isUnauthorized, router]);

  if (isUnauthorized) return null;

  return <FamilySettingsContent />;
}

function FamilySettingsContent(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { profiles, activeProfile } = useProfile();
  const { gates } = useNavigationContract();
  const { data: familyPoolBreakdownSharing, isLoading } =
    useFamilyPoolBreakdownSharing();
  const updateFamilyPoolBreakdownSharing =
    useUpdateFamilyPoolBreakdownSharing();

  const linkedChildren = gates.showRemoveFamilyMember
    ? profiles.filter((profile) => profile.id !== activeProfile?.id)
    : [];

  return (
    <ScrollView
      className="flex-1 px-5"
      contentContainerStyle={{ paddingBottom: 32 }}
      testID="family-settings-screen"
    >
      <View className="pt-4">
        <Text
          className="text-h2 font-bold text-text-primary"
          accessibilityRole="header"
        >
          {t('accountAdmin.familySettings')}
        </Text>
      </View>

      <SectionHeader>{t('more.family.sectionHeader')}</SectionHeader>
      {gates.showRemoveFamilyMember ? (
        <SettingsRow
          label={t('profiles.title')}
          onPress={() => router.push('/(app)/account/profiles' as Href)}
          testID="family-settings-members"
        />
      ) : null}
      {gates.showAddChild ? (
        <SettingsRow
          label={t('more.family.addChild')}
          description={t('more.family.addChildDescription')}
          onPress={() =>
            router.push({
              pathname: '/create-profile',
              params: { for: 'child' },
            } as Href)
          }
          testID="family-settings-add-child"
        />
      ) : null}
      {gates.showBilling ? (
        <SettingsRow
          label={t('more.account.subscription')}
          onPress={() => router.push('/(app)/subscription' as Href)}
          testID="family-settings-subscription"
        />
      ) : null}
      {linkedChildren.length > 0 ? (
        <View className="mt-2 flex-row items-center justify-between rounded-card bg-surface px-4 py-3">
          <View className="flex-1 pr-3">
            <Text className="text-body text-text-primary">
              {t('more.family.breakdownSharingTitle')}
            </Text>
            <Text className="mt-1 text-body-sm text-text-secondary">
              {t('more.family.breakdownSharingDescription')}
            </Text>
          </View>
          <Switch
            value={familyPoolBreakdownSharing ?? false}
            onValueChange={(value) => {
              updateFamilyPoolBreakdownSharing.mutate(value, {
                onError: () => {
                  platformAlert(
                    t('more.errors.couldNotSaveSetting'),
                    t('more.family.breakdownSharingError'),
                  );
                },
              });
            }}
            disabled={isLoading || updateFamilyPoolBreakdownSharing.isPending}
            accessibilityLabel={t('more.family.breakdownSharingTitle')}
            testID="family-settings-breakdown-sharing"
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
