import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAssessmentEligibleTopics } from '../../../hooks/use-assessments';
import { Button } from '../../../components/common/Button';
import { ErrorFallback } from '../../../components/common/ErrorFallback';
import { useThemeColors } from '../../../lib/theme';

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

function formatStudiedAt(isoDate: string, t: TranslationFn): string {
  const diffDays = Math.floor(
    (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays <= 0) return t('assessment.studiedToday');
  if (diffDays === 1) return t('assessment.studiedYesterday');
  return t('assessment.studiedDaysAgo', { count: diffDays });
}

export default function AssessmentPickerScreen(): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    data: topics = [],
    isLoading,
    isError,
    refetch,
  } = useAssessmentEligibleTopics();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="assessment-picker-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack', 'Go back')}
          testID="assessment-picker-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {t('assessment.pickerTitle')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('assessment.pickerSubtitle')}
          </Text>
        </View>
      </View>

      {isError ? (
        <ErrorFallback
          variant="card"
          message={t('assessment.pickerLoadError')}
          primaryAction={{
            label: t('common.tryAgain', 'Try again'),
            testID: 'assessment-picker-retry',
            onPress: () => {
              void refetch();
            },
          }}
          secondaryAction={{
            label: t('common.goBack', 'Go back'),
            testID: 'assessment-picker-error-back',
            onPress: () => router.back(),
          }}
        />
      ) : isLoading ? (
        <Text className="text-body text-text-secondary">
          {t('assessment.pickerLoading')}
        </Text>
      ) : topics.length === 0 ? (
        <View
          testID="assessment-picker-empty"
          className="bg-surface-elevated rounded-card px-4 py-5"
        >
          <Text className="text-body font-semibold text-text-primary">
            {t('assessment.pickerEmptyTitle')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('assessment.pickerEmptyBody')}
          </Text>
          <View className="mt-4">
            <Button
              variant="primary"
              label={t('assessment.pickerBrowseTopics')}
              testID="assessment-picker-browse"
              onPress={() => router.push('/(app)/library' as never)}
            />
          </View>
        </View>
      ) : (
        <View className="gap-3">
          {topics.map((topic) => (
            <Pressable
              key={topic.topicId}
              testID={`assessment-topic-${topic.topicId}`}
              className="bg-surface-elevated rounded-card px-4 py-4 flex-row items-center active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel={t('assessment.pickerStartForTopic', {
                title: topic.topicTitle,
              })}
              onPress={() =>
                router.push({
                  pathname: '/(app)/practice/assessment',
                  params: {
                    subjectId: topic.subjectId,
                    topicId: topic.topicId,
                  },
                } as never)
              }
            >
              <View className="flex-1">
                <Text className="text-body font-semibold text-text-primary">
                  {topic.topicTitle}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  {topic.subjectName} -{' '}
                  {formatStudiedAt(topic.lastStudiedAt, t)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={22}
                color={colors.primary}
              />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
