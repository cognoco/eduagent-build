import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useChildDetail,
  useChildSessionDetail,
} from '../../../../../hooks/use-dashboard';
import {
  childProfileHref,
  goBackOrReplace,
  homeHrefForReturnTo,
} from '../../../../../lib/navigation';
import { FEATURE_FLAGS } from '../../../../../lib/feature-flags';
import { firstParam } from '../../../../../lib/route-params';
import { EngagementChip } from '../../../../../components/parent/EngagementChip';
import { MetricInfoDot } from '../../../../../components/parent/MetricInfoDot';
import { useThemeColors } from '../../../../../lib/theme';
import { AddToMyLearningButton } from '../../../../../components/family/AddToMyLearningButton';
import { QueryStateView } from '../../../../../components/common';
import { useDurationLabel } from '../../../../../hooks/use-time-format';
import { formatShortDate } from '../../../../../lib/format-datetime';
let Clipboard: typeof import('expo-clipboard') | null = null;
try {
  Clipboard = require('expo-clipboard');
} catch {
  // Native module unavailable (dev-client missing expo-clipboard)
}

function formatDate(iso: string, locale: string | undefined): string {
  return formatShortDate(iso, locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SessionDetailScreen() {
  const { t, i18n } = useTranslation();
  const durationLabel = useDurationLabel();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const params = useLocalSearchParams<{
    profileId: string | string[];
    sessionId: string | string[];
    returnTo?: string | string[];
    returnId?: string | string[];
  }>();
  const profileId = firstParam(params.profileId);
  const sessionId = firstParam(params.sessionId);
  const returnTo = firstParam(params.returnTo);
  const returnId = firstParam(params.returnId);

  const {
    data: session,
    isLoading,
    isError,
    refetch,
  } = useChildSessionDetail(profileId, sessionId);
  const childDetailQuery = useChildDetail(profileId);
  const v2Enabled = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
  const backFallbackHref =
    returnTo != null
      ? homeHrefForReturnTo(returnTo, returnId, v2Enabled)
      : profileId
        ? childProfileHref(profileId)
        : ((v2Enabled ? '/(app)/mentor' : '/(app)/home') as Href);
  const handleBack = () => goBackOrReplace(router, backFallbackHref);

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

  if (isLoading || (isError && !session)) {
    return (
      <QueryStateView
        isLoading={isLoading}
        error={isError && !session ? true : undefined}
        retry={{ onPress: () => refetch(), testID: 'retry-session' }}
        back={{ onPress: handleBack, testID: 'error-go-back' }}
        errorTitle={t('parentView.session.somethingWentWrong')}
        testID="loading"
      >
        {null}
      </QueryStateView>
    );
  }

  if (!session) {
    return (
      <View
        testID="session-not-found"
        className="flex-1 items-center justify-center bg-background px-6"
      >
        <Ionicons name="document-text-outline" size={48} color={colors.muted} />
        <Text className="text-text-secondary mt-4 text-center text-base">
          {t('parentView.session.sessionNoLongerAvailable')}
        </Text>
        <Pressable
          onPress={handleBack}
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
  const duration = durationLabel(
    session.durationSeconds ?? session.wallClockSeconds,
  );
  const hasRecap = Boolean(
    session.narrative ||
    session.highlight ||
    session.conversationPrompt ||
    session.engagementSignal,
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
          onPress={handleBack}
          className="mb-4 flex-row items-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>

        <Text className="text-text-primary text-xl font-bold">
          {session.displayTitle}
        </Text>
        <Text className="text-text-secondary mt-1 text-sm">
          {formatDate(session.startedAt, i18n?.language)}
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
            <View
              testID="session-recap-narrative"
              className="mx-4 mt-4 rounded-xl bg-surface p-4"
            >
              <Text className="text-text-secondary mb-2 text-xs font-medium tracking-wide">
                {t('parentView.session.sessionRecap')}
              </Text>
              <Text className="text-text-primary text-base leading-relaxed">
                {session.narrative}
              </Text>
            </View>
          ) : null}

          {session.highlight ? (
            <View
              testID="session-recap-highlight"
              className="mx-4 mt-4 rounded-xl bg-surface p-4"
            >
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
            <View
              testID="session-recap-conversation-prompt"
              className="mx-4 mt-4 rounded-xl bg-surface p-4"
            >
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
                    'parentView.session.copyConversationPrompt',
                  )}
                  testID="session-recap-copy-prompt"
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
              {copyState === 'copied' ? (
                <View
                  testID="session-recap-copy-prompt-toast"
                  className="mt-2 self-start rounded-full bg-primary/10 px-3 py-1"
                  accessibilityRole="text"
                >
                  <Text className="text-caption font-semibold text-primary">
                    {t('parentView.session.copied')}
                  </Text>
                </View>
              ) : null}
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
            onPress={handleBack}
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

      <View className="mx-4 mt-4">
        <AddToMyLearningButton
          childProfileId={profileId ?? ''}
          childDisplayName={
            childDetailQuery.data?.displayName ??
            t('parentView.index.yourChild')
          }
          subjectName={session.subjectName}
          topicId={session.topicId}
          topicTitle={session.topicTitle}
          triggerPath={`/child/${profileId ?? ''}/session/${sessionId ?? ''}`}
        />
      </View>

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
            onPress={() => router.push(continueTopicHref as Href)}
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
          onPress={handleBack}
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
