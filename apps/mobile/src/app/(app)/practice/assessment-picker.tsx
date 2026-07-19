import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAssessmentEligibleTopics } from '../../../hooks/use-assessments';
import { useEntryGate } from '../../../hooks/use-entry-gate';
import { Button } from '../../../components/common/Button';
import { ErrorFallback } from '../../../components/common/ErrorFallback';
import { TimeoutLoader } from '../../../components/common/TimeoutLoader';
import { useThemeColors } from '../../../lib/theme';
import { goBackOrReplace, PRACTICE_HREF } from '../../../lib/navigation';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { useRelativeDate } from '../../../hooks/use-time-format';

type AssessmentTopic = ReturnType<
  typeof useAssessmentEligibleTopics
>['data'] extends (infer T)[] | undefined
  ? T
  : never;

const ASSESSMENT_PICKER_CONTENT_STYLE_BASE = { paddingHorizontal: 20 } as const;

export default function AssessmentPickerScreen(): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const relativeDate = useRelativeDate();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const blocked = useEntryGate('practice');
  const {
    data: topics = [],
    isLoading,
    isError,
    refetch,
  } = useAssessmentEligibleTopics();
  const contentContainerStyle = useMemo(
    () => ({
      ...ASSESSMENT_PICKER_CONTENT_STYLE_BASE,
      paddingTop: insets.top + 16,
      paddingBottom: insets.bottom + 24,
    }),
    [insets.bottom, insets.top],
  );

  const renderTopic = useCallback(
    ({ item: topic }: { item: AssessmentTopic }) => (
      <Pressable
        key={topic.topicId}
        testID={`assessment-topic-${topic.topicId}`}
        className="bg-surface-elevated rounded-card px-4 py-4 flex-row items-center active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel={t(
          topic.activeAssessmentId
            ? 'assessment.pickerContinueForTopic'
            : 'assessment.pickerStartForTopic',
          {
            title: topic.topicTitle,
          },
        )}
        onPress={() =>
          router.push({
            pathname: '/(app)/practice/assessment',
            params: {
              subjectId: topic.subjectId,
              topicId: topic.topicId,
              topicTitle: topic.topicTitle,
              topicDescription: topic.topicDescription,
              pedagogyMode: topic.pedagogyMode,
              languageCode: topic.languageCode,
            },
          } as Href)
        }
      >
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-body font-semibold text-text-primary flex-1">
              {topic.topicTitle}
            </Text>
            {topic.activeAssessmentId ? (
              <Text className="text-caption font-semibold text-primary">
                {t('assessment.pickerInProgress')}
              </Text>
            ) : null}
          </View>
          <Text
            className="text-body-sm text-text-secondary mt-1"
            numberOfLines={2}
          >
            {topic.topicDescription}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {topic.subjectName} -{' '}
            {t('assessment.studiedWhen', {
              when: relativeDate(topic.lastStudiedAt),
            })}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.primary} />
      </Pressable>
    ),
    [colors.primary, router, t, relativeDate],
  );

  const keyExtractor = useCallback(
    (topic: AssessmentTopic) => topic.topicId,
    [],
  );

  const header = (
    <View className="flex-row items-center mb-6">
      <Pressable
        onPress={() => goBackOrReplace(router, PRACTICE_HREF)}
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
  );

  if (blocked) {
    return <Redirect href="/(app)/home" />;
  }

  // Non-list states (error, loading, empty) remain in a ScrollView so insets
  // are respected and the header renders at the top.
  const isListState = !isError && !isLoading && topics.length > 0;

  if (!isListState) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={contentContainerStyle}
        testID="assessment-picker-screen"
      >
        {header}
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
              onPress: () => goBackOrReplace(router, PRACTICE_HREF),
            }}
          />
        ) : isLoading ? (
          <TimeoutLoader
            isLoading
            variant="card"
            title={t('assessment.pickerLoadTimeoutTitle')}
            message={t('assessment.pickerLoadTimeoutMessage')}
            loadingLabel={t('assessment.pickerLoading')}
            loadingDescription={t('assessment.pickerLoadingBody')}
            primaryAction={{
              label: t('common.tryAgain', 'Try again'),
              testID: 'assessment-picker-timeout-retry',
              onPress: () => {
                void refetch();
              },
            }}
            secondaryAction={{
              label: t('common.goBack', 'Go back'),
              testID: 'assessment-picker-timeout-back',
              onPress: () => goBackOrReplace(router, PRACTICE_HREF),
            }}
            testID="assessment-picker-loading"
            fallbackTestID="assessment-picker-timeout"
          />
        ) : (
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
                onPress={() =>
                  router.push(
                    (FEATURE_FLAGS.MODE_NAV_V2_ENABLED
                      ? '/(app)/subjects'
                      : '/(app)/library') as Href,
                  )
                }
              />
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      data={topics}
      keyExtractor={keyExtractor}
      renderItem={renderTopic}
      contentContainerStyle={contentContainerStyle}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListHeaderComponent={header}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews
      testID="assessment-picker-screen"
    />
  );
}
