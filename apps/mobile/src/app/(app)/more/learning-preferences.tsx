import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useLearnerProfile } from '../../../hooks/use-learner-profile';
import { ACCOMMODATION_OPTIONS } from '../../../lib/accommodation-options';
import { goBackOrReplace } from '../../../lib/navigation';
import {
  SectionHeader,
  SettingsRow,
} from '../../../components/more/settings-rows';

export default function LearningPreferencesScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: learnerProfile } = useLearnerProfile();

  const activeOption = ACCOMMODATION_OPTIONS.find(
    (o) => o.mode === (learnerProfile?.accommodationMode ?? 'none'),
  );

  const handleBack = useCallback(() => {
    goBackOrReplace(router, '/(app)/more' as const);
  }, [router]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={handleBack}
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="learning-preferences-back"
        >
          <Ionicons name="arrow-back" size={24} className="text-primary" />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          {t('more.learningPreferences.screenTitle')}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        testID="learning-preferences-scroll"
      >
        <SectionHeader testID="learning-accommodation-section-header">
          {t('more.accommodation.sectionHeader')}
        </SectionHeader>
        <SettingsRow
          label={activeOption?.title ?? t('more.accommodation.viewAndManage')}
          description={activeOption?.description}
          onPress={() => router.push('/(app)/more/accommodation')}
          testID="accommodation-link"
        />
      </ScrollView>
    </View>
  );
}
