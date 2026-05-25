import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useProfile } from '../../../lib/profile';
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
  const { profiles } = useProfile();

  const { childProfileId } = useLocalSearchParams<{
    childProfileId?: string;
  }>();
  const isChildMode = !!childProfileId;

  const childProfile = isChildMode
    ? profiles.find((p) => p.id === childProfileId)
    : undefined;
  const childName = childProfile?.displayName;

  const { data: learnerProfile } = useLearnerProfile();

  const activeOption = ACCOMMODATION_OPTIONS.find(
    (o) => o.mode === (learnerProfile?.accommodationMode ?? 'none'),
  );

  const fallbackHref =
    isChildMode && childProfileId
      ? (`/(app)/child/${childProfileId}?mode=settings` as Href)
      : ('/(app)/more' as Href);

  const handleBack = useCallback(() => {
    goBackOrReplace(router, fallbackHref);
  }, [fallbackHref, router]);

  const screenTitle = isChildMode
    ? t('more.accommodation.childScreenTitle', { name: childName })
    : t('more.learningPreferences.screenTitle');

  const sectionTitle = isChildMode
    ? t('parentView.index.learningAccommodationTitle', { name: childName })
    : t('more.accommodation.sectionHeader');

  const accommodationHref =
    isChildMode && childProfileId
      ? (`/(app)/more/accommodation?childProfileId=${childProfileId}` as Href)
      : ('/(app)/more/accommodation' as Href);

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
          {screenTitle}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        testID="learning-preferences-scroll"
      >
        <SectionHeader testID="learning-accommodation-section-header">
          {sectionTitle}
        </SectionHeader>
        <SettingsRow
          label={activeOption?.title ?? t('more.accommodation.viewAndManage')}
          description={activeOption?.description}
          onPress={() => router.push(accommodationHref)}
          testID="accommodation-link"
        />
      </ScrollView>
    </View>
  );
}
