import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrReplace } from '../../../lib/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalogyDomainPicker, ErrorFallback } from '../../../components/common';
import {
  useAnalogyDomain,
  useUpdateAnalogyDomain,
} from '../../../hooks/use-settings';
import { useSubjects } from '../../../hooks/use-subjects';
import type { AnalogyDomain } from '@eduagent/schemas';
import { classifyApiError } from '../../../lib/format-api-error';
import { platformAlert } from '../../../lib/platform-alert';

export default function SubjectSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { subjectId, subjectName } = useLocalSearchParams<{
    subjectId: string;
    subjectName?: string;
  }>();

  const safeSubjectId = subjectId ?? '';
  const { data: analogyDomain, isLoading } = useAnalogyDomain(safeSubjectId);
  const { mutate: updateAnalogyDomain, isPending } =
    useUpdateAnalogyDomain(safeSubjectId);
  // [BUG-939] Hide Analogy Preference for language subjects (pedagogyMode
  // 'four_strands'). The four-strands pedagogy teaches vocabulary directly via
  // phonetic and usage examples, not via analogies — the picker would never
  // influence those sessions, so showing it is misleading.
  const { data: subjects, isLoading: isSubjectsLoading } = useSubjects({
    includeInactive: true,
  });
  const activeSubject = subjects?.find((s) => s.id === safeSubjectId);
  const isLanguageSubject = activeSubject?.pedagogyMode === 'four_strands';

  const handleSelect = (domain: AnalogyDomain | null): void => {
    // UX-DE-L9: surface mutation errors
    updateAnalogyDomain(domain, {
      onError: (err) =>
        platformAlert(
          t('subject.settings.updateErrorTitle'),
          classifyApiError(err).message,
        ),
    });
  };

  if (!subjectId) {
    return (
      <ErrorFallback
        variant="centered"
        title={t('subject.settings.missingTitle')}
        message={t('subject.settings.missingMessage')}
        primaryAction={{
          label: t('common.goHome'),
          onPress: () => goBackOrReplace(router, '/(app)/home'),
          testID: 'subject-missing-param',
        }}
      />
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center">
        <Pressable
          onPress={() =>
            router.replace({
              pathname: '/(app)/shelf/[subjectId]',
              params: { subjectId },
            } as never)
          }
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          testID="subject-settings-back"
          accessibilityLabel={t('common.goBack')}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={26} className="text-primary" />
        </Pressable>
        <Text
          className="text-h2 font-bold text-text-primary flex-1"
          numberOfLines={1}
        >
          {subjectName ?? t('subject.settings.fallbackTitle')}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {isLanguageSubject ? (
          <View
            className="mt-6 items-center"
            testID="subject-settings-language-empty"
          >
            <Text className="text-body-sm text-text-secondary text-center">
              {t('subject.settings.languageEmpty')}
            </Text>
          </View>
        ) : isSubjectsLoading && !activeSubject ? (
          <View className="mt-6" testID="subject-settings-loading" />
        ) : (
          <View className="mt-2 mb-4">
            <Text className="text-h3 font-semibold text-text-primary mb-1">
              {t('subject.settings.analogyTitle')}
            </Text>
            <Text className="text-body-sm text-text-secondary mb-3">
              {t('subject.settings.analogyDescription')}
            </Text>
            <AnalogyDomainPicker
              value={analogyDomain}
              onSelect={handleSelect}
              isLoading={isLoading}
              disabled={isPending}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
