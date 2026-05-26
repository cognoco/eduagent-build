import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ChildSession } from '@eduagent/schemas';
import { formatRelativeDate } from '../../../../lib/format-relative-date';
import { sessionFocusTitle } from '../_view-models/progress-report-helpers';

export function RecentFocusCard({
  sessions,
  fallbackItems,
  isLoading,
  isError,
  onRetry,
  onShowAll,
}: {
  sessions: ChildSession[] | undefined;
  fallbackItems: string[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onShowAll: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const focusSessions = sessions?.slice(0, 2) ?? [];
  const fallbackFocus =
    focusSessions.length === 0 ? fallbackItems.slice(0, 2) : [];

  return (
    <View className="mt-6" testID="progress-recent-focus-card">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-h3 font-semibold text-text-primary">
          {t('progress.recentFocus.title')}
        </Text>
        <Pressable
          onPress={onShowAll}
          accessibilityRole="button"
          accessibilityLabel={t('progress.recentFocus.showAll')}
          testID="progress-show-all-sessions"
        >
          <Text className="text-body-sm text-primary font-semibold">
            {t('progress.recentFocus.showAll')}
          </Text>
        </Pressable>
      </View>

      <View className="bg-surface rounded-card p-4">
        {isLoading ? (
          <>
            <View className="bg-border rounded h-5 w-2/3 mb-3" />
            <View className="bg-border rounded h-4 w-full mb-2" />
            <View className="bg-border rounded h-4 w-1/2" />
          </>
        ) : isError ? (
          <View testID="progress-recent-focus-error">
            <Text className="text-body text-text-secondary mb-3">
              {t('progress.recentFocus.error')}
            </Text>
            <Pressable
              onPress={onRetry}
              className="bg-background rounded-button px-4 py-3 items-center self-start"
              accessibilityRole="button"
              accessibilityLabel={t('common.tryAgain')}
              testID="progress-recent-focus-retry"
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('common.tryAgain')}
              </Text>
            </Pressable>
          </View>
        ) : focusSessions.length > 0 ? (
          focusSessions.map((session, index) => (
            <View
              key={session.sessionId}
              className={index === 0 ? '' : 'border-t border-border mt-3 pt-3'}
            >
              <Text className="text-body font-semibold text-text-primary">
                {sessionFocusTitle(session)}
              </Text>
              <Text
                className="text-body-sm text-text-secondary mt-1"
                numberOfLines={2}
              >
                {session.displaySummary ??
                  session.highlight ??
                  t('progress.recentFocus.sessionFallback', {
                    date: formatRelativeDate(session.startedAt),
                  })}
              </Text>
            </View>
          ))
        ) : fallbackFocus.length > 0 ? (
          fallbackFocus.map((item, index) => (
            <View key={item} className={index === 0 ? '' : 'mt-3'}>
              <Text className="text-body font-semibold text-text-primary">
                {item}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-body text-text-secondary">
            {t('progress.recentFocus.empty')}
          </Text>
        )}
      </View>
    </View>
  );
}
