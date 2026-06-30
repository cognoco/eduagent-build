import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { DictationResult } from '@eduagent/schemas';
import { goBackOrReplace } from '../../../lib/navigation';
import { useDictationHistory } from '../../../hooks/use-dictation-api';
import { useThemeColors } from '../../../lib/theme';
import { ErrorFallback } from '../../../components/common/ErrorFallback';

// [WI-902] Read-only dictation history. Lists the learner's recent sessions
// (newest first) and shows the persisted source sentences so they can review
// the full text of past exercises, not just the aggregate counts.

function HistoryEntryCard({
  entry,
}: {
  entry: DictationResult;
}): React.ReactElement {
  const { t } = useTranslation();
  const modeLabel =
    entry.mode === 'homework'
      ? t('dictation.history.modeHomework')
      : t('dictation.history.modeSurprise');

  return (
    <View
      className="bg-coaching-card rounded-card p-4"
      testID="dictation-history-entry"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-body font-semibold text-text-primary">
          {modeLabel}
        </Text>
        <Text className="text-body-sm text-text-muted">{entry.date}</Text>
      </View>

      <Text className="text-body-sm text-text-secondary mt-1">
        {entry.mistakeCount != null
          ? t('dictation.history.scoreLabel', {
              correct: Math.max(0, entry.sentenceCount - entry.mistakeCount),
              total: entry.sentenceCount,
            })
          : t('dictation.history.sentenceCountLabel', {
              count: entry.sentenceCount,
            })}
      </Text>

      <Text className="text-body-sm font-semibold text-text-primary mt-3">
        {t('dictation.history.sentencesHeading')}
      </Text>
      {entry.sentences && entry.sentences.length > 0 ? (
        <View className="mt-1 gap-1">
          {entry.sentences.map((sentence, index) => (
            <Text
              key={index}
              className="text-body text-text-secondary"
              testID="dictation-history-sentence"
            >
              {sentence}
            </Text>
          ))}
        </View>
      ) : (
        <Text className="text-body-sm text-text-muted mt-1 italic">
          {t('dictation.history.noSentences')}
        </Text>
      )}
    </View>
  );
}

export default function DictationHistoryScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data, isPending, isError, refetch } = useDictationHistory();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="dictation-history-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/dictation' as Href)}
          className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('dictation.history.back')}
          testID="dictation-history-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          {t('dictation.history.title')}
        </Text>
      </View>

      {isPending ? (
        <View
          className="items-center justify-center py-16"
          testID="dictation-history-loading"
        >
          <ActivityIndicator
            size="large"
            color={colors.primary}
            accessibilityLabel={t('dictation.history.loading')}
          />
          <Text className="text-body-sm text-text-secondary mt-4 text-center">
            {t('dictation.history.loading')}
          </Text>
        </View>
      ) : isError ? (
        <ErrorFallback
          title={t('dictation.history.errorTitle')}
          primaryAction={{
            label: t('dictation.history.retry'),
            onPress: () => void refetch(),
            testID: 'dictation-history-retry',
          }}
          testID="dictation-history-error"
        />
      ) : data == null || data.length === 0 ? (
        <Text
          className="text-body text-text-secondary text-center mt-8"
          testID="dictation-history-empty"
        >
          {t('dictation.history.empty')}
        </Text>
      ) : (
        <View className="gap-4">
          {data.map((entry) => (
            <HistoryEntryCard key={entry.id} entry={entry} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
