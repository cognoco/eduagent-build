import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChildSessionDetail } from '../../../../../hooks/use-dashboard';
import { goBackOrReplace } from '../../../../../lib/navigation';
import { EngagementChip } from '../../../../../components/parent/EngagementChip';
import { MetricInfoDot } from '../../../../../components/parent/MetricInfoDot';
let Clipboard: typeof import('expo-clipboard') | null = null;
try {
  Clipboard = require('expo-clipboard');
} catch {
  // Native module unavailable (dev-client missing expo-clipboard)
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const mins = Math.round(seconds / 60);
  return mins === 1 ? '1 min' : `${mins} min`;
}

export default function SessionDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  );
  const params = useLocalSearchParams<{
    profileId: string;
    sessionId: string;
  }>();
  const profileId = Array.isArray(params.profileId)
    ? params.profileId[0]
    : params.profileId;
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;

  const {
    data: session,
    isLoading,
    isError,
    refetch,
  } = useChildSessionDetail(profileId, sessionId);

  useEffect(() => {
    if (copyState === 'idle') return undefined;

    const timeout = setTimeout(() => setCopyState('idle'), 2000);
    return () => clearTimeout(timeout);
  }, [copyState]);

  async function handleCopyPrompt() {
    if (!session?.conversationPrompt) return;

    try {
      if (!Clipboard?.setStringAsync) throw new Error('Clipboard unavailable');
      await Clipboard.setStringAsync(session.conversationPrompt);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator testID="loading" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-text-secondary mb-4 text-center">
          {t('parentView.session.somethingWentWrong')}
        </Text>
        <Pressable
          testID="retry-session"
          onPress={() => refetch()}
          className="rounded-lg bg-primary px-6 py-3"
        >
          <Text className="text-text-inverse font-medium">
            {t('common.retry')}
          </Text>
        </Pressable>
        {/* [F-033] Secondary escape — UX resilience rule requires a Go Back
            action on every error state, not just Retry. */}
        <Pressable
          testID="error-go-back"
          onPress={() =>
            goBackOrReplace(router, `/(app)/child/${profileId}` as const)
          }
          className="mt-3 px-6 py-3"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <Text className="text-text-secondary font-medium">
            {t('common.goBack')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!session) {
    return (
      <View
        testID="session-not-found"
        className="flex-1 items-center justify-center bg-background px-6"
      >
        <Ionicons name="document-text-outline" size={48} color="#888" />
        <Text className="text-text-secondary mt-4 text-center text-base">
          {t('parentView.session.sessionNoLongerAvailable')}
        </Text>
        <Pressable
          onPress={() =>
            goBackOrReplace(router, `/(app)/child/${profileId}` as const)
          }
          className="mt-4 rounded-lg bg-primary px-6 py-3"
        >
          <Text className="text-text-inverse font-medium">
            {t('common.goBack')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // BUG-902: Parent-facing duration must be ACTIVE time, not wall-clock.
  // Wall-clock inflates engagement — a 39-minute "browsed a topic" entry
  // suggests sustained focus when active time may have been a few minutes.
  // Per project_session_lifecycle_decisions.md, active time is the correct
  // parent-facing aggregate; wall-clock is a fallback for legacy rows that
  // never recorded active seconds.
  const duration = formatDuration(
    session.durationSeconds ?? session.wallClockSeconds
  );
  const hasRecap = Boolean(
    session.narrative ||
      session.highlight ||
      session.conversationPrompt ||
      session.engagementSignal
  );

  // BUG-901: Build at least one always-visible CTA so the screen is never a
  // dead-end when summary/transcript are missing. Prefer a topic deep link
  // (re-engage with the same content), fall back to the child profile.
  const continueTopicHref =
    session.topicId && profileId
      ? (`/(app)/child/${profileId}/topic/${session.topicId}` as const)
      : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 16,
      }}
    >
      {/* Header */}
      <View className="px-4 pt-4">
        <Pressable
          onPress={() =>
            goBackOrReplace(router, `/(app)/child/${profileId}` as const)
          }
          className="mb-4 flex-row items-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <Ionicons name="arrow-back" size={24} />
        </Pressable>

        <Text className="text-text-primary text-xl font-bold">
          {session.displayTitle}
        </Text>
        <Text className="text-text-secondary mt-1 text-sm">
          {formatDate(session.startedAt)}
        </Text>
      </View>

      {/* Metadata */}
      <View
        testID="session-metadata"
        className="mx-4 mt-4 rounded-xl bg-surface p-4"
      >
        <View className="flex-row justify-between">
          <View>
            <View className="flex-row items-center gap-1">
              <Text className="text-text-secondary text-xs">
                {t('parentView.session.duration')}
              </Text>
              <MetricInfoDot metricKey="time-on-app" />
            </View>
            <Text className="text-text-primary text-base font-medium">
              {duration || '—'}
            </Text>
          </View>
          <View>
            <Text className="text-text-secondary text-xs">
              {t('parentView.session.type')}
            </Text>
            <Text className="text-text-primary text-base font-medium capitalize">
              {session.sessionType}
            </Text>
          </View>
        </View>
      </View>

      {hasRecap ? (
        <>
          {session.narrative ? (
            <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
              <Text className="text-text-secondary mb-2 text-xs font-medium tracking-wide">
                {t('parentView.session.sessionRecap')}
              </Text>
              <Text className="text-text-primary text-base leading-relaxed">
                {session.narrative}
              </Text>
            </View>
          ) : null}

          {session.highlight ? (
            <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
              <Text className="text-text-secondary mb-2 text-xs font-medium tracking-wide">
                {t('parentView.session.highlight')}
              </Text>
              <Text className="text-text-primary text-base italic leading-relaxed">
                {session.highlight}
              </Text>
            </View>
          ) : null}

          {session.engagementSignal ? (
            <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
              <Text className="text-text-secondary mb-2 text-xs font-medium tracking-wide">
                {t('parentView.session.engagement')}
              </Text>
              <EngagementChip signal={session.engagementSignal} />
            </View>
          ) : null}

          {session.conversationPrompt ? (
            <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-text-secondary mb-2 text-xs font-medium tracking-wide">
                    {t('parentView.session.tryAsking')}
                  </Text>
                  <Text className="text-text-primary text-base leading-relaxed">
                    {session.conversationPrompt}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void handleCopyPrompt()}
                  className="rounded-full bg-background px-3 py-2"
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'parentView.session.copyConversationPrompt'
                  )}
                  testID="copy-conversation-prompt"
                >
                  <Text className="text-body-sm font-semibold text-primary">
                    {copyState === 'copied'
                      ? t('parentView.session.copied')
                      : copyState === 'failed'
                      ? t('parentView.session.copyFailed')
                      : t('parentView.session.copy')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      ) : (
        <View
          className="mx-4 mt-4 rounded-xl bg-surface p-4"
          testID="narrative-unavailable"
        >
          <Text className="text-text-primary text-base font-semibold">
            {t('parentView.session.noRecapAvailable')}
          </Text>
          <Text className="text-text-secondary mt-2 text-sm leading-relaxed">
            {/* [BUG-552] The recap may not exist because the session is still
                being processed, was too short, or predates the recap feature.
                Avoid "older session" — any session can lack a recap. */}
            {t('parentView.session.noRecapBody')}
          </Text>
          <Pressable
            onPress={() =>
              goBackOrReplace(router, `/(app)/child/${profileId}` as const)
            }
            className="mt-4 self-start rounded-lg bg-primary px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="narrative-unavailable-back"
          >
            <Text className="text-text-inverse font-medium">
              {t('common.goBack')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Summary */}
      <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
        <Text className="text-text-secondary mb-2 text-xs font-medium tracking-wide">
          {t('parentView.session.sessionSummary')}
        </Text>
        {session.displaySummary ? (
          <Text className="text-text-primary text-base leading-relaxed">
            {session.displaySummary}
          </Text>
        ) : (
          // BUG-901: Replace bare "No summary available" with friendlier
          // microcopy that explains *why* (short / browsing / pre-recap).
          // [BUG-552] displaySummary is only set for homework sessions,
          // so this fires for every learning session — not just old ones.
          <Text
            className="text-text-secondary text-base leading-relaxed"
            testID="session-summary-empty-note"
          >
            {t('parentView.session.noSummaryBody')}
          </Text>
        )}
      </View>

      {/* Homework details */}
      {session.homeworkSummary && (
        <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
          <Text className="text-text-secondary mb-2 text-xs font-medium tracking-wide">
            {t('parentView.session.homeworkHelp')}
          </Text>
          <Text className="text-text-primary text-base leading-relaxed">
            {session.homeworkSummary.summary}
          </Text>
        </View>
      )}

      {/* BUG-901: Always-on CTAs — never let the parent hit a dead-end. */}
      <View className="mx-4 mt-6" testID="session-detail-ctas">
        {continueTopicHref ? (
          <Pressable
            onPress={() => router.push(continueTopicHref as never)}
            className="rounded-lg bg-primary px-4 py-3 items-center min-h-[48px] justify-center mb-2"
            accessibilityRole="button"
            accessibilityLabel={
              session.topicTitle
                ? t('parentView.session.openTopicWithTitle', {
                    title: session.topicTitle,
                  })
                : t('parentView.session.openThisTopic')
            }
            testID="session-detail-continue-topic"
          >
            <Text className="text-text-inverse font-medium">
              {session.topicTitle
                ? t('parentView.session.openTopicWithTitle', {
                    title: session.topicTitle,
                  })
                : t('parentView.session.openThisTopic')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() =>
            goBackOrReplace(router, `/(app)/child/${profileId}` as const)
          }
          className="rounded-lg px-4 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('parentView.session.backToChildProfile')}
          testID="session-detail-back-to-child"
        >
          <Text className="text-primary font-medium">
            {t('parentView.session.backToChildProfile')}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
