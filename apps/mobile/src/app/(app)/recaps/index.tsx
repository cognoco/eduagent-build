import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ErrorFallback, TimeoutLoader } from '../../../components/common';
import { RecapsEmptyState } from '../../../components/recaps/RecapsEmptyState';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import { useRecaps } from '../../../hooks/use-recaps';
import { formatRelativeDate } from '../../../lib/format-relative-date';

export default function RecapsScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const navigationContract = useNavigationContract();
  const recapsQuery = useRecaps();

  if (!navigationContract.canEnter('recaps')) {
    return <Redirect href="/(app)/home" />;
  }

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="recaps-screen"
    >
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      >
        <Text className="text-h1 font-bold text-text-primary mt-4">
          {t('recaps.title')}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1 mb-4">
          {t('recaps.subtitle')}
        </Text>

        {recapsQuery.isLoading ? (
          <View className="py-16" testID="recaps-loading">
            <TimeoutLoader
              isLoading={recapsQuery.isLoading}
              timeoutMs={15_000}
              primaryAction={{
                label: t('common.tryAgain'),
                onPress: () => void recapsQuery.refetch(),
                testID: 'recaps-timeout-retry',
              }}
              secondaryAction={{
                label: t('common.goHome'),
                onPress: () => router.push('/(app)/home' as Href),
                testID: 'recaps-timeout-home',
              }}
              testID="recaps-loading-spinner"
            />
          </View>
        ) : recapsQuery.isError ? (
          <ErrorFallback
            title={t('recaps.errorTitle')}
            message={t('recaps.errorMessage')}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => void recapsQuery.refetch(),
              testID: 'recaps-retry',
            }}
            secondaryAction={{
              label: t('common.goHome'),
              onPress: () => router.push('/(app)/home' as Href),
              testID: 'recaps-home',
            }}
            testID="recaps-error"
          />
        ) : (recapsQuery.data?.length ?? 0) === 0 ? (
          <RecapsEmptyState
            onStart={() => router.push('/(app)/home' as Href)}
          />
        ) : (
          <View className="gap-3">
            {recapsQuery.data?.map((recap) => (
              <Pressable
                key={recap.recapId}
                className="rounded-card border border-border bg-surface px-4 py-4"
                accessibilityRole="button"
                accessibilityLabel={t('recaps.openRecapLabel', {
                  child: recap.childDisplayName,
                  title:
                    recap.topicTitle ?? recap.subjectName ?? recap.displayTitle,
                })}
                onPress={() => {
                  router.push({
                    pathname: '/(app)/recaps/[recapId]',
                    params: {
                      recapId: recap.recapId,
                    },
                  } as Href);
                }}
                testID={`recap-row-${recap.recapId}`}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-body-sm font-semibold text-primary">
                      {recap.childDisplayName}
                    </Text>
                    <Text className="text-body font-semibold text-text-primary mt-1">
                      {recap.topicTitle ??
                        recap.subjectName ??
                        recap.displayTitle}
                    </Text>
                  </View>
                  <Text className="text-caption text-text-secondary">
                    {formatRelativeDate(recap.startedAt)}
                  </Text>
                </View>
                <Text className="text-body-sm text-text-secondary mt-3">
                  {recap.narrative ??
                    recap.displaySummary ??
                    recap.highlight ??
                    t('recaps.summaryPending')}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
