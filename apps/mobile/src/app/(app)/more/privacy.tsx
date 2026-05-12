import { useCallback } from 'react';
import { Platform, Share, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  LearningModeOption,
  SectionHeader,
  SettingsRow,
} from '../../../components/more/settings-rows';
import { useExportData } from '../../../hooks/use-account';
import { useActiveProfileRole } from '../../../hooks/use-active-profile-role';
import { useLinkedChildren } from '../../../lib/profile';
import {
  useUpdateWithdrawalArchivePreference,
  useWithdrawalArchivePreference,
} from '../../../hooks/use-settings';
import { formatApiError } from '../../../lib/format-api-error';
import { platformAlert } from '../../../lib/platform-alert';
import { useLinkedChildren } from '../../../lib/profile';

export default function PrivacyScreen(): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const role = useActiveProfileRole();
  const linkedChildren = useLinkedChildren();
  const exportData = useExportData();
  const { data: withdrawalArchivePreference, isLoading: archivePrefLoading } =
    useWithdrawalArchivePreference();
  const updateWithdrawalArchivePreference =
    useUpdateWithdrawalArchivePreference();
  const showFamilyConsentControls =
    role === 'owner' && linkedChildren.length > 0;

  const withdrawalArchiveOptions = [
    {
      value: 'auto',
      title: t('more.privacy.withdrawalArchiveAuto'),
      description: t('more.privacy.withdrawalArchiveAutoDescription'),
    },
    {
      value: 'always',
      title: t('more.privacy.withdrawalArchiveAlways'),
      description: t('more.privacy.withdrawalArchiveAlwaysDescription'),
    },
    {
      value: 'never',
      title: t('more.privacy.withdrawalArchiveNever'),
      description: t('more.privacy.withdrawalArchiveNeverDescription'),
    },
  ] as const;

  const handleExport = useCallback(async () => {
    try {
      const data = await exportData.mutateAsync();
      const jsonString = JSON.stringify(data, null, 2);

      if (Platform.OS === 'web') {
        type WebDoc = {
          createElement(tag: string): {
            href: string;
            download: string;
            click(): void;
          };
        };
        const doc = (globalThis as { document?: WebDoc }).document;
        if (!doc) return;
        const blob = new Blob([jsonString], {
          type: 'application/json',
          lastModified: Date.now(),
        });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = 'mentomate-data-export.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const result = await Share.share({
          title: t('more.export.shareTitle'),
          message: jsonString,
        });
        if (result.action === Share.dismissedAction) {
          return;
        }
      }
    } catch (err: unknown) {
      platformAlert(t('more.export.errorTitle'), formatApiError(err));
    }
  }, [exportData, t]);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="more-privacy-scroll"
      >
        <SectionHeader>{t('more.privacy.privacyAndData')}</SectionHeader>
        {role === 'owner' && linkedChildren.length > 0 ? (
          <>
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('more.privacy.withdrawalArchiveTitle')}
            </Text>
            {withdrawalArchiveOptions.map((opt) => (
              <LearningModeOption
                key={opt.value}
                title={opt.title}
                description={opt.description}
                selected={withdrawalArchivePreference === opt.value}
                disabled={
                  archivePrefLoading ||
                  updateWithdrawalArchivePreference.isPending
                }
                onPress={() => {
                  if (withdrawalArchivePreference === opt.value) return;
                  updateWithdrawalArchivePreference.mutate(opt.value, {
                    onError: () => {
                      platformAlert(
                        t('more.errors.couldNotSaveSetting'),
                        t('more.privacy.withdrawalArchiveError'),
                      );
                    },
                  });
                }}
                testID={`more-withdrawal-archive-${opt.value}`}
              />
            ))}
          </>
        ) : null}
        <SettingsRow
          label={t('more.other.privacyPolicy')}
          onPress={() => router.push('/privacy')}
        />
        <SettingsRow
          label={t('more.other.termsOfService')}
          onPress={() => router.push('/terms')}
        />
        {role === 'owner' ? (
          <SettingsRow
            label={t('more.other.exportMyData')}
            onPress={exportData.isPending ? undefined : handleExport}
            value={
              exportData.isPending
                ? t('more.export.preparingExport')
                : undefined
            }
            testID="more-row-export"
          />
        ) : null}
        {role === 'owner' ? (
          <SettingsRow
            label={t('more.other.deleteAccount')}
            onPress={() => router.push('/delete-account')}
            testID="more-row-delete-account"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
