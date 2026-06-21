import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ErrorFallback, TimeoutLoader } from '../../../components/common';
import { AddToMyLearningButton } from '../../../components/family/AddToMyLearningButton';
import { RequireFamilyContext } from '../../../components/guards/RequireFamilyContext';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import { useRecap } from '../../../hooks/use-recaps';
import {
  FAMILY_RECAPS_HREF,
  FAMILY_RECAPS_RETURN_TO,
  goBackOrReplace,
} from '../../../lib/navigation';
import { firstParam } from '../../../lib/route-params';
import { formatRelativeDate } from '../../../lib/format-relative-date';
import { useThemeColors } from '../../../lib/theme';

export default function RecapDetailScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ recapId?: string | string[] }>();
  const recapId = firstParam(params.recapId);
  const navigationContract = useNavigationContract();
  const recapQuery = useRecap(recapId);
  const { t } = useTranslation();
  const colors = useThemeColors();

  if (!navigationContract.canEnter('recaps/[recapId]')) {
    return (
      <RequireFamilyContext route="recaps/[recapId]">
        <View />
      </RequireFamilyContext>
    );
  }

  const handleBack = (): void => {
    goBackOrReplace(router, FAMILY_RECAPS_HREF as Href);
  };

  const handleOpenChildSession = (): void => {
    const recap = recapQuery.data;
    if (!recap) return;

    router.push({
      pathname: '/(app)/child/[profileId]/session/[sessionId]',
      params: {
        profileId: recap.childProfileId,
        sessionId: recap.sessionId,
        returnTo: FAMILY_RECAPS_RETURN_TO,
        returnId: recap.recapId,
      },
    } as Href);
  };

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="recap-detail-screen"
    >
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      >
        <View className="mt-4 flex-row items-center">
          <Pressable
            onPress={handleBack}
            className="me-3 min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('recaps.backLabel')}
            testID="recap-detail-back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text className="flex-1 text-h2 font-bold text-text-primary">
            {t('recaps.detailHeading')}
          </Text>
        </View>

        {recapQuery.isLoading ? (
          <View className="py-16" testID="recap-detail-loading">
            <TimeoutLoader
              isLoading={recapQuery.isLoading}
              timeoutMs={15_000}
              primaryAction={{
                label: t('common.tryAgain'),
                onPress: () => void recapQuery.refetch(),
                testID: 'recap-detail-timeout-retry',
              }}
              secondaryAction={{
                label: t('recaps.backLabel'),
                onPress: handleBack,
                testID: 'recap-detail-timeout-back',
              }}
              testID="recap-detail-loading-spinner"
            />
          </View>
        ) : recapQuery.isError ? (
          <View className="mt-4">
            <ErrorFallback
              title={t('recaps.detailLoadError')}
              message={t('recaps.detailLoadErrorMessage')}
              primaryAction={{
                label: t('common.tryAgain'),
                onPress: () => void recapQuery.refetch(),
                testID: 'recap-detail-retry',
              }}
              secondaryAction={{
                label: t('recaps.backLabel'),
                onPress: handleBack,
                testID: 'recap-detail-error-back',
              }}
              testID="recap-detail-error"
            />
          </View>
        ) : !recapQuery.data ? (
          <View className="mt-4">
            <ErrorFallback
              title={t('recaps.notFoundTitle')}
              message={t('recaps.notFoundMessage')}
              primaryAction={{
                label: t('recaps.backLabel'),
                onPress: handleBack,
                testID: 'recap-detail-not-found-back',
              }}
              secondaryAction={{
                label: t('common.goHome'),
                onPress: () => router.replace('/(app)/home'),
                testID: 'recap-detail-not-found-go-home',
              }}
              testID="recap-detail-not-found"
            />
          </View>
        ) : (
          <View className="mt-4">
            <Text className="text-body-sm font-semibold text-primary">
              {recapQuery.data.childDisplayName}
            </Text>
            <Text className="mt-1 text-h1 font-bold text-text-primary">
              {recapQuery.data.topicTitle ??
                recapQuery.data.subjectName ??
                recapQuery.data.displayTitle}
            </Text>
            <Text className="mt-2 text-caption text-text-secondary">
              {formatRelativeDate(recapQuery.data.startedAt)}
              {recapQuery.data.exchangeCount > 0
                ? ` - ${t('recaps.exchangesCount', { count: recapQuery.data.exchangeCount })}`
                : ''}
            </Text>

            <View className="mt-5 rounded-card border border-border bg-surface px-4 py-4">
              <Text className="text-caption font-semibold text-text-secondary">
                {t('recaps.whatHappened')}
              </Text>
              <Text className="mt-2 text-body text-text-primary leading-relaxed">
                {recapQuery.data.narrative ??
                  recapQuery.data.displaySummary ??
                  recapQuery.data.highlight ??
                  t('recaps.detailPending')}
              </Text>
            </View>

            {recapQuery.data.conversationPrompt ? (
              <View className="mt-3 rounded-card border border-border bg-surface px-4 py-4">
                <Text className="text-caption font-semibold text-text-secondary">
                  {t('recaps.tryAsking')}
                </Text>
                <Text className="mt-2 text-body text-text-primary leading-relaxed">
                  {recapQuery.data.conversationPrompt}
                </Text>
              </View>
            ) : null}

            <AddToMyLearningButton
              childProfileId={recapQuery.data.childProfileId}
              childDisplayName={recapQuery.data.childDisplayName}
              subjectName={recapQuery.data.subjectName}
              topicId={recapQuery.data.topicId}
              topicTitle={recapQuery.data.topicTitle}
              triggerPath={`/recaps/${recapQuery.data.recapId}`}
            />

            <Pressable
              onPress={handleOpenChildSession}
              className="mt-4 min-h-[48px] items-center justify-center rounded-button bg-surface px-4 py-3"
              accessibilityRole="button"
              accessibilityLabel={t('recaps.openChildSession')}
              testID="recap-detail-open-session"
            >
              <Text className="text-body font-semibold text-primary">
                {t('recaps.openChildSession')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
